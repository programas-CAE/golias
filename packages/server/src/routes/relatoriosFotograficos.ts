import { relatorioFotograficoFotoUpdateInputSchema, relatorioFotograficoUpdateInputSchema } from "@golias/shared";
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ANEXO_MIME_EXTENSAO, assinaturaValida, salvarArquivoAnexo } from "../lib/anexoArquivo.js";
import { prisma } from "../lib/prisma.js";
import { gerarRelatorioFotograficoPdf } from "../lib/relatorioFotograficoPdf.js";
import { parseBody } from "../lib/validate.js";

/**
 * "Check List de Conclusão de Manutenção Preventiva/Corretiva -
 * Infraestrutura" (documento oficial da Vale/EFC, aqui chamado de
 * "Relatório Fotográfico" — nome que o usuário já usa) — um POR DIA
 * trabalhado numa OM, não um por OM. A mesma OM pode ser trabalhada em
 * vários dias até fechar (ver comentário em foiLancada, ordensManutencao.ts)
 * e cada dia documenta suas próprias fotos e o % concluído daquele dia,
 * mesmo que a OM ainda esteja em andamento — assim o histórico completo
 * fica registrado (nada se sobrescreve dia a dia) e disponível pra
 * conferência posterior, independente de a OM já ter fechado ou não.
 *
 * Criado (e pré-preenchido com as fotos que o encarregado lançou pra essa
 * OM NAQUELE RDO) na primeira vez que aquele dia é aberto no escritório —
 * ver `buscarOuCriarRelatorio`. Depois disso é só ajuste por dia: trocar/
 * adicionar/remover foto, escrever comentário, gerar o PDF daquele dia.
 */

const fotoSelect = {
  id: true,
  ordem: true,
  legenda: true,
  rdoAnexoId: true,
  caminhoArquivo: true,
  mimeType: true,
  nomeOriginal: true,
  rdoAnexo: { select: { caminhoArquivo: true, mimeType: true, nomeOriginal: true } },
} as const;

const relatorioSelect = {
  id: true,
  ordemManutencaoId: true,
  rdoId: true,
  dataConclusao: true,
  atividadesExecutadas: true,
  comentarios: true,
  pdfPath: true,
  fotos: { where: { ativa: true }, orderBy: { ordem: "asc" }, select: fotoSelect },
  rdo: { select: { data: true, equipe: { select: { nome: true } } } },
} as const;

function semCaminhosInternos<T extends { pdfPath: string | null; fotos: Array<{ caminhoArquivo: string | null; rdoAnexo: { caminhoArquivo: string | null } | null }> }>(
  relatorio: T,
) {
  const { pdfPath, fotos, ...resto } = relatorio;
  return {
    ...resto,
    pdfDisponivel: pdfPath != null,
    fotos: fotos.map(({ caminhoArquivo, rdoAnexo, ...restoFoto }) => restoFoto),
  };
}

/**
 * Monta o `ordem` de cada foto pareando Antes com Depois — a N-ésima foto
 * "Antes" fica ao lado da N-ésima foto "Depois" (na ordem cronológica em
 * que cada uma foi lançada), em vez de simplesmente empilhar na ordem de
 * chegada. Antes disso, quando o encarregado mandava as fotos fora de
 * ordem (ex.: várias "Antes" seguidas, "Depois" só depois), o Antes e o
 * Depois do mesmo item acabavam longe um do outro na grade 2 colunas do
 * PDF/edição — bug real visto em produção.
 *
 * Cada par ocupa sempre 2 posições de `ordem` (par N = 2N e 2N+1, Antes e
 * Depois respectivamente) MESMO quando um dos lados ainda não existe — é
 * assim que a tela sabe desenhar um par "incompleto" com uma caixa vazia
 * do lado que falta, em vez de desalinhar o par seguinte. Fotos sem
 * legenda (Antes/Depois) viram pares próprios no final, sozinhas do lado
 * Antes, depois de todos os pares reconhecidos.
 *
 * `ordemBase` desloca tudo pra depois de fotos que já estavam no
 * relatório (usado por /sincronizar-fotos, que só deve mexer no que é
 * novo — nunca reordenar o que o escritório já ajustou manualmente).
 */
function montarOrdemPareada<T extends { legenda: string | null }>(itens: T[], ordemBase = 0): Array<T & { ordem: number }> {
  const antes = itens.filter((item) => item.legenda === "Antes");
  const depois = itens.filter((item) => item.legenda === "Depois");
  const semLegenda = itens.filter((item) => item.legenda !== "Antes" && item.legenda !== "Depois");

  const resultado: Array<T & { ordem: number }> = [];
  const totalPares = Math.max(antes.length, depois.length);
  for (let i = 0; i < totalPares; i++) {
    if (antes[i]) resultado.push({ ...antes[i]!, ordem: ordemBase + i * 2 });
    if (depois[i]) resultado.push({ ...depois[i]!, ordem: ordemBase + i * 2 + 1 });
  }
  const baseSemLegenda = ordemBase + totalPares * 2;
  semLegenda.forEach((item, indice) => {
    resultado.push({ ...item, ordem: baseSemLegenda + indice * 2 });
  });
  return resultado;
}

async function buscarOuCriarRelatorio(ordemManutencaoId: string, rdoId: string) {
  const existente = await prisma.relatorioFotografico.findUnique({
    where: { ordemManutencaoId_rdoId: { ordemManutencaoId, rdoId } },
    select: relatorioSelect,
  });
  if (existente) return existente;

  const fotosDoDia = await prisma.rdoAnexo.findMany({
    where: { ordemManutencaoId, rdoId, tipo: "FOTO" },
    orderBy: { criadoEm: "asc" },
    select: { id: true, descricao: true },
  });

  const pareadas = montarOrdemPareada(fotosDoDia.map((anexo) => ({ ...anexo, legenda: anexo.descricao })));

  return prisma.relatorioFotografico.create({
    data: {
      ordemManutencaoId,
      rdoId,
      fotos: {
        create: pareadas.map((anexo) => ({ ordem: anexo.ordem, rdoAnexoId: anexo.id, legenda: anexo.legenda })),
      },
    },
    select: relatorioSelect,
  });
}

/**
 * % concluído e status da OM registrados NAQUELE dia (RdoAtividade já
 * carrega isso por RDO+OM) — não duplicado no RelatorioFotografico, só
 * lido na hora de montar a resposta. Uma OM pode, em teoria, ter mais de
 * uma atividade no mesmo dia (ex.: pontos extras) — fica o maior percentual.
 */
async function buscarProgressoDoDia(ordemManutencaoId: string, rdoId: string): Promise<{ statusOm: string | null; percentualConcluido: number | null }> {
  const atividades = await prisma.rdoAtividade.findMany({
    where: { ordemManutencaoId, rdoLocal: { rdoId } },
    select: { statusOm: true, percentualConcluido: true },
  });
  if (atividades.length === 0) return { statusOm: null, percentualConcluido: null };

  const concluida = atividades.find((a) => a.statusOm === "CONCLUIDA");
  const maiorPercentual = atividades.reduce<number | null>((maior, a) => {
    if (a.percentualConcluido == null) return maior;
    return maior == null || a.percentualConcluido > maior ? a.percentualConcluido : maior;
  }, null);
  return { statusOm: concluida ? "CONCLUIDA" : (atividades[0]?.statusOm ?? null), percentualConcluido: maiorPercentual };
}

async function lerBytesDaFoto(foto: {
  caminhoArquivo: string | null;
  rdoAnexo: { caminhoArquivo: string | null } | null;
}): Promise<Buffer | null> {
  const caminho = foto.caminhoArquivo ?? foto.rdoAnexo?.caminhoArquivo;
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch {
    return null;
  }
}

/** Confere que o relatório pedido é mesmo dessa OM (evita acessar um relatorioId/fotoId de outra OM pela URL). */
async function relatorioDaOm(relatorioId: string, ordemManutencaoId: string) {
  const relatorio = await prisma.relatorioFotografico.findUnique({
    where: { id: relatorioId },
    select: { id: true, ordemManutencaoId: true },
  });
  return relatorio && relatorio.ordemManutencaoId === ordemManutencaoId ? relatorio : null;
}

export function registerRelatoriosFotograficosRoutes(app: FastifyInstance): void {
  /**
   * Lista um item por dia já trabalhado nessa OM (não só os que já têm
   * relatório criado — cria na hora pra cada dia com atividade lançada),
   * com o % concluído daquele dia e se já tem foto/PDF.
   */
  app.get<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorios-fotograficos", async (request, reply) => {
    const om = await prisma.ordemManutencao.findUnique({ where: { id: request.params.id }, select: { id: true, numero: true } });
    if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });

    const diasTrabalhados = await prisma.rdoAtividade.findMany({
      where: { ordemManutencaoId: om.id },
      select: { rdoLocal: { select: { rdo: { select: { id: true, data: true, equipe: { select: { nome: true } } } } } } },
    });
    const rdosUnicos = new Map(diasTrabalhados.map((item) => [item.rdoLocal.rdo.id, item.rdoLocal.rdo]));

    const itens = await Promise.all(
      [...rdosUnicos.values()]
        .sort((a, b) => b.data.getTime() - a.data.getTime())
        .map(async (rdo) => {
          const [relatorio, progresso] = await Promise.all([
            buscarOuCriarRelatorio(om.id, rdo.id),
            buscarProgressoDoDia(om.id, rdo.id),
          ]);
          return {
            relatorioId: relatorio.id,
            rdoId: rdo.id,
            data: rdo.data,
            equipe: rdo.equipe.nome,
            statusOm: progresso.statusOm,
            percentualConcluido: progresso.percentualConcluido,
            totalFotos: relatorio.fotos.length,
            pdfDisponivel: relatorio.pdfPath != null,
          };
        }),
    );

    return { omNumero: om.numero, itens };
  });

  app.get<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const [completo, om] = await Promise.all([
        prisma.relatorioFotografico.findUniqueOrThrow({ where: { id: relatorio.id }, select: relatorioSelect }),
        prisma.ordemManutencao.findUniqueOrThrow({ where: { id: request.params.id }, select: { numero: true } }),
      ]);
      const progresso = await buscarProgressoDoDia(request.params.id, completo.rdoId);
      return { ...semCaminhosInternos(completo), omNumero: om.numero, ...progresso };
    },
  );

  app.patch<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId",
    async (request, reply) => {
      const data = parseBody(relatorioFotograficoUpdateInputSchema, request.body, reply);
      if (!data) return;
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const atualizado = await prisma.relatorioFotografico.update({
        where: { id: relatorio.id },
        data,
        select: relatorioSelect,
      });
      return semCaminhosInternos(atualizado);
    },
  );

  /** Puxa pro relatório daquele dia as fotos lançadas nele (mesmo RDO) que ainda não estão nele. */
  app.post<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/sincronizar-fotos",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });
      const completo = await prisma.relatorioFotografico.findUniqueOrThrow({ where: { id: relatorio.id }, select: relatorioSelect });

      const todasJaVistas = await prisma.relatorioFotograficoFoto.findMany({
        where: { relatorioFotograficoId: relatorio.id, rdoAnexoId: { not: null } },
        select: { rdoAnexoId: true },
      });
      const jaReferenciadas = new Set(
        todasJaVistas.map((f) => f.rdoAnexoId).filter((id): id is string => id != null),
      );
      const todasFotosDoDia = await prisma.rdoAnexo.findMany({
        where: { ordemManutencaoId: request.params.id, rdoId: completo.rdoId, tipo: "FOTO" },
        orderBy: { criadoEm: "asc" },
        select: { id: true, descricao: true },
      });
      const novas = todasFotosDoDia.filter((f) => !jaReferenciadas.has(f.id));
      if (novas.length > 0) {
        const maiorOrdemAtual = completo.fotos.reduce((maior, foto) => Math.max(maior, foto.ordem), -1);
        const ordemInicial = maiorOrdemAtual % 2 === 0 ? maiorOrdemAtual + 2 : maiorOrdemAtual + 1;
        const pareadas = montarOrdemPareada(
          novas.map((anexo) => ({ ...anexo, legenda: anexo.descricao })),
          ordemInicial,
        );
        await prisma.relatorioFotograficoFoto.createMany({
          data: pareadas.map((anexo) => ({
            relatorioFotograficoId: relatorio.id,
            rdoAnexoId: anexo.id,
            legenda: anexo.legenda,
            ordem: anexo.ordem,
          })),
        });
      }
      const atualizado = await prisma.relatorioFotografico.findUniqueOrThrow({
        where: { id: relatorio.id },
        select: relatorioSelect,
      });
      return { ...semCaminhosInternos(atualizado), fotosAdicionadas: novas.length };
    },
  );

  /** Anexa uma foto extra direto no relatório daquele dia — não veio de nenhum RDO. */
  app.post<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/fotos",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "Nenhum arquivo enviado" });
      if (!ANEXO_MIME_EXTENSAO[file.mimetype] || !file.mimetype.startsWith("image/")) {
        return reply.status(400).send({ error: "Envie uma imagem (JPEG, PNG ou WEBP)" });
      }
      const buffer = await file.toBuffer();
      if (file.file.truncated) return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
      if (!assinaturaValida(file.mimetype, buffer)) {
        return reply.status(400).send({ error: "O conteúdo do arquivo não corresponde ao tipo declarado" });
      }

      const completo = await prisma.relatorioFotografico.findUniqueOrThrow({ where: { id: relatorio.id }, select: relatorioSelect });
      const { caminhoArquivo } = await salvarArquivoAnexo(buffer, file.mimetype, "relatorios-fotograficos", relatorio.id);

      const maiorOrdem = completo.fotos.reduce((maior, foto) => Math.max(maior, foto.ordem), -1);

      await prisma.relatorioFotograficoFoto.create({
        data: {
          relatorioFotograficoId: relatorio.id,
          ordem: maiorOrdem + 1,
          caminhoArquivo,
          nomeOriginal: file.filename,
          mimeType: file.mimetype,
          tamanhoBytes: buffer.length,
        },
      });
      const atualizado = await prisma.relatorioFotografico.findUniqueOrThrow({
        where: { id: relatorio.id },
        select: relatorioSelect,
      });
      return reply.status(201).send(semCaminhosInternos(atualizado));
    },
  );

  app.patch<{ Params: { id: string; relatorioId: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/fotos/:fotoId",
    async (request, reply) => {
      const data = parseBody(relatorioFotograficoFotoUpdateInputSchema, request.body, reply);
      if (!data) return;
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: { id: true, relatorioFotograficoId: true },
      });
      if (!foto || foto.relatorioFotograficoId !== relatorio.id) {
        return reply.status(404).send({ error: "Foto não encontrada" });
      }
      const { caminhoArquivo, rdoAnexo, ...atualizada } = await prisma.relatorioFotograficoFoto.update({
        where: { id: foto.id },
        data,
        select: fotoSelect,
      });
      return atualizada;
    },
  );

  /** Remove a foto do relatório — se ela foi anexada direto aqui (não veio de um RdoAnexo), apaga o arquivo também. */
  app.delete<{ Params: { id: string; relatorioId: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/fotos/:fotoId",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: { id: true, caminhoArquivo: true, relatorioFotograficoId: true },
      });
      if (!foto || foto.relatorioFotograficoId !== relatorio.id) {
        return reply.status(404).send({ error: "Foto não encontrada" });
      }
      // Exclusão lógica (ativa: false), não apaga a linha — senão sincronizar
      // fotos novas do campo ressuscitaria essa mesma foto (ver
      // /sincronizar-fotos). O arquivo em disco pode ir embora com segurança
      // quando é um upload direto (nada mais o referencia).
      await prisma.relatorioFotograficoFoto.update({ where: { id: foto.id }, data: { ativa: false } });
      if (foto.caminhoArquivo) {
        await unlink(foto.caminhoArquivo).catch(() => {});
      }
      return reply.status(204).send();
    },
  );

  /** Bytes da foto (própria, ou reaproveitada de um RdoAnexo) — pra preview na tela e miniatura. */
  app.get<{ Params: { id: string; relatorioId: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/fotos/:fotoId/arquivo",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Foto não encontrada" });

      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: {
          caminhoArquivo: true,
          mimeType: true,
          nomeOriginal: true,
          relatorioFotograficoId: true,
          rdoAnexo: { select: { caminhoArquivo: true, mimeType: true, nomeOriginal: true } },
        },
      });
      if (!foto || foto.relatorioFotograficoId !== relatorio.id) {
        return reply.status(404).send({ error: "Foto não encontrada" });
      }
      const caminho = foto.caminhoArquivo ?? foto.rdoAnexo?.caminhoArquivo;
      if (!caminho) return reply.status(404).send({ error: "Arquivo não encontrado" });
      const mimeType = foto.mimeType ?? foto.rdoAnexo?.mimeType ?? "application/octet-stream";
      const nome = foto.nomeOriginal ?? foto.rdoAnexo?.nomeOriginal ?? "foto";
      const buffer = await readFile(caminho);
      return reply.header("Content-Type", mimeType).header("Content-Disposition", `inline; filename="${nome}"`).send(buffer);
    },
  );

  app.post<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/pdf",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });

      const [completo, om] = await Promise.all([
        prisma.relatorioFotografico.findUniqueOrThrow({ where: { id: relatorio.id }, select: relatorioSelect }),
        prisma.ordemManutencao.findUniqueOrThrow({ where: { id: request.params.id }, select: { numero: true } }),
      ]);
      const progresso = await buscarProgressoDoDia(request.params.id, completo.rdoId);

      const fotos: { imagem: Buffer; legenda: string | null; ordem: number }[] = [];
      for (const foto of completo.fotos) {
        const imagem = await lerBytesDaFoto(foto);
        if (imagem) fotos.push({ imagem, legenda: foto.legenda, ordem: foto.ordem });
      }

      const buffer = await gerarRelatorioFotograficoPdf({
        omNumero: om.numero,
        dataConclusao: completo.dataConclusao,
        atividadesExecutadas: completo.atividadesExecutadas,
        comentarios: completo.comentarios,
        fotos,
        percentualConcluido: progresso.percentualConcluido,
      });

      const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
      const dir = path.join(uploadsRoot, "relatorios-fotograficos", relatorio.id);
      await mkdir(dir, { recursive: true });
      const caminhoCompleto = path.join(dir, "relatorio-fotografico.pdf");
      await writeFile(caminhoCompleto, buffer);

      await prisma.relatorioFotografico.update({ where: { id: relatorio.id }, data: { pdfPath: caminhoCompleto } });
      return { id: relatorio.id, pdfDisponivel: true };
    },
  );

  app.get<{ Params: { id: string; relatorioId: string } }>(
    "/ordens-manutencao/:id/relatorios-fotograficos/:relatorioId/pdf",
    async (request, reply) => {
      const relatorio = await relatorioDaOm(request.params.relatorioId, request.params.id);
      if (!relatorio) return reply.status(404).send({ error: "Relatório não encontrado" });
      const completo = await prisma.relatorioFotografico.findUnique({ where: { id: relatorio.id }, select: { pdfPath: true } });
      if (!completo?.pdfPath) return reply.status(404).send({ error: "PDF ainda não foi gerado para este relatório" });
      const buffer = await readFile(completo.pdfPath);
      return reply.header("Content-Type", "application/pdf").send(buffer);
    },
  );
}

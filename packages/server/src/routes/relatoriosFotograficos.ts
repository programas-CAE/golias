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
 * "Relatório Fotográfico" — nome que o usuário já usa) de uma OM.
 *
 * Um por OM. Criado (e pré-preenchido com as fotos que o encarregado já
 * lançou pra essa OM em algum RDO) na primeira vez que a tela é aberta —
 * ver `buscarOuCriarRelatorio`. Depois disso é só ajuste: trocar/adicionar/
 * remover foto, escrever comentário, gerar o PDF. Sincronizar fotos novas
 * do campo é uma ação separada (`/sincronizar-fotos`), pra não ressuscitar
 * uma foto que o escritório removeu de propósito.
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
  dataConclusao: true,
  atividadesExecutadas: true,
  comentarios: true,
  pdfPath: true,
  fotos: { where: { ativa: true }, orderBy: { ordem: "asc" }, select: fotoSelect },
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

async function buscarOuCriarRelatorio(ordemManutencaoId: string) {
  const existente = await prisma.relatorioFotografico.findUnique({
    where: { ordemManutencaoId },
    select: relatorioSelect,
  });
  if (existente) return existente;

  const fotosDaOm = await prisma.rdoAnexo.findMany({
    where: { ordemManutencaoId, tipo: "FOTO" },
    orderBy: { criadoEm: "asc" },
    select: { id: true, descricao: true },
  });

  return prisma.relatorioFotografico.create({
    data: {
      ordemManutencaoId,
      // A legenda (ex.: "Antes"/"Depois") que o encarregado já marcou no
      // anexo vem junto — a foto chega no relatório já identificada, sem
      // precisar legendar de novo no escritório.
      fotos: {
        create: fotosDaOm.map((anexo, indice) => ({ ordem: indice, rdoAnexoId: anexo.id, legenda: anexo.descricao })),
      },
    },
    select: relatorioSelect,
  });
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

export function registerRelatoriosFotograficosRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorio-fotografico", async (request, reply) => {
    const om = await prisma.ordemManutencao.findUnique({
      where: { id: request.params.id },
      select: { id: true, numero: true },
    });
    if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
    const relatorio = await buscarOuCriarRelatorio(om.id);
    return { ...semCaminhosInternos(relatorio), omNumero: om.numero };
  });

  app.patch<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorio-fotografico", async (request, reply) => {
    const data = parseBody(relatorioFotograficoUpdateInputSchema, request.body, reply);
    if (!data) return;
    const om = await prisma.ordemManutencao.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
    const relatorio = await buscarOuCriarRelatorio(om.id);
    const atualizado = await prisma.relatorioFotografico.update({
      where: { id: relatorio.id },
      data,
      select: relatorioSelect,
    });
    return semCaminhosInternos(atualizado);
  });

  /** Puxa pro relatório as fotos lançadas pra essa OM que ainda não estão nele. */
  app.post<{ Params: { id: string } }>(
    "/ordens-manutencao/:id/relatorio-fotografico/sincronizar-fotos",
    async (request, reply) => {
      const om = await prisma.ordemManutencao.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
      const relatorio = await buscarOuCriarRelatorio(om.id);

      // Considera TODAS as linhas já vistas (inclusive as removidas/inativas)
      // pra decidir o que é "novo" — senão uma foto que o escritório tirou de
      // propósito voltaria a aparecer aqui.
      const todasJaVistas = await prisma.relatorioFotograficoFoto.findMany({
        where: { relatorioFotograficoId: relatorio.id, rdoAnexoId: { not: null } },
        select: { rdoAnexoId: true },
      });
      const jaReferenciadas = new Set(
        todasJaVistas.map((f) => f.rdoAnexoId).filter((id): id is string => id != null),
      );
      const todasFotosDaOm = await prisma.rdoAnexo.findMany({
        where: { ordemManutencaoId: om.id, tipo: "FOTO" },
        orderBy: { criadoEm: "asc" },
        select: { id: true, descricao: true },
      });
      const novas = todasFotosDaOm.filter((f) => !jaReferenciadas.has(f.id));
      if (novas.length > 0) {
        const ordemInicial = relatorio.fotos.length;
        await prisma.relatorioFotograficoFoto.createMany({
          data: novas.map((anexo, indice) => ({
            relatorioFotograficoId: relatorio.id,
            rdoAnexoId: anexo.id,
            legenda: anexo.descricao,
            ordem: ordemInicial + indice,
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

  /** Anexa uma foto extra direto no relatório — não veio de nenhum RDO. */
  app.post<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorio-fotografico/fotos", async (request, reply) => {
    const om = await prisma.ordemManutencao.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });

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

    const relatorio = await buscarOuCriarRelatorio(om.id);
    const { caminhoArquivo } = await salvarArquivoAnexo(buffer, file.mimetype, "relatorios-fotograficos", relatorio.id);

    await prisma.relatorioFotograficoFoto.create({
      data: {
        relatorioFotograficoId: relatorio.id,
        ordem: relatorio.fotos.length,
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
  });

  app.patch<{ Params: { id: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorio-fotografico/fotos/:fotoId",
    async (request, reply) => {
      const data = parseBody(relatorioFotograficoFotoUpdateInputSchema, request.body, reply);
      if (!data) return;
      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: { id: true, relatorioFotografico: { select: { ordemManutencaoId: true } } },
      });
      if (!foto || foto.relatorioFotografico.ordemManutencaoId !== request.params.id) {
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
  app.delete<{ Params: { id: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorio-fotografico/fotos/:fotoId",
    async (request, reply) => {
      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: { id: true, caminhoArquivo: true, relatorioFotografico: { select: { ordemManutencaoId: true } } },
      });
      if (!foto || foto.relatorioFotografico.ordemManutencaoId !== request.params.id) {
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
  app.get<{ Params: { id: string; fotoId: string } }>(
    "/ordens-manutencao/:id/relatorio-fotografico/fotos/:fotoId/arquivo",
    async (request, reply) => {
      const foto = await prisma.relatorioFotograficoFoto.findUnique({
        where: { id: request.params.fotoId },
        select: {
          caminhoArquivo: true,
          mimeType: true,
          nomeOriginal: true,
          relatorioFotografico: { select: { ordemManutencaoId: true } },
          rdoAnexo: { select: { caminhoArquivo: true, mimeType: true, nomeOriginal: true } },
        },
      });
      if (!foto || foto.relatorioFotografico.ordemManutencaoId !== request.params.id) {
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

  app.post<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorio-fotografico/pdf", async (request, reply) => {
    const om = await prisma.ordemManutencao.findUnique({ where: { id: request.params.id }, select: { id: true, numero: true } });
    if (!om) return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
    const relatorio = await buscarOuCriarRelatorio(om.id);

    const fotos: { imagem: Buffer; legenda: string | null }[] = [];
    for (const foto of relatorio.fotos) {
      const imagem = await lerBytesDaFoto(foto);
      if (imagem) fotos.push({ imagem, legenda: foto.legenda });
    }

    const buffer = await gerarRelatorioFotograficoPdf({
      omNumero: om.numero,
      dataConclusao: relatorio.dataConclusao,
      atividadesExecutadas: relatorio.atividadesExecutadas,
      comentarios: relatorio.comentarios,
      fotos,
    });

    const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
    const dir = path.join(uploadsRoot, "relatorios-fotograficos", relatorio.id);
    await mkdir(dir, { recursive: true });
    const caminhoCompleto = path.join(dir, "relatorio-fotografico.pdf");
    await writeFile(caminhoCompleto, buffer);

    await prisma.relatorioFotografico.update({ where: { id: relatorio.id }, data: { pdfPath: caminhoCompleto } });
    return { id: relatorio.id, pdfDisponivel: true };
  });

  app.get<{ Params: { id: string } }>("/ordens-manutencao/:id/relatorio-fotografico/pdf", async (request, reply) => {
    const relatorio = await prisma.relatorioFotografico.findUnique({
      where: { ordemManutencaoId: request.params.id },
      select: { pdfPath: true },
    });
    if (!relatorio?.pdfPath) return reply.status(404).send({ error: "PDF ainda não foi gerado para este relatório" });
    const buffer = await readFile(relatorio.pdfPath);
    return reply.header("Content-Type", "application/pdf").send(buffer);
  });
}

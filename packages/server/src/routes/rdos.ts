import {
  calcularTotalAtividade,
  rdoCampoUpdateInputSchema,
  rdoCreateInputSchema,
  rdoDraftCreateInputSchema,
} from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { calcularHashConteudo, gerarPdfRdo, type RdoConteudo } from "../lib/rdoPdf.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

const LINK_CAMPO_DIAS_VALIDADE = 7;

const rdoListSelect = {
  id: true,
  data: true,
  status: true,
  frente: { select: { id: true, nome: true } },
  equipe: { select: { id: true, nome: true } },
  linkCampoToken: true,
  linkCampoExpiraEm: true,
} as const;

const rdoCampoSelect = {
  id: true,
  frenteId: true,
  frente: { select: { id: true, nome: true, codigo: true, contrato: { select: { numero: true } } } },
  equipeId: true,
  equipe: {
    select: {
      id: true,
      nome: true,
      membros: {
        select: {
          id: true,
          colaboradorId: true,
          colaborador: { select: { id: true, nome: true } },
          funcaoId: true,
          funcao: { select: { id: true, nome: true } },
          quantidade: true,
        },
      },
    },
  },
  data: true,
  status: true,
  clima: true,
  horaExtraInicio: true,
  horaExtraFim: true,
  encarregadoId: true,
  totalDesvios: true,
  observacoesContratada: true,
  observacoesCliente: true,
  linkCampoToken: true,
  linkCampoExpiraEm: true,
  blocosHorario: {
    orderBy: { ordem: "asc" },
    select: { id: true, horarioInicial: true, horarioFinal: true, descricao: true, ordem: true },
  },
  locais: {
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      descricao: true,
      kmInicial: true,
      kmFinal: true,
      lado: true,
      ordem: true,
      atividades: {
        select: {
          id: true,
          atividadeCatalogoId: true,
          atividadeCatalogo: { select: { id: true, codigo: true, descricao: true, unidade: true, usaDimensoes: true } },
          ordemManutencaoId: true,
          altura: true,
          largura: true,
          larguraFinal: true,
          comprimento: true,
          quantidadeDireta: true,
          horasTrabalhadas: true,
          maoObraDireta: true,
          totalCalculado: true,
          unidade: true,
        },
      },
    },
  },
  maoDeObra: {
    select: {
      id: true,
      funcaoId: true,
      funcao: { select: { id: true, nome: true } },
      colaboradorId: true,
      colaborador: { select: { id: true, nome: true } },
      quantidade: true,
      horasImprodutivas: true,
      causaImprodutividade: true,
    },
  },
  equipamentos: {
    select: {
      id: true,
      equipamentoCatalogoId: true,
      equipamentoCatalogo: { select: { id: true, nome: true } },
      quantidade: true,
    },
  },
  materiais: {
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      materialCatalogoId: true,
      materialCatalogo: { select: { id: true, codigo: true, descricao: true, unidade: true, precoUnitario: true } },
      quantidade: true,
      ordem: true,
    },
  },
  anexos: {
    select: {
      id: true,
      tipo: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      descricao: true,
      criadoEm: true,
    },
  },
} as const;

const ANEXO_TIPOS = ["FOTO", "NOTA_FISCAL", "DOCUMENTO"] as const;
const ANEXO_MIME_EXTENSAO: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

/**
 * Confere os primeiros bytes do arquivo contra a assinatura esperada do tipo
 * declarado — o Content-Type do multipart é só uma alegação do cliente, não
 * prova do conteúdo real (endpoint público, sem login).
 */
function assinaturaValida(mimetype: string, buffer: Buffer): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/pdf":
      return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
    default:
      return false;
  }
}

async function buscarRdoPorToken(token: string) {
  return prisma.rdo.findUnique({ where: { linkCampoToken: token }, select: rdoCampoSelect });
}

function tokenExpirado(expiraEm: Date | null): boolean {
  return expiraEm != null && expiraEm.getTime() < Date.now();
}

type RdoParaPdf = NonNullable<Awaited<ReturnType<typeof buscarRdoPorToken>>>;

/**
 * Monta o conteúdo do RDO com nomes já resolvidos (não IDs), usado tanto
 * para gerar o PDF quanto para calcular o hash de autenticidade.
 * `Rdo.encarregadoId` não tem relação declarada no Prisma — resolvido aqui
 * com uma busca à parte, como já feito em distritos.ts
 * (`/distritos/:id/encarregados`).
 */
async function montarConteudoRdo(rdo: RdoParaPdf): Promise<RdoConteudo> {
  const encarregado = rdo.encarregadoId
    ? await prisma.colaborador.findUnique({ where: { id: rdo.encarregadoId }, select: { nome: true } })
    : null;

  return {
    numeroSap: rdo.frente.contrato.numero,
    encarregadoNome: encarregado?.nome ?? null,
    equipeNome: rdo.equipe.nome,
    frenteNome: rdo.frente.nome,
    data: rdo.data,
    clima: rdo.clima,
    horaExtraInicio: rdo.horaExtraInicio,
    horaExtraFim: rdo.horaExtraFim,
    blocosHorario: rdo.blocosHorario,
    locais: rdo.locais.map((local) => ({
      descricao: local.descricao,
      kmInicial: local.kmInicial != null ? Number(local.kmInicial) : null,
      kmFinal: local.kmFinal != null ? Number(local.kmFinal) : null,
      lado: local.lado,
      atividades: local.atividades.map((atividade) => ({
        item: atividade.atividadeCatalogo.codigo,
        descricao: atividade.atividadeCatalogo.descricao,
        unidade: atividade.unidade,
        quantidade: Number(atividade.totalCalculado),
      })),
    })),
    maoDeObra: rdo.maoDeObra
      .filter((item) => item.quantidade > 0)
      .map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
    equipamentos: rdo.equipamentos
      .filter((item) => item.quantidade > 0)
      .map((item) => ({ nome: item.equipamentoCatalogo.nome, quantidade: item.quantidade })),
    observacoesContratada: rdo.observacoesContratada,
    observacoesCliente: rdo.observacoesCliente,
  };
}

function montarUrlVerificacao(rdoId: string, hash: string): string {
  const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
  return `${publicWebUrl.replace(/\/$/, "")}/verificar/${rdoId}?h=${hash}`;
}

export function registerRdosRoutes(app: FastifyInstance): void {
  app.get("/rdos", async () => {
    return prisma.rdo.findMany({ orderBy: { criadoEm: "desc" }, select: rdoListSelect });
  });

  app.post("/rdos", async (request, reply) => {
    const data = parseBody(rdoDraftCreateInputSchema, request.body, reply);
    if (!data) return;

    const linkCampoExpiraEm = new Date();
    linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

    try {
      const rdo = await prisma.rdo.create({
        data: { ...data, linkCampoToken: generateToken(), linkCampoExpiraEm },
        select: rdoListSelect,
      });
      return await reply.status(201).send(rdo);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Frente ou equipe informada não existe" });
      }
      throw error;
    }
  });

  /**
   * Cadastro completo de um RDO em uma única chamada, feito direto pelo
   * escritório (ex.: transcrevendo um RDO em papel) — ao contrário de
   * `POST /rdos`, que só cria o rascunho para o encarregado preencher pelo
   * link de campo. Ainda gera `linkCampoToken` para que o encarregado possa
   * acessar o RDO depois (ex.: anexar fotos).
   */
  app.post("/rdos/completo", async (request, reply) => {
    const data = parseBody(rdoCreateInputSchema, request.body, reply);
    if (!data) return;

    const linkCampoExpiraEm = new Date();
    linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

    try {
      const rdoId = await prisma.$transaction(async (tx) => {
        const rdo = await tx.rdo.create({
          data: {
            frenteId: data.frenteId,
            equipeId: data.equipeId,
            data: data.data,
            horaExtraInicio: data.horaExtraInicio,
            horaExtraFim: data.horaExtraFim,
            clima: data.clima,
            encarregadoId: data.encarregadoId,
            totalDesvios: data.totalDesvios,
            observacoesContratada: data.observacoesContratada,
            linkCampoToken: generateToken(),
            linkCampoExpiraEm,
            blocosHorario: { create: data.blocosHorario },
            maoDeObra: { create: data.maoDeObra },
            equipamentos: { create: data.equipamentos },
            materiais: { create: data.materiais },
          },
          select: { id: true },
        });

        for (const local of data.locais) {
          await tx.rdoLocal.create({
            data: {
              rdoId: rdo.id,
              descricao: local.descricao,
              kmInicial: local.kmInicial,
              kmFinal: local.kmFinal,
              lado: local.lado,
              ordem: local.ordem,
              atividades: {
                create: local.atividades.map((atividade) => ({
                  atividadeCatalogoId: atividade.atividadeCatalogoId,
                  ordemManutencaoId: atividade.ordemManutencaoId,
                  altura: atividade.altura,
                  largura: atividade.largura,
                  larguraFinal: atividade.larguraFinal,
                  comprimento: atividade.comprimento,
                  horasTrabalhadas: atividade.horasTrabalhadas,
                  maoObraDireta: atividade.maoObraDireta,
                  quantidadeDireta: atividade.quantidadeDireta,
                  unidade: atividade.unidade,
                  totalCalculado: calcularTotalAtividade(atividade.unidade, atividade),
                })),
              },
            },
          });
        }

        return rdo.id;
      });

      const criado = await prisma.rdo.findUnique({ where: { id: rdoId }, select: rdoCampoSelect });
      return await reply.status(201).send(criado);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Frente, equipe, encarregado, ordem de manutenção, função, colaborador, equipamento ou material inválido" });
      }
      throw error;
    }
  });

  app.get<{ Params: { token: string } }>("/rdos/campo/:token", async (request, reply) => {
    const rdo = await buscarRdoPorToken(request.params.token);
    if (!rdo) {
      return reply.status(404).send({ error: "Link inválido" });
    }
    if (tokenExpirado(rdo.linkCampoExpiraEm)) {
      return reply.status(410).send({ error: "Link expirado" });
    }

    const [ordensManutencao, atividadesCatalogo] = await Promise.all([
      prisma.ordemManutencao.findMany({ where: { frenteId: rdo.frenteId }, select: { id: true, numero: true, detalhes: true } }),
      prisma.atividadeCatalogo.findMany({
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true, codigo: true, descricao: true, unidade: true, usaDimensoes: true },
      }),
    ]);

    return { rdo, ordensManutencao, atividadesCatalogo };
  });

  app.patch<{ Params: { token: string } }>(
    "/rdos/campo/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const data = parseBody(rdoCampoUpdateInputSchema, request.body, reply);
      if (!data) return;

      const existente = await prisma.rdo.findUnique({
        where: { linkCampoToken: request.params.token },
        select: { id: true, linkCampoExpiraEm: true },
      });
      if (!existente) {
        return reply.status(404).send({ error: "Link inválido" });
      }
      if (tokenExpirado(existente.linkCampoExpiraEm)) {
        return reply.status(410).send({ error: "Link expirado" });
      }

      const rdoId = existente.id;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.rdoBlocoHorario.deleteMany({ where: { rdoId } });
          await tx.rdoAtividade.deleteMany({ where: { rdoLocal: { rdoId } } });
          await tx.rdoLocal.deleteMany({ where: { rdoId } });
          await tx.rdoMaoDeObra.deleteMany({ where: { rdoId } });
          await tx.rdoEquipamento.deleteMany({ where: { rdoId } });
          await tx.rdoMaterial.deleteMany({ where: { rdoId } });

          await tx.rdo.update({
            where: { id: rdoId },
            data: {
              horaExtraInicio: data.horaExtraInicio,
              horaExtraFim: data.horaExtraFim,
              clima: data.clima,
              encarregadoId: data.encarregadoId,
              totalDesvios: data.totalDesvios,
              observacoesContratada: data.observacoesContratada,
              blocosHorario: { create: data.blocosHorario },
              maoDeObra: { create: data.maoDeObra },
              equipamentos: { create: data.equipamentos },
              materiais: { create: data.materiais },
            },
          });

          for (const local of data.locais) {
            await tx.rdoLocal.create({
              data: {
                rdoId,
                descricao: local.descricao,
                kmInicial: local.kmInicial,
                kmFinal: local.kmFinal,
                lado: local.lado,
                ordem: local.ordem,
                atividades: {
                  create: local.atividades.map((atividade) => ({
                    atividadeCatalogoId: atividade.atividadeCatalogoId,
                    ordemManutencaoId: atividade.ordemManutencaoId,
                    altura: atividade.altura,
                    largura: atividade.largura,
                    comprimento: atividade.comprimento,
                    quantidadeDireta: atividade.quantidadeDireta,
                    unidade: atividade.unidade,
                    totalCalculado: calcularTotalAtividade(atividade.unidade, atividade),
                  })),
                },
              },
            });
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          return reply.status(400).send({ error: "Ordem de manutenção, função, colaborador, equipamento ou material inválido" });
        }
        throw error;
      }

      return await buscarRdoPorToken(request.params.token);
    },
  );

  app.post<{ Params: { token: string }; Querystring: { tipo?: string; descricao?: string } }>(
    "/rdos/campo/:token/anexos",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rdo = await prisma.rdo.findUnique({
        where: { linkCampoToken: request.params.token },
        select: { id: true, linkCampoExpiraEm: true },
      });
      if (!rdo) {
        return reply.status(404).send({ error: "Link inválido" });
      }
      if (tokenExpirado(rdo.linkCampoExpiraEm)) {
        return reply.status(410).send({ error: "Link expirado" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Nenhum arquivo enviado" });
      }

      const extensao = ANEXO_MIME_EXTENSAO[file.mimetype];
      if (!extensao) {
        return reply.status(400).send({ error: "Tipo de arquivo não permitido" });
      }

      const buffer = await file.toBuffer();

      if (file.file.truncated) {
        return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
      }
      if (!assinaturaValida(file.mimetype, buffer)) {
        return reply.status(400).send({ error: "O conteúdo do arquivo não corresponde ao tipo declarado" });
      }

      const tipoQuery = request.query.tipo;
      const tipo = (ANEXO_TIPOS as readonly string[]).includes(tipoQuery ?? "")
        ? (tipoQuery as (typeof ANEXO_TIPOS)[number])
        : "FOTO";

      const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
      const rdoDir = path.join(uploadsRoot, rdo.id);
      await mkdir(rdoDir, { recursive: true });

      const nomeArquivo = `${generateToken()}${extensao}`;
      const caminhoCompleto = path.join(rdoDir, nomeArquivo);
      await writeFile(caminhoCompleto, buffer);

      const anexo = await prisma.rdoAnexo.create({
        data: {
          rdoId: rdo.id,
          tipo,
          caminhoArquivo: caminhoCompleto,
          nomeOriginal: file.filename,
          mimeType: file.mimetype,
          tamanhoBytes: buffer.length,
          descricao: request.query.descricao ?? null,
        },
        select: {
          id: true,
          tipo: true,
          nomeOriginal: true,
          mimeType: true,
          tamanhoBytes: true,
          descricao: true,
          criadoEm: true,
        },
      });

      return await reply.status(201).send(anexo);
    },
  );

  app.get<{ Params: { id: string } }>("/rdos/:id", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: rdoCampoSelect });
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });
    return rdo;
  });

  app.post<{ Params: { id: string } }>("/rdos/:id/pdf", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: rdoCampoSelect });
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });

    const conteudo = await montarConteudoRdo(rdo);
    const hash = calcularHashConteudo(conteudo);
    const urlVerificacao = montarUrlVerificacao(rdo.id, hash);
    const buffer = await gerarPdfRdo({ ...conteudo, urlVerificacao });

    const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
    const rdoDir = path.join(uploadsRoot, "rdos", rdo.id);
    await mkdir(rdoDir, { recursive: true });
    const caminhoCompleto = path.join(rdoDir, "rdo.pdf");
    await writeFile(caminhoCompleto, buffer);

    const atualizado = await prisma.rdo.update({
      where: { id: rdo.id },
      data: { pdfPath: caminhoCompleto, pdfHash: hash },
      select: { id: true, pdfPath: true, pdfHash: true },
    });

    return atualizado;
  });

  app.get<{ Params: { id: string } }>("/rdos/:id/pdf", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({
      where: { id: request.params.id },
      select: { pdfPath: true },
    });
    if (!rdo?.pdfPath) return reply.status(404).send({ error: "PDF ainda não foi gerado para este RDO" });

    const buffer = await readFile(rdo.pdfPath);
    return reply.header("Content-Type", "application/pdf").send(buffer);
  });

  /**
   * Pública (sem login) e propositalmente enxuta — o que dá pra ver
   * escaneando o QR do PDF, sem expor dados sensíveis do RDO. Segue a mesma
   * filosofia de acesso sem autenticação de `/rdos/campo/:token`, mas por ID
   * (não por token secreto) porque aqui o objetivo é o oposto: qualquer um
   * com o papel em mãos deve conseguir validar, não é um link privado.
   */
  app.get<{ Params: { id: string }; Querystring: { h?: string } }>(
    "/rdos/:id/verificar",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rdo = await prisma.rdo.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          data: true,
          status: true,
          pdfHash: true,
          frente: { select: { nome: true } },
          equipe: { select: { nome: true } },
        },
      });
      if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });

      const hashRecebido = request.query.h;
      const autentico = hashRecebido != null && rdo.pdfHash != null && hashRecebido === rdo.pdfHash;

      return {
        rdoId: rdo.id,
        data: rdo.data,
        frente: rdo.frente.nome,
        equipe: rdo.equipe.nome,
        status: rdo.status,
        autentico,
        motivo: rdo.pdfHash == null ? "PDF_NAO_GERADO" : autentico ? "OK" : "HASH_DESATUALIZADO",
      };
    },
  );
}

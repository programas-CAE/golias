import { portalFiscalReprovarInputSchema } from "@golias/shared";
import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gerarEArmazenarPdf, rdoCampoSelect } from "./rdos.js";
import { assinaturaValida } from "../lib/anexoArquivo.js";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

export const STATUS_PENDENTES = ["AGUARDANDO_APROVACAO", "EM_CORRECAO"] as const;

const rdoResumoSelect = {
  id: true,
  data: true,
  status: true,
  enviadoParaFiscalEm: true,
  equipe: { select: { id: true, nome: true } },
} as const;

async function buscarFrentePorToken(token: string) {
  return prisma.frente.findUnique({
    where: { portalFiscalToken: token },
    select: { id: true, nome: true, codigo: true },
  });
}

/** Reaproveitado pela rota de token (portal fixo) e pela autenticada (routes/fiscal.ts). */
export async function listarRdosDaFrente(frenteId: string) {
  const [pendentes, historico] = await Promise.all([
    prisma.rdo.findMany({
      where: { frenteId, status: { in: [...STATUS_PENDENTES] } },
      orderBy: { data: "desc" },
      select: rdoResumoSelect,
    }),
    prisma.rdo.findMany({
      where: { frenteId, status: { in: ["APROVADO", "REPROVADO"] } },
      orderBy: { data: "desc" },
      take: 30,
      select: rdoResumoSelect,
    }),
  ]);
  return { pendentes, historico };
}

export async function buscarRdoDaFrente(rdoId: string, frenteId: string) {
  const rdo = await prisma.rdo.findUnique({ where: { id: rdoId }, select: rdoCampoSelect });
  if (!rdo || rdo.frenteId !== frenteId) return null;
  return rdo;
}

interface AssinarRdoInput {
  rdoId: string;
  frenteId: string;
  fiscalNome: string;
  fiscalEmail: string;
  observacao: string | null;
  arquivo: Buffer;
  ip: string;
}

/** Grava a assinatura/aprovação e regera o PDF — quem chama já validou o RDO (existe, é dessa frente, está pendente) e o PNG da assinatura. */
export async function assinarRdo({ rdoId, fiscalNome, fiscalEmail, observacao, arquivo, ip }: AssinarRdoInput) {
  const rdo = await prisma.rdo.findUniqueOrThrow({ where: { id: rdoId }, select: { id: true, status: true, pdfHash: true } });

  const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
  const rdoDir = path.join(uploadsRoot, "rdos", rdo.id);
  await mkdir(rdoDir, { recursive: true });
  const caminhoAssinatura = path.join(rdoDir, "assinatura-fiscal.png");
  await writeFile(caminhoAssinatura, arquivo);

  await prisma.$transaction([
    prisma.aprovacaoFiscal.create({
      data: {
        rdoId: rdo.id,
        fiscalNome,
        fiscalEmail,
        token: generateToken(),
        tokenExpiraEm: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "APROVADO",
        assinanteNome: fiscalNome,
        assinadoEm: new Date(),
        assinadoIp: ip,
        documentoHash: rdo.pdfHash,
        assinaturaImagemPath: caminhoAssinatura,
        observacao: observacao || null,
      },
    }),
    prisma.rdo.update({ where: { id: rdo.id }, data: { status: "APROVADO" } }),
    prisma.rdoHistorico.create({
      data: { rdoId: rdo.id, deStatus: rdo.status, paraStatus: "APROVADO", ator: fiscalNome },
    }),
  ]);

  return gerarEArmazenarPdf(rdo.id);
}

interface ReprovarRdoInput {
  rdoId: string;
  fiscalNome: string;
  fiscalEmail: string;
  comentario: string;
  ip: string;
}

export async function reprovarRdo({ rdoId, fiscalNome, fiscalEmail, comentario, ip }: ReprovarRdoInput) {
  const rdo = await prisma.rdo.findUniqueOrThrow({ where: { id: rdoId }, select: { id: true, status: true } });

  await prisma.$transaction([
    prisma.aprovacaoFiscal.create({
      data: {
        rdoId: rdo.id,
        fiscalNome,
        fiscalEmail,
        token: generateToken(),
        tokenExpiraEm: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "REPROVADO",
        assinanteNome: fiscalNome,
        assinadoEm: new Date(),
        assinadoIp: ip,
        comentarioReprovacao: comentario,
      },
    }),
    prisma.rdo.update({ where: { id: rdo.id }, data: { status: "REPROVADO" } }),
    prisma.rdoHistorico.create({
      data: { rdoId: rdo.id, deStatus: rdo.status, paraStatus: "REPROVADO", ator: fiscalNome, observacao: comentario },
    }),
  ]);

  return prisma.rdo.findUnique({ where: { id: rdo.id }, select: rdoCampoSelect });
}

export function registerPortalFiscalRoutes(app: FastifyInstance): void {
  /**
   * Portal fixo do fiscal, por frente (não por RDO) — o link não expira,
   * o fiscal salva/favorita e volta nele sempre. Pública, sem login, mesma
   * filosofia de `/rdos/campo/:token`.
   */
  app.get<{ Params: { token: string } }>("/portal-fiscal/:token", async (request, reply) => {
    const frente = await buscarFrentePorToken(request.params.token);
    if (!frente) return reply.status(404).send({ error: "Link inválido" });

    const { pendentes, historico } = await listarRdosDaFrente(frente.id);
    return { frente, pendentes, historico };
  });

  app.get<{ Params: { token: string; rdoId: string } }>(
    "/portal-fiscal/:token/rdos/:rdoId",
    async (request, reply) => {
      const frente = await buscarFrentePorToken(request.params.token);
      if (!frente) return reply.status(404).send({ error: "Link inválido" });

      const rdo = await buscarRdoDaFrente(request.params.rdoId, frente.id);
      if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });

      return rdo;
    },
  );

  app.post<{ Params: { token: string; rdoId: string } }>(
    "/portal-fiscal/:token/rdos/:rdoId/assinar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const frente = await buscarFrentePorToken(request.params.token);
      if (!frente) return reply.status(404).send({ error: "Link inválido" });

      const rdo = await prisma.rdo.findUnique({
        where: { id: request.params.rdoId },
        select: { id: true, frenteId: true, status: true, pdfHash: true },
      });
      if (!rdo || rdo.frenteId !== frente.id) {
        return reply.status(404).send({ error: "RDO não encontrado" });
      }
      if (!(STATUS_PENDENTES as readonly string[]).includes(rdo.status)) {
        return reply.status(409).send({ error: "Este RDO não está aguardando aprovação" });
      }

      let fiscalNome = "";
      let fiscalEmail = "";
      let observacao = "";
      let arquivo: Buffer | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.mimetype !== "image/png") {
            return reply.status(400).send({ error: "A assinatura precisa ser PNG" });
          }
          arquivo = await part.toBuffer();
          if (part.file.truncated) {
            return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
          }
        } else if (part.fieldname === "fiscalNome") {
          fiscalNome = String(part.value).trim();
        } else if (part.fieldname === "fiscalEmail") {
          fiscalEmail = String(part.value).trim();
        } else if (part.fieldname === "observacao") {
          observacao = String(part.value).trim().slice(0, 2000);
        }
      }

      if (!fiscalNome) return reply.status(400).send({ error: "Informe seu nome" });
      if (!fiscalEmail) return reply.status(400).send({ error: "Informe seu e-mail" });
      if (!arquivo) return reply.status(400).send({ error: "Assinatura não enviada" });
      if (!assinaturaValida("image/png", arquivo)) {
        return reply.status(400).send({ error: "Assinatura inválida" });
      }

      return assinarRdo({ rdoId: rdo.id, frenteId: frente.id, fiscalNome, fiscalEmail, observacao: observacao || null, arquivo, ip: request.ip });
    },
  );

  app.post<{ Params: { token: string; rdoId: string } }>(
    "/portal-fiscal/:token/rdos/:rdoId/reprovar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const frente = await buscarFrentePorToken(request.params.token);
      if (!frente) return reply.status(404).send({ error: "Link inválido" });

      const data = parseBody(portalFiscalReprovarInputSchema, request.body, reply);
      if (!data) return;

      const rdo = await prisma.rdo.findUnique({
        where: { id: request.params.rdoId },
        select: { id: true, frenteId: true, status: true },
      });
      if (!rdo || rdo.frenteId !== frente.id) {
        return reply.status(404).send({ error: "RDO não encontrado" });
      }
      if (!(STATUS_PENDENTES as readonly string[]).includes(rdo.status)) {
        return reply.status(409).send({ error: "Este RDO não está aguardando aprovação" });
      }

      return reprovarRdo({ rdoId: rdo.id, fiscalNome: data.fiscalNome, fiscalEmail: data.fiscalEmail, comentario: data.comentario, ip: request.ip });
    },
  );
}

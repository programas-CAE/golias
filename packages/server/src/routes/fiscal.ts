import { portalFiscalReprovarInputSchema } from "@golias/shared";
import type { FastifyInstance } from "fastify";
import { exigirRole } from "../lib/authGuard.js";
import { assinaturaValida } from "../lib/anexoArquivo.js";
import { prisma } from "../lib/prisma.js";
import { assinarRdo, buscarRdoDaFrente, listarRdosDaFrente, reprovarRdo, STATUS_PENDENTES } from "./portalFiscal.js";
import { parseBody } from "../lib/validate.js";

/**
 * Portal do fiscal por login (substitui o link público por frente pra quem
 * já tem usuário cadastrado) — nome/e-mail vêm do usuário logado, não são
 * mais digitados a cada aprovação/reprovação.
 */
export function registerFiscalRoutes(app: FastifyInstance): void {
  app.get("/fiscal/rdos", async (request, reply) => {
    const usuario = await exigirRole(["FISCAL"])(request, reply);
    if (!usuario) return;
    if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

    const frente = await prisma.frente.findUnique({ where: { id: usuario.frenteId }, select: { id: true, nome: true, codigo: true } });
    if (!frente) return reply.status(404).send({ error: "Frente não encontrada" });

    const { pendentes, historico } = await listarRdosDaFrente(frente.id);
    return { frente, pendentes, historico };
  });

  app.get<{ Params: { rdoId: string } }>("/fiscal/rdos/:rdoId", async (request, reply) => {
    const usuario = await exigirRole(["FISCAL"])(request, reply);
    if (!usuario) return;
    if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

    const rdo = await buscarRdoDaFrente(request.params.rdoId, usuario.frenteId);
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });
    return rdo;
  });

  app.post<{ Params: { rdoId: string } }>(
    "/fiscal/rdos/:rdoId/assinar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const usuario = await exigirRole(["FISCAL"])(request, reply);
      if (!usuario) return;
      if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

      const rdo = await prisma.rdo.findUnique({ where: { id: request.params.rdoId }, select: { id: true, frenteId: true, status: true } });
      if (!rdo || rdo.frenteId !== usuario.frenteId) return reply.status(404).send({ error: "RDO não encontrado" });
      if (!(STATUS_PENDENTES as readonly string[]).includes(rdo.status)) {
        return reply.status(409).send({ error: "Este RDO não está aguardando aprovação" });
      }

      const fiscal = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.sub } });

      let observacao = "";
      let arquivo: Buffer | undefined;
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.mimetype !== "image/png") return reply.status(400).send({ error: "A assinatura precisa ser PNG" });
          arquivo = await part.toBuffer();
          if (part.file.truncated) return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
        } else if (part.fieldname === "observacao") {
          observacao = String(part.value).trim().slice(0, 2000);
        }
      }
      if (!arquivo) return reply.status(400).send({ error: "Assinatura não enviada" });
      if (!assinaturaValida("image/png", arquivo)) return reply.status(400).send({ error: "Assinatura inválida" });

      return assinarRdo({
        rdoId: rdo.id,
        frenteId: usuario.frenteId,
        fiscalNome: fiscal.nome,
        fiscalEmail: fiscal.email ?? "",
        observacao: observacao || null,
        arquivo,
        ip: request.ip,
      });
    },
  );

  app.post<{ Params: { rdoId: string } }>(
    "/fiscal/rdos/:rdoId/reprovar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const usuario = await exigirRole(["FISCAL"])(request, reply);
      if (!usuario) return;
      if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

      const data = parseBody(portalFiscalReprovarInputSchema.pick({ comentario: true }), request.body, reply);
      if (!data) return;

      const rdo = await prisma.rdo.findUnique({ where: { id: request.params.rdoId }, select: { id: true, frenteId: true, status: true } });
      if (!rdo || rdo.frenteId !== usuario.frenteId) return reply.status(404).send({ error: "RDO não encontrado" });
      if (!(STATUS_PENDENTES as readonly string[]).includes(rdo.status)) {
        return reply.status(409).send({ error: "Este RDO não está aguardando aprovação" });
      }

      const fiscal = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.sub } });

      return reprovarRdo({
        rdoId: rdo.id,
        fiscalNome: fiscal.nome,
        fiscalEmail: fiscal.email ?? "",
        comentario: data.comentario,
        ip: request.ip,
      });
    },
  );
}

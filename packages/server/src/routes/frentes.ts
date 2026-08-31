import { frenteUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

const frenteSelect = {
  id: true,
  codigo: true,
  nome: true,
  ativo: true,
  contratoId: true,
  contrato: { select: { id: true, numero: true, nome: true } },
  portalFiscalToken: true,
  portalEncarregadoToken: true,
} as const;

export function registerFrentesRoutes(app: FastifyInstance): void {
  app.get("/frentes", async () => {
    return prisma.frente.findMany({
      orderBy: { codigo: "asc" },
      select: frenteSelect,
    });
  });

  app.patch<{ Params: { id: string } }>("/frentes/:id", async (request, reply) => {
    const data = parseBody(frenteUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.frente.update({
        where: { id: request.params.id },
        data,
        select: frenteSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return reply.status(404).send({ error: "Frente não encontrada" });
        if (error.code === "P2003") return reply.status(400).send({ error: "Contrato informado não existe" });
      }
      throw error;
    }
  });

  /**
   * Gera (ou renova, se já existir) o link fixo do portal do fiscal dessa
   * frente — não expira. Renovar invalida o link antigo (ex.: se vazou).
   */
  app.post<{ Params: { id: string } }>("/frentes/:id/portal-token", async (request, reply) => {
    try {
      return await prisma.frente.update({
        where: { id: request.params.id },
        data: { portalFiscalToken: generateToken() },
        select: frenteSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Frente não encontrada" });
      }
      throw error;
    }
  });

  /**
   * Gera (ou renova) o link fixo do portal do encarregado dessa frente —
   * mesma lógica do portal do fiscal, ver comentário em `portal-token`.
   */
  app.post<{ Params: { id: string } }>("/frentes/:id/portal-encarregado-token", async (request, reply) => {
    try {
      return await prisma.frente.update({
        where: { id: request.params.id },
        data: { portalEncarregadoToken: generateToken() },
        select: frenteSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Frente não encontrada" });
      }
      throw error;
    }
  });
}

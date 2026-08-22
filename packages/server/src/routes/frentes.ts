import { frenteUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const frenteSelect = {
  id: true,
  codigo: true,
  nome: true,
  ativo: true,
  contratoId: true,
  contrato: { select: { id: true, numero: true, nome: true } },
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
}

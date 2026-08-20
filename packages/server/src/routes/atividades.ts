import { atividadeCatalogoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const atividadeSelect = {
  id: true,
  codigo: true,
  descricao: true,
  unidade: true,
  metaPus: true,
  usaDimensoes: true,
  ativo: true,
  ordem: true,
} as const;

export function registerAtividadesRoutes(app: FastifyInstance): void {
  app.get("/atividades", async () => {
    return prisma.atividadeCatalogo.findMany({
      orderBy: { ordem: "asc" },
      select: atividadeSelect,
    });
  });

  app.patch<{ Params: { id: string } }>("/atividades/:id", async (request, reply) => {
    const data = parseBody(atividadeCatalogoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.atividadeCatalogo.update({
        where: { id: request.params.id },
        data,
        select: atividadeSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Atividade não encontrada" });
      }
      throw error;
    }
  });
}

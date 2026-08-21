import { equipeCreateInputSchema, equipeMembroInputSchema, equipeUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const membroSelect = {
  id: true,
  colaboradorId: true,
  colaborador: { select: { id: true, nome: true } },
  funcaoId: true,
  funcao: { select: { id: true, nome: true } },
  quantidade: true,
} as const;

const equipeSelect = {
  id: true,
  nome: true,
  distritoId: true,
  distrito: { select: { id: true, nome: true, frenteId: true, frente: { select: { id: true, nome: true } } } },
  encarregadoId: true,
  ativo: true,
  membros: { select: membroSelect },
} as const;

export function registerEquipesRoutes(app: FastifyInstance): void {
  app.get("/equipes", async () => {
    return prisma.equipe.findMany({ orderBy: { nome: "asc" }, select: equipeSelect });
  });

  app.post("/equipes", async (request, reply) => {
    const data = parseBody(equipeCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const equipe = await prisma.equipe.create({ data, select: equipeSelect });
      return await reply.status(201).send(equipe);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Distrito informado não existe" });
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/equipes/:id", async (request, reply) => {
    const data = parseBody(equipeUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.equipe.update({ where: { id: request.params.id }, data, select: equipeSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return reply.status(404).send({ error: "Equipe não encontrada" });
        if (error.code === "P2003") return reply.status(400).send({ error: "Frente informada não existe" });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/equipes/:id/membros", async (request, reply) => {
    const data = parseBody(equipeMembroInputSchema, request.body, reply);
    if (!data) return;

    try {
      const membro = await prisma.equipeMembro.create({
        data: { ...data, equipeId: request.params.id },
        select: membroSelect,
      });
      return await reply.status(201).send(membro);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Colaborador já faz parte desta equipe" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Equipe, colaborador ou função inválidos" });
        }
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string; membroId: string } }>(
    "/equipes/:id/membros/:membroId",
    async (request, reply) => {
      // deleteMany (não delete) porque {id, equipeId} não é uma constraint
      // única — isso também garante que só removemos o membro se ele
      // pertencer à equipe do path, e não a outra.
      const { count } = await prisma.equipeMembro.deleteMany({
        where: { id: request.params.membroId, equipeId: request.params.id },
      });
      if (count === 0) {
        return reply.status(404).send({ error: "Membro não encontrado" });
      }
      return reply.status(204).send();
    },
  );
}

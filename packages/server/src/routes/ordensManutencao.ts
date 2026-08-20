import { ordemManutencaoCreateInputSchema, ordemManutencaoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const ordemSelect = {
  id: true,
  numero: true,
  frenteId: true,
  frente: { select: { id: true, nome: true, codigo: true } },
  dataEmissao: true,
  kmInicial: true,
  kmFinal: true,
  lado: true,
  detalhes: true,
} as const;

export function registerOrdensManutencaoRoutes(app: FastifyInstance): void {
  app.get("/ordens-manutencao", async () => {
    return prisma.ordemManutencao.findMany({
      orderBy: { dataEmissao: "desc" },
      select: ordemSelect,
    });
  });

  app.post("/ordens-manutencao", async (request, reply) => {
    const data = parseBody(ordemManutencaoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const ordem = await prisma.ordemManutencao.create({ data, select: ordemSelect });
      return await reply.status(201).send(ordem);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe uma ordem com esse número" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente informada não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/ordens-manutencao/:id", async (request, reply) => {
    const data = parseBody(ordemManutencaoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.ordemManutencao.update({
        where: { id: request.params.id },
        data,
        select: ordemSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
        }
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe uma ordem com esse número" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente informada não existe" });
        }
      }
      throw error;
    }
  });
}

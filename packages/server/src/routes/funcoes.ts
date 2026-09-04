import { funcaoCatalogoCreateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

export function registerFuncoesRoutes(app: FastifyInstance): void {
  app.get("/funcoes", async () => {
    return prisma.funcaoCatalogo.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
  });

  app.post("/funcoes", async (request, reply) => {
    const data = parseBody(funcaoCatalogoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const criada = await prisma.funcaoCatalogo.create({ data, select: { id: true, nome: true } });
      return await reply.status(201).send(criada);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.status(409).send({ error: "Já existe uma função com esse nome" });
      }
      throw error;
    }
  });
}

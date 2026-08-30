import { equipamentoCatalogoCreateInputSchema, equipamentoCatalogoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const equipamentoSelect = { id: true, nome: true, ativo: true } as const;

export function registerEquipamentosRoutes(app: FastifyInstance): void {
  /**
   * `?todos=1` traz também os inativos — usado pela tela de gerenciamento
   * do catálogo (packages/desktop/src/pages/Equipamentos.tsx). Sem o
   * parâmetro, só os ativos — o que os formulários de RDO consomem, pra
   * não oferecer um equipamento fora de uso.
   */
  app.get<{ Querystring: { todos?: string } }>("/equipamentos", async (request) => {
    return prisma.equipamentoCatalogo.findMany({
      where: request.query.todos ? {} : { ativo: true },
      orderBy: { nome: "asc" },
      select: equipamentoSelect,
    });
  });

  app.post("/equipamentos", async (request, reply) => {
    const data = parseBody(equipamentoCatalogoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const criado = await prisma.equipamentoCatalogo.create({ data, select: equipamentoSelect });
      return await reply.status(201).send(criado);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.status(400).send({ error: "Já existe um equipamento com esse nome" });
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/equipamentos/:id", async (request, reply) => {
    const data = parseBody(equipamentoCatalogoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.equipamentoCatalogo.update({
        where: { id: request.params.id },
        data,
        select: equipamentoSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Equipamento não encontrado" });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.status(400).send({ error: "Já existe um equipamento com esse nome" });
      }
      throw error;
    }
  });
}

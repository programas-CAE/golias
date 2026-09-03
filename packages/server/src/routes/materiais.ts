import { materialCatalogoCreateInputSchema, materialCatalogoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const materialSelect = {
  id: true,
  contratoId: true,
  codigo: true,
  descricao: true,
  unidade: true,
  precoUnitario: true,
  ativo: true,
} as const;

export function registerMateriaisRoutes(app: FastifyInstance): void {
  /**
   * `?todos=1` traz também os inativos — usado pela tela de gerenciamento
   * do catálogo (packages/desktop/src/pages/Catalogos.tsx). Sem o
   * parâmetro, só os ativos — o que o formulário de RDO consome.
   */
  app.get<{ Querystring: { todos?: string } }>("/materiais", async (request) => {
    return prisma.materialCatalogo.findMany({
      where: request.query.todos ? {} : { ativo: true },
      orderBy: { descricao: "asc" },
      select: materialSelect,
    });
  });

  app.post("/materiais", async (request, reply) => {
    const data = parseBody(materialCatalogoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const criado = await prisma.materialCatalogo.create({ data, select: materialSelect });
      return await reply.status(201).send(criado);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um material com esse código nesse contrato" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Contrato informado não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/materiais/:id", async (request, reply) => {
    const data = parseBody(materialCatalogoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.materialCatalogo.update({
        where: { id: request.params.id },
        data,
        select: materialSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Material não encontrado" });
      }
      throw error;
    }
  });
}

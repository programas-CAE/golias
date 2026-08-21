import { colaboradorCreateInputSchema, colaboradorUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const colaboradorSelect = {
  id: true,
  matricula: true,
  nome: true,
  ativo: true,
  funcaoId: true,
  funcao: { select: { id: true, nome: true } },
} as const;

export function registerColaboradoresRoutes(app: FastifyInstance): void {
  app.get("/colaboradores", async () => {
    return prisma.colaborador.findMany({
      orderBy: { nome: "asc" },
      select: colaboradorSelect,
    });
  });

  app.post("/colaboradores", async (request, reply) => {
    const data = parseBody(colaboradorCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const colaborador = await prisma.colaborador.create({ data, select: colaboradorSelect });
      return await reply.status(201).send(colaborador);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um colaborador com essa matrícula" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Função informada não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/colaboradores/:id", async (request, reply) => {
    const data = parseBody(colaboradorUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.colaborador.update({
        where: { id: request.params.id },
        data,
        select: colaboradorSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.status(404).send({ error: "Colaborador não encontrado" });
        }
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um colaborador com essa matrícula" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Função informada não existe" });
        }
      }
      throw error;
    }
  });

  /**
   * "Equipe efetiva" do encarregado: mão de obra e equipamentos do RDO mais
   * recente em que ele aparece como `Rdo.encarregadoId` — reflete quem
   * realmente trabalhou por último, não o cadastro fixo de `EquipeMembro`.
   */
  app.get<{ Params: { id: string } }>("/colaboradores/:id/equipe-efetiva", async (request, reply) => {
    const rdo = await prisma.rdo.findFirst({
      where: { encarregadoId: request.params.id },
      orderBy: { data: "desc" },
      select: {
        id: true,
        data: true,
        equipe: { select: { id: true, nome: true } },
        maoDeObra: {
          select: {
            id: true,
            quantidade: true,
            funcao: { select: { id: true, nome: true } },
            colaborador: { select: { id: true, nome: true } },
          },
        },
        equipamentos: {
          select: { id: true, quantidade: true, equipamentoCatalogo: { select: { id: true, nome: true } } },
        },
      },
    });

    if (!rdo) {
      return reply.status(404).send({ error: "Este encarregado ainda não aparece em nenhum RDO." });
    }
    return rdo;
  });
}

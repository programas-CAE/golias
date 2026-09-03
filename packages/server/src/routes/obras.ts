import { obraCreateInputSchema, obraUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const obraSelect = { id: true, nome: true, ativo: true, criadoEm: true } as const;

export function registerObrasRoutes(app: FastifyInstance): void {
  /**
   * `?todos=1` traz também as inativas — usado pela tela de cadastro do
   * escritório. Sem o parâmetro, só as ativas — o que o encarregado escolhe
   * ao lançar o RDO do dia.
   */
  app.get<{ Querystring: { todos?: string } }>("/obras", async (request) => {
    return prisma.obra.findMany({
      where: request.query.todos ? {} : { ativo: true },
      orderBy: { nome: "asc" },
      select: obraSelect,
    });
  });

  app.post("/obras", async (request, reply) => {
    const data = parseBody(obraCreateInputSchema, request.body, reply);
    if (!data) return;

    const criada = await prisma.obra.create({ data, select: obraSelect });
    return await reply.status(201).send(criada);
  });

  app.patch<{ Params: { id: string } }>("/obras/:id", async (request, reply) => {
    const data = parseBody(obraUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.obra.update({ where: { id: request.params.id }, data, select: obraSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Obra não encontrada" });
      }
      throw error;
    }
  });

  /**
   * Cronograma da obra — todos os RDOs lançados nela dentro do mês
   * informado, pra montar o calendário na tela. Diferente do Farol (ciclo
   * de medição dia 19-20), aqui é o mês civil mesmo: Obra não é sobre
   * medição de OM, é sobre acompanhar quando essa obra teve gente
   * trabalhando nela.
   */
  app.get<{ Params: { id: string }; Querystring: { mes?: string } }>(
    "/obras/:id/calendario",
    async (request, reply) => {
      const obra = await prisma.obra.findUnique({ where: { id: request.params.id }, select: { id: true, nome: true } });
      if (!obra) return reply.status(404).send({ error: "Obra não encontrada" });

      const mesParam =
        request.query.mes && /^\d{4}-\d{2}$/.test(request.query.mes)
          ? request.query.mes
          : new Date().toISOString().slice(0, 7);
      const ano = Number(mesParam.slice(0, 4));
      const mes = Number(mesParam.slice(5, 7));
      const inicio = new Date(Date.UTC(ano, mes - 1, 1));
      const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

      const rdos = await prisma.rdo.findMany({
        where: { obraId: obra.id, data: { gte: inicio, lte: fim } },
        orderBy: { data: "asc" },
        select: {
          id: true,
          data: true,
          status: true,
          equipe: { select: { id: true, nome: true } },
          frente: { select: { id: true, nome: true } },
        },
      });

      return {
        obra,
        periodo: { mes: mesParam, inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) },
        rdos,
      };
    },
  );

  /**
   * Lista de materiais consolidada da obra, a partir de todos os RDOs já
   * lançados nela — total por material (pra saber quanto já foi usado no
   * todo) e o detalhe por data/RDO (pra saber quando cada quantidade
   * entrou), conforme os lançamentos forem acontecendo.
   */
  app.get<{ Params: { id: string } }>("/obras/:id/materiais", async (request, reply) => {
    const obra = await prisma.obra.findUnique({ where: { id: request.params.id }, select: { id: true, nome: true } });
    if (!obra) return reply.status(404).send({ error: "Obra não encontrada" });

    const rdos = await prisma.rdo.findMany({
      where: { obraId: obra.id },
      orderBy: { data: "asc" },
      select: {
        id: true,
        data: true,
        equipe: { select: { nome: true } },
        materiais: {
          select: {
            quantidade: true,
            materialCatalogo: { select: { id: true, descricao: true, unidade: true } },
          },
        },
      },
    });

    const totais = new Map<string, { materialCatalogoId: string; descricao: string; unidade: string; quantidadeTotal: number }>();
    const porData: Array<{
      rdoId: string;
      data: string;
      equipe: string;
      materiais: Array<{ descricao: string; unidade: string; quantidade: number }>;
    }> = [];

    for (const rdo of rdos) {
      if (rdo.materiais.length === 0) continue;
      porData.push({
        rdoId: rdo.id,
        data: rdo.data.toISOString().slice(0, 10),
        equipe: rdo.equipe.nome,
        materiais: rdo.materiais.map((item) => ({
          descricao: item.materialCatalogo.descricao,
          unidade: item.materialCatalogo.unidade,
          quantidade: Number(item.quantidade),
        })),
      });
      for (const item of rdo.materiais) {
        const chave = item.materialCatalogo.id;
        const atual = totais.get(chave) ?? {
          materialCatalogoId: chave,
          descricao: item.materialCatalogo.descricao,
          unidade: item.materialCatalogo.unidade,
          quantidadeTotal: 0,
        };
        atual.quantidadeTotal += Number(item.quantidade);
        totais.set(chave, atual);
      }
    }

    return {
      obra,
      totais: [...totais.values()].sort((a, b) => a.descricao.localeCompare(b.descricao)),
      porData,
    };
  });
}

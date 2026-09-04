import { obraCreateInputSchema, obraEtapaInputSchema, obraUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

const obraSelect = { id: true, nome: true, ativo: true, criadoEm: true } as const;
const etapaSelect = { id: true, obraId: true, nome: true, dataInicioPrevista: true, dataFimPrevista: true } as const;

function minutosDoHorario(horario: string): number {
  const [horaStr, minutoStr] = horario.split(":");
  return Number(horaStr) * 60 + Number(minutoStr);
}

/** Soma blocos de horário + horasTrabalhadas já derivado de cada atividade — mesmo cálculo usado no PDF do RDO. */
function calcularHorasTrabalhadas(rdo: {
  blocosHorario: Array<{ horarioInicial: string; horarioFinal: string }>;
  locais: Array<{ atividades: Array<{ horasTrabalhadas: Prisma.Decimal | null }> }>;
}): number {
  let minutos = 0;
  for (const bloco of rdo.blocosHorario) {
    const diferenca = minutosDoHorario(bloco.horarioFinal) - minutosDoHorario(bloco.horarioInicial);
    if (diferenca > 0) minutos += diferenca;
  }
  let horasAtividades = 0;
  for (const local of rdo.locais) {
    for (const atividade of local.atividades) {
      if (atividade.horasTrabalhadas != null) horasAtividades += Number(atividade.horasTrabalhadas);
    }
  }
  return minutos / 60 + horasAtividades;
}

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

  /** Etapas/fases PLANEJADAS da obra (cronograma) — datas previstas cadastradas pelo escritório. */
  app.get<{ Params: { id: string } }>("/obras/:id/etapas", async (request, reply) => {
    const obra = await prisma.obra.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!obra) return reply.status(404).send({ error: "Obra não encontrada" });

    return prisma.obraEtapa.findMany({
      where: { obraId: obra.id },
      orderBy: { dataInicioPrevista: "asc" },
      select: etapaSelect,
    });
  });

  app.post<{ Params: { id: string } }>("/obras/:id/etapas", async (request, reply) => {
    const obra = await prisma.obra.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!obra) return reply.status(404).send({ error: "Obra não encontrada" });

    const data = parseBody(obraEtapaInputSchema, request.body, reply);
    if (!data) return;

    const criada = await prisma.obraEtapa.create({ data: { ...data, obraId: obra.id }, select: etapaSelect });
    return await reply.status(201).send(criada);
  });

  app.patch<{ Params: { id: string; etapaId: string } }>("/obras/:id/etapas/:etapaId", async (request, reply) => {
    const data = parseBody(obraEtapaInputSchema, request.body, reply);
    if (!data) return;

    const { count } = await prisma.obraEtapa.updateMany({
      where: { id: request.params.etapaId, obraId: request.params.id },
      data,
    });
    if (count === 0) return reply.status(404).send({ error: "Etapa não encontrada" });
    return prisma.obraEtapa.findUniqueOrThrow({ where: { id: request.params.etapaId }, select: etapaSelect });
  });

  app.delete<{ Params: { id: string; etapaId: string } }>("/obras/:id/etapas/:etapaId", async (request, reply) => {
    const { count } = await prisma.obraEtapa.deleteMany({
      where: { id: request.params.etapaId, obraId: request.params.id },
    });
    if (count === 0) return reply.status(404).send({ error: "Etapa não encontrada" });
    return reply.status(204).send();
  });

  /**
   * Cronograma da obra: etapas PLANEJADAS (todas, pra desenhar a barra
   * mesmo quando ultrapassam o mês visível) + apontamentos REAIS (RDOs) do
   * ciclo de medição informado — mesmo ciclo dia 19 do mês anterior ao dia
   * 20 do mês selecionado usado no Farol de OM/RDO, pra bater com o
   * fechamento mensal que a obra também segue.
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
      const inicio = new Date(Date.UTC(ano, mes - 2, 19));
      const fim = new Date(Date.UTC(ano, mes - 1, 20, 23, 59, 59, 999));

      const [rdos, etapas] = await Promise.all([
        prisma.rdo.findMany({
          where: { obraId: obra.id, data: { gte: inicio, lte: fim } },
          orderBy: { data: "asc" },
          select: {
            id: true,
            data: true,
            status: true,
            equipe: { select: { id: true, nome: true } },
            frente: { select: { id: true, nome: true } },
            blocosHorario: { select: { horarioInicial: true, horarioFinal: true } },
            locais: { select: { atividades: { select: { horasTrabalhadas: true } } } },
            maoDeObra: { select: { quantidade: true, funcao: { select: { nome: true } } } },
            materiais: { select: { quantidade: true, materialCatalogo: { select: { descricao: true, unidade: true } } } },
          },
        }),
        prisma.obraEtapa.findMany({ where: { obraId: obra.id }, orderBy: { dataInicioPrevista: "asc" }, select: etapaSelect }),
      ]);

      return {
        obra,
        periodo: { mes: mesParam, inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) },
        etapas,
        rdos: rdos.map(({ blocosHorario, locais, maoDeObra, materiais, ...rdo }) => ({
          ...rdo,
          horasTrabalhadas: calcularHorasTrabalhadas({ blocosHorario, locais }),
          maoDeObra: maoDeObra.map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
          materiais: materiais.map((item) => ({
            descricao: item.materialCatalogo.descricao,
            unidade: item.materialCatalogo.unidade,
            quantidade: Number(item.quantidade),
          })),
        })),
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

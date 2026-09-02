import { distritoCreateInputSchema, distritoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";
import {
  calcularProdutividade,
  calcularQlp,
  extrairMetasDoMesAnterior,
  intervaloDoMes,
  periodoAnterior,
  rdoIndicadorSelect,
} from "./indicadores.js";

const distritoSelect = {
  id: true,
  nome: true,
  ativo: true,
  frenteId: true,
  frente: { select: { id: true, nome: true } },
} as const;

export function registerDistritosRoutes(app: FastifyInstance): void {
  app.get("/distritos", async () => {
    return prisma.distrito.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: distritoSelect });
  });

  app.get<{ Params: { frenteId: string } }>("/frentes/:frenteId/distritos", async (request) => {
    return prisma.distrito.findMany({
      where: { frenteId: request.params.frenteId },
      orderBy: { nome: "asc" },
      select: { ...distritoSelect, _count: { select: { equipes: true } } },
    });
  });

  app.get<{ Params: { id: string } }>("/distritos/:id", async (request, reply) => {
    const distrito = await prisma.distrito.findUnique({ where: { id: request.params.id }, select: distritoSelect });
    if (!distrito) {
      return reply.status(404).send({ error: "Distrito não encontrado" });
    }
    return distrito;
  });

  app.post("/distritos", async (request, reply) => {
    const data = parseBody(distritoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const distrito = await prisma.distrito.create({ data, select: distritoSelect });
      return await reply.status(201).send(distrito);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um distrito com esse nome nesta frente" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente informada não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/distritos/:id", async (request, reply) => {
    const data = parseBody(distritoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.distrito.update({ where: { id: request.params.id }, data, select: distritoSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return reply.status(404).send({ error: "Distrito não encontrado" });
        if (error.code === "P2002") return reply.status(409).send({ error: "Já existe um distrito com esse nome nesta frente" });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/distritos/:id/encarregados", async (request) => {
    const equipes = await prisma.equipe.findMany({
      where: { distritoId: request.params.id, encarregadoId: { not: null } },
      select: { encarregadoId: true },
      distinct: ["encarregadoId"],
    });
    const ids = equipes.map((equipe) => equipe.encarregadoId).filter((id): id is string => id != null);
    if (ids.length === 0) return [];

    return prisma.colaborador.findMany({
      where: { id: { in: ids } },
      orderBy: { nome: "asc" },
      select: { id: true, matricula: true, nome: true },
    });
  });

  app.get<{ Params: { id: string }; Querystring: { mes?: string } }>("/distritos/:id/indicadores", async (request) => {
    const { periodo, inicio, fim } = intervaloDoMes(request.query.mes);
    const { inicio: inicioAnterior, fim: fimAnterior } = intervaloDoMes(periodoAnterior(periodo));
    const distritoId = request.params.id;

    const [rdos, rdosMesAnterior] = await Promise.all([
      prisma.rdo.findMany({ where: { data: { gte: inicio, lt: fim }, equipe: { distritoId } }, select: rdoIndicadorSelect }),
      prisma.rdo.findMany({
        where: { data: { gte: inicioAnterior, lt: fimAnterior }, equipe: { distritoId } },
        select: rdoIndicadorSelect,
      }),
    ]);

    const metasMesAnterior = extrairMetasDoMesAnterior(calcularProdutividade(rdosMesAnterior));
    const resumo = calcularProdutividade(rdos, metasMesAnterior);
    const rdosEmitidos = rdos.length;
    const maoDeObraMedia =
      rdosEmitidos > 0
        ? rdos.reduce((soma, rdo) => soma + rdo.maoDeObra.reduce((s, mdo) => s + mdo.quantidade, 0), 0) / rdosEmitidos
        : 0;
    const qlp = calcularQlp(rdos);
    const totalDesvios = rdos.reduce((soma, rdo) => soma + (rdo.totalDesvios ?? 0), 0);

    return {
      periodo,
      rdosEmitidos,
      maoDeObraMedia,
      qlp,
      totalDesvios,
      eficienciaGeral: resumo.eficiencia,
      horasTrabalhadas: resumo.horasTrabalhadas,
      horasImprodutivas: resumo.horasImprodutivas,
      horasProdutivas: Math.max(resumo.horasTrabalhadas - resumo.horasImprodutivas, 0),
      produtividadePorAtividade: resumo.produtividadePorAtividade,
    };
  });
}

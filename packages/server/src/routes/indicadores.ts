import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

/**
 * Jornada padrão usada pela ENGECOM para calcular produtividade (ver
 * "JORNADA MÉDIA (H): 7" em todos os meses do relatório mensal fonte) —
 * horas trabalhadas no período = efetivo (soma de RdoMaoDeObra.quantidade)
 * × esta constante, não um registro de ponto real.
 */
const JORNADA_HORAS_DIA = 7;

const rdoIndicadorSelect = {
  id: true,
  data: true,
  frenteId: true,
  totalDesvios: true,
  temperaturaMedia: true,
  maoDeObra: { select: { quantidade: true, horasImprodutivas: true, causaImprodutividade: true } },
  locais: {
    select: {
      atividades: {
        select: {
          totalCalculado: true,
          atividadeCatalogo: { select: { id: true, codigo: true, descricao: true, unidade: true, metaPus: true } },
        },
      },
    },
  },
} satisfies Prisma.RdoSelect;

type RdoIndicador = Prisma.RdoGetPayload<{ select: typeof rdoIndicadorSelect }>;

function horasEquipe(rdo: RdoIndicador): number {
  const efetivo = rdo.maoDeObra.reduce((soma, mdo) => soma + mdo.quantidade, 0);
  return efetivo * JORNADA_HORAS_DIA;
}

interface ProdutividadeAtividade {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  producaoTotal: number;
  metaPus: number | null;
  pus: number;
  percentualMeta: number | null;
}

interface ResumoProdutividade {
  horasTrabalhadas: number;
  horasImprodutivas: number;
  produtividadePorAtividade: ProdutividadeAtividade[];
  eficiencia: number | null;
}

/**
 * PUS por atividade = produção total da atividade no período ÷ horas
 * trabalhadas pela equipe no período (mesmo denominador para todas as
 * atividades, fiel ao relatório mensal fonte). Eficiência = média de
 * (PUS real ÷ Meta PUS) entre as atividades que têm meta cadastrada e
 * produção no período.
 */
function calcularProdutividade(rdos: RdoIndicador[]): ResumoProdutividade {
  const horasTrabalhadas = rdos.reduce((soma, rdo) => soma + horasEquipe(rdo), 0);
  const horasImprodutivas = rdos.reduce(
    (soma, rdo) => soma + rdo.maoDeObra.reduce((s, mdo) => s + Number(mdo.horasImprodutivas ?? 0), 0),
    0,
  );

  const atividadesMap = new Map<string, Omit<ProdutividadeAtividade, "pus" | "percentualMeta">>();
  for (const rdo of rdos) {
    for (const local of rdo.locais) {
      for (const atividade of local.atividades) {
        const catalogo = atividade.atividadeCatalogo;
        const atual = atividadesMap.get(catalogo.id) ?? {
          id: catalogo.id,
          codigo: catalogo.codigo,
          descricao: catalogo.descricao,
          unidade: catalogo.unidade,
          metaPus: catalogo.metaPus != null ? Number(catalogo.metaPus) : null,
          producaoTotal: 0,
        };
        atual.producaoTotal += Number(atividade.totalCalculado);
        atividadesMap.set(catalogo.id, atual);
      }
    }
  }

  const produtividadePorAtividade = [...atividadesMap.values()]
    .map((atividade) => {
      const pus = horasTrabalhadas > 0 ? atividade.producaoTotal / horasTrabalhadas : 0;
      const percentualMeta = atividade.metaPus != null && atividade.metaPus > 0 ? (pus / atividade.metaPus) * 100 : null;
      return { ...atividade, pus, percentualMeta };
    })
    .sort((a, b) => b.producaoTotal - a.producaoTotal);

  const percentuaisComMeta = produtividadePorAtividade
    .map((atividade) => atividade.percentualMeta)
    .filter((valor): valor is number => valor != null);
  const eficiencia =
    percentuaisComMeta.length > 0 ? percentuaisComMeta.reduce((soma, valor) => soma + valor, 0) / percentuaisComMeta.length : null;

  return { horasTrabalhadas, horasImprodutivas, produtividadePorAtividade, eficiencia };
}

/** Intervalo [início, fim) do mês "YYYY-MM"; usa o mês atual se omitido/inválido. */
function intervaloDoMes(mes: string | undefined): { periodo: string; inicio: Date; fim: Date } {
  const valido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);
  const ano = Number(valido.slice(0, 4));
  const mesNum = Number(valido.slice(5, 7));
  return {
    periodo: valido,
    inicio: new Date(Date.UTC(ano, mesNum - 1, 1)),
    fim: new Date(Date.UTC(ano, mesNum, 1)),
  };
}

export function registerIndicadoresRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { mes?: string } }>("/indicadores", async (request) => {
    const { periodo, inicio, fim } = intervaloDoMes(request.query.mes);

    const [rdos, ordensManutencao, frentes] = await Promise.all([
      prisma.rdo.findMany({ where: { data: { gte: inicio, lt: fim } }, select: rdoIndicadorSelect }),
      prisma.ordemManutencao.count({ where: { dataEmissao: { gte: inicio, lt: fim } } }),
      prisma.frente.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, nome: true, codigo: true } }),
    ]);

    const geral = calcularProdutividade(rdos);

    const rdosEmitidos = rdos.length;
    const maoDeObraMedia =
      rdosEmitidos > 0
        ? rdos.reduce((soma, rdo) => soma + rdo.maoDeObra.reduce((s, mdo) => s + mdo.quantidade, 0), 0) / rdosEmitidos
        : 0;
    const totalDesvios = rdos.reduce((soma, rdo) => soma + (rdo.totalDesvios ?? 0), 0);
    const temperaturas = rdos.map((rdo) => rdo.temperaturaMedia).filter((valor): valor is Prisma.Decimal => valor != null);
    const temperaturaMedia =
      temperaturas.length > 0 ? temperaturas.reduce((soma, valor) => soma + Number(valor), 0) / temperaturas.length : null;

    const porFrente = frentes.map((frente) => {
      const rdosDaFrente = rdos.filter((rdo) => rdo.frenteId === frente.id);
      const { eficiencia } = calcularProdutividade(rdosDaFrente);
      return { id: frente.id, nome: frente.nome, codigo: frente.codigo, rdosEmitidos: rdosDaFrente.length, eficiencia };
    });

    const causasMap = new Map<string, number>();
    for (const rdo of rdos) {
      for (const mdo of rdo.maoDeObra) {
        const horas = Number(mdo.horasImprodutivas ?? 0);
        if (!mdo.causaImprodutividade || horas <= 0) continue;
        causasMap.set(mdo.causaImprodutividade, (causasMap.get(mdo.causaImprodutividade) ?? 0) + horas);
      }
    }
    const causasImprodutividade = [...causasMap.entries()]
      .map(([causa, horas]) => ({ causa, horas }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 6);

    const semanasMap = new Map<number, RdoIndicador[]>();
    for (const rdo of rdos) {
      const semana = Math.ceil(rdo.data.getUTCDate() / 7);
      const atual = semanasMap.get(semana) ?? [];
      atual.push(rdo);
      semanasMap.set(semana, atual);
    }
    const evolucaoSemanal = [...semanasMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semana, rdosSemana]) => ({
        semana: `Semana ${semana}`,
        rdosEmitidos: rdosSemana.length,
        eficiencia: calcularProdutividade(rdosSemana).eficiencia,
      }));

    return {
      periodo,
      rdosEmitidos,
      ordensManutencao,
      maoDeObraMedia,
      totalDesvios,
      temperaturaMedia,
      eficienciaGeral: geral.eficiencia,
      horasTrabalhadas: geral.horasTrabalhadas,
      horasImprodutivas: geral.horasImprodutivas,
      horasProdutivas: Math.max(geral.horasTrabalhadas - geral.horasImprodutivas, 0),
      produtividadePorAtividade: geral.produtividadePorAtividade,
      porFrente,
      causasImprodutividade,
      evolucaoSemanal,
    };
  });
}

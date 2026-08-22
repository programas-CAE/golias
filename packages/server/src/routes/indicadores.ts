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

export const rdoIndicadorSelect = {
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

export type RdoIndicador = Prisma.RdoGetPayload<{ select: typeof rdoIndicadorSelect }>;

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
  pus: number;
  meta: number | null;
  metaOrigem: "mes_anterior" | "referencia" | null;
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
 * (PUS real ÷ Meta) entre as atividades que têm meta e produção no
 * período.
 *
 * A Meta de cada atividade é a média REALIZADA da própria atividade no mês
 * anterior (`metasMesAnterior`, calculado pelo chamador com este mesmo
 * `calcularProdutividade` sobre o período anterior) — não um valor fixo.
 * Quando não há produção da atividade no mês anterior (contrato novo,
 * atividade ainda não executada etc.), cai no `metaPus` de referência do
 * catálogo (`AtividadeCatalogo.metaPus`) como fallback.
 */
export function calcularProdutividade(rdos: RdoIndicador[], metasMesAnterior?: Map<string, number>): ResumoProdutividade {
  const horasTrabalhadas = rdos.reduce((soma, rdo) => soma + horasEquipe(rdo), 0);
  const horasImprodutivas = rdos.reduce(
    (soma, rdo) => soma + rdo.maoDeObra.reduce((s, mdo) => s + Number(mdo.horasImprodutivas ?? 0), 0),
    0,
  );

  const atividadesMap = new Map<
    string,
    { id: string; codigo: string; descricao: string; unidade: string; producaoTotal: number; metaReferencia: number | null }
  >();
  for (const rdo of rdos) {
    for (const local of rdo.locais) {
      for (const atividade of local.atividades) {
        const catalogo = atividade.atividadeCatalogo;
        const atual = atividadesMap.get(catalogo.id) ?? {
          id: catalogo.id,
          codigo: catalogo.codigo,
          descricao: catalogo.descricao,
          unidade: catalogo.unidade,
          metaReferencia: catalogo.metaPus != null ? Number(catalogo.metaPus) : null,
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
      const metaMesAnterior = metasMesAnterior?.get(atividade.id);
      const meta = metaMesAnterior ?? atividade.metaReferencia;
      const metaOrigem: ProdutividadeAtividade["metaOrigem"] =
        metaMesAnterior != null ? "mes_anterior" : atividade.metaReferencia != null ? "referencia" : null;
      const percentualMeta = meta != null && meta > 0 ? (pus / meta) * 100 : null;
      return {
        id: atividade.id,
        codigo: atividade.codigo,
        descricao: atividade.descricao,
        unidade: atividade.unidade,
        producaoTotal: atividade.producaoTotal,
        pus,
        meta,
        metaOrigem,
        percentualMeta,
      };
    })
    .sort((a, b) => b.producaoTotal - a.producaoTotal);

  const percentuaisComMeta = produtividadePorAtividade
    .map((atividade) => atividade.percentualMeta)
    .filter((valor): valor is number => valor != null);
  const eficiencia =
    percentuaisComMeta.length > 0 ? percentuaisComMeta.reduce((soma, valor) => soma + valor, 0) / percentuaisComMeta.length : null;

  return { horasTrabalhadas, horasImprodutivas, produtividadePorAtividade, eficiencia };
}

/** `{ atividadeId: pus }` do mês anterior, só para atividades com produção real (pus > 0) — usado como Meta dinâmica do mês corrente. */
export function extrairMetasDoMesAnterior(resumoMesAnterior: ResumoProdutividade): Map<string, number> {
  const metas = new Map<string, number>();
  for (const atividade of resumoMesAnterior.produtividadePorAtividade) {
    if (atividade.pus > 0) metas.set(atividade.id, atividade.pus);
  }
  return metas;
}

/** Intervalo [início, fim) do mês "YYYY-MM"; usa o mês atual se omitido/inválido. */
export function intervaloDoMes(mes: string | undefined): { periodo: string; inicio: Date; fim: Date } {
  const valido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);
  const ano = Number(valido.slice(0, 4));
  const mesNum = Number(valido.slice(5, 7));
  return {
    periodo: valido,
    inicio: new Date(Date.UTC(ano, mesNum - 1, 1)),
    fim: new Date(Date.UTC(ano, mesNum, 1)),
  };
}

/** "YYYY-MM" do mês imediatamente anterior ao informado. */
export function periodoAnterior(periodo: string): string {
  const ano = Number(periodo.slice(0, 4));
  const mesNum = Number(periodo.slice(5, 7));
  const data = new Date(Date.UTC(ano, mesNum - 2, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function registerIndicadoresRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { mes?: string } }>("/indicadores", async (request) => {
    const { periodo, inicio, fim } = intervaloDoMes(request.query.mes);
    const ano = inicio.getUTCFullYear();
    const mesNum = inicio.getUTCMonth() + 1;
    const { inicio: inicioAnterior, fim: fimAnterior } = intervaloDoMes(periodoAnterior(periodo));

    const [rdos, rdosMesAnterior, ordensManutencao, frentes, periodosMedicao, atividadesCatalogo] = await Promise.all([
      prisma.rdo.findMany({ where: { data: { gte: inicio, lt: fim } }, select: rdoIndicadorSelect }),
      prisma.rdo.findMany({ where: { data: { gte: inicioAnterior, lt: fimAnterior } }, select: rdoIndicadorSelect }),
      prisma.ordemManutencao.count({ where: { dataEmissao: { gte: inicio, lt: fim } } }),
      prisma.frente.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, nome: true, codigo: true } }),
      prisma.periodoMedicao.findMany({
        where: { ano, mes: mesNum },
        select: { frenteId: true, itens: { select: { atividadeCatalogoId: true, quantidadeTotal: true, unidade: true } } },
      }),
      prisma.atividadeCatalogo.findMany({ select: { id: true, codigo: true, descricao: true, ordem: true } }),
    ]);

    const metasMesAnterior = extrairMetasDoMesAnterior(calcularProdutividade(rdosMesAnterior));

    const atividadePorId = new Map(atividadesCatalogo.map((atividade) => [atividade.id, atividade]));
    const frentePorId = new Map(frentes.map((frente) => [frente.id, frente]));

    /**
     * Produção histórica importada das planilhas (packages/server/prisma/
     * seed.ts) para o mês selecionado — não vem de RDO, então fica separada
     * dos indicadores calculados a partir de RDOs reais, com a mesma
     * unidade/atividade do catálogo pra ficar fácil de comparar.
     */
    const producaoHistorica =
      periodosMedicao.length === 0
        ? null
        : (() => {
            const linhasMap = new Map<string, { atividade: { id: string; codigo: string; descricao: string; ordem: number }; unidade: string; porFrente: Record<string, number>; total: number }>();
            for (const periodoDoMes of periodosMedicao) {
              const frente = frentePorId.get(periodoDoMes.frenteId);
              if (!frente) continue;
              for (const item of periodoDoMes.itens) {
                const atividade = atividadePorId.get(item.atividadeCatalogoId);
                if (!atividade) continue;
                const linha = linhasMap.get(atividade.id) ?? { atividade, unidade: item.unidade, porFrente: {}, total: 0 };
                const quantidade = Number(item.quantidadeTotal);
                linha.porFrente[frente.codigo] = quantidade;
                linha.total += quantidade;
                linhasMap.set(atividade.id, linha);
              }
            }
            return [...linhasMap.values()].sort((a, b) => a.atividade.ordem - b.atividade.ordem);
          })();

    const geral = calcularProdutividade(rdos, metasMesAnterior);

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
      const { eficiencia } = calcularProdutividade(rdosDaFrente, metasMesAnterior);
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
        eficiencia: calcularProdutividade(rdosSemana, metasMesAnterior).eficiencia,
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
      producaoHistorica,
    };
  });
}

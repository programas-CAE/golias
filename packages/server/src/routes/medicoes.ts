import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

const periodoMedicaoSelect = {
  id: true,
  ano: true,
  mes: true,
  status: true,
  frenteId: true,
  itens: { select: { id: true, atividadeCatalogoId: true, quantidadeTotal: true, unidade: true } },
} as const;

/**
 * Medições mensais fechadas — hoje só o backfill histórico (abril/maio/
 * junho de 2026, extraído de "PRODUTIVIDADE ABRIL MAIO JUNHO.xlsx", ver
 * packages/server/prisma/seed.ts). Volume é pequeno (poucos períodos por
 * frente/mês), então devolve tudo de uma vez — o desktop agrupa/filtra.
 *
 * Nem `PeriodoMedicao.frenteId` nem `MedicaoItem.atividadeCatalogoId` têm
 * relação Prisma declarada (só o id solto, mesmo padrão de
 * `Rdo.encarregadoId`), então Frente e AtividadeCatalogo são buscados à
 * parte e casados manualmente em vez de via `select` aninhado.
 */
export function registerMedicoesRoutes(app: FastifyInstance): void {
  app.get("/medicoes", async () => {
    const [periodos, atividades, frentes] = await Promise.all([
      prisma.periodoMedicao.findMany({
        orderBy: [{ ano: "desc" }, { mes: "desc" }, { frenteId: "asc" }],
        select: periodoMedicaoSelect,
      }),
      prisma.atividadeCatalogo.findMany({ select: { id: true, codigo: true, descricao: true, ordem: true } }),
      prisma.frente.findMany({ select: { id: true, nome: true, codigo: true } }),
    ]);
    const atividadePorId = new Map(atividades.map((atividade) => [atividade.id, atividade]));
    const frentePorId = new Map(frentes.map((frente) => [frente.id, frente]));

    return periodos.map((periodo) => ({
      ...periodo,
      frente: frentePorId.get(periodo.frenteId) ?? null,
      itens: periodo.itens
        .map((item) => ({
          id: item.id,
          quantidadeTotal: item.quantidadeTotal,
          unidade: item.unidade,
          atividadeCatalogo: atividadePorId.get(item.atividadeCatalogoId) ?? null,
        }))
        .filter((item) => item.atividadeCatalogo != null)
        .sort((a, b) => (a.atividadeCatalogo?.ordem ?? 0) - (b.atividadeCatalogo?.ordem ?? 0)),
    }));
  });
}

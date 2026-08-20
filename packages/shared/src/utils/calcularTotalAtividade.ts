import type { UnidadeMedida } from "../constants/catalogo.js";

export interface CalcularTotalAtividadeInput {
  altura?: number | null;
  largura?: number | null;
  comprimento?: number | null;
  quantidadeDireta?: number | null;
}

/**
 * Calcula a quantidade total de uma atividade de RDO a partir das suas
 * dimensões (ou de um valor direto, para unidades que não usam dimensões).
 *
 * Regras (validadas contra apontamentos reais do cliente):
 *  - M3: altura × largura × comprimento
 *      ex.: 1.20 × 2.10 × 3.30 = 8.316 (armazenado com 3 casas decimais,
 *      conforme RdoAtividade.totalCalculado @db.Decimal(12,3))
 *  - M2: largura × comprimento
 *      ex.: 20.00 × 2.00 = 40.00
 *  - M: comprimento
 *  - UND, HH, M3KM: quantidade informada diretamente
 *
 * Não há arredondamento nesta função — a precisão final é responsabilidade
 * da coluna Decimal do Prisma no momento da persistência.
 */
export function calcularTotalAtividade(
  unidade: UnidadeMedida,
  input: CalcularTotalAtividadeInput,
): number {
  switch (unidade) {
    case "M3":
      return (input.altura ?? 0) * (input.largura ?? 0) * (input.comprimento ?? 0);
    case "M2":
      return (input.largura ?? 0) * (input.comprimento ?? 0);
    case "M":
      return input.comprimento ?? 0;
    case "UND":
    case "HH":
    case "M3KM":
    default:
      return input.quantidadeDireta ?? 0;
  }
}

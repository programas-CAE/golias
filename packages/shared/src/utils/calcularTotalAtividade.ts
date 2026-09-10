import type { UnidadeMedida } from "../constants/catalogo.js";

export interface CalcularTotalAtividadeInput {
  altura?: number | null;
  largura?: number | null;
  larguraFinal?: number | null;
  comprimento?: number | null;
  quantidadeDireta?: number | null;
}

/**
 * Calcula a quantidade total de uma atividade de RDO a partir das suas
 * dimensões (ou de um valor direto, para unidades que não usam dimensões).
 *
 * Regras (validadas contra apontamentos reais do cliente):
 *  - M3: altura × largura × comprimento — ou, quando `larguraFinal` é
 *      informada (a seção afunila/alarga, ex. vala/canal de drenagem em
 *      talude), o volume do prisma trapezoidal: altura × média(largura
 *      inicial, largura final) × comprimento.
 *      ex.: altura 0.8, largura 3.70, larguraFinal 6.20, comprimento 9.80
 *      → 0.8 × (3.70+6.20)/2 × 9.80 = 38.808 (armazenado com 3 casas
 *      decimais, conforme RdoAtividade.totalCalculado @db.Decimal(12,3))
 *  - M2: largura × comprimento — ou, quando `larguraFinal` é informada (o
 *      trecho afunila/alarga, ex. roçada em faixa irregular), a área do
 *      trapézio: média(largura inicial, largura final) × comprimento.
 *      ex.: largura 20, larguraFinal 12, comprimento 10 → (20+12)/2 × 10 = 160
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
    case "M3": {
      const larguraInicial = input.largura ?? 0;
      const larguraFinal = input.larguraFinal ?? larguraInicial;
      return (input.altura ?? 0) * ((larguraInicial + larguraFinal) / 2) * (input.comprimento ?? 0);
    }
    case "M2": {
      const larguraInicial = input.largura ?? 0;
      const larguraFinal = input.larguraFinal ?? larguraInicial;
      return ((larguraInicial + larguraFinal) / 2) * (input.comprimento ?? 0);
    }
    case "M":
      return input.comprimento ?? 0;
    case "UND":
    case "HH":
    case "M3KM":
    default:
      return input.quantidadeDireta ?? 0;
  }
}

import type { UnidadeMedida } from "../constants/catalogo.js";

export interface CalcularTotalAtividadeInput {
  altura?: number | null;
  largura?: number | null;
  larguraFinal?: number | null;
  // Leituras de largura além das duas primeiras (largura/larguraFinal) —
  // trecho medido em mais de 2 pontos (ex.: papel com "LAR A/B/C"), todas
  // entrando na mesma média. Normalmente vazio (1 ou 2 leituras bastam).
  largurasExtras?: number[] | null;
  comprimento?: number | null;
  quantidadeDireta?: number | null;
}

/** Todas as leituras de largura informadas (largura + larguraFinal + largurasExtras), sem as vazias. */
export function listarLarguras(input: CalcularTotalAtividadeInput): number[] {
  return [input.largura, input.larguraFinal, ...(input.largurasExtras ?? [])].filter(
    (valor): valor is number => valor != null,
  );
}

/** Média das leituras de largura — 0 se nenhuma foi informada. */
export function mediaLargura(input: CalcularTotalAtividadeInput): number {
  const leituras = listarLarguras(input);
  if (leituras.length === 0) return 0;
  return leituras.reduce((soma, valor) => soma + valor, 0) / leituras.length;
}

/**
 * Calcula a quantidade total de uma atividade de RDO a partir das suas
 * dimensões (ou de um valor direto, para unidades que não usam dimensões).
 *
 * Regras (validadas contra apontamentos reais do cliente):
 *  - M3: altura × média das larguras × comprimento — 1 leitura de largura
 *      é o caso comum (seção reta); 2+ leituras (largura/larguraFinal/
 *      largurasExtras) são a seção medida em vários pontos porque afunila/
 *      alarga/varia (ex. vala/canal de drenagem em talude).
 *      ex.: altura 0.8, larguras [3.70, 6.20], comprimento 9.80
 *      → 0.8 × média(3.70, 6.20) × 9.80 = 38.808 (armazenado com 3 casas
 *      decimais, conforme RdoAtividade.totalCalculado @db.Decimal(12,3))
 *  - M2: média das larguras × comprimento — mesma lógica do M3, sem altura.
 *      ex.: larguras [7.80, 6.50, 7.40], comprimento 340 →
 *      média(7.80, 6.50, 7.40) × 340 = 2458,20
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
      return (input.altura ?? 0) * mediaLargura(input) * (input.comprimento ?? 0);
    case "M2":
      return mediaLargura(input) * (input.comprimento ?? 0);
    case "M":
      return input.comprimento ?? 0;
    case "UND":
    case "HH":
    case "M3KM":
    default:
      return input.quantidadeDireta ?? 0;
  }
}

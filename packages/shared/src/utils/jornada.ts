/**
 * Jornada de referência (horas produtivas esperadas), por dia da semana —
 * já descontando o almoço (ex.: segunda a quinta é 07:00–17:00 com 1h de
 * almoço = 9h). Usada como denominador em "X apontadas de Yh de referência"
 * (RdoCompleto.tsx, Campo.tsx, rdoPdf.ts) — antes um número fixo (10h) igual
 * pra todo dia, não batia com sexta/sábado.
 */
const JORNADA_REFERENCIA_POR_DIA_SEMANA: Record<number, number> = {
  0: 0, // domingo — não é dia de trabalho padrão
  1: 9, // segunda
  2: 9, // terça
  3: 9, // quarta
  4: 9, // quinta
  5: 8, // sexta (07:00–16:00 - 1h almoço)
  6: 7, // sábado (07:00–14:00, sem almoço)
};

export function jornadaReferenciaHoras(data: Date): number {
  return JORNADA_REFERENCIA_POR_DIA_SEMANA[data.getUTCDay()] ?? 9;
}

/** Mesma coisa que `jornadaReferenciaHoras`, mas a partir de uma data "AAAA-MM-DD" (estado de formulário no front). */
export function jornadaReferenciaHorasDeString(dataAaaaMmDd: string): number {
  const [ano, mes, dia] = dataAaaaMmDd.split("-").map(Number);
  if (!ano || !mes || !dia) return 9;
  return jornadaReferenciaHoras(new Date(Date.UTC(ano, mes - 1, dia)));
}

export function minutosDoHorario(horario: string): number {
  const [horas, minutos] = horario.split(":").map(Number);
  return (horas ?? 0) * 60 + (minutos ?? 0);
}

/** Duração em horas entre dois horários "HH:mm" do mesmo dia — 0 se inválido/negativo. */
export function duracaoHoras(horarioInicial: string, horarioFinal: string): number {
  const minutos = minutosDoHorario(horarioFinal) - minutosDoHorario(horarioInicial);
  return minutos > 0 ? minutos / 60 : 0;
}

/**
 * Mescla intervalos [início, fim] (em minutos) que se sobrepõem ou se
 * encostam, somando só o tempo de calendário coberto — sem isso, duas
 * frentes trabalhando ao mesmo tempo em locais diferentes (comum quando a
 * equipe se divide) faziam a soma de "horas apontadas" passar do próprio
 * tamanho do dia, contando a mesma janela de horário mais de uma vez.
 */
export function somarMinutosSemSobreposicao(intervalos: Array<[number, number]>): number {
  const validos = intervalos.filter(([inicio, fim]) => fim > inicio).sort((a, b) => a[0] - b[0]);
  let minutos = 0;
  let inicioAtual = Number.NaN;
  let fimAtual = Number.NaN;
  for (const [inicio, fim] of validos) {
    if (Number.isNaN(inicioAtual)) {
      inicioAtual = inicio;
      fimAtual = fim;
      continue;
    }
    if (inicio <= fimAtual) {
      fimAtual = Math.max(fimAtual, fim);
    } else {
      minutos += fimAtual - inicioAtual;
      inicioAtual = inicio;
      fimAtual = fim;
    }
  }
  if (!Number.isNaN(inicioAtual)) minutos += fimAtual - inicioAtual;
  return minutos;
}

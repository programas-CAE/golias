import { describe, expect, it } from "vitest";
import { jornadaReferenciaHoras, jornadaReferenciaHorasDeString, somarMinutosSemSobreposicao } from "@golias/shared";

describe("jornadaReferenciaHoras", () => {
  it("segunda a quinta são 9h (07:00 às 17:00 menos 1h de almoço)", () => {
    // 2026-09-07 é segunda, 2026-09-10 é quinta
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 7)))).toBe(9);
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 8)))).toBe(9);
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 9)))).toBe(9);
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 10)))).toBe(9);
  });

  it("sexta é 8h (07:00 às 16:00 menos 1h de almoço)", () => {
    // 2026-09-11 é sexta
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 11)))).toBe(8);
  });

  it("sábado é 7h (07:00 às 14:00, sem almoço)", () => {
    // 2026-09-12 é sábado
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 12)))).toBe(7);
  });

  it("domingo é 0h", () => {
    // 2026-09-13 é domingo
    expect(jornadaReferenciaHoras(new Date(Date.UTC(2026, 8, 13)))).toBe(0);
  });
});

describe("jornadaReferenciaHorasDeString", () => {
  it("calcula a partir de uma data AAAA-MM-DD sem depender do fuso local", () => {
    expect(jornadaReferenciaHorasDeString("2026-09-07")).toBe(9); // segunda
    expect(jornadaReferenciaHorasDeString("2026-09-11")).toBe(8); // sexta
    expect(jornadaReferenciaHorasDeString("2026-09-12")).toBe(7); // sábado
  });
});

describe("somarMinutosSemSobreposicao", () => {
  it("soma intervalos que não se sobrepõem normalmente", () => {
    // 07:00-09:00 (120min) + 09:00-12:00 (180min) = 300min
    expect(somarMinutosSemSobreposicao([[420, 540], [540, 720]])).toBe(300);
  });

  it("não conta duas vezes quando duas frentes trabalham ao mesmo tempo em locais diferentes", () => {
    // 09:20-12:00 (160min) e 10:40-12:00 (80min, dentro do primeiro) — duas
    // equipes em locais diferentes na mesma janela não pode virar 240min.
    expect(somarMinutosSemSobreposicao([[560, 720], [640, 720]])).toBe(160);
  });

  it("mescla intervalos parcialmente sobrepostos num único bloco contínuo", () => {
    // 10:00-12:00 (120min) e 11:00-13:00 (120min), união = 10:00-13:00 (180min)
    expect(somarMinutosSemSobreposicao([[600, 720], [660, 780]])).toBe(180);
  });

  it("ignora intervalos invertidos ou de duração zero", () => {
    expect(somarMinutosSemSobreposicao([[600, 600], [700, 650]])).toBe(0);
  });
});

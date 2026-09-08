import { describe, expect, it } from "vitest";
import { jornadaReferenciaHoras, jornadaReferenciaHorasDeString } from "@golias/shared";

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

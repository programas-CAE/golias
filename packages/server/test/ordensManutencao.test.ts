import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarFrente(): Promise<{ id: string }> {
  return prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá" } });
}

describe("GET /ordens-manutencao", () => {
  it("lista as ordens com a frente embutida", async () => {
    const frente = await criarFrente();
    await prisma.ordemManutencao.create({
      data: { numero: "OM-001", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ numero: string; frente: { nome: string } }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.frente.nome).toBe("Marabá");
  });
});

describe("POST /ordens-manutencao", () => {
  it("cria uma ordem de manutenção", async () => {
    const frente = await criarFrente();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-002", frenteId: frente.id, dataEmissao: "2026-02-01", kmInicial: 10, kmFinal: 20 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { numero: string }).numero).toBe("OM-002");
  });

  it("retorna 409 para número duplicado", async () => {
    const frente = await criarFrente();
    await prisma.ordemManutencao.create({
      data: { numero: "OM-003", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-003", frenteId: frente.id, dataEmissao: "2026-02-01" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 400 para frenteId inválido", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-004", frenteId: "invalido", dataEmissao: "2026-02-01" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /ordens-manutencao/:id", () => {
  it("atualiza uma ordem de manutenção", async () => {
    const frente = await criarFrente();
    const ordem = await prisma.ordemManutencao.create({
      data: { numero: "OM-005", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${ordem.id}`,
      payload: { detalhes: "Troca de válvula" },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { detalhes: string }).detalhes).toBe("Troca de válvula");
  });

  it("retorna 404 para ordem inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/ordens-manutencao/nao-existe",
      payload: { detalhes: "X" },
    });

    expect(response.statusCode).toBe(404);
  });
});

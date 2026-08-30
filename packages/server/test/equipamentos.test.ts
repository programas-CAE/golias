import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /equipamentos", () => {
  it("lista apenas equipamentos ativos, ordenados por nome", async () => {
    await prisma.equipamentoCatalogo.createMany({
      data: [
        { nome: "Roçadeira" },
        { nome: "Caminhão 3/4" },
        { nome: "Inativo", ativo: false },
      ],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/equipamentos" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ nome: string }>;
    expect(body.map((e) => e.nome)).toEqual(["Caminhão 3/4", "Roçadeira"]);
  });

  it("com ?todos=1, também lista os inativos", async () => {
    await prisma.equipamentoCatalogo.createMany({
      data: [{ nome: "Roçadeira" }, { nome: "Inativo", ativo: false }],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/equipamentos?todos=1" });

    const body = response.json() as Array<{ nome: string; ativo: boolean }>;
    expect(body.map((e) => e.nome)).toEqual(["Inativo", "Roçadeira"]);
  });
});

describe("POST /equipamentos", () => {
  it("cria um equipamento novo", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/equipamentos", payload: { nome: "Van" } });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { nome: string; ativo: boolean };
    expect(body.nome).toBe("Van");
    expect(body.ativo).toBe(true);
  });

  it("retorna 400 para nome duplicado", async () => {
    await prisma.equipamentoCatalogo.create({ data: { nome: "Van" } });

    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/equipamentos", payload: { nome: "Van" } });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 para nome vazio", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/equipamentos", payload: { nome: "" } });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /equipamentos/:id", () => {
  it("edita nome e desativa um equipamento", async () => {
    const equipamento = await prisma.equipamentoCatalogo.create({ data: { nome: "Van" } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/equipamentos/${equipamento.id}`,
      payload: { nome: "Van 15 lugares", ativo: false },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { nome: string; ativo: boolean };
    expect(body.nome).toBe("Van 15 lugares");
    expect(body.ativo).toBe(false);
  });

  it("retorna 404 para equipamento inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "PATCH", url: "/equipamentos/nao-existe", payload: { ativo: false } });

    expect(response.statusCode).toBe(404);
  });
});

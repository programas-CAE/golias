import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /frentes", () => {
  it("lista as frentes ordenadas por código", async () => {
    await prisma.frente.createMany({
      data: [
        { codigo: "RAMAL", nome: "Ramal" },
        { codigo: "MAB", nome: "Marabá" },
        { codigo: "PBA", nome: "Parauapebas" },
      ],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/frentes" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ codigo: string; nome: string }>;
    expect(body.map((f) => f.codigo)).toEqual(["MAB", "PBA", "RAMAL"]);
  });
});

describe("PATCH /frentes/:id", () => {
  it("atualiza nome e ativo", async () => {
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá" } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/frentes/${frente.id}`,
      payload: { nome: "Marabá Norte", ativo: false },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { nome: string; ativo: boolean };
    expect(body.nome).toBe("Marabá Norte");
    expect(body.ativo).toBe(false);
  });

  it("retorna 404 para frente inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/frentes/nao-existe",
      payload: { nome: "X" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("retorna 400 quando o nome é vazio", async () => {
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá" } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/frentes/${frente.id}`,
      payload: { nome: "" },
    });

    expect(response.statusCode).toBe(400);
  });
});

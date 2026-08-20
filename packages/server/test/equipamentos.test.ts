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
});

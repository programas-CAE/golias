import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /funcoes", () => {
  it("lista apenas funções ativas, ordenadas por nome", async () => {
    await prisma.funcaoCatalogo.createMany({
      data: [
        { nome: "Soldador" },
        { nome: "Encarregado" },
        { nome: "Inativa", ativo: false },
      ],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/funcoes" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ nome: string }>;
    expect(body.map((f) => f.nome)).toEqual(["Encarregado", "Soldador"]);
  });
});

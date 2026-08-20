import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /atividades", () => {
  it("lista as atividades ordenadas por ordem", async () => {
    await prisma.atividadeCatalogo.createMany({
      data: [
        { codigo: "2.1", descricao: "B", unidade: "M", ordem: 2 },
        { codigo: "1.1", descricao: "A", unidade: "M", ordem: 1 },
      ],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/atividades" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ descricao: string }>;
    expect(body.map((a) => a.descricao)).toEqual(["A", "B"]);
  });
});

describe("PATCH /atividades/:id", () => {
  it("atualiza ativo, ordem e metaPus", async () => {
    const atividade = await prisma.atividadeCatalogo.create({
      data: { codigo: "1.1", descricao: "A", unidade: "M", ordem: 1 },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/atividades/${atividade.id}`,
      payload: { ativo: false, ordem: 5, metaPus: 12.5 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ativo: boolean; ordem: number };
    expect(body.ativo).toBe(false);
    expect(body.ordem).toBe(5);
  });

  it("retorna 404 para atividade inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/atividades/nao-existe",
      payload: { ativo: false },
    });

    expect(response.statusCode).toBe(404);
  });
});

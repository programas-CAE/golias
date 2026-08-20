import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarFuncao(nome = "Soldador"): Promise<{ id: string }> {
  return prisma.funcaoCatalogo.create({ data: { nome } });
}

describe("GET /colaboradores", () => {
  it("lista colaboradores com a função embutida", async () => {
    const funcao = await criarFuncao();
    await prisma.colaborador.create({ data: { matricula: "001", nome: "João", funcaoId: funcao.id } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/colaboradores" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ nome: string; funcao: { nome: string } }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.funcao.nome).toBe("Soldador");
  });
});

describe("POST /colaboradores", () => {
  it("cria um colaborador", async () => {
    const funcao = await criarFuncao();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/colaboradores",
      payload: { matricula: "002", nome: "Maria", funcaoId: funcao.id },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { matricula: string; ativo: boolean };
    expect(body.matricula).toBe("002");
    expect(body.ativo).toBe(true);
  });

  it("retorna 409 para matrícula duplicada", async () => {
    const funcao = await criarFuncao();
    await prisma.colaborador.create({ data: { matricula: "003", nome: "Ana", funcaoId: funcao.id } });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/colaboradores",
      payload: { matricula: "003", nome: "Outra Ana", funcaoId: funcao.id },
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 400 para funcaoId inválido", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/colaboradores",
      payload: { matricula: "004", nome: "Pedro", funcaoId: "invalido" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /colaboradores/:id", () => {
  it("atualiza dados do colaborador", async () => {
    const funcao = await criarFuncao();
    const colaborador = await prisma.colaborador.create({
      data: { matricula: "005", nome: "Carlos", funcaoId: funcao.id },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/colaboradores/${colaborador.id}`,
      payload: { ativo: false },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { ativo: boolean }).ativo).toBe(false);
  });

  it("retorna 404 para colaborador inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/colaboradores/nao-existe",
      payload: { ativo: false },
    });

    expect(response.statusCode).toBe(404);
  });
});

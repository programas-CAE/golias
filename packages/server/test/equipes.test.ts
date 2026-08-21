import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarDistrito(): Promise<{ id: string }> {
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá" } });
  return prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
}

async function criarColaborador(matricula = "001"): Promise<{ id: string }> {
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: `Função ${matricula}` } });
  return prisma.colaborador.create({ data: { matricula, nome: `Colaborador ${matricula}`, funcaoId: funcao.id } });
}

describe("GET /equipes", () => {
  it("lista equipes com distrito e membros", async () => {
    const distrito = await criarDistrito();
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe A", distritoId: distrito.id } });
    const colaborador = await criarColaborador();
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow();
    await prisma.equipeMembro.create({
      data: { equipeId: equipe.id, colaboradorId: colaborador.id, funcaoId: funcao.id, quantidade: 2 },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/equipes" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{
      nome: string;
      distrito: { nome: string; frente: { nome: string } };
      membros: unknown[];
    }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.distrito.nome).toBe("Marabá Centro");
    expect(body[0]?.distrito.frente.nome).toBe("Marabá");
    expect(body[0]?.membros).toHaveLength(1);
  });
});

describe("POST /equipes", () => {
  it("cria uma equipe", async () => {
    const distrito = await criarDistrito();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/equipes",
      payload: { nome: "Equipe B", distritoId: distrito.id },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { nome: string }).nome).toBe("Equipe B");
  });

  it("retorna 400 para distritoId inválido", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/equipes",
      payload: { nome: "Equipe C", distritoId: "invalido" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /equipes/:id", () => {
  it("atualiza uma equipe", async () => {
    const distrito = await criarDistrito();
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe D", distritoId: distrito.id } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/equipes/${equipe.id}`,
      payload: { ativo: false },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { ativo: boolean }).ativo).toBe(false);
  });

  it("retorna 404 para equipe inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/equipes/nao-existe",
      payload: { ativo: false },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /equipes/:id/membros", () => {
  it("adiciona um membro à equipe", async () => {
    const distrito = await criarDistrito();
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe E", distritoId: distrito.id } });
    const colaborador = await criarColaborador("010");
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/equipes/${equipe.id}/membros`,
      payload: { colaboradorId: colaborador.id, funcaoId: funcao.id, quantidade: 3 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { quantidade: number }).quantidade).toBe(3);
  });

  it("retorna 409 ao adicionar o mesmo colaborador duas vezes", async () => {
    const distrito = await criarDistrito();
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe F", distritoId: distrito.id } });
    const colaborador = await criarColaborador("011");
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow();
    await prisma.equipeMembro.create({
      data: { equipeId: equipe.id, colaboradorId: colaborador.id, funcaoId: funcao.id },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/equipes/${equipe.id}/membros`,
      payload: { colaboradorId: colaborador.id, funcaoId: funcao.id },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("DELETE /equipes/:id/membros/:membroId", () => {
  it("remove um membro da equipe", async () => {
    const distrito = await criarDistrito();
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe G", distritoId: distrito.id } });
    const colaborador = await criarColaborador("012");
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow();
    const membro = await prisma.equipeMembro.create({
      data: { equipeId: equipe.id, colaboradorId: colaborador.id, funcaoId: funcao.id },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/equipes/${equipe.id}/membros/${membro.id}`,
    });

    expect(response.statusCode).toBe(204);
    await expect(prisma.equipeMembro.findUnique({ where: { id: membro.id } })).resolves.toBeNull();
  });

  it("retorna 404 e não remove o membro se ele pertence a outra equipe", async () => {
    const distrito = await criarDistrito();
    const equipeCerta = await prisma.equipe.create({ data: { nome: "Equipe H", distritoId: distrito.id } });
    const outraEquipe = await prisma.equipe.create({ data: { nome: "Equipe I", distritoId: distrito.id } });
    const colaborador = await criarColaborador("013");
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow();
    const membroDaOutraEquipe = await prisma.equipeMembro.create({
      data: { equipeId: outraEquipe.id, colaboradorId: colaborador.id, funcaoId: funcao.id },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/equipes/${equipeCerta.id}/membros/${membroDaOutraEquipe.id}`,
    });

    expect(response.statusCode).toBe(404);
    await expect(prisma.equipeMembro.findUnique({ where: { id: membroDaOutraEquipe.id } })).resolves.not.toBeNull();
  });
});

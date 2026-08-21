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

describe("GET /distritos", () => {
  it("lista todos os distritos ativos com a frente embutida", async () => {
    const frente = await criarFrente();
    await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/distritos" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ nome: string; frente: { nome: string } }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.frente.nome).toBe("Marabá");
  });
});

describe("GET /frentes/:frenteId/distritos", () => {
  it("lista distritos da frente com contagem de equipes", async () => {
    const frente = await criarFrente();
    const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
    await prisma.equipe.create({ data: { nome: "Equipe A", distritoId: distrito.id } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/frentes/${frente.id}/distritos` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ nome: string; _count: { equipes: number } }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.nome).toBe("Marabá Centro");
    expect(body[0]?._count.equipes).toBe(1);
  });
});

describe("POST /distritos", () => {
  it("cria um distrito", async () => {
    const frente = await criarFrente();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/distritos",
      payload: { nome: "Marabá Centro", frenteId: frente.id },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { nome: string }).nome).toBe("Marabá Centro");
  });

  it("retorna 409 para nome duplicado na mesma frente", async () => {
    const frente = await criarFrente();
    await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/distritos",
      payload: { nome: "Marabá Centro", frenteId: frente.id },
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 400 para frenteId inválido", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/distritos",
      payload: { nome: "Distrito X", frenteId: "invalido" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /distritos/:id/encarregados", () => {
  it("lista os encarregados distintos das equipes do distrito", async () => {
    const frente = await criarFrente();
    const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
    const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Encarregado" } });
    const encarregado = await prisma.colaborador.create({
      data: { matricula: "030", nome: "Zé Encarregado", funcaoId: funcao.id },
    });
    await prisma.equipe.create({ data: { nome: "Equipe A", distritoId: distrito.id, encarregadoId: encarregado.id } });
    await prisma.equipe.create({ data: { nome: "Equipe B", distritoId: distrito.id, encarregadoId: encarregado.id } });
    await prisma.equipe.create({ data: { nome: "Equipe C", distritoId: distrito.id } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/distritos/${distrito.id}/encarregados` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ id: string; nome: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.nome).toBe("Zé Encarregado");
  });
});

describe("GET /distritos/:id/indicadores", () => {
  it("calcula indicadores só com os RDOs das equipes do distrito", async () => {
    const frente = await criarFrente();
    const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
    const outroDistrito = await prisma.distrito.create({ data: { nome: "Outro", frenteId: frente.id } });
    const equipe = await prisma.equipe.create({ data: { nome: "Equipe A", distritoId: distrito.id } });
    const outraEquipe = await prisma.equipe.create({ data: { nome: "Equipe B", distritoId: outroDistrito.id } });
    const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras" } });
    const colaborador = await prisma.colaborador.create({ data: { matricula: "040", nome: "João", funcaoId: funcao.id } });

    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-05"),
        maoDeObra: { create: [{ funcaoId: funcao.id, colaboradorId: colaborador.id, quantidade: 2 }] },
      },
    });
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: outraEquipe.id,
        data: new Date("2026-07-06"),
        maoDeObra: { create: [{ funcaoId: funcao.id, colaboradorId: colaborador.id, quantidade: 5 }] },
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/distritos/${distrito.id}/indicadores?mes=2026-07` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number; maoDeObraMedia: number };
    expect(body.rdosEmitidos).toBe(1);
    expect(body.maoDeObraMedia).toBe(2);
  });
});

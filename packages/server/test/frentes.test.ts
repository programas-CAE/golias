import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarContrato(numero = "5900000000"): Promise<{ id: string }> {
  return prisma.contrato.create({ data: { numero } });
}

describe("GET /frentes", () => {
  it("lista as frentes ordenadas por código", async () => {
    const contrato = await criarContrato();
    await prisma.frente.createMany({
      data: [
        { codigo: "RAMAL", nome: "Ramal", contratoId: contrato.id },
        { codigo: "MAB", nome: "Marabá", contratoId: contrato.id },
        { codigo: "PBA", nome: "Parauapebas", contratoId: contrato.id },
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
  it("atualiza o contrato vinculado", async () => {
    const contrato = await criarContrato("5900130281");
    const novoContrato = await criarContrato("5900999999");
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/frentes/${frente.id}`,
      payload: { contratoId: novoContrato.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { contrato: { numero: string } };
    expect(body.contrato.numero).toBe("5900999999");
  });

  it("atualiza nome e ativo", async () => {
    const contrato = await criarContrato();
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });

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
    const contrato = await criarContrato();
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/frentes/${frente.id}`,
      payload: { nome: "" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /frentes/:id/portal-token", () => {
  it("gera o link fixo do portal do fiscal para a frente", async () => {
    const contrato = await criarContrato();
    const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });

    const app = buildApp();
    const response = await app.inject({ method: "POST", url: `/frentes/${frente.id}/portal-token` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { portalFiscalToken: string };
    expect(body.portalFiscalToken).toHaveLength(43);
  });

  it("retorna 404 para frente inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/frentes/nao-existe/portal-token" });
    expect(response.statusCode).toBe(404);
  });
});

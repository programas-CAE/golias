import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarCenario(
  portalEncarregadoToken: string | null = "token-encarregado",
  codigo: "MAB" | "PBA" | "RAMAL" = "MAB",
) {
  const contrato = await prisma.contrato.create({ data: { numero: `${codigo}-0000` } });
  const frente = await prisma.frente.create({
    data: { codigo, nome: "Marabá", contratoId: contrato.id, portalEncarregadoToken },
  });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  return { frente, distrito, equipe };
}

describe("GET /portal-encarregado/:token", () => {
  it("lista os distritos e equipes ativas da frente", async () => {
    const { frente, distrito, equipe } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/portal-encarregado/token-encarregado" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      frente: { id: string };
      distritos: Array<{ id: string; nome: string; equipes: Array<{ id: string; nome: string }> }>;
    };
    expect(body.frente.id).toBe(frente.id);
    expect(body.distritos).toHaveLength(1);
    expect(body.distritos[0]?.id).toBe(distrito.id);
    expect(body.distritos[0]?.equipes.map((e) => e.id)).toEqual([equipe.id]);
  });

  it("retorna 404 para token inválido", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/portal-encarregado/nao-existe" });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /portal-encarregado/:token/equipes", () => {
  it("cria uma equipe nova no distrito informado", async () => {
    const { distrito } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/portal-encarregado/token-encarregado/equipes",
      payload: { nome: "Terraplenagem 2", distritoId: distrito.id },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { nome: string };
    expect(body.nome).toBe("Terraplenagem 2");
  });

  it("retorna 400 quando o distrito é de outra frente", async () => {
    const { distrito: distritoDaOutraFrente } = await criarCenario();
    await criarCenario("token-encarregado-2", "PBA");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/portal-encarregado/token-encarregado-2/equipes",
      payload: { nome: "Equipe inválida", distritoId: distritoDaOutraFrente.id },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /portal-encarregado/:token/equipes/:equipeId/rdo-hoje", () => {
  it("cria um RDO em rascunho pra hoje e devolve o token de campo", async () => {
    const { equipe } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/portal-encarregado/token-encarregado/equipes/${equipe.id}/rdo-hoje`,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { linkCampoToken: string };
    expect(body.linkCampoToken).toBeTruthy();

    const rdo = await prisma.rdo.findFirstOrThrow({ where: { equipeId: equipe.id } });
    expect(rdo.status).toBe("RASCUNHO");
    expect(rdo.linkCampoToken).toBe(body.linkCampoToken);
  });

  it("na segunda chamada no mesmo dia devolve o mesmo RDO, sem duplicar", async () => {
    const { equipe } = await criarCenario();

    const app = buildApp();
    const primeira = await app.inject({
      method: "POST",
      url: `/portal-encarregado/token-encarregado/equipes/${equipe.id}/rdo-hoje`,
    });
    const segunda = await app.inject({
      method: "POST",
      url: `/portal-encarregado/token-encarregado/equipes/${equipe.id}/rdo-hoje`,
    });

    expect((primeira.json() as { linkCampoToken: string }).linkCampoToken).toBe(
      (segunda.json() as { linkCampoToken: string }).linkCampoToken,
    );
    const total = await prisma.rdo.count({ where: { equipeId: equipe.id } });
    expect(total).toBe(1);
  });

  it("retorna 404 quando a equipe não pertence à frente do token", async () => {
    const { equipe } = await criarCenario();
    await criarCenario("token-encarregado-2", "PBA");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/portal-encarregado/token-encarregado-2/equipes/${equipe.id}/rdo-hoje`,
    });

    expect(response.statusCode).toBe(404);
  });
});

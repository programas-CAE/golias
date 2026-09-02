import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarCenario() {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000001" } });
  const frenteA = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const frenteB = await prisma.frente.create({ data: { codigo: "PBA", nome: "Parauapebas", contratoId: contrato.id } });
  const distritoA = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frenteA.id } });
  const distritoB = await prisma.distrito.create({ data: { nome: "Parauapebas Centro", frenteId: frenteB.id } });
  const equipeA = await prisma.equipe.create({ data: { nome: "Preventiva A", distritoId: distritoA.id } });
  const equipeB = await prisma.equipe.create({ data: { nome: "Preventiva B", distritoId: distritoB.id } });
  const atividade1 = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 1 },
  });
  const atividade2 = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.1.5", descricao: "Limpeza de valeta", unidade: "M2", usaDimensoes: true, ordem: 2 },
  });
  return { frenteA, frenteB, equipeA, equipeB, atividade1, atividade2 };
}

async function criarRdoCompleto(
  app: ReturnType<typeof buildApp>,
  opcoes: { frenteId: string; equipeId: string; data: string; atividadeCatalogoId: string },
) {
  const response = await app.inject({
    method: "POST",
    url: "/rdos/completo",
    payload: {
      frenteId: opcoes.frenteId,
      equipeId: opcoes.equipeId,
      data: opcoes.data,
      locais: [
        {
          descricao: "Km 0 ao km 1",
          ordem: 0,
          atividades: [{ atividadeCatalogoId: opcoes.atividadeCatalogoId, largura: 4, comprimento: 100, unidade: "M2" }],
        },
      ],
      maoDeObra: [],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("GET /indicadores", () => {
  it("usa o ciclo de medição (dia 19 do mês anterior ao dia 20 do mês selecionado), não o mês civil", async () => {
    const { frenteA, equipeA, atividade1 } = await criarCenario();
    const app = buildApp();

    // Fora do ciclo de "2026-09" (começa em 19/08): dia 18/08 fica de fora.
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-08-18", atividadeCatalogoId: atividade1.id });
    // Dentro do ciclo: começo (19/08) e fim (20/09).
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-08-19", atividadeCatalogoId: atividade1.id });
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-20", atividadeCatalogoId: atividade1.id });
    // Fora do ciclo de "2026-09": dia 21/09 já pertence ao ciclo de "2026-10".
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-21", atividadeCatalogoId: atividade1.id });

    const response = await app.inject({ method: "GET", url: "/indicadores?mes=2026-09" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number };
    expect(body.rdosEmitidos).toBe(2);
  });

  it("filtra por localidade (frente)", async () => {
    const { frenteA, frenteB, equipeA, equipeB, atividade1 } = await criarCenario();
    const app = buildApp();

    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });
    await criarRdoCompleto(app, { frenteId: frenteB.id, equipeId: equipeB.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });

    const response = await app.inject({ method: "GET", url: `/indicadores?mes=2026-09&frenteId=${frenteA.id}` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number; porFrente: Array<{ nome: string; rdosEmitidos: number }> };
    expect(body.rdosEmitidos).toBe(1);
    expect(body.porFrente).toHaveLength(1);
    expect(body.porFrente[0]?.nome).toBe("Marabá");
  });

  it("filtra por equipe", async () => {
    const { frenteA, equipeA, equipeB, atividade1 } = await criarCenario();
    const app = buildApp();

    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeB.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });

    const response = await app.inject({ method: "GET", url: `/indicadores?mes=2026-09&equipeId=${equipeA.id}` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number };
    expect(body.rdosEmitidos).toBe(1);
  });

  it("filtra por atividade, restringindo tanto a contagem de RDOs quanto a tabela de produtividade", async () => {
    const { frenteA, equipeA, atividade1, atividade2 } = await criarCenario();
    const app = buildApp();

    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-02", atividadeCatalogoId: atividade2.id });

    const response = await app.inject({ method: "GET", url: `/indicadores?mes=2026-09&atividadeCatalogoId=${atividade1.id}` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number; produtividadePorAtividade: Array<{ id: string }> };
    expect(body.rdosEmitidos).toBe(1);
    expect(body.produtividadePorAtividade).toHaveLength(1);
    expect(body.produtividadePorAtividade[0]?.id).toBe(atividade1.id);
  });

  it("combina os três filtros (localidade, equipe e atividade) com AND", async () => {
    const { frenteA, equipeA, equipeB, atividade1, atividade2 } = await criarCenario();
    const app = buildApp();

    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-01", atividadeCatalogoId: atividade1.id });
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeA.id, data: "2026-09-02", atividadeCatalogoId: atividade2.id });
    await criarRdoCompleto(app, { frenteId: frenteA.id, equipeId: equipeB.id, data: "2026-09-03", atividadeCatalogoId: atividade1.id });

    const response = await app.inject({
      method: "GET",
      url: `/indicadores?mes=2026-09&frenteId=${frenteA.id}&equipeId=${equipeA.id}&atividadeCatalogoId=${atividade1.id}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdosEmitidos: number };
    expect(body.rdosEmitidos).toBe(1);
  });
});

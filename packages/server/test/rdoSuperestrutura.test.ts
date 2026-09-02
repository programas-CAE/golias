import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function criarCenario() {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Superestrutura", distritoId: distrito.id } });
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Soldador/Maçariqueiro" } });
  const equipamento = await prisma.equipamentoCatalogo.create({ data: { nome: "Caminhão Munck" } });
  const material = await prisma.materialCatalogo.create({
    data: { contratoId: contrato.id, codigo: "TIREFOND", descricao: "Tirefond", unidade: "peça", precoUnitario: 5 },
  });
  return { frente, equipe, funcao, equipamento, material };
}

function payloadSuperestrutura(frenteId: string, equipeId: string) {
  return {
    frenteId,
    equipeId,
    data: "2026-07-21",
    tipo: "SUPERESTRUTURA",
    superestrutura: {
      intervaloProgramadoInicio: "10:00",
      intervaloProgramadoFim: "10:30",
      intervaloRealizadoInicio: "10:05",
      intervaloRealizadoFim: "10:20",
      tempoTotalPerdas: "00:15",
      leiturasTemperatura: [
        { hora: "07:00", temperaturaC: 24 },
        { hora: "12:00", temperaturaC: 31 },
      ],
      servicos: [
        {
          codigo: "SE-01",
          descricao: "Troca de dormentes",
          unidade: "UND",
          quantidade: 12,
          linha: "Linha Norte",
          kmInicial: 758,
          kmFinal: 759,
        },
      ],
    },
  };
}

describe("POST /rdos/completo — tipo SUPERESTRUTURA", () => {
  it("cria um RDO de superestrutura com temperatura/intervalos/serviços", async () => {
    const { frente, equipe } = await criarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: payloadSuperestrutura(frente.id, equipe.id),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; tipo: string };
    expect(body.tipo).toBe("SUPERESTRUTURA");

    const superestrutura = await prisma.rdoSuperestrutura.findUnique({
      where: { rdoId: body.id },
      include: { leiturasTemperatura: true, servicos: true },
    });
    expect(superestrutura).not.toBeNull();
    expect(superestrutura!.leiturasTemperatura).toHaveLength(2);
    expect(superestrutura!.servicos).toHaveLength(1);
    expect(superestrutura!.servicos[0]!.descricao).toBe("Troca de dormentes");
  });

  it("retorna 400 quando não há nenhum serviço executado", async () => {
    const { frente, equipe } = await criarCenario();
    const app = buildApp();

    const payload = payloadSuperestrutura(frente.id, equipe.id);
    payload.superestrutura.servicos = [];

    const response = await app.inject({ method: "POST", url: "/rdos/completo", payload });
    expect(response.statusCode).toBe(400);
  });

  it("gera o PDF de superestrutura", async () => {
    const { frente, equipe } = await criarCenario();
    const app = buildApp();

    const criado = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: payloadSuperestrutura(frente.id, equipe.id),
    });
    const { id } = criado.json() as { id: string };

    const gerar = await app.inject({ method: "POST", url: `/rdos/${id}/pdf` });
    expect(gerar.statusCode).toBe(200);

    const baixar = await app.inject({ method: "GET", url: `/rdos/${id}/pdf` });
    expect(baixar.statusCode).toBe(200);
    expect(baixar.headers["content-type"]).toBe("application/pdf");
  });

  it("um RDO PREVENTIVA_CORRETIVA continua exigindo local/atividade normalmente (tipo default)", async () => {
    const { frente, equipe } = await criarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: { frenteId: frente.id, equipeId: equipe.id, data: "2026-07-21", locais: [] },
    });
    expect(response.statusCode).toBe(400);
  });
});

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
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras" } });
  const colaborador = await prisma.colaborador.create({
    data: { matricula: "001", nome: "João", funcaoId: funcao.id },
  });
  const atividade = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 1 },
  });
  const equipamento = await prisma.equipamentoCatalogo.create({ data: { nome: "Roçadeira" } });
  const material = await prisma.materialCatalogo.create({
    data: { contratoId: contrato.id, codigo: "M001", descricao: "Cimento", unidade: "saco", precoUnitario: 30 },
  });
  return { frente, distrito, equipe, funcao, colaborador, atividade, equipamento, material };
}

describe("POST /rdos", () => {
  it("cria um RDO em rascunho com token de campo", async () => {
    const { frente, equipe } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos",
      payload: { frenteId: frente.id, equipeId: equipe.id, data: "2026-07-21" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { status: string; linkCampoToken: string; linkCampoExpiraEm: string };
    expect(body.status).toBe("RASCUNHO");
    expect(body.linkCampoToken).toHaveLength(43);
  });

  it("retorna 400 para frenteId inválido", async () => {
    const { equipe } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos",
      payload: { frenteId: "invalido", equipeId: equipe.id, data: "2026-07-21" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /rdos/completo", () => {
  it("cria um RDO completo numa única chamada, com atividades, mão de obra, equipamentos e materiais", async () => {
    const { frente, equipe, funcao, colaborador, atividade, equipamento, material } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        clima: "SOL",
        totalDesvios: 2,
        temperaturaMedia: 28.5,
        blocosHorario: [{ horarioInicial: "07:00", horarioFinal: "08:50", descricao: "Deslocamento", ordem: 0 }],
        locais: [
          {
            descricao: "Km 767+520 ao 770+480",
            ordem: 0,
            atividades: [{ atividadeCatalogoId: atividade.id, largura: 12, comprimento: 264, unidade: "M2" }],
          },
        ],
        maoDeObra: [{ funcaoId: funcao.id, colaboradorId: colaborador.id, quantidade: 10 }],
        equipamentos: [{ equipamentoCatalogoId: equipamento.id, quantidade: 2 }],
        materiais: [{ materialCatalogoId: material.id, quantidade: 5 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      status: string;
      linkCampoToken: string;
      totalDesvios: number;
      temperaturaMedia: string;
      locais: Array<{ atividades: Array<{ totalCalculado: string }> }>;
      maoDeObra: unknown[];
      equipamentos: unknown[];
      materiais: Array<{ materialCatalogo: { descricao: string }; quantidade: string }>;
    };
    expect(body.status).toBe("RASCUNHO");
    expect(body.linkCampoToken).toHaveLength(43);
    expect(body.totalDesvios).toBe(2);
    expect(Number(body.temperaturaMedia)).toBe(28.5);
    expect(Number(body.locais[0]?.atividades[0]?.totalCalculado)).toBe(3168);
    expect(body.maoDeObra).toHaveLength(1);
    expect(body.equipamentos).toHaveLength(1);
    expect(body.materiais).toHaveLength(1);
    expect(body.materiais[0]?.materialCatalogo.descricao).toBe("Cimento");
  });

  it("retorna 400 quando nenhum local é informado", async () => {
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

describe("GET /rdos/campo/:token", () => {
  it("carrega o RDO com dados de apoio pelo token", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-valido",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/campo/token-valido" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdo: { id: string }; atividadesCatalogo: unknown[] };
    expect(body.rdo.id).toBe(rdo.id);
    expect(body.atividadesCatalogo).toHaveLength(1);
  });

  it("retorna 404 para token inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/campo/nao-existe" });
    expect(response.statusCode).toBe(404);
  });

  it("retorna 410 para token expirado", async () => {
    const { frente, equipe } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-expirado",
        linkCampoExpiraEm: new Date(Date.now() - 1000),
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/campo/token-expirado" });
    expect(response.statusCode).toBe(410);
  });
});

describe("PATCH /rdos/campo/:token", () => {
  it("salva blocos, locais, mão de obra e equipamentos, calculando o total da atividade", async () => {
    const { frente, equipe, funcao, colaborador, atividade, equipamento } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-save",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/rdos/campo/token-save",
      payload: {
        clima: "SOL",
        blocosHorario: [{ horarioInicial: "07:00", horarioFinal: "08:50", descricao: "Deslocamento", ordem: 0 }],
        locais: [
          {
            descricao: "Km 767+520 ao 770+480",
            ordem: 0,
            atividades: [
              { atividadeCatalogoId: atividade.id, largura: 12, comprimento: 264, unidade: "M2" },
            ],
          },
        ],
        maoDeObra: [{ funcaoId: funcao.id, colaboradorId: colaborador.id, quantidade: 10 }],
        equipamentos: [{ equipamentoCatalogoId: equipamento.id, quantidade: 2 }],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      blocosHorario: unknown[];
      locais: Array<{ atividades: Array<{ totalCalculado: string }> }>;
      maoDeObra: unknown[];
      equipamentos: unknown[];
    };
    expect(body.blocosHorario).toHaveLength(1);
    expect(body.locais).toHaveLength(1);
    expect(Number(body.locais[0]?.atividades[0]?.totalCalculado)).toBe(3168);
    expect(body.maoDeObra).toHaveLength(1);
    expect(body.equipamentos).toHaveLength(1);
  });

  it("substitui os locais salvos anteriormente (não acumula)", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-substitui",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const payload = {
      locais: [
        {
          descricao: "Trecho A",
          ordem: 0,
          atividades: [{ atividadeCatalogoId: atividade.id, comprimento: 10, unidade: "M" }],
        },
      ],
    };

    await app.inject({ method: "PATCH", url: "/rdos/campo/token-substitui", payload });
    const segunda = await app.inject({
      method: "PATCH",
      url: "/rdos/campo/token-substitui",
      payload: {
        locais: [
          {
            descricao: "Trecho B",
            ordem: 0,
            atividades: [{ atividadeCatalogoId: atividade.id, comprimento: 20, unidade: "M" }],
          },
        ],
      },
    });

    const body = segunda.json() as { locais: Array<{ descricao: string }> };
    expect(body.locais).toHaveLength(1);
    expect(body.locais[0]?.descricao).toBe("Trecho B");
  });

  it("retorna 410 para token expirado", async () => {
    const { frente, equipe } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-patch-expirado",
        linkCampoExpiraEm: new Date(Date.now() - 1000),
      },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/rdos/campo/token-patch-expirado",
      payload: { locais: [] },
    });
    expect(response.statusCode).toBe(410);
  });

  it("retorna 400 quando atividade em M2 não informa largura/comprimento", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-invalido",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/rdos/campo/token-invalido",
      payload: {
        locais: [
          { descricao: "Trecho", ordem: 0, atividades: [{ atividadeCatalogoId: atividade.id, unidade: "M2" }] },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

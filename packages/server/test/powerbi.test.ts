import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

const TOKEN = "token-de-teste-powerbi";

beforeEach(async () => {
  await resetDatabase();
  process.env.POWERBI_API_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.POWERBI_API_TOKEN;
});

async function criarCenario() {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Encarregado" } });
  const encarregado = await prisma.colaborador.create({ data: { matricula: "001", nome: "João", funcaoId: funcao.id } });
  const atividade = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 1, metaPus: 50 },
  });
  return { frente, equipe, encarregado, atividade };
}

describe("GET /powerbi/fato-rdo-detalhe", () => {
  it("retorna 401 sem token válido", async () => {
    const app = buildApp();
    const semToken = await app.inject({ method: "GET", url: "/powerbi/fato-rdo-detalhe" });
    expect(semToken.statusCode).toBe(401);

    const tokenErrado = await app.inject({ method: "GET", url: "/powerbi/fato-rdo-detalhe?token=errado" });
    expect(tokenErrado.statusCode).toBe(401);
  });

  it("retorna uma linha por atividade de RDO aprovado, com PUS calculado", async () => {
    const { frente, equipe, encarregado, atividade } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Duplicação Km 40-60" } });
    const ordem = await prisma.ordemManutencao.create({
      data: { numero: "202600000001", frenteId: frente.id, dataEmissao: new Date("2026-07-20") },
    });
    const rdo = await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        obraId: obra.id,
        data: new Date("2026-07-21"),
        status: "APROVADO",
        encarregadoId: encarregado.id,
        tipo: "TERRAPLENAGEM",
      },
    });
    await prisma.rdoLocal.create({
      data: {
        rdoId: rdo.id,
        descricao: "Trecho A",
        ordem: 0,
        atividades: {
          create: [
            {
              atividadeCatalogoId: atividade.id,
              ordemManutencaoId: ordem.id,
              statusOm: "EM_ANDAMENTO",
              percentualConcluido: 40,
              largura: 10,
              comprimento: 20,
              unidade: "M2",
              totalCalculado: 200,
              maoObraDireta: 4,
              horasTrabalhadas: 5,
            },
          ],
        },
      },
    });

    // RDO em rascunho não deve entrar.
    await prisma.rdo.create({ data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-22") } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/powerbi/fato-rdo-detalhe?token=${TOKEN}` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      Data: "2026-07-21",
      Tipo_RDO: "TERRAPLENAGEM",
      Contrato: "5900000000",
      Distrito: "Marabá",
      Equipe: "Preventiva",
      Obra: "Duplicação Km 40-60",
      Colaborador: "João",
      Atividade_Codigo: "2.2.1",
      Producao: 200,
      Mao_Obra_Direta: 4,
      Horas_Trabalhadas: 5,
      PUS_Referencia: 50,
      Homens_Hora: 20,
      PUS_Calculado: 10,
      Eficiencia_Calculada: 20,
      OM_Numero: "202600000001",
      Status_OM: "EM_ANDAMENTO",
      Percentual_Concluido_OM: 40,
    });
  });
});

describe("GET /powerbi/fato-rdo-material", () => {
  it("retorna uma linha por material lançado num RDO aprovado, com valor calculado", async () => {
    const { frente, equipe } = await criarCenario();
    const contrato = await prisma.contrato.findFirstOrThrow({ where: { numero: "5900000000" } });
    const material = await prisma.materialCatalogo.create({
      data: { contratoId: contrato.id, codigo: "MAT-01", descricao: "Cimento", unidade: "SC", precoUnitario: 35.5 },
    });
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21"), status: "APROVADO" },
    });
    await prisma.rdoMaterial.create({ data: { rdoId: rdo.id, materialCatalogoId: material.id, quantidade: 10 } });

    // RDO em rascunho não deve entrar.
    const rascunho = await prisma.rdo.create({ data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-22") } });
    await prisma.rdoMaterial.create({ data: { rdoId: rascunho.id, materialCatalogoId: material.id, quantidade: 99 } });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/powerbi/fato-rdo-material?token=${TOKEN}` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      Data: "2026-07-21",
      Contrato: "5900000000",
      Distrito: "Marabá",
      Equipe: "Preventiva",
      Material_Codigo: "MAT-01",
      Material_Descricao: "Cimento",
      Unidade: "SC",
      Quantidade: 10,
      Preco_Unitario: 35.5,
      Valor_Total: 355,
    });
  });
});

describe("GET /powerbi/fato-rdo-mao-de-obra", () => {
  it("retorna uma linha por função de efetivo lançada num RDO aprovado", async () => {
    const { frente, equipe, encarregado } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21"), status: "APROVADO" },
    });
    const funcao = await prisma.funcaoCatalogo.findFirstOrThrow({ where: { nome: "Encarregado" } });
    await prisma.rdoMaoDeObra.create({
      data: {
        rdoId: rdo.id,
        funcaoId: funcao.id,
        colaboradorId: encarregado.id,
        quantidade: 2,
        horasImprodutivas: 1.5,
        causaImprodutividade: "Chuva",
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/powerbi/fato-rdo-mao-de-obra?token=${TOKEN}` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      Data: "2026-07-21",
      Contrato: "5900000000",
      Distrito: "Marabá",
      Equipe: "Preventiva",
      Funcao: "Encarregado",
      Colaborador: "João",
      Quantidade: 2,
      Horas_Improdutivas: 1.5,
      Causa_Improdutividade: "Chuva",
    });
  });
});

describe("GET /powerbi/dim-atividade e /powerbi/dim-distrito", () => {
  it("retornam as dimensões no formato esperado, com token válido", async () => {
    await criarCenario();
    const app = buildApp();

    const dimAtividade = await app.inject({ method: "GET", url: `/powerbi/dim-atividade?token=${TOKEN}` });
    expect(dimAtividade.statusCode).toBe(200);
    const atividades = dimAtividade.json() as Array<{ Atividade_Codigo: string; Meta_PUS_Padrao: number }>;
    expect(atividades.find((a) => a.Atividade_Codigo === "2.2.1")?.Meta_PUS_Padrao).toBe(50);

    const dimDistrito = await app.inject({ method: "GET", url: `/powerbi/dim-distrito?token=${TOKEN}` });
    expect(dimDistrito.statusCode).toBe(200);
    const distritos = dimDistrito.json() as Array<{ Distrito: string; Sigla_Origem: string }>;
    expect(distritos).toContainEqual({ Distrito: "Marabá", Sigla_Origem: "MAB" });
  });
});

describe("GET /powerbi/dim-obra", () => {
  it("retorna as obras cadastradas, ativas ou não, com token válido", async () => {
    await prisma.obra.create({ data: { nome: "Duplicação Km 40-60" } });
    await prisma.obra.create({ data: { nome: "Obra encerrada", ativo: false } });

    const app = buildApp();
    const semToken = await app.inject({ method: "GET", url: "/powerbi/dim-obra" });
    expect(semToken.statusCode).toBe(401);

    const response = await app.inject({ method: "GET", url: `/powerbi/dim-obra?token=${TOKEN}` });
    expect(response.statusCode).toBe(200);
    const obras = response.json() as Array<{ Obra: string; Ativo: boolean }>;
    expect(obras).toContainEqual({ Obra: "Duplicação Km 40-60", Ativo: true });
    expect(obras).toContainEqual({ Obra: "Obra encerrada", Ativo: false });
  });
});

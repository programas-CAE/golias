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
  const atividade = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 1 },
  });
  const material = await prisma.materialCatalogo.create({
    data: { contratoId: contrato.id, codigo: "M001", descricao: "Cimento", unidade: "saco", precoUnitario: 30 },
  });
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras" } });
  return { frente, distrito, equipe, atividade, material, funcao };
}

async function criarRdoNaObra(params: {
  frenteId: string;
  equipeId: string;
  obraId: string;
  data: string;
  atividadeId: string;
  materialId?: string;
  quantidadeMaterial?: number;
  funcaoId?: string;
  blocosHorario?: Array<{ horarioInicial: string; horarioFinal: string; descricao: string }>;
}) {
  const app = buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/rdos/completo",
    payload: {
      frenteId: params.frenteId,
      equipeId: params.equipeId,
      obraId: params.obraId,
      data: params.data,
      blocosHorario: params.blocosHorario ?? [],
      locais: [
        {
          descricao: "Trecho teste",
          ordem: 0,
          atividades: [{ atividadeCatalogoId: params.atividadeId, unidade: "M2", largura: 2, comprimento: 10 }],
        },
      ],
      materiais: params.materialId
        ? [{ materialCatalogoId: params.materialId, quantidade: params.quantidadeMaterial ?? 1 }]
        : [],
      maoDeObra: params.funcaoId ? [{ funcaoId: params.funcaoId, quantidade: 3 }] : [],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

describe("POST /obras", () => {
  it("cria uma obra ativa por padrão", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/obras", payload: { nome: "Duplicação Km 40-60" } });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { nome: string; ativo: boolean };
    expect(body.nome).toBe("Duplicação Km 40-60");
    expect(body.ativo).toBe(true);
  });

  it("retorna 400 quando o nome está vazio", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "POST", url: "/obras", payload: { nome: "" } });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /obras", () => {
  it("sem ?todos só lista obras ativas; com ?todos=1 lista todas", async () => {
    const ativa = await prisma.obra.create({ data: { nome: "Ativa" } });
    await prisma.obra.create({ data: { nome: "Inativa", ativo: false } });

    const app = buildApp();
    const soAtivas = await app.inject({ method: "GET", url: "/obras" });
    const todas = await app.inject({ method: "GET", url: "/obras?todos=1" });

    const bodyAtivas = soAtivas.json() as Array<{ id: string }>;
    const bodyTodas = todas.json() as Array<{ id: string }>;
    expect(bodyAtivas.map((o) => o.id)).toEqual([ativa.id]);
    expect(bodyTodas).toHaveLength(2);
  });
});

describe("PATCH /obras/:id", () => {
  it("atualiza nome e ativo", async () => {
    const obra = await prisma.obra.create({ data: { nome: "Original" } });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/obras/${obra.id}`,
      payload: { nome: "Renomeada", ativo: false },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { nome: string; ativo: boolean };
    expect(body.nome).toBe("Renomeada");
    expect(body.ativo).toBe(false);
  });

  it("retorna 404 para obra inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "PATCH", url: "/obras/nao-existe", payload: { nome: "X" } });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /rdos/completo com obraId", () => {
  it("liga o RDO à obra informada", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Obra do RDO" } });

    const rdo = await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-09-03",
      atividadeId: atividade.id,
    });

    const salvo = await prisma.rdo.findUniqueOrThrow({ where: { id: rdo.id }, select: { obraId: true } });
    expect(salvo.obraId).toBe(obra.id);
  });
});

describe("GET /obras/:id/calendario", () => {
  it("lista só os RDOs da obra dentro do mês pedido", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Obra do calendário" } });
    const outraObra = await prisma.obra.create({ data: { nome: "Outra obra" } });

    const dentroDoMes = await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-09-03",
      atividadeId: atividade.id,
    });
    await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-08-15",
      atividadeId: atividade.id,
    });
    await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: outraObra.id,
      data: "2026-09-05",
      atividadeId: atividade.id,
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/obras/${obra.id}/calendario?mes=2026-09` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { rdos: Array<{ id: string }> };
    expect(body.rdos.map((r) => r.id)).toEqual([dentroDoMes.id]);
  });

  it("retorna 404 para obra inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/obras/nao-existe/calendario" });
    expect(response.statusCode).toBe(404);
  });

  it("usa o mesmo ciclo de medição do Farol (dia 21 do mês anterior ao dia 20 do mês pedido), não o mês civil", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Obra do ciclo" } });

    const foraAntes = await criarRdoNaObra({ frenteId: frente.id, equipeId: equipe.id, obraId: obra.id, data: "2026-08-20", atividadeId: atividade.id });
    const dentroInicio = await criarRdoNaObra({ frenteId: frente.id, equipeId: equipe.id, obraId: obra.id, data: "2026-08-21", atividadeId: atividade.id });
    const dentroFim = await criarRdoNaObra({ frenteId: frente.id, equipeId: equipe.id, obraId: obra.id, data: "2026-09-20", atividadeId: atividade.id });
    const foraDepois = await criarRdoNaObra({ frenteId: frente.id, equipeId: equipe.id, obraId: obra.id, data: "2026-09-21", atividadeId: atividade.id });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/obras/${obra.id}/calendario?mes=2026-09` });

    const body = response.json() as { periodo: { inicio: string; fim: string }; rdos: Array<{ id: string }> };
    expect(body.periodo).toMatchObject({ inicio: "2026-08-21", fim: "2026-09-20" });
    const ids = body.rdos.map((r) => r.id);
    expect(ids).toContain(dentroInicio.id);
    expect(ids).toContain(dentroFim.id);
    expect(ids).not.toContain(foraAntes.id);
    expect(ids).not.toContain(foraDepois.id);
  });

  it("traz horas trabalhadas, efetivo e materiais de cada RDO (apontamentos do dia)", async () => {
    const { frente, equipe, atividade, material, funcao } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Obra dos apontamentos" } });

    const rdo = await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-09-03",
      atividadeId: atividade.id,
      materialId: material.id,
      quantidadeMaterial: 12,
      funcaoId: funcao.id,
      blocosHorario: [{ horarioInicial: "07:00", horarioFinal: "11:00", descricao: "DSS" }],
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/obras/${obra.id}/calendario?mes=2026-09` });
    const body = response.json() as {
      rdos: Array<{
        id: string;
        horasTrabalhadas: number;
        maoDeObra: Array<{ funcao: string; quantidade: number }>;
        materiais: Array<{ descricao: string; unidade: string; quantidade: number }>;
      }>;
    };

    const linha = body.rdos.find((r) => r.id === rdo.id);
    expect(linha?.horasTrabalhadas).toBe(4);
    expect(linha?.maoDeObra).toEqual([{ funcao: "Servente de Obras", quantidade: 3 }]);
    expect(linha?.materiais).toEqual([{ descricao: "Cimento", unidade: "saco", quantidade: 12 }]);
  });
});

describe("Etapas da obra (cronograma planejado)", () => {
  it("cria, lista ordenado por data de início, edita e remove uma etapa", async () => {
    const obra = await prisma.obra.create({ data: { nome: "Obra com etapas" } });
    const app = buildApp();

    const criada2 = await app.inject({
      method: "POST",
      url: `/obras/${obra.id}/etapas`,
      payload: { nome: "Base", dataInicioPrevista: "2026-09-16", dataFimPrevista: "2026-09-30" },
    });
    const criada1 = await app.inject({
      method: "POST",
      url: `/obras/${obra.id}/etapas`,
      payload: { nome: "Terraplenagem", dataInicioPrevista: "2026-09-01", dataFimPrevista: "2026-09-15" },
    });
    expect(criada1.statusCode).toBe(201);
    expect(criada2.statusCode).toBe(201);
    const etapa1 = criada1.json() as { id: string };

    const lista = await app.inject({ method: "GET", url: `/obras/${obra.id}/etapas` });
    expect((lista.json() as Array<{ nome: string }>).map((e) => e.nome)).toEqual(["Terraplenagem", "Base"]);

    const editada = await app.inject({
      method: "PATCH",
      url: `/obras/${obra.id}/etapas/${etapa1.id}`,
      payload: { nome: "Terraplenagem (revisado)", dataInicioPrevista: "2026-09-01", dataFimPrevista: "2026-09-18" },
    });
    expect(editada.statusCode).toBe(200);
    expect((editada.json() as { nome: string }).nome).toBe("Terraplenagem (revisado)");

    const removida = await app.inject({ method: "DELETE", url: `/obras/${obra.id}/etapas/${etapa1.id}` });
    expect(removida.statusCode).toBe(204);
    const listaFinal = await app.inject({ method: "GET", url: `/obras/${obra.id}/etapas` });
    expect((listaFinal.json() as Array<{ nome: string }>).map((e) => e.nome)).toEqual(["Base"]);
  });

  it("retorna 400 quando a data fim é antes da data início", async () => {
    const obra = await prisma.obra.create({ data: { nome: "Obra" } });
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/obras/${obra.id}/etapas`,
      payload: { nome: "Etapa inválida", dataInicioPrevista: "2026-09-15", dataFimPrevista: "2026-09-01" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("não deixa editar/remover etapa de outra obra (isolamento por obraId)", async () => {
    const obraA = await prisma.obra.create({ data: { nome: "Obra A" } });
    const obraB = await prisma.obra.create({ data: { nome: "Obra B" } });
    const app = buildApp();
    const etapa = (
      await app.inject({
        method: "POST",
        url: `/obras/${obraA.id}/etapas`,
        payload: { nome: "Etapa da A", dataInicioPrevista: "2026-09-01", dataFimPrevista: "2026-09-10" },
      })
    ).json() as { id: string };

    const editar = await app.inject({
      method: "PATCH",
      url: `/obras/${obraB.id}/etapas/${etapa.id}`,
      payload: { nome: "Tentativa", dataInicioPrevista: "2026-09-01", dataFimPrevista: "2026-09-10" },
    });
    expect(editar.statusCode).toBe(404);

    const remover = await app.inject({ method: "DELETE", url: `/obras/${obraB.id}/etapas/${etapa.id}` });
    expect(remover.statusCode).toBe(404);
  });

  it("retorna 404 pra obra inexistente", async () => {
    const app = buildApp();
    const listar = await app.inject({ method: "GET", url: "/obras/nao-existe/etapas" });
    expect(listar.statusCode).toBe(404);
    const criar = await app.inject({
      method: "POST",
      url: "/obras/nao-existe/etapas",
      payload: { nome: "X", dataInicioPrevista: "2026-09-01", dataFimPrevista: "2026-09-10" },
    });
    expect(criar.statusCode).toBe(404);
  });
});

describe("GET /obras/:id/materiais", () => {
  it("soma o total por material e detalha por data/RDO, só da obra pedida", async () => {
    const { frente, equipe, atividade, material } = await criarCenario();
    const obra = await prisma.obra.create({ data: { nome: "Obra dos materiais" } });
    const outraObra = await prisma.obra.create({ data: { nome: "Outra obra" } });

    await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-09-03",
      atividadeId: atividade.id,
      materialId: material.id,
      quantidadeMaterial: 10,
    });
    await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: obra.id,
      data: "2026-09-10",
      atividadeId: atividade.id,
      materialId: material.id,
      quantidadeMaterial: 15,
    });
    await criarRdoNaObra({
      frenteId: frente.id,
      equipeId: equipe.id,
      obraId: outraObra.id,
      data: "2026-09-04",
      atividadeId: atividade.id,
      materialId: material.id,
      quantidadeMaterial: 100,
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/obras/${obra.id}/materiais` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      totais: Array<{ materialCatalogoId: string; descricao: string; unidade: string; quantidadeTotal: number }>;
      porData: Array<{ data: string }>;
    };
    expect(body.totais).toEqual([{ materialCatalogoId: material.id, descricao: "Cimento", unidade: "saco", quantidadeTotal: 25 }]);
    expect(body.porData.map((p) => p.data).sort()).toEqual(["2026-09-03", "2026-09-10"]);
  });
});

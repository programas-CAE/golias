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
    const body = response.json() as { status: string; codigoRastreio: string; linkCampoToken: string; linkCampoExpiraEm: string };
    expect(body.status).toBe("RASCUNHO");
    expect(body.linkCampoToken).toHaveLength(43);
    expect(body.codigoRastreio).toMatch(/^\d{8}\d{3}$/);
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

  it("dá códigos de rastreio sequenciais pra RDOs criados no mesmo dia", async () => {
    const { frente, equipe } = await criarCenario();

    const app = buildApp();
    const payload = { frenteId: frente.id, equipeId: equipe.id, data: "2026-07-21" };
    const primeiro = await app.inject({ method: "POST", url: "/rdos", payload });
    const segundo = await app.inject({ method: "POST", url: "/rdos", payload });

    const codigo1 = (primeiro.json() as { codigoRastreio: string }).codigoRastreio;
    const codigo2 = (segundo.json() as { codigoRastreio: string }).codigoRastreio;
    expect(codigo1.slice(0, 8)).toBe(codigo2.slice(0, 8));
    expect(Number(codigo2.slice(8))).toBe(Number(codigo1.slice(8)) + 1);
  });
});

describe("DELETE /rdos/:id", () => {
  it("apaga um RDO em rascunho", async () => {
    const { frente, equipe } = await criarCenario();
    const app = buildApp();
    const criado = await app.inject({
      method: "POST",
      url: "/rdos",
      payload: { frenteId: frente.id, equipeId: equipe.id, data: "2026-07-21" },
    });
    const rdoId = (criado.json() as { id: string }).id;

    const response = await app.inject({ method: "DELETE", url: `/rdos/${rdoId}` });
    expect(response.statusCode).toBe(204);

    const buscar = await app.inject({ method: "GET", url: `/rdos/${rdoId}` });
    expect(buscar.statusCode).toBe(404);
  });

  it("retorna 409 quando o RDO não está mais em rascunho", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21"), status: "APROVADO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "DELETE", url: `/rdos/${rdo.id}` });

    expect(response.statusCode).toBe(409);
    await expect(prisma.rdo.findUnique({ where: { id: rdo.id } })).resolves.not.toBeNull();
  });

  it("retorna 404 para RDO inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "DELETE", url: "/rdos/nao-existe" });
    expect(response.statusCode).toBe(404);
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
      locais: Array<{ atividades: Array<{ totalCalculado: string }> }>;
      maoDeObra: unknown[];
      equipamentos: unknown[];
      materiais: Array<{ materialCatalogo: { descricao: string }; quantidade: string }>;
    };
    expect(body.status).toBe("RASCUNHO");
    expect(body.linkCampoToken).toHaveLength(43);
    expect(body.totalDesvios).toBe(2);
    expect(Number(body.locais[0]?.atividades[0]?.totalCalculado)).toBe(3168);
    expect(body.maoDeObra).toHaveLength(1);
    expect(body.equipamentos).toHaveLength(1);
    expect(body.materiais).toHaveLength(1);
    expect(body.materiais[0]?.materialCatalogo.descricao).toBe("Cimento");
  });

  it("salva a produção por equipamento (equipes de terraplenagem apontam por máquina, não por atividade)", async () => {
    const { frente, equipe, atividade, equipamento } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [
          {
            descricao: "Ramal km 28+200 a 30+700",
            ordem: 0,
            atividades: [{ atividadeCatalogoId: atividade.id, largura: 2, comprimento: 20, unidade: "M2" }],
          },
        ],
        equipamentos: [
          {
            equipamentoCatalogoId: equipamento.id,
            quantidade: 1,
            producaoDescricao: "Manutenção de Acesso",
            producaoValor: 800,
            producaoUnidade: "m",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; equipamentos: Array<{ producaoDescricao: string; producaoValor: string; producaoUnidade: string }> };
    expect(body.equipamentos[0]).toMatchObject({
      producaoDescricao: "Manutenção de Acesso",
      producaoUnidade: "m",
    });
    expect(Number(body.equipamentos[0]?.producaoValor)).toBe(800);

    const detalhe = await app.inject({ method: "GET", url: `/rdos/${body.id}` });
    const detalheBody = detalhe.json() as { equipamentos: Array<{ producaoValor: string }> };
    expect(Number(detalheBody.equipamentos[0]?.producaoValor)).toBe(800);
  });

  it("aceita um RDO só com produção de equipamento, sem nenhuma atividade do catálogo", async () => {
    const { frente, equipe, equipamento } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [{ descricao: "Ramal km 28+200 a 30+700", ordem: 0, atividades: [] }],
        equipamentos: [
          { equipamentoCatalogoId: equipamento.id, quantidade: 1, producaoDescricao: "Manutenção de Acesso", producaoValor: 800, producaoUnidade: "m" },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it("retorna 400 quando não há atividade nem produção de equipamento (RDO vazio)", async () => {
    const { frente, equipe } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [{ descricao: "Ramal km 28+200 a 30+700", ordem: 0, atividades: [] }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("soma pontos extras da mesma atividade/OM no totalCalculado, cada um com seu próprio memorial", async () => {
    const { frente, equipe, atividade } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [
          {
            descricao: "Trecho com dois pontos",
            ordem: 0,
            atividades: [
              {
                atividadeCatalogoId: atividade.id,
                largura: 2,
                comprimento: 20,
                unidade: "M2",
                pontosExtras: [{ ordem: 0, largura: 5, comprimento: 4 }],
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      locais: Array<{
        atividades: Array<{ totalCalculado: string; pontosExtras: Array<{ largura: string; comprimento: string; totalCalculado: string }> }>;
      }>;
    };
    const salva = body.locais[0]?.atividades[0];
    // Ponto 1 (2 × 20 = 40) + Ponto 2 (5 × 4 = 20) = 60.
    expect(Number(salva?.totalCalculado)).toBe(60);
    expect(salva?.pontosExtras).toHaveLength(1);
    expect(Number(salva?.pontosExtras[0]?.totalCalculado)).toBe(20);
  });

  it("retorna 400 quando um ponto extra não informa as dimensões exigidas pela unidade", async () => {
    const { frente, equipe, atividade } = await criarCenario();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [
          {
            descricao: "Trecho com ponto incompleto",
            ordem: 0,
            atividades: [
              {
                atividadeCatalogoId: atividade.id,
                largura: 2,
                comprimento: 20,
                unidade: "M2",
                pontosExtras: [{ ordem: 0, largura: 5 }],
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
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

  it("guarda km e OM por atividade — duas atividades do mesmo local podem ter OMs e kms diferentes", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const omA = await prisma.ordemManutencao.create({
      data: { numero: "OM-KM-A", frenteId: frente.id, dataEmissao: new Date("2026-07-01") },
    });
    const omB = await prisma.ordemManutencao.create({
      data: { numero: "OM-KM-B", frenteId: frente.id, dataEmissao: new Date("2026-07-01") },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [
          {
            descricao: "Trecho único com duas OMs",
            ordem: 0,
            atividades: [
              {
                atividadeCatalogoId: atividade.id,
                ordemManutencaoId: omA.id,
                kmInicial: 10,
                kmFinal: 11,
                comprimento: 5,
                unidade: "M",
              },
              {
                atividadeCatalogoId: atividade.id,
                ordemManutencaoId: omB.id,
                kmInicial: 20,
                kmFinal: 21,
                comprimento: 8,
                unidade: "M",
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      locais: Array<{ atividades: Array<{ ordemManutencaoId: string; kmInicial: string; kmFinal: string }> }>;
    };
    const atividades = body.locais[0]?.atividades ?? [];
    const daOmA = atividades.find((a) => a.ordemManutencaoId === omA.id);
    const daOmB = atividades.find((a) => a.ordemManutencaoId === omB.id);
    expect(Number(daOmA?.kmInicial)).toBe(10);
    expect(Number(daOmA?.kmFinal)).toBe(11);
    expect(Number(daOmB?.kmInicial)).toBe(20);
    expect(Number(daOmB?.kmFinal)).toBe(21);
  });

  it("deriva horasTrabalhadas do horário, maoObraDireta da quebra por função, e guarda o status da OM", async () => {
    const { frente, equipe, funcao, atividade } = await criarCenario();
    const om = await prisma.ordemManutencao.create({
      data: { numero: "OM-HORARIO", frenteId: frente.id, dataEmissao: new Date("2026-07-01") },
    });
    const funcao2 = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras 2" } });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/completo",
      payload: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: "2026-07-21",
        locais: [
          {
            descricao: "Trecho único",
            ordem: 0,
            atividades: [
              {
                atividadeCatalogoId: atividade.id,
                ordemManutencaoId: om.id,
                statusOm: "CONCLUIDA",
                comprimento: 10,
                unidade: "M",
                horarioInicial: "07:00",
                horarioFinal: "09:30",
                maoDeObra: [
                  { funcaoId: funcao.id, quantidade: 1 },
                  { funcaoId: funcao2.id, quantidade: 3 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      locais: Array<{
        atividades: Array<{
          statusOm: string;
          horarioInicial: string;
          horarioFinal: string;
          horasTrabalhadas: string;
          maoObraDireta: number;
          maoDeObra: Array<{ funcao: { nome: string }; quantidade: number }>;
        }>;
      }>;
    };
    const salva = body.locais[0]?.atividades[0];
    expect(salva?.statusOm).toBe("CONCLUIDA");
    expect(salva?.horarioInicial).toBe("07:00");
    expect(salva?.horarioFinal).toBe("09:30");
    expect(Number(salva?.horasTrabalhadas)).toBe(2.5);
    expect(salva?.maoObraDireta).toBe(4);
    expect(salva?.maoDeObra).toHaveLength(2);
  });

  it("permite salvar de novo (PATCH) um RDO cujas atividades já têm mão de obra — não trava por FK", async () => {
    const { frente, equipe, funcao, atividade } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-refazer",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const payload = {
      locais: [
        {
          descricao: "Trecho",
          ordem: 0,
          atividades: [
            {
              atividadeCatalogoId: atividade.id,
              comprimento: 10,
              unidade: "M",
              maoDeObra: [{ funcaoId: funcao.id, quantidade: 2 }],
            },
          ],
        },
      ],
    };

    const primeira = await app.inject({ method: "PATCH", url: "/rdos/campo/token-refazer", payload });
    const segunda = await app.inject({ method: "PATCH", url: "/rdos/campo/token-refazer", payload });

    expect(primeira.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(200);
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

  it("sugere o horímetro final do RDO anterior da mesma equipe como ultimosHorimetros", async () => {
    const { frente, equipe, equipamento } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-20"),
        linkCampoToken: "token-dia-1",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
        equipamentos: { create: [{ equipamentoCatalogoId: equipamento.id, quantidade: 1, horimetroFinal: 1234.5 }] },
      },
    });
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-dia-2",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/campo/token-dia-2" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ultimosHorimetros: Record<string, number> };
    expect(body.ultimosHorimetros[equipamento.id]).toBe(1234.5);
  });

  it("não sugere o horímetro do próprio RDO em edição, só de RDOs de dias anteriores", async () => {
    const { frente, equipe, equipamento } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-mesmo-dia",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
        equipamentos: { create: [{ equipamentoCatalogoId: equipamento.id, quantidade: 1, horimetroFinal: 999 }] },
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/campo/token-mesmo-dia" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ultimosHorimetros: Record<string, number> };
    expect(body.ultimosHorimetros[equipamento.id]).toBeUndefined();
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
              {
                atividadeCatalogoId: atividade.id,
                largura: 12,
                comprimento: 264,
                unidade: "M2",
                kmInicial: 767.52,
                kmFinal: 770.48,
                horasTrabalhadas: 6,
                maoObraDireta: 4,
              },
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
      locais: Array<{
        atividades: Array<{
          totalCalculado: string;
          kmInicial: string;
          kmFinal: string;
          horasTrabalhadas: string;
          maoObraDireta: number;
        }>;
      }>;
      maoDeObra: unknown[];
      equipamentos: unknown[];
    };
    expect(body.blocosHorario).toHaveLength(1);
    expect(body.locais).toHaveLength(1);
    const salva = body.locais[0]?.atividades[0];
    expect(Number(salva?.totalCalculado)).toBe(3168);
    expect(Number(salva?.kmInicial)).toBe(767.52);
    expect(Number(salva?.kmFinal)).toBe(770.48);
    expect(Number(salva?.horasTrabalhadas)).toBe(6);
    expect(salva?.maoObraDireta).toBe(4);
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

  it("reabre um RDO reprovado para correção (REPROVADO -> EM_CORRECAO) ao salvar de novo", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        status: "REPROVADO",
        linkCampoToken: "token-corrigir",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/rdos/campo/token-corrigir",
      payload: {
        locais: [
          { descricao: "Trecho corrigido", ordem: 0, atividades: [{ atividadeCatalogoId: atividade.id, comprimento: 10, unidade: "M" }] },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const atualizado = await prisma.rdo.findUniqueOrThrow({ where: { id: rdo.id } });
    expect(atualizado.status).toBe("EM_CORRECAO");

    const historico = await prisma.rdoHistorico.findMany({ where: { rdoId: rdo.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.deStatus).toBe("REPROVADO");
    expect(historico[0]?.paraStatus).toBe("EM_CORRECAO");
  });
});

const BOUNDARY = "----golias-test-boundary";
// PNG 1x1 válido de verdade (não só o cabeçalho) — o PDF da assinatura é
// realmente desenhado com pdfkit (doc.image), que decodifica o PNG e falha
// se o arquivo não tiver os chunks IHDR/IDAT/IEND completos.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function multipartAssinatura(content: Buffer = PNG_BYTES): { headers: Record<string, string>; payload: Buffer } {
  const preamble = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="assinatura"; filename="assinatura.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return {
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: Buffer.concat([preamble, content, epilogue]),
  };
}

describe("POST /rdos/campo/:token/enviar", () => {
  async function criarRdoComAtividade(token: string) {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: token,
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.rdoLocal.create({
      data: {
        rdoId: rdo.id,
        descricao: "Trecho A",
        ordem: 0,
        atividades: { create: [{ atividadeCatalogoId: atividade.id, comprimento: 10, unidade: "M", totalCalculado: 10 }] },
      },
    });
    return rdo;
  }

  it("finaliza o RDO, salva a assinatura e muda o status para aguardando validação do escritório", async () => {
    const rdo = await criarRdoComAtividade("token-enviar");

    const app = buildApp();
    const { headers, payload } = multipartAssinatura();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-enviar/enviar",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    // Não vai direto pro fiscal — passa pelo escritório primeiro (ver
    // POST /rdos/:id/enviar-fiscal).
    expect(body.status).toBe("AGUARDANDO_VALIDACAO_ESCRITORIO");

    const atualizado = await prisma.rdo.findUniqueOrThrow({ where: { id: rdo.id } });
    expect(atualizado.assinaturaEncarregadoPath).toBeTruthy();
    expect(atualizado.enviadoParaFiscalEm).toBeTruthy();
    expect(atualizado.pdfHash).toHaveLength(64);

    const historico = await prisma.rdoHistorico.findMany({ where: { rdoId: rdo.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.paraStatus).toBe("AGUARDANDO_VALIDACAO_ESCRITORIO");
  });

  it("retorna 400 quando não há nenhum local com atividade", async () => {
    const { frente, equipe } = await criarCenario();
    await prisma.rdo.create({
      data: {
        frenteId: frente.id,
        equipeId: equipe.id,
        data: new Date("2026-07-21"),
        linkCampoToken: "token-enviar-vazio",
        linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
      },
    });

    const app = buildApp();
    const { headers, payload } = multipartAssinatura();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-enviar-vazio/enviar",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 quando a assinatura não é enviada", async () => {
    await criarRdoComAtividade("token-enviar-sem-assinatura");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-enviar-sem-assinatura/enviar",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: Buffer.from(`--${BOUNDARY}--\r\n`),
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 409 quando o RDO já foi enviado para aprovação", async () => {
    const rdo = await criarRdoComAtividade("token-enviar-duplicado");
    await prisma.rdo.update({ where: { id: rdo.id }, data: { status: "AGUARDANDO_APROVACAO" } });

    const app = buildApp();
    const { headers, payload } = multipartAssinatura();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-enviar-duplicado/enviar",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 404 para token inexistente", async () => {
    const app = buildApp();
    const { headers, payload } = multipartAssinatura();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/nao-existe/enviar",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /rdos/:id (edição pelo escritório)", () => {
  it("permite o escritório corrigir o conteúdo de um RDO aguardando validação", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-08-06"), status: "AGUARDANDO_VALIDACAO_ESCRITORIO" },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/rdos/${rdo.id}`,
      payload: {
        locais: [
          {
            descricao: "Km 10 ao 12",
            ordem: 0,
            atividades: [{ atividadeCatalogoId: atividade.id, largura: 2, comprimento: 100, unidade: "M2" }],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; locais: Array<{ descricao: string }> };
    // Edição do escritório não muda o status por si só — só o conteúdo.
    expect(body.status).toBe("AGUARDANDO_VALIDACAO_ESCRITORIO");
    expect(body.locais[0]?.descricao).toBe("Km 10 ao 12");
  });

  it("retorna 409 ao tentar editar um RDO que já foi para o fiscal", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-08-06"), status: "AGUARDANDO_APROVACAO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "PATCH", url: `/rdos/${rdo.id}`, payload: { locais: [] } });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 404 para RDO inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "PATCH", url: "/rdos/nao-existe", payload: { locais: [] } });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /rdos/:id/enviar-fiscal", () => {
  async function criarRdoAguardandoValidacao() {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-08-06"), status: "AGUARDANDO_VALIDACAO_ESCRITORIO" },
    });
    await prisma.rdoLocal.create({
      data: {
        rdoId: rdo.id,
        descricao: "Trecho A",
        ordem: 0,
        atividades: { create: [{ atividadeCatalogoId: atividade.id, comprimento: 10, unidade: "M", totalCalculado: 10 }] },
      },
    });
    return rdo;
  }

  it("manda o RDO pro fiscal — muda o status pra aguardando aprovação", async () => {
    const rdo = await criarRdoAguardandoValidacao();

    const app = buildApp();
    const response = await app.inject({ method: "POST", url: `/rdos/${rdo.id}/enviar-fiscal` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("AGUARDANDO_APROVACAO");

    const historico = await prisma.rdoHistorico.findMany({ where: { rdoId: rdo.id } });
    expect(historico.map((h) => h.paraStatus)).toContain("AGUARDANDO_APROVACAO");
  });

  it("não aparece no portal do fiscal antes de ser enviado, e aparece depois", async () => {
    const rdo = await criarRdoAguardandoValidacao();
    const frente = await prisma.frente.update({
      where: { id: rdo.frenteId },
      data: { portalFiscalToken: "token-portal-validacao" },
    });

    const app = buildApp();
    const antes = await app.inject({ method: "GET", url: "/portal-fiscal/token-portal-validacao" });
    const corpoAntes = antes.json() as { pendentes: Array<{ id: string }> };
    expect(corpoAntes.pendentes.find((p) => p.id === rdo.id)).toBeUndefined();

    await app.inject({ method: "POST", url: `/rdos/${rdo.id}/enviar-fiscal` });

    const depois = await app.inject({ method: "GET", url: "/portal-fiscal/token-portal-validacao" });
    const corpoDepois = depois.json() as { pendentes: Array<{ id: string }> };
    expect(corpoDepois.pendentes.find((p) => p.id === rdo.id)).toBeTruthy();
    void frente;
  });

  it("retorna 409 se o RDO não está aguardando validação do escritório", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-08-06"), status: "RASCUNHO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "POST", url: `/rdos/${rdo.id}/enviar-fiscal` });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 400 quando não há nenhum local com atividade", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-08-06"), status: "AGUARDANDO_VALIDACAO_ESCRITORIO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "POST", url: `/rdos/${rdo.id}/enviar-fiscal` });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /rdos/farol-status", () => {
  it("monta a grade equipe x dia com o status de cada RDO no ciclo de medição (dia 19 do mês anterior ao dia 20 do mês selecionado)", async () => {
    const { frente, equipe } = await criarCenario();
    await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-15"), status: "APROVADO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/farol-status?periodo=2026-07" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      periodo: string;
      dias: string[];
      linhas: Array<{ equipeId: string; porDia: Record<string, string | null> }>;
    };
    expect(body.periodo).toBe("2026-07");
    // Ciclo: 19/06 a 20/07 — 12 dias em junho (19..30) + 20 dias em julho (1..20) = 32.
    expect(body.dias).toHaveLength(32);
    expect(body.dias[0]).toBe("2026-06-19");
    expect(body.dias[body.dias.length - 1]).toBe("2026-07-20");
    const linha = body.linhas.find((l) => l.equipeId === equipe.id);
    expect(linha?.porDia["2026-07-15"]).toBe("APROVADO");
    expect(linha?.porDia["2026-07-14"]).toBeNull();
  });

  it("não inclui RDOs fora do ciclo de medição (ex.: dia 21, que já entra no ciclo do mês seguinte)", async () => {
    const { frente, equipe } = await criarCenario();
    await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21"), status: "APROVADO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/farol-status?periodo=2026-07" });

    const body = response.json() as { itens: Array<{ data: string }> };
    expect(body.itens.find((i) => i.data === "2026-07-21")).toBeUndefined();
  });

  it("retorna uma lista plana (itens) com um RDO por linha, para agrupar por status", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-15"), status: "EM_CORRECAO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/rdos/farol-status?periodo=2026-07" });

    const body = response.json() as {
      itens: Array<{ id: string; data: string; status: string; equipe: string; distrito: string }>;
    };
    const item = body.itens.find((i) => i.id === rdo.id);
    expect(item).toMatchObject({ data: "2026-07-15", status: "EM_CORRECAO", equipe: equipe.nome, distrito: "Marabá Centro" });
  });
});

describe("POST /rdos/:id/pdf e GET /rdos/:id/verificar", () => {
  it("gera o PDF, grava o hash de autenticidade, e a verificação confirma", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21") },
    });

    const app = buildApp();
    const gerar = await app.inject({ method: "POST", url: `/rdos/${rdo.id}/pdf` });
    expect(gerar.statusCode).toBe(200);
    const gerado = gerar.json() as { pdfPath: string; pdfHash: string };
    expect(gerado.pdfPath).toBeTruthy();
    expect(gerado.pdfHash).toHaveLength(64);

    const baixar = await app.inject({ method: "GET", url: `/rdos/${rdo.id}/pdf` });
    expect(baixar.statusCode).toBe(200);
    expect(baixar.headers["content-type"]).toBe("application/pdf");

    const verOk = await app.inject({ method: "GET", url: `/rdos/${rdo.id}/verificar?h=${gerado.pdfHash}` });
    expect(verOk.statusCode).toBe(200);
    const okBody = verOk.json() as { autentico: boolean; motivo: string };
    expect(okBody.autentico).toBe(true);
    expect(okBody.motivo).toBe("OK");

    const verErrado = await app.inject({ method: "GET", url: `/rdos/${rdo.id}/verificar?h=hash-invalido` });
    const erradoBody = verErrado.json() as { autentico: boolean; motivo: string };
    expect(erradoBody.autentico).toBe(false);
    expect(erradoBody.motivo).toBe("HASH_DESATUALIZADO");
  });

  it("verificar informa PDF_NAO_GERADO antes de qualquer geração", async () => {
    const { frente, equipe } = await criarCenario();
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-21") },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/rdos/${rdo.id}/verificar` });
    expect((response.json() as { motivo: string }).motivo).toBe("PDF_NAO_GERADO");
  });

  it("retorna 404 para RDO inexistente, tanto ao gerar quanto ao verificar", async () => {
    const app = buildApp();
    const gerar = await app.inject({ method: "POST", url: "/rdos/nao-existe/pdf" });
    expect(gerar.statusCode).toBe(404);

    const verificar = await app.inject({ method: "GET", url: "/rdos/nao-existe/verificar" });
    expect(verificar.statusCode).toBe(404);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

const BOUNDARY = "----golias-test-boundary";

function multipartBody(filename: string, contentType: string, content: Buffer): Buffer {
  const preamble = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return Buffer.concat([preamble, content, epilogue]);
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function montarCenario() {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  const om = await prisma.ordemManutencao.create({
    data: { numero: "202600000001", frenteId: frente.id, dataEmissao: new Date("2026-07-21") },
  });
  const rdo = await prisma.rdo.create({
    data: {
      frenteId: frente.id,
      equipeId: equipe.id,
      data: new Date("2026-07-21"),
      linkCampoToken: "token-relfoto",
      linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
    },
  });
  const atividadeCatalogo = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.1.2", descricao: "Limpeza de bueiros", unidade: "M2" },
  });
  return { om, rdo, frenteId: frente.id, equipeId: equipe.id, atividadeCatalogo };
}

/** Um segundo dia trabalhado na MESMA OM — pra testar que cada dia ganha seu próprio relatório. */
async function criarSegundoDia(frenteId: string, equipeId: string, token: string) {
  return prisma.rdo.create({
    data: {
      frenteId,
      equipeId,
      data: new Date("2026-07-22"),
      linkCampoToken: token,
      linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
    },
  });
}

/**
 * Uma foto só pode ser vinculada a uma OM que já tem alguma atividade
 * lançada nesse RDO (é assim que o formulário de campo monta a lista de OMs
 * disponíveis pra foto — ver omsUsadasNoRdo em Campo.tsx) — por isso todo
 * teste que sobe foto ligada à OM precisa disso antes, senão o dia nunca
 * aparece na lista de "/relatorios-fotograficos" (que é baseada em
 * RdoAtividade, não em RdoAnexo).
 */
async function lancarAtividadeNaOm(
  rdoId: string,
  omId: string,
  atividadeCatalogoId: string,
  opcoes: { statusOm?: "EM_ANDAMENTO" | "CONCLUIDA" | null; percentualConcluido?: number | null } = {},
) {
  const local = await prisma.rdoLocal.create({ data: { rdoId, descricao: "Trecho", ordem: 0 } });
  return prisma.rdoAtividade.create({
    data: {
      rdoLocalId: local.id,
      atividadeCatalogoId,
      ordemManutencaoId: omId,
      statusOm: opcoes.statusOm ?? null,
      percentualConcluido: opcoes.percentualConcluido ?? null,
      unidade: "M2",
      totalCalculado: 5,
    },
  });
}

async function enviarFotoParaOm(
  app: ReturnType<typeof buildApp>,
  token: string,
  omId: string,
  legenda?: string,
  atividadeCatalogoId?: string,
) {
  const query =
    (legenda ? `&descricao=${encodeURIComponent(legenda)}` : "") +
    (atividadeCatalogoId ? `&atividadeCatalogoId=${atividadeCatalogoId}` : "");
  const response = await app.inject({
    method: "POST",
    url: `/rdos/campo/${token}/anexos?tipo=FOTO&ordemManutencaoId=${omId}${query}`,
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipartBody("foto.jpg", "image/jpeg", JPEG_BYTES),
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; ordemManutencaoId: string | null; atividadeCatalogoId: string | null };
}

interface FotoOrdenada {
  id: string;
  ordem: number;
  legenda: string | null;
  atividadeCatalogoId: string | null;
}

interface ItemDia {
  relatorioId: string;
  rdoId: string;
  data: string;
  totalFotos: number;
  statusOm: string | null;
  percentualConcluido: number | null;
  pdfDisponivel: boolean;
}

/** Lista os dias trabalhados na OM (cria o relatório de cada dia na hora, se ainda não existir). */
async function listarDias(app: ReturnType<typeof buildApp>, omId: string) {
  const response = await app.inject({ method: "GET", url: `/ordens-manutencao/${omId}/relatorios-fotograficos` });
  expect(response.statusCode).toBe(200);
  return response.json() as { omNumero: string; itens: ItemDia[] };
}

/** Acha (criando se preciso) o relatorioId do dia de um RDO específico. */
async function relatorioDoRdo(app: ReturnType<typeof buildApp>, omId: string, rdoId: string): Promise<string> {
  const lista = await listarDias(app, omId);
  const item = lista.itens.find((i) => i.rdoId === rdoId);
  if (!item) throw new Error("dia não encontrado na lista");
  return item.relatorioId;
}

async function buscarRelatorio(app: ReturnType<typeof buildApp>, omId: string, relatorioId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/ordens-manutencao/${omId}/relatorios-fotograficos/${relatorioId}`,
  });
  return response.json() as {
    fotos: FotoOrdenada[];
    statusOm: string | null;
    percentualConcluido: number | null;
    atividadesDoDia: { id: string; codigo: string; descricao: string }[];
  };
}

describe("POST /rdos/campo/:token/anexos com ordemManutencaoId", () => {
  it("liga a foto à OM informada", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    const anexo = await enviarFotoParaOm(app, "token-relfoto", om.id);
    expect(anexo.ordemManutencaoId).toBe(om.id);
    void rdo;
  });

  it("retorna 400 quando a OM informada não existe", async () => {
    await montarCenario();
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-relfoto/anexos?tipo=FOTO&ordemManutencaoId=nao-existe",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("foto.jpg", "image/jpeg", JPEG_BYTES),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /ordens-manutencao/:id/relatorios-fotograficos (lista por dia)", () => {
  it("cria um item por dia trabalhado, pré-populado com as fotos daquele dia", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id);

    const lista = await listarDias(app, om.id);
    expect(lista.itens).toHaveLength(1);
    expect(lista.itens[0]!.totalFotos).toBe(2);
  });

  it("um dia trabalhado sem nenhuma atividade lançada não aparece na lista", async () => {
    const { om } = await montarCenario();
    const app = buildApp();
    const lista = await listarDias(app, om.id);
    expect(lista.itens).toHaveLength(0);
  });

  it("dois dias trabalhados na mesma OM viram dois relatórios separados", async () => {
    const { om, rdo, frenteId, equipeId, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "EM_ANDAMENTO", percentualConcluido: 40 });

    const segundoDia = await criarSegundoDia(frenteId, equipeId, "token-relfoto-2");
    await lancarAtividadeNaOm(segundoDia.id, om.id, atividadeCatalogo.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });

    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await enviarFotoParaOm(app, "token-relfoto-2", om.id);

    const lista = await listarDias(app, om.id);
    expect(lista.itens).toHaveLength(2);
    const dia1 = lista.itens.find((i) => i.rdoId === rdo.id);
    const dia2 = lista.itens.find((i) => i.rdoId === segundoDia.id);
    expect(dia1?.statusOm).toBe("EM_ANDAMENTO");
    expect(dia1?.percentualConcluido).toBe(40);
    expect(dia1?.totalFotos).toBe(1);
    expect(dia2?.statusOm).toBe("CONCLUIDA");
    expect(dia2?.percentualConcluido).toBe(100);
    expect(dia2?.totalFotos).toBe(1);
  });

  it("retorna 404 pra OM inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao/nao-existe/relatorios-fotograficos" });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET/PATCH /ordens-manutencao/:id/relatorios-fotograficos/:relatorioId", () => {
  it("carrega o relatório do dia com os dados da OM e do RDO", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const response = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { fotos: unknown[]; rdoId: string; omNumero: string };
    expect(body.fotos).toHaveLength(1);
    expect(body.rdoId).toBe(rdo.id);
    expect(body.omNumero).toBe(om.numero);
  });

  it("salva data de conclusão, comentário e o checklist", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}`,
      payload: { dataConclusao: "2026-07-22", comentarios: "Tudo certo", atividadesExecutadas: false },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { comentarios: string; atividadesExecutadas: boolean; dataConclusao: string };
    expect(body.comentarios).toBe("Tudo certo");
    expect(body.atividadesExecutadas).toBe(false);
    expect(body.dataConclusao.slice(0, 10)).toBe("2026-07-22");
  });

  it("retorna 404 pra relatorioId de outra OM", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const outraOm = await prisma.ordemManutencao.create({
      data: { numero: "202600000002", frenteId: om.frenteId, dataEmissao: new Date("2026-07-21") },
    });
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const response = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${outraOm.id}/relatorios-fotograficos/${relatorioId}`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("Fotos do Relatório Fotográfico", () => {
  it("remover uma foto e sincronizar de novo não a ressuscita", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const inicial = await buscarRelatorio(app, om.id, relatorioId);
    expect(inicial.fotos).toHaveLength(1);

    const del = await app.inject({
      method: "DELETE",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/fotos/${inicial.fotos[0]!.id}`,
    });
    expect(del.statusCode).toBe(204);

    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/sincronizar-fotos`,
    });
    const syncBody = sync.json() as { fotosAdicionadas: number; fotos: unknown[] };
    expect(syncBody.fotosAdicionadas).toBe(0);
    expect(syncBody.fotos).toHaveLength(0);
  });

  it("sincronizar traz fotos novas lançadas depois, no mesmo dia", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/sincronizar-fotos`,
    });
    const syncBody = sync.json() as { fotosAdicionadas: number; fotos: unknown[] };
    expect(syncBody.fotosAdicionadas).toBe(1);
    expect(syncBody.fotos).toHaveLength(2);
  });

  it("anexa uma foto extra direto no relatório, sem vir de um RDO", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const response = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/fotos`,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("extra.jpg", "image/jpeg", JPEG_BYTES),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { fotos: { rdoAnexoId: string | null }[] };
    expect(body.fotos).toHaveLength(2);
    expect(body.fotos.some((f) => f.rdoAnexoId === null)).toBe(true);
  });

  it("salva a legenda de uma foto", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const relatorio = await buscarRelatorio(app, om.id, relatorioId);

    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/fotos/${relatorio.fotos[0]!.id}`,
      payload: { legenda: "Antes" },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { legenda: string }).legenda).toBe("Antes");
  });

  it("baixa o arquivo de uma foto do relatório", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const relatorio = await buscarRelatorio(app, om.id, relatorioId);

    const response = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/fotos/${relatorio.fotos[0]!.id}/arquivo`,
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("PDF do Relatório Fotográfico", () => {
  it("gera e baixa o PDF quando o dia não fechou a OM", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "EM_ANDAMENTO", percentualConcluido: 40 });
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const gerar = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(gerar.statusCode).toBe(200);
    expect((gerar.json() as { pdfDisponivel: boolean }).pdfDisponivel).toBe(true);

    const baixar = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(baixar.statusCode).toBe(200);
    expect(baixar.headers["content-type"]).toBe("application/pdf");
  });

  it("retorna 404 antes de qualquer geração", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const response = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("bloqueia gerar o PDF do dia que fechou a OM com menos de 2 pares de fotos", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    const app = buildApp();
    // só 1 par completo (Antes/Depois) — precisa de 2.
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const gerar = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(gerar.statusCode).toBe(400);
  });

  it("permite gerar o PDF do dia que fechou a OM com 2 pares completos de fotos", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);

    const gerar = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(gerar.statusCode).toBe(200);
  });
});

describe("Pareamento Antes/Depois no Relatório Fotográfico", () => {
  it("pareia a N-ésima foto Antes com a N-ésima Depois, mesmo chegando fora de ordem", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    // Antes, Antes, Depois (fora de ordem — duas "Antes" seguidas antes de qualquer "Depois").
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");

    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const relatorio = await buscarRelatorio(app, om.id, relatorioId);
    const ordenadas = [...relatorio.fotos].sort((a, b) => a.ordem - b.ordem);
    expect(ordenadas.map((f) => [f.ordem, f.legenda])).toEqual([
      [0, "Antes"], // par 0: Antes
      [1, "Depois"], // par 0: Depois (a 1ª Depois pareia com a 1ª Antes)
      [2, "Antes"], // par 1: só Antes (não tem 2ª Depois pra parear)
    ]);
  });

  it("sincronizar-fotos empareia só as fotos novas, sem mexer no que já tava no relatório", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id);
    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");
    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id); // cria o relatório, par 0 = ordem 0/1

    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes");
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois");
    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/sincronizar-fotos`,
    });
    const body = sync.json() as { fotos: FotoOrdenada[] };
    const ordenadas = [...body.fotos].sort((a, b) => a.ordem - b.ordem);
    expect(ordenadas.map((f) => [f.ordem, f.legenda])).toEqual([
      [0, "Antes"],
      [1, "Depois"],
      [2, "Antes"], // novo par começa em 2, não colide com o par 0 existente
      [3, "Depois"],
    ]);
  });
});

describe("Fotos agrupadas por atividade dentro da OM", () => {
  it("pareia Antes/Depois dentro do grupo de cada atividade, sem misturar com o de outra", async () => {
    const { om, rdo, atividadeCatalogo: atividadeA } = await montarCenario();
    const atividadeB = await prisma.atividadeCatalogo.create({
      data: { codigo: "3.4.1", descricao: "Roçagem", unidade: "M2" },
    });
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeA.id);
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeB.id);
    const app = buildApp();

    // Fora de ordem de propósito: A-Antes, B-Antes, A-Depois, B-Depois.
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeA.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeB.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeA.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeB.id);

    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const relatorio = await buscarRelatorio(app, om.id, relatorioId);
    expect(relatorio.fotos).toHaveLength(4);

    const codigosDoDia = relatorio.atividadesDoDia.map((a) => a.codigo).sort();
    expect(codigosDoDia).toEqual(["2.1.2", "3.4.1"]);

    for (const atividadeId of [atividadeA.id, atividadeB.id]) {
      const doGrupo = relatorio.fotos.filter((f) => f.atividadeCatalogoId === atividadeId).sort((a, b) => a.ordem - b.ordem);
      expect(doGrupo).toHaveLength(2);
      expect(doGrupo[0]!.legenda).toBe("Antes");
      expect(doGrupo[1]!.legenda).toBe("Depois");
      expect(doGrupo[1]!.ordem).toBe(doGrupo[0]!.ordem + 1); // par completo, ordens adjacentes dentro do grupo
    }
  });

  it("bloqueia fechar a OM se alguma atividade (das várias lançadas nesse dia) não tem 2 pares completos", async () => {
    const { om, rdo, atividadeCatalogo: atividadeA } = await montarCenario();
    const atividadeB = await prisma.atividadeCatalogo.create({
      data: { codigo: "3.4.1", descricao: "Roçagem", unidade: "M2" },
    });
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeA.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeB.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    const app = buildApp();

    // Atividade A com 2 pares completos.
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeA.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeA.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeA.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeA.id);
    // Atividade B com só 1 foto "Antes" — nenhum par completo.
    await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeB.id);

    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const gerar = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(gerar.statusCode).toBe(400);
    expect((gerar.json() as { error: string }).error).toContain("3.4.1");
  });

  it("permite fechar a OM quando cada atividade lançada nesse dia tem seus 2 pares completos", async () => {
    const { om, rdo, atividadeCatalogo: atividadeA } = await montarCenario();
    const atividadeB = await prisma.atividadeCatalogo.create({
      data: { codigo: "3.4.1", descricao: "Roçagem", unidade: "M2" },
    });
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeA.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeB.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });
    const app = buildApp();

    for (const atividadeId of [atividadeA.id, atividadeB.id]) {
      await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeId);
      await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeId);
      await enviarFotoParaOm(app, "token-relfoto", om.id, "Antes", atividadeId);
      await enviarFotoParaOm(app, "token-relfoto", om.id, "Depois", atividadeId);
    }

    const relatorioId = await relatorioDoRdo(app, om.id, rdo.id);
    const gerar = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorios-fotograficos/${relatorioId}/pdf`,
    });
    expect(gerar.statusCode).toBe(200);
  });
});

describe("GET /ordens-manutencao — precisaRelatorioFotografico", () => {
  it("marca a OM quando há atividade CONCLUIDA e nenhum dia tem relatório com pelo menos 2 pares de fotos", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });
    const ordens = response.json() as { id: string; precisaRelatorioFotografico: boolean; foiLancada: boolean }[];
    const encontrada = ordens.find((o) => o.id === om.id);
    expect(encontrada?.precisaRelatorioFotografico).toBe(true);
    expect(encontrada?.foiLancada).toBe(true);
  });

  it("deixa de marcar quando algum dia já tem pelo menos 2 pares de fotos (4 fotos)", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "CONCLUIDA", percentualConcluido: 100 });

    const app = buildApp();
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await enviarFotoParaOm(app, "token-relfoto", om.id);
    await relatorioDoRdo(app, om.id, rdo.id); // materializa o relatório do dia com as fotos

    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });
    const ordens = response.json() as { id: string; precisaRelatorioFotografico: boolean }[];
    const encontrada = ordens.find((o) => o.id === om.id);
    expect(encontrada?.precisaRelatorioFotografico).toBe(false);
  });

  it("foiLancada é false pra OM que nunca teve nenhuma atividade lançada", async () => {
    const { om } = await montarCenario();
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });
    const ordens = response.json() as { id: string; foiLancada: boolean }[];
    const encontrada = ordens.find((o) => o.id === om.id);
    expect(encontrada?.foiLancada).toBe(false);
  });

  it("foiLancada é true mesmo só EM_ANDAMENTO — uma OM pode levar vários lançamentos até ser finalizada", async () => {
    const { om, rdo, atividadeCatalogo } = await montarCenario();
    await lancarAtividadeNaOm(rdo.id, om.id, atividadeCatalogo.id, { statusOm: "EM_ANDAMENTO", percentualConcluido: 40 });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });
    const ordens = response.json() as { id: string; foiLancada: boolean; precisaRelatorioFotografico: boolean }[];
    const encontrada = ordens.find((o) => o.id === om.id);
    expect(encontrada?.foiLancada).toBe(true);
    // Em andamento (não concluída) ainda não pede relatório fotográfico.
    expect(encontrada?.precisaRelatorioFotografico).toBe(false);
  });
});

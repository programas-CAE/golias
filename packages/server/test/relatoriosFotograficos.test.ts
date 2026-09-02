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
  return { om, rdo };
}

async function enviarFotoParaOm(app: ReturnType<typeof buildApp>, rdoId: string, omId: string, legenda?: string) {
  const query = legenda ? `&descricao=${encodeURIComponent(legenda)}` : "";
  const response = await app.inject({
    method: "POST",
    url: `/rdos/campo/token-relfoto/anexos?tipo=FOTO&ordemManutencaoId=${omId}${query}`,
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipartBody("foto.jpg", "image/jpeg", JPEG_BYTES),
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; ordemManutencaoId: string | null };
}

async function enviarFotoExtra(app: ReturnType<typeof buildApp>, omId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/ordens-manutencao/${omId}/relatorio-fotografico/fotos`,
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipartBody("extra.jpg", "image/jpeg", JPEG_BYTES),
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { fotos: FotoOrdenada[] };
}

interface FotoOrdenada {
  id: string;
  ordem: number;
  legenda: string | null;
}

async function buscarRelatorio(app: ReturnType<typeof buildApp>, omId: string) {
  const response = await app.inject({ method: "GET", url: `/ordens-manutencao/${omId}/relatorio-fotografico` });
  return response.json() as { fotos: FotoOrdenada[] };
}

describe("POST /rdos/campo/:token/anexos com ordemManutencaoId", () => {
  it("liga a foto à OM informada", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    const anexo = await enviarFotoParaOm(app, rdo.id, om.id);
    expect(anexo.ordemManutencaoId).toBe(om.id);
  });

  it("retorna 400 quando a OM informada não existe", async () => {
    const { rdo } = await montarCenario();
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-relfoto/anexos?tipo=FOTO&ordemManutencaoId=nao-existe",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("foto.jpg", "image/jpeg", JPEG_BYTES),
    });
    expect(response.statusCode).toBe(400);
    void rdo;
  });
});

describe("GET/DELETE /rdos/:id/anexos/:anexoId", () => {
  it("baixa o arquivo do anexo", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    const anexo = await enviarFotoParaOm(app, rdo.id, om.id);

    const response = await app.inject({ method: "GET", url: `/rdos/${rdo.id}/anexos/${anexo.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/jpeg");
  });

  it("apaga o anexo", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    const anexo = await enviarFotoParaOm(app, rdo.id, om.id);

    const del = await app.inject({ method: "DELETE", url: `/rdos/${rdo.id}/anexos/${anexo.id}` });
    expect(del.statusCode).toBe(204);

    const existe = await prisma.rdoAnexo.findUnique({ where: { id: anexo.id } });
    expect(existe).toBeNull();
  });

  it("retorna 404 pra anexo de outro RDO", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    const anexo = await enviarFotoParaOm(app, rdo.id, om.id);

    const response = await app.inject({ method: "GET", url: `/rdos/outro-rdo/anexos/${anexo.id}` });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /ordens-manutencao/:id/relatorio-fotografico", () => {
  it("cria e pré-popula o relatório com as fotos já lançadas pra essa OM", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);
    await enviarFotoParaOm(app, rdo.id, om.id);

    const response = await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { fotos: unknown[]; atividadesExecutadas: boolean };
    expect(body.fotos).toHaveLength(2);
    expect(body.atividadesExecutadas).toBe(true);
  });

  it("não inclui foto de outra OM nem anexo que não é foto", async () => {
    const { om, rdo } = await montarCenario();
    const outraOm = await prisma.ordemManutencao.create({
      data: { numero: "202600000002", frenteId: om.frenteId, dataEmissao: new Date("2026-07-21") },
    });
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);
    await enviarFotoParaOm(app, rdo.id, outraOm.id);

    const response = await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` });
    const body = response.json() as { fotos: unknown[] };
    expect(body.fotos).toHaveLength(1);
  });

  it("retorna 404 pra OM inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao/nao-existe/relatorio-fotografico" });
    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /ordens-manutencao/:id/relatorio-fotografico", () => {
  it("salva data de conclusão, comentário e o checklist", async () => {
    const { om } = await montarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico`,
      payload: { dataConclusao: "2026-07-22", comentarios: "Tudo certo", atividadesExecutadas: false },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { comentarios: string; atividadesExecutadas: boolean; dataConclusao: string };
    expect(body.comentarios).toBe("Tudo certo");
    expect(body.atividadesExecutadas).toBe(false);
    expect(body.dataConclusao.slice(0, 10)).toBe("2026-07-22");
  });
});

describe("Fotos do Relatório Fotográfico", () => {
  it("remover uma foto e sincronizar de novo não a ressuscita", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);

    const inicial = (
      await (await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` })).json()
    ) as { fotos: { id: string }[] };
    expect(inicial.fotos).toHaveLength(1);

    const del = await app.inject({
      method: "DELETE",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/fotos/${inicial.fotos[0]!.id}`,
    });
    expect(del.statusCode).toBe(204);

    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/sincronizar-fotos`,
    });
    const syncBody = sync.json() as { fotosAdicionadas: number; fotos: unknown[] };
    expect(syncBody.fotosAdicionadas).toBe(0);
    expect(syncBody.fotos).toHaveLength(0);
  });

  it("sincronizar traz fotos novas lançadas depois", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);
    await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` });

    await enviarFotoParaOm(app, rdo.id, om.id);
    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/sincronizar-fotos`,
    });
    const syncBody = sync.json() as { fotosAdicionadas: number; fotos: unknown[] };
    expect(syncBody.fotosAdicionadas).toBe(1);
    expect(syncBody.fotos).toHaveLength(2);
  });

  it("anexa uma foto extra direto no relatório, sem vir de um RDO", async () => {
    const { om } = await montarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/fotos`,
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("extra.jpg", "image/jpeg", JPEG_BYTES),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { fotos: { rdoAnexoId: string | null }[] };
    expect(body.fotos).toHaveLength(1);
    expect(body.fotos[0]!.rdoAnexoId).toBeNull();
  });

  it("salva a legenda de uma foto", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);
    const relatorio = (
      await (await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` })).json()
    ) as { fotos: { id: string }[] };

    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/fotos/${relatorio.fotos[0]!.id}`,
      payload: { legenda: "Antes" },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { legenda: string }).legenda).toBe("Antes");
  });

  it("baixa o arquivo de uma foto do relatório", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);
    const relatorio = (
      await (await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico` })).json()
    ) as { fotos: { id: string }[] };

    const response = await app.inject({
      method: "GET",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/fotos/${relatorio.fotos[0]!.id}/arquivo`,
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("PDF do Relatório Fotográfico", () => {
  it("gera e baixa o PDF", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id);

    const gerar = await app.inject({ method: "POST", url: `/ordens-manutencao/${om.id}/relatorio-fotografico/pdf` });
    expect(gerar.statusCode).toBe(200);
    expect((gerar.json() as { pdfDisponivel: boolean }).pdfDisponivel).toBe(true);

    const baixar = await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico/pdf` });
    expect(baixar.statusCode).toBe(200);
    expect(baixar.headers["content-type"]).toBe("application/pdf");
  });

  it("retorna 404 antes de qualquer geração", async () => {
    const { om } = await montarCenario();
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/ordens-manutencao/${om.id}/relatorio-fotografico/pdf` });
    expect(response.statusCode).toBe(404);
  });
});

describe("Pareamento Antes/Depois no Relatório Fotográfico", () => {
  it("pareia a N-ésima foto Antes com a N-ésima Depois, mesmo chegando fora de ordem", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    // Antes, Antes, Depois (fora de ordem — duas "Antes" seguidas antes de qualquer "Depois").
    await enviarFotoParaOm(app, rdo.id, om.id, "Antes");
    await enviarFotoParaOm(app, rdo.id, om.id, "Antes");
    await enviarFotoParaOm(app, rdo.id, om.id, "Depois");

    const relatorio = await buscarRelatorio(app, om.id);
    const ordenadas = [...relatorio.fotos].sort((a, b) => a.ordem - b.ordem);
    expect(ordenadas.map((f) => [f.ordem, f.legenda])).toEqual([
      [0, "Antes"], // par 0: Antes
      [1, "Depois"], // par 0: Depois (a 1ª Depois pareia com a 1ª Antes)
      [2, "Antes"], // par 1: só Antes (não tem 2ª Depois pra parear)
    ]);
  });

  it("sincronizar-fotos empareia só as fotos novas, sem mexer no que já tava no relatório", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    await enviarFotoParaOm(app, rdo.id, om.id, "Antes");
    await enviarFotoParaOm(app, rdo.id, om.id, "Depois");
    await buscarRelatorio(app, om.id); // cria o relatório, par 0 = ordem 0/1

    await enviarFotoParaOm(app, rdo.id, om.id, "Antes");
    await enviarFotoParaOm(app, rdo.id, om.id, "Depois");
    const sync = await app.inject({
      method: "POST",
      url: `/ordens-manutencao/${om.id}/relatorio-fotografico/sincronizar-fotos`,
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

  it("upload extra não colide com foto existente quando há buraco no meio (par incompleto)", async () => {
    const { om, rdo } = await montarCenario();
    const app = buildApp();
    // 1 Antes + 2 Depois: par 0 = (Antes@0, Depois@1); par 1 = só Depois,
    // que fica em ordem 3 (o lado Antes, ordem 2, fica vazio) — 3 fotos no
    // total, mas o maior `ordem` usado é 3, não 2. Se o upload extra usasse
    // ingenuamente "quantas fotos existem" (3) como próximo ordem, colidiria
    // com essa foto que já está em 3.
    await enviarFotoParaOm(app, rdo.id, om.id, "Antes");
    await enviarFotoParaOm(app, rdo.id, om.id, "Depois");
    await enviarFotoParaOm(app, rdo.id, om.id, "Depois");
    const antesDoExtra = await buscarRelatorio(app, om.id);
    expect(antesDoExtra.fotos.map((f) => f.ordem).sort((a, b) => a - b)).toEqual([0, 1, 3]);

    const extra = await enviarFotoExtra(app, om.id);
    const ordensUsadas = extra.fotos.map((f) => f.ordem);
    expect(new Set(ordensUsadas).size).toBe(ordensUsadas.length); // nenhum ordem repetido
    expect(extra.fotos).toHaveLength(4);
  });
});

describe("GET /ordens-manutencao — precisaRelatorioFotografico", () => {
  it("marca a OM quando há atividade CONCLUIDA e ainda não há relatório com foto", async () => {
    const { om, rdo } = await montarCenario();
    const distrito = await prisma.distrito.findFirstOrThrow({ where: { frenteId: om.frenteId } });
    const atividadeCatalogo = await prisma.atividadeCatalogo.create({
      data: { codigo: "2.1.2", descricao: "Limpeza de bueiros", unidade: "M2" },
    });
    const local = await prisma.rdoLocal.create({ data: { rdoId: rdo.id, descricao: "Trecho", ordem: 0 } });
    await prisma.rdoAtividade.create({
      data: {
        rdoLocalId: local.id,
        atividadeCatalogoId: atividadeCatalogo.id,
        ordemManutencaoId: om.id,
        statusOm: "CONCLUIDA",
        percentualConcluido: 100,
        unidade: "M2",
        totalCalculado: 10,
      },
    });
    void distrito;

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });
    const ordens = response.json() as { id: string; precisaRelatorioFotografico: boolean }[];
    const encontrada = ordens.find((o) => o.id === om.id);
    expect(encontrada?.precisaRelatorioFotografico).toBe(true);
  });
});

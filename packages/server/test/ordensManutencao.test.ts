import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

const BOUNDARY = "----golias-test-boundary";

/** Monta um corpo multipart com um campo de texto + um arquivo, na ordem dada. */
function multipartComCampoEArquivo(
  campos: Record<string, string>,
  arquivo: { nome: string; contentType: string; conteudo: Buffer },
): Buffer {
  const partes: Buffer[] = [];
  for (const [nome, valor] of Object.entries(campos)) {
    partes.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${nome}"\r\n\r\n${valor}\r\n`));
  }
  partes.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; filename="${arquivo.nome}"\r\nContent-Type: ${arquivo.contentType}\r\n\r\n`,
    ),
    arquivo.conteudo,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  );
  return Buffer.concat(partes);
}

/** Relatório de OM real (export do SAP/ECC), duas ordens — mesmo arquivo usado durante o desenvolvimento do parser. */
const PDF_OM_REAL = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../ECC RAMAL_removed.pdf"),
);

async function criarFrente(): Promise<{ id: string }> {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  return prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
}

describe("GET /ordens-manutencao", () => {
  it("lista as ordens com a frente embutida", async () => {
    const frente = await criarFrente();
    await prisma.ordemManutencao.create({
      data: { numero: "OM-001", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ numero: string; frente: { nome: string } }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.frente.nome).toBe("Marabá");
  });
});

describe("POST /ordens-manutencao", () => {
  it("cria uma ordem de manutenção", async () => {
    const frente = await criarFrente();

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-002", frenteId: frente.id, dataEmissao: "2026-02-01", kmInicial: 10, kmFinal: 20 },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { numero: string }).numero).toBe("OM-002");
  });

  it("retorna 409 para número duplicado", async () => {
    const frente = await criarFrente();
    await prisma.ordemManutencao.create({
      data: { numero: "OM-003", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-003", frenteId: frente.id, dataEmissao: "2026-02-01" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 400 para frenteId inválido", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao",
      payload: { numero: "OM-004", frenteId: "invalido", dataEmissao: "2026-02-01" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /ordens-manutencao/:id", () => {
  it("atualiza uma ordem de manutenção", async () => {
    const frente = await criarFrente();
    const ordem = await prisma.ordemManutencao.create({
      data: { numero: "OM-005", frenteId: frente.id, dataEmissao: new Date("2026-01-10") },
    });

    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/ordens-manutencao/${ordem.id}`,
      payload: { detalhes: "Troca de válvula" },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { detalhes: string }).detalhes).toBe("Troca de válvula");
  });

  it("retorna 404 para ordem inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/ordens-manutencao/nao-existe",
      payload: { detalhes: "X" },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /ordens-manutencao/importar-pdf", () => {
  it("cria as OMs descritas no PDF, e na reimportação atualiza em vez de duplicar", async () => {
    const frente = await criarFrente();

    const app = buildApp();
    const primeira = await app.inject({
      method: "POST",
      url: "/ordens-manutencao/importar-pdf",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartComCampoEArquivo(
        { frenteId: frente.id },
        { nome: "om.pdf", contentType: "application/pdf", conteudo: PDF_OM_REAL },
      ),
    });

    expect(primeira.statusCode).toBe(201);
    const corpoPrimeira = primeira.json() as {
      criadas: number;
      atualizadas: number;
      ordens: Array<{ numero: string; detalhes: string }>;
    };
    expect(corpoPrimeira.criadas).toBe(2);
    expect(corpoPrimeira.atualizadas).toBe(0);
    expect(corpoPrimeira.ordens.map((o) => o.numero).sort()).toEqual(["202602273896", "202602318160"]);
    expect(corpoPrimeira.ordens.find((o) => o.numero === "202602273896")?.detalhes).toBe(
      "P1F- MANUTENÇÃO NO SISTEMA DE DRENAGEM",
    );

    const segunda = await app.inject({
      method: "POST",
      url: "/ordens-manutencao/importar-pdf",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartComCampoEArquivo(
        { frenteId: frente.id },
        { nome: "om.pdf", contentType: "application/pdf", conteudo: PDF_OM_REAL },
      ),
    });

    const corpoSegunda = segunda.json() as { criadas: number; atualizadas: number };
    expect(corpoSegunda.criadas).toBe(0);
    expect(corpoSegunda.atualizadas).toBe(2);

    expect(await prisma.ordemManutencao.count()).toBe(2);
  });

  it("rejeita arquivo que não é PDF", async () => {
    const frente = await criarFrente();
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao/importar-pdf",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartComCampoEArquivo(
        { frenteId: frente.id },
        { nome: "om.pdf", contentType: "application/pdf", conteudo: Buffer.from("isto nao e um pdf") },
      ),
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 quando a frente não é informada", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/ordens-manutencao/importar-pdf",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartComCampoEArquivo({}, { nome: "om.pdf", contentType: "application/pdf", conteudo: PDF_OM_REAL }),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /ordens-manutencao/farol", () => {
  it("agrupa as OMs por dia e deriva o status a partir do RDO vinculado", async () => {
    const frente = await criarFrente();
    const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
    const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
    const atividadeCatalogo = await prisma.atividadeCatalogo.create({
      data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 1 },
    });

    // OM sem RDO vinculado, com data no passado (referência: "hoje" do teste é a data real do sistema) — cai em "não executada".
    await prisma.ordemManutencao.create({
      data: { numero: "OM-FAROL-1", frenteId: frente.id, dataEmissao: new Date("2020-01-10") },
    });

    // OM vinculada a um RDO aprovado — cai em "realizada".
    const omRealizada = await prisma.ordemManutencao.create({
      data: { numero: "OM-FAROL-2", frenteId: frente.id, dataEmissao: new Date("2020-01-10") },
    });
    const rdo = await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2020-01-10"), status: "APROVADO" },
    });
    const local = await prisma.rdoLocal.create({ data: { rdoId: rdo.id, descricao: "Trecho A" } });
    await prisma.rdoAtividade.create({
      data: {
        rdoLocalId: local.id,
        atividadeCatalogoId: atividadeCatalogo.id,
        ordemManutencaoId: omRealizada.id,
        unidade: "M2",
        totalCalculado: 10,
      },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao/farol?mes=2020-01" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      periodo: { inicio: string; fim: string };
      dias: Array<{ data: string; realizada: number; naoExecutada: number; total: number }>;
    };
    expect(body.periodo).toEqual({ inicio: "2019-12-19", fim: "2020-01-20" });

    const dia = body.dias.find((d) => d.data === "2020-01-10");
    expect(dia?.realizada).toBe(1);
    expect(dia?.naoExecutada).toBe(1);
    expect(dia?.total).toBe(2);
  });

  it("retorna uma linha por OM (itens) com o status individual, para conferência", async () => {
    const frente = await criarFrente();

    await prisma.ordemManutencao.create({
      data: { numero: "OM-ITEM-1", frenteId: frente.id, dataEmissao: new Date("2020-01-12"), lado: "LE" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/ordens-manutencao/farol?mes=2020-01" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      itens: Array<{ numero: string; frenteNome: string; dataEmissao: string; lado: string | null; status: string }>;
    };
    const item = body.itens.find((i) => i.numero === "OM-ITEM-1");
    expect(item).toMatchObject({ frenteNome: "Marabá", dataEmissao: "2020-01-12", lado: "LE", status: "naoExecutada" });
  });
});

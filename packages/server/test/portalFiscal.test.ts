import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
});

const BOUNDARY = "----golias-test-boundary";
// PNG 1x1 válido de verdade (não só o cabeçalho) — o PDF da assinatura é
// realmente desenhado com pdfkit (doc.image), que decodifica o PNG e falha
// se o arquivo não tiver os chunks IHDR/IDAT/IEND completos.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function multipartAssinar(
  nome: string,
  email: string,
  content: Buffer = PNG_BYTES,
  observacao?: string,
): { headers: Record<string, string>; payload: Buffer } {
  const partes = [
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="fiscalNome"\r\n\r\n${nome}\r\n`),
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="fiscalEmail"\r\n\r\n${email}\r\n`),
    ...(observacao != null
      ? [Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="observacao"\r\n\r\n${observacao}\r\n`)]
      : []),
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="assinatura"; filename="assinatura.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ];
  return {
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    payload: Buffer.concat(partes),
  };
}

async function criarCenario(portalFiscalToken: string | null = "token-portal") {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({
    data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id, portalFiscalToken },
  });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  const atividade = await prisma.atividadeCatalogo.create({
    data: { codigo: "2.2.1", descricao: "Roçada", unidade: "M", usaDimensoes: true, ordem: 1 },
  });
  return { frente, distrito, equipe, atividade };
}

async function criarRdoAguardandoAprovacao(frenteId: string, equipeId: string, atividadeId: string) {
  const rdo = await prisma.rdo.create({
    data: { frenteId, equipeId, data: new Date("2026-07-21"), status: "AGUARDANDO_APROVACAO" },
  });
  await prisma.rdoLocal.create({
    data: {
      rdoId: rdo.id,
      descricao: "Trecho A",
      ordem: 0,
      atividades: { create: [{ atividadeCatalogoId: atividadeId, comprimento: 10, unidade: "M", totalCalculado: 10 }] },
    },
  });
  return rdo;
}

describe("GET /portal-fiscal/:token", () => {
  it("lista os RDOs pendentes e o histórico da frente", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const pendente = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);
    await prisma.rdo.create({
      data: { frenteId: frente.id, equipeId: equipe.id, data: new Date("2026-07-15"), status: "APROVADO" },
    });

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/portal-fiscal/token-portal" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      frente: { id: string };
      pendentes: Array<{ id: string }>;
      historico: Array<{ id: string }>;
    };
    expect(body.frente.id).toBe(frente.id);
    expect(body.pendentes.map((r) => r.id)).toEqual([pendente.id]);
    expect(body.historico).toHaveLength(1);
  });

  it("retorna 404 para token inválido", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/portal-fiscal/nao-existe" });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /portal-fiscal/:token/rdos/:rdoId", () => {
  it("retorna o detalhe completo do RDO", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/portal-fiscal/token-portal/rdos/${rdo.id}` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string; locais: unknown[] };
    expect(body.id).toBe(rdo.id);
    expect(body.locais).toHaveLength(1);
  });

  it("retorna 404 quando o RDO é de outra frente", async () => {
    const { equipe, atividade } = await criarCenario();
    const outraFrenteContrato = await prisma.contrato.create({ data: { numero: "5900000001" } });
    const outraFrente = await prisma.frente.create({
      data: { codigo: "PBA", nome: "Parauapebas", contratoId: outraFrenteContrato.id },
    });
    const rdo = await criarRdoAguardandoAprovacao(outraFrente.id, equipe.id, atividade.id);

    const app = buildApp();
    const response = await app.inject({ method: "GET", url: `/portal-fiscal/token-portal/rdos/${rdo.id}` });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /portal-fiscal/:token/rdos/:rdoId/assinar", () => {
  it("aprova o RDO, salva a assinatura do fiscal e regera o PDF", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const { headers, payload } = multipartAssinar("Fiscal Vale", "fiscal@vale.com");
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/token-portal/rdos/${rdo.id}/assinar`,
      headers,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { pdfHash: string };
    expect(body.pdfHash).toHaveLength(64);

    const atualizado = await prisma.rdo.findUniqueOrThrow({ where: { id: rdo.id } });
    expect(atualizado.status).toBe("APROVADO");

    const aprovacao = await prisma.aprovacaoFiscal.findFirstOrThrow({ where: { rdoId: rdo.id } });
    expect(aprovacao.status).toBe("APROVADO");
    expect(aprovacao.fiscalNome).toBe("Fiscal Vale");
    expect(aprovacao.assinaturaImagemPath).toBeTruthy();

    const historico = await prisma.rdoHistorico.findMany({ where: { rdoId: rdo.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.paraStatus).toBe("APROVADO");
  });

  it("salva a observação do fiscal na aprovação, e ela aparece em GET /rdos/:id", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const { headers, payload } = multipartAssinar(
      "Fiscal Vale",
      "fiscal@vale.com",
      PNG_BYTES,
      "Atenção à sinalização no próximo RDO.",
    );
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/token-portal/rdos/${rdo.id}/assinar`,
      headers,
      payload,
    });
    expect(response.statusCode).toBe(200);

    const aprovacao = await prisma.aprovacaoFiscal.findFirstOrThrow({ where: { rdoId: rdo.id } });
    expect(aprovacao.observacao).toBe("Atenção à sinalização no próximo RDO.");

    const detalhe = await app.inject({ method: "GET", url: `/rdos/${rdo.id}` });
    expect(detalhe.statusCode).toBe(200);
    const body = detalhe.json() as { ultimaDecisaoFiscal: { status: string; comentario: string | null } | null };
    expect(body.ultimaDecisaoFiscal).toMatchObject({
      status: "APROVADO",
      comentario: "Atenção à sinalização no próximo RDO.",
    });
  });

  it("retorna 409 quando o RDO não está aguardando aprovação", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);
    await prisma.rdo.update({ where: { id: rdo.id }, data: { status: "APROVADO" } });

    const app = buildApp();
    const { headers, payload } = multipartAssinar("Fiscal Vale", "fiscal@vale.com");
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/token-portal/rdos/${rdo.id}/assinar`,
      headers,
      payload,
    });

    expect(response.statusCode).toBe(409);
  });

  it("retorna 404 para token de portal inválido", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const { headers, payload } = multipartAssinar("Fiscal Vale", "fiscal@vale.com");
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/nao-existe/rdos/${rdo.id}/assinar`,
      headers,
      payload,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /portal-fiscal/:token/rdos/:rdoId/reprovar", () => {
  it("reprova o RDO e grava o comentário", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/token-portal/rdos/${rdo.id}/reprovar`,
      payload: {
        fiscalNome: "Fiscal Vale",
        fiscalEmail: "fiscal@vale.com",
        comentario: "Faltou anexar a nota fiscal do material.",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("REPROVADO");

    const aprovacao = await prisma.aprovacaoFiscal.findFirstOrThrow({ where: { rdoId: rdo.id } });
    expect(aprovacao.status).toBe("REPROVADO");
    expect(aprovacao.comentarioReprovacao).toBe("Faltou anexar a nota fiscal do material.");
  });

  it("retorna 400 quando o comentário não é informado", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/token-portal/rdos/${rdo.id}/reprovar`,
      payload: { fiscalNome: "Fiscal Vale", fiscalEmail: "fiscal@vale.com", comentario: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 404 para token de portal inválido", async () => {
    const { frente, equipe, atividade } = await criarCenario();
    const rdo = await criarRdoAguardandoAprovacao(frente.id, equipe.id, atividade.id);

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/portal-fiscal/nao-existe/rdos/${rdo.id}/reprovar`,
      payload: { fiscalNome: "Fiscal Vale", fiscalEmail: "fiscal@vale.com", comentario: "Motivo" },
    });

    expect(response.statusCode).toBe(404);
  });
});

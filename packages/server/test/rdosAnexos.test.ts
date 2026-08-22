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

async function criarRdoComToken(token: string) {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const distrito = await prisma.distrito.create({ data: { nome: "Marabá Centro", frenteId: frente.id } });
  const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
  return prisma.rdo.create({
    data: {
      frenteId: frente.id,
      equipeId: equipe.id,
      data: new Date("2026-07-21"),
      linkCampoToken: token,
      linkCampoExpiraEm: new Date(Date.now() + 86_400_000),
    },
  });
}

// Assinatura mínima de um JPEG válido (SOI marker) — a rota confere os bytes
// reais do arquivo contra o Content-Type declarado, não confia só no header.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe("POST /rdos/campo/:token/anexos", () => {
  it("faz upload de uma foto e cria o anexo", async () => {
    await criarRdoComToken("token-anexo");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-anexo/anexos?tipo=FOTO",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("foto.jpg", "image/jpeg", JPEG_BYTES),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { tipo: string; nomeOriginal: string; tamanhoBytes: number };
    expect(body.tipo).toBe("FOTO");
    expect(body.nomeOriginal).toBe("foto.jpg");
    expect(body.tamanhoBytes).toBeGreaterThan(0);
  });

  it("rejeita arquivo cujo conteúdo não bate com o Content-Type declarado", async () => {
    await criarRdoComToken("token-anexo-forjado");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-anexo-forjado/anexos",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("foto.jpg", "image/jpeg", Buffer.from("isto nao e uma foto de verdade")),
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejeita tipo de arquivo não permitido", async () => {
    await criarRdoComToken("token-anexo-invalido");

    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/token-anexo-invalido/anexos",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("script.exe", "application/x-msdownload", Buffer.from("x")),
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 404 para token inexistente", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/rdos/campo/nao-existe/anexos",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody("foto.jpg", "image/jpeg", Buffer.from("x")),
    });

    expect(response.statusCode).toBe(404);
  });
});

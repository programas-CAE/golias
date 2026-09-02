import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashSenha } from "../src/lib/auth.js";
import { prisma } from "../src/lib/prisma.js";
import { resetDatabase } from "./db.js";

beforeEach(async () => {
  await resetDatabase();
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
});

async function criarCenario() {
  const contrato = await prisma.contrato.create({ data: { numero: "5900000000" } });
  const frente = await prisma.frente.create({ data: { codigo: "MAB", nome: "Marabá", contratoId: contrato.id } });
  const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Encarregado" } });
  const colaborador = await prisma.colaborador.create({ data: { matricula: "19342", nome: "Thiago", funcaoId: funcao.id } });

  const fiscal = await prisma.usuario.create({
    data: { nome: "Fiscal Vale", email: "fiscal@vale.com", senhaHash: await hashSenha("senha123"), role: "FISCAL", frenteId: frente.id },
  });
  const encarregado = await prisma.usuario.create({
    data: {
      nome: "Thiago",
      matriculaLogin: colaborador.matricula,
      colaboradorId: colaborador.id,
      senhaHash: await hashSenha("senha123"),
      role: "ENCARREGADO",
      frenteId: frente.id,
    },
  });
  return { frente, colaborador, fiscal, encarregado };
}

describe("POST /auth/login", () => {
  it("loga o fiscal com e-mail e senha", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "senha123" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { accessToken: string; refreshToken: string; usuario: { role: string } };
    expect(body.usuario.role).toBe("FISCAL");
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  it("loga o encarregado com matrícula e senha", async () => {
    const { encarregado } = await criarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: encarregado.matriculaLogin, senha: "senha123" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { usuario: { role: string; colaboradorId: string | null } };
    expect(body.usuario.role).toBe("ENCARREGADO");
    expect(body.usuario.colaboradorId).toBeTruthy();
  });

  it("retorna 401 pra senha errada", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "errada" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("retorna 401 pra usuário inativo", async () => {
    const { fiscal } = await criarCenario();
    await prisma.usuario.update({ where: { id: fiscal.id }, data: { ativo: false } });
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "senha123" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /auth/refresh e /auth/logout", () => {
  it("troca um refresh token válido por um access token novo", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { identificador: fiscal.email, senha: "senha123" } });
    const { refreshToken } = login.json() as { refreshToken: string };

    const response = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { accessToken: string }).accessToken).toBeTruthy();
  });

  it("revoga o refresh token no logout — refresh subsequente falha", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { identificador: fiscal.email, senha: "senha123" } });
    const { refreshToken } = login.json() as { refreshToken: string };

    const logout = await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken } });
    expect(logout.statusCode).toBe(204);

    const response = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } });
    expect(response.statusCode).toBe(401);
  });
});

describe("Rotas autenticadas — /fiscal e /encarregado", () => {
  it("retorna 401 sem token", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/fiscal/rdos" });
    expect(response.statusCode).toBe(401);
  });

  it("retorna 403 quando a role não bate (encarregado tentando acessar rota de fiscal)", async () => {
    const { encarregado } = await criarCenario();
    const app = buildApp();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: encarregado.matriculaLogin, senha: "senha123" },
    });
    const { accessToken } = login.json() as { accessToken: string };

    const response = await app.inject({ method: "GET", url: "/fiscal/rdos", headers: { authorization: `Bearer ${accessToken}` } });
    expect(response.statusCode).toBe(403);
  });

  it("fiscal logado vê os RDOs pendentes da própria frente", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { identificador: fiscal.email, senha: "senha123" } });
    const { accessToken } = login.json() as { accessToken: string };

    const response = await app.inject({ method: "GET", url: "/fiscal/rdos", headers: { authorization: `Bearer ${accessToken}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { frente: { id: string }; pendentes: unknown[] };
    expect(body.frente.id).toBe(fiscal.frenteId);
  });

  it("encarregado logado cria o RDO de hoje já com encarregadoId e tipo", async () => {
    const { encarregado, frente } = await criarCenario();
    const distrito = await prisma.distrito.create({ data: { nome: "Centro", frenteId: frente.id } });
    const equipe = await prisma.equipe.create({ data: { nome: "Terra", distritoId: distrito.id } });
    const app = buildApp();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: encarregado.matriculaLogin, senha: "senha123" },
    });
    const { accessToken } = login.json() as { accessToken: string };

    const response = await app.inject({
      method: "POST",
      url: "/encarregado/rdo-hoje",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { equipeId: equipe.id, tipo: "TERRAPLENAGEM" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; linkCampoToken: string; tipo: string };
    expect(body.tipo).toBe("TERRAPLENAGEM");

    const rdo = await prisma.rdo.findUniqueOrThrow({ where: { id: body.id } });
    expect(rdo.encarregadoId).toBe(encarregado.colaboradorId);
  });
});

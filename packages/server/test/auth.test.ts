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

describe("Autonomia do encarregado sobre a própria equipe", () => {
  async function logarEncarregado(app: ReturnType<typeof buildApp>, identificador: string): Promise<string> {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { identificador, senha: "senha123" } });
    return (login.json() as { accessToken: string }).accessToken;
  }

  it("criar equipe já entra com o encarregadoId de quem criou", async () => {
    const { encarregado, frente } = await criarCenario();
    const distrito = await prisma.distrito.create({ data: { nome: "Centro", frenteId: frente.id } });
    const app = buildApp();
    const accessToken = await logarEncarregado(app, encarregado.matriculaLogin!);

    const response = await app.inject({
      method: "POST",
      url: "/encarregado/equipes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { nome: "Preventiva Nova", distritoId: distrito.id },
    });
    expect(response.statusCode).toBe(201);
    const equipe = await prisma.equipe.findUniqueOrThrow({ where: { id: (response.json() as { id: string }).id } });
    expect(equipe.encarregadoId).toBe(encarregado.colaboradorId);
  });

  it("adiciona, edita a quantidade e remove um membro da equipe da própria frente", async () => {
    const { encarregado, frente } = await criarCenario();
    const distrito = await prisma.distrito.create({ data: { nome: "Centro", frenteId: frente.id } });
    const equipe = await prisma.equipe.create({ data: { nome: "Preventiva", distritoId: distrito.id } });
    const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras" } });
    const app = buildApp();
    const accessToken = await logarEncarregado(app, encarregado.matriculaLogin!);

    const criar = await app.inject({
      method: "POST",
      url: `/encarregado/equipes/${equipe.id}/membros`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { funcaoId: funcao.id, quantidade: 3 },
    });
    expect(criar.statusCode).toBe(201);
    const membro = criar.json() as { id: string; quantidade: number };
    expect(membro.quantidade).toBe(3);

    const editar = await app.inject({
      method: "PATCH",
      url: `/encarregado/equipes/${equipe.id}/membros/${membro.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { quantidade: 5 },
    });
    expect(editar.statusCode).toBe(200);
    expect((editar.json() as { quantidade: number }).quantidade).toBe(5);

    const remover = await app.inject({
      method: "DELETE",
      url: `/encarregado/equipes/${equipe.id}/membros/${membro.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(remover.statusCode).toBe(204);
    expect(await prisma.equipeMembro.findUnique({ where: { id: membro.id } })).toBeNull();
  });

  it("retorna 404 ao tentar mexer numa equipe de outra frente", async () => {
    const { encarregado } = await criarCenario();
    const outroContrato = await prisma.contrato.create({ data: { numero: "5900000001" } });
    const outraFrente = await prisma.frente.create({ data: { codigo: "PBA", nome: "Parauapebas", contratoId: outroContrato.id } });
    const outroDistrito = await prisma.distrito.create({ data: { nome: "Centro PBA", frenteId: outraFrente.id } });
    const equipeDeOutraFrente = await prisma.equipe.create({ data: { nome: "Preventiva PBA", distritoId: outroDistrito.id } });
    const funcao = await prisma.funcaoCatalogo.create({ data: { nome: "Servente de Obras" } });
    const app = buildApp();
    const accessToken = await logarEncarregado(app, encarregado.matriculaLogin!);

    const response = await app.inject({
      method: "POST",
      url: `/encarregado/equipes/${equipeDeOutraFrente.id}/membros`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { funcaoId: funcao.id, quantidade: 1 },
    });
    expect(response.statusCode).toBe(404);
  });
});

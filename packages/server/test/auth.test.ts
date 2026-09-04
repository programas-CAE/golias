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

async function logar(app: ReturnType<typeof buildApp>, identificador: string, senha = "senha123"): Promise<string> {
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { identificador, senha } });
  return (login.json() as { accessToken: string }).accessToken;
}

describe("POST /auth/trocar-senha", () => {
  it("troca a senha sabendo a atual, e a senha nova já loga", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();
    const accessToken = await logar(app, fiscal.email!);

    const response = await app.inject({
      method: "POST",
      url: "/auth/trocar-senha",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { senhaAtual: "senha123", novaSenha: "senhaNova456" },
    });
    expect(response.statusCode).toBe(204);

    const loginAntiga = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "senha123" },
    });
    expect(loginAntiga.statusCode).toBe(401);

    const loginNova = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "senhaNova456" },
    });
    expect(loginNova.statusCode).toBe(200);
  });

  it("retorna 401 quando a senha atual está errada", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();
    const accessToken = await logar(app, fiscal.email!);

    const response = await app.inject({
      method: "POST",
      url: "/auth/trocar-senha",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { senhaAtual: "senhaErrada", novaSenha: "senhaNova456" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("retorna 401 sem token de acesso", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/trocar-senha",
      payload: { senhaAtual: "senha123", novaSenha: "senhaNova456" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /auth/esqueci-senha e /auth/redefinir-senha", () => {
  it("gera um token de redefinição válido, que troca a senha e não pode ser reusado", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();

    const pedido = await app.inject({
      method: "POST",
      url: "/auth/esqueci-senha",
      payload: { identificador: fiscal.email },
    });
    expect(pedido.statusCode).toBe(200);

    const registro = await prisma.redefinicaoSenhaToken.findFirstOrThrow({ where: { usuarioId: fiscal.id } });
    // O e-mail (não enviado de verdade, sem SMTP no teste) leva o token puro,
    // só o hash fica no banco — sobrescreve com um token conhecido pra
    // testar /redefinir-senha de ponta a ponta sem precisar capturar o e-mail.
    const tokenConhecido = "token-de-teste-redefinicao";
    const { createHash } = await import("node:crypto");
    await prisma.redefinicaoSenhaToken.update({
      where: { id: registro.id },
      data: { tokenHash: createHash("sha256").update(tokenConhecido).digest("hex") },
    });

    const redefinir = await app.inject({
      method: "POST",
      url: "/auth/redefinir-senha",
      payload: { token: tokenConhecido, novaSenha: "senhaNova456" },
    });
    expect(redefinir.statusCode).toBe(204);

    const loginNova = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { identificador: fiscal.email, senha: "senhaNova456" },
    });
    expect(loginNova.statusCode).toBe(200);

    const reusar = await app.inject({
      method: "POST",
      url: "/auth/redefinir-senha",
      payload: { token: tokenConhecido, novaSenha: "outraSenha789" },
    });
    expect(reusar.statusCode).toBe(400);
  });

  it("responde 200 mesmo pra identificador inexistente (não revela se a conta existe)", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/esqueci-senha",
      payload: { identificador: "ninguem@example.com" },
    });
    expect(response.statusCode).toBe(200);
    expect(await prisma.redefinicaoSenhaToken.count()).toBe(0);
  });

  it("retorna 400 pra token inválido ou expirado", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/redefinir-senha",
      payload: { token: "nao-existe", novaSenha: "senhaNova456" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /auth/perfil", () => {
  it("atualiza o próprio e-mail", async () => {
    const { fiscal } = await criarCenario();
    const app = buildApp();
    const accessToken = await logar(app, fiscal.email!);

    const response = await app.inject({
      method: "PATCH",
      url: "/auth/perfil",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: "fiscal-novo@vale.com" },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { email: string }).email).toBe("fiscal-novo@vale.com");
  });

  it("retorna 409 quando o e-mail já pertence a outra conta", async () => {
    const { fiscal, encarregado } = await criarCenario();
    await prisma.usuario.update({ where: { id: encarregado.id }, data: { email: "encarregado@example.com" } });
    const app = buildApp();
    const accessToken = await logar(app, fiscal.email!);

    const response = await app.inject({
      method: "PATCH",
      url: "/auth/perfil",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: "encarregado@example.com" },
    });
    expect(response.statusCode).toBe(409);
  });
});

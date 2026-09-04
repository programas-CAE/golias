import {
  esqueciSenhaInputSchema,
  loginInputSchema,
  perfilUpdateInputSchema,
  redefinirSenhaInputSchema,
  refreshInputSchema,
  trocarSenhaInputSchema,
} from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import {
  assinarAccessToken,
  criarSessao,
  hashSenha,
  revogarSessao,
  verificarSenha,
  verificarSessao,
} from "../lib/auth.js";
import { enviarEmail } from "../lib/email.js";
import { exigirLogin } from "../lib/authGuard.js";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

const REDEFINICAO_SENHA_DURACAO_MS = 60 * 60 * 1000; // 1h — link de e-mail vive pouco de propósito

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const usuarioPublicoSelect = {
  id: true,
  nome: true,
  email: true,
  role: true,
  frenteId: true,
  colaboradorId: true,
  ativo: true,
} as const;

/**
 * Login de fiscal/encarregado — substitui os links públicos por frente
 * (ver `portalFiscal.ts`/`portalEncarregado.ts`, que continuam existindo
 * pra quem ainda tem um link salvo, mas deixam de ser o caminho principal).
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  app.post<{ Querystring: never }>(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const data = parseBody(loginInputSchema, request.body, reply);
      if (!data) return;

      const usuario = await prisma.usuario.findFirst({
        where: { OR: [{ email: data.identificador }, { matriculaLogin: data.identificador }] },
      });
      if (!usuario || !usuario.ativo || !(await verificarSenha(data.senha, usuario.senhaHash))) {
        return reply.status(401).send({ error: "E-mail/matrícula ou senha inválidos" });
      }

      const accessToken = await assinarAccessToken({
        sub: usuario.id,
        role: usuario.role,
        frenteId: usuario.frenteId,
        colaboradorId: usuario.colaboradorId,
      });
      const refreshToken = await criarSessao(usuario.id, request.ip);

      return {
        accessToken,
        refreshToken,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          role: usuario.role,
          frenteId: usuario.frenteId,
          colaboradorId: usuario.colaboradorId,
        },
      };
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const data = parseBody(refreshInputSchema, request.body, reply);
    if (!data) return;

    const usuarioId = await verificarSessao(data.refreshToken);
    if (!usuarioId) return reply.status(401).send({ error: "Sessão inválida ou expirada" });

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: usuarioPublicoSelect });
    if (!usuario || !usuario.ativo) return reply.status(401).send({ error: "Sessão inválida ou expirada" });

    const accessToken = await assinarAccessToken({
      sub: usuario.id,
      role: usuario.role,
      frenteId: usuario.frenteId,
      colaboradorId: usuario.colaboradorId,
    });
    return { accessToken };
  });

  app.post("/auth/logout", async (request, reply) => {
    const data = parseBody(refreshInputSchema, request.body, reply);
    if (!data) return;
    await revogarSessao(data.refreshToken);
    return reply.status(204).send();
  });

  /** Trocar senha sabendo a senha atual — uma das duas formas (a outra é o link por e-mail abaixo). */
  app.post(
    "/auth/trocar-senha",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const usuarioToken = await exigirLogin(request, reply);
      if (!usuarioToken) return;

      const data = parseBody(trocarSenhaInputSchema, request.body, reply);
      if (!data) return;

      const usuario = await prisma.usuario.findUnique({ where: { id: usuarioToken.sub } });
      if (!usuario || !(await verificarSenha(data.senhaAtual, usuario.senhaHash))) {
        return reply.status(401).send({ error: "Senha atual incorreta" });
      }

      await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await hashSenha(data.novaSenha) } });
      return reply.status(204).send();
    },
  );

  /**
   * "Esqueci minha senha" — sempre responde 200 com a mesma mensagem
   * genérica, ache ou não o usuário: dizer "esse e-mail não existe"
   * deixaria qualquer um descobrir quem tem login no sistema só tentando
   * e-mails.
   */
  app.post(
    "/auth/esqueci-senha",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const data = parseBody(esqueciSenhaInputSchema, request.body, reply);
      if (!data) return;

      const usuario = await prisma.usuario.findFirst({
        where: {
          OR: [{ email: data.identificador }, { matriculaLogin: data.identificador }],
          ativo: true,
          email: { not: null },
        },
      });

      if (usuario?.email) {
        const token = generateToken();
        await prisma.redefinicaoSenhaToken.create({
          data: {
            usuarioId: usuario.id,
            tokenHash: hashToken(token),
            expiraEm: new Date(Date.now() + REDEFINICAO_SENHA_DURACAO_MS),
          },
        });
        const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
        await enviarEmail({
          para: usuario.email,
          assunto: "Redefinição de senha — GOLIAS",
          texto: `Alguém (você, esperamos) pediu pra redefinir a senha da sua conta.\n\nAcesse o link abaixo pra criar uma senha nova — ele vale por 1 hora:\n${publicWebUrl}/redefinir-senha/${token}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.`,
        });
      }

      return reply.status(200).send({ mensagem: "Se o e-mail/matrícula existir, enviamos um link de redefinição." });
    },
  );

  app.post(
    "/auth/redefinir-senha",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const data = parseBody(redefinirSenhaInputSchema, request.body, reply);
      if (!data) return;

      const registro = await prisma.redefinicaoSenhaToken.findUnique({ where: { tokenHash: hashToken(data.token) } });
      if (!registro || registro.usadoEm != null || registro.expiraEm.getTime() < Date.now()) {
        return reply.status(400).send({ error: "Link inválido ou expirado — peça uma redefinição nova" });
      }

      await prisma.$transaction([
        prisma.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash: await hashSenha(data.novaSenha) } }),
        prisma.redefinicaoSenhaToken.update({ where: { id: registro.id }, data: { usadoEm: new Date() } }),
        // Derruba as sessões existentes — se o pedido de redefinição foi
        // porque alguém mais tinha acesso à conta, a troca de senha sozinha
        // não adiantaria enquanto o token antigo continuasse valendo.
        prisma.sessaoRefreshToken.updateMany({
          where: { usuarioId: registro.usuarioId, revogadoEm: null },
          data: { revogadoEm: new Date() },
        }),
      ]);

      return reply.status(204).send();
    },
  );

  /** Fiscal/encarregado editando o próprio e-mail (ex.: pra receber notificação de RDO). */
  app.patch("/auth/perfil", async (request, reply) => {
    const usuarioToken = await exigirLogin(request, reply);
    if (!usuarioToken) return;

    const data = parseBody(perfilUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const usuario = await prisma.usuario.update({
        where: { id: usuarioToken.sub },
        data: { email: data.email },
        select: usuarioPublicoSelect,
      });
      return usuario;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.status(409).send({ error: "Já existe uma conta com esse e-mail" });
      }
      throw error;
    }
  });
}

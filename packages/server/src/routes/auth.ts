import { loginInputSchema, refreshInputSchema } from "@golias/shared";
import type { FastifyInstance } from "fastify";
import { assinarAccessToken, criarSessao, revogarSessao, verificarSenha, verificarSessao } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

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
}

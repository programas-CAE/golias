import type { FastifyReply, FastifyRequest } from "fastify";
import { verificarAccessToken, type AccessTokenPayload } from "./auth.js";

/**
 * Mesmo padrão de `parseBody` (lib/validate.ts): já responde e devolve
 * `undefined` em caso de falha — quem chama só precisa checar
 * `if (!usuario) return;` antes de seguir.
 */
export async function exigirLogin(request: FastifyRequest, reply: FastifyReply): Promise<AccessTokenPayload | undefined> {
  const cabecalho = request.headers.authorization;
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!token) {
    reply.status(401).send({ error: "Não autenticado" });
    return undefined;
  }
  const payload = await verificarAccessToken(token);
  if (!payload) {
    reply.status(401).send({ error: "Sessão inválida ou expirada" });
    return undefined;
  }
  return payload;
}

export function exigirRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<AccessTokenPayload | undefined> => {
    const usuario = await exigirLogin(request, reply);
    if (!usuario) return undefined;
    if (!roles.includes(usuario.role)) {
      reply.status(403).send({ error: "Sem permissão para essa ação" });
      return undefined;
    }
    return usuario;
  };
}

import type { FastifyReply } from "fastify";
import type { ZodSchema } from "zod";

/**
 * Valida o corpo da requisição contra um schema zod. Em caso de falha, já
 * envia a resposta 400 e retorna undefined — o chamador só precisa checar
 * `if (!data) return;`.
 */
export function parseBody<T>(schema: ZodSchema<T>, payload: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(payload);
  if (!result.success) {
    void reply.status(400).send({ error: "Dados inválidos", issues: result.error.issues });
    return undefined;
  }
  return result.data;
}

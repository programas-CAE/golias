import type { FastifyReply } from "fastify";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Valida o corpo da requisição contra um schema zod. Em caso de falha, já
 * envia a resposta 400 e retorna undefined — o chamador só precisa checar
 * `if (!data) return;`.
 *
 * Usa `ZodType<T, ZodTypeDef, any>` (não o alias `ZodSchema<T>`) para que T
 * seja inferido a partir do tipo de SAÍDA do schema — schemas com
 * `.default(...)` têm entrada opcional e saída obrigatória, e `ZodSchema<T>`
 * unifica os dois, fazendo o TS inferir campos como opcionais indevidamente.
 */
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, any>, payload: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(payload);
  if (!result.success) {
    void reply.status(400).send({ error: "Dados inválidos", issues: result.error.issues });
    return undefined;
  }
  return result.data;
}

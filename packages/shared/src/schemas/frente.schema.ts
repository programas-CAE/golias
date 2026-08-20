import { z } from "zod";

/**
 * Frente.codigo é um enum fixo de 3 valores (packages/server/prisma/schema.prisma)
 * já semeado por completo — por isso não há schema de criação, só de edição
 * de nome/ativo.
 */
export const frenteUpdateInputSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(120).optional(),
  ativo: z.boolean().optional(),
});

export type FrenteUpdateInput = z.infer<typeof frenteUpdateInputSchema>;

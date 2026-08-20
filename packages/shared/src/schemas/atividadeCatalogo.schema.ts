import { z } from "zod";

/**
 * O catálogo de atividades é oficial e já vem semeado por completo
 * (packages/server/prisma/seed.ts) — por isso só existe schema de edição
 * (ativo, ordem, metaPus), sem criação/exclusão livre.
 */
export const atividadeCatalogoUpdateInputSchema = z.object({
  ativo: z.boolean().optional(),
  ordem: z.number().int().nonnegative().optional(),
  metaPus: z.number().positive().nullable().optional(),
});

export type AtividadeCatalogoUpdateInput = z.infer<typeof atividadeCatalogoUpdateInputSchema>;

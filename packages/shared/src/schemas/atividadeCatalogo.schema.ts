import { z } from "zod";
import { unidadeMedidaSchema } from "./rdo.schema.js";

/**
 * O catálogo de atividades vem semeado com a Price List oficial do contrato
 * (packages/server/prisma/seed.ts) — por isso a edição das já existentes é
 * limitada (ativo, ordem, metaPus; código/descrição/unidade oficiais não se
 * mexe). Mas atividade nova pode surgir fora da Price List original, daí a
 * criação livre existir também (ao contrário do próprio código/descrição/
 * unidade de uma já cadastrada, que fica travado).
 */
export const atividadeCatalogoCreateInputSchema = z.object({
  codigo: z.string().trim().min(1, "Código é obrigatório").max(60),
  descricao: z.string().trim().min(1, "Descrição é obrigatória").max(255),
  unidade: unidadeMedidaSchema,
  usaDimensoes: z.boolean().optional().default(false),
  metaPus: z.number().positive().nullable().optional(),
  ordem: z.number().int().nonnegative().optional().default(0),
});

export type AtividadeCatalogoCreateInput = z.infer<typeof atividadeCatalogoCreateInputSchema>;

export const atividadeCatalogoUpdateInputSchema = z.object({
  ativo: z.boolean().optional(),
  ordem: z.number().int().nonnegative().optional(),
  metaPus: z.number().positive().nullable().optional(),
});

export type AtividadeCatalogoUpdateInput = z.infer<typeof atividadeCatalogoUpdateInputSchema>;

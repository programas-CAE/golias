import { z } from "zod";

/**
 * Catálogo de materiais — igual ao de equipamentos, aceita criação e edição
 * livre pelo escritório (ao contrário do de atividades, que vem fechado da
 * Price List). `codigo` é único por contrato (ver @@unique no schema), não
 * globalmente — dois contratos podem ter o mesmo código de material.
 */
export const materialCatalogoCreateInputSchema = z.object({
  contratoId: z.string().min(1, "Contrato é obrigatório"),
  codigo: z.string().trim().min(1, "Código é obrigatório").max(60),
  descricao: z.string().trim().min(1, "Descrição é obrigatória").max(255),
  unidade: z.string().trim().min(1, "Unidade é obrigatória").max(20),
  precoUnitario: z.number().positive().nullable().optional(),
});

export type MaterialCatalogoCreateInput = z.infer<typeof materialCatalogoCreateInputSchema>;

export const materialCatalogoUpdateInputSchema = z.object({
  descricao: z.string().trim().min(1, "Descrição é obrigatória").max(255).optional(),
  unidade: z.string().trim().min(1, "Unidade é obrigatória").max(20).optional(),
  precoUnitario: z.number().positive().nullable().optional(),
  ativo: z.boolean().optional(),
});

export type MaterialCatalogoUpdateInput = z.infer<typeof materialCatalogoUpdateInputSchema>;

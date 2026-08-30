import { z } from "zod";

/**
 * Catálogo de equipamentos/custos indiretos — diferente do catálogo de
 * atividades (que vem fechado da Price List do contrato), a lista de
 * equipamentos muda com frequência (veículo novo, equipamento que saiu de
 * frota etc.), por isso aceita criação e edição livre pelo escritório.
 */
export const equipamentoCatalogoCreateInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(120),
});

export type EquipamentoCatalogoCreateInput = z.infer<typeof equipamentoCatalogoCreateInputSchema>;

export const equipamentoCatalogoUpdateInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(120).optional(),
  ativo: z.boolean().optional(),
});

export type EquipamentoCatalogoUpdateInput = z.infer<typeof equipamentoCatalogoUpdateInputSchema>;

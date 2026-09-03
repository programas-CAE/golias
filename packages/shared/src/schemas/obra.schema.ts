import { z } from "zod";

/**
 * Obra — projeto/empreendimento com nome próprio (ver model Obra no
 * schema.prisma) que agrupa RDOs de uma ou mais equipes ao longo do
 * tempo. Cadastro livre pelo escritório, como equipamentos/materiais.
 */
export const obraCreateInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(160),
});

export type ObraCreateInput = z.infer<typeof obraCreateInputSchema>;

export const obraUpdateInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(160).optional(),
  ativo: z.boolean().optional(),
});

export type ObraUpdateInput = z.infer<typeof obraUpdateInputSchema>;

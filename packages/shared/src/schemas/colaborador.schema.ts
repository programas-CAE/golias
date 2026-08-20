import { z } from "zod";

export const colaboradorCreateInputSchema = z.object({
  matricula: z.string().min(1, "Matrícula é obrigatória").max(30),
  nome: z.string().min(1, "Nome é obrigatório").max(150),
  funcaoId: z.string().cuid("Função inválida"),
  ativo: z.boolean().default(true),
});

export type ColaboradorCreateInput = z.infer<typeof colaboradorCreateInputSchema>;

export const colaboradorUpdateInputSchema = z.object({
  matricula: z.string().min(1).max(30).optional(),
  nome: z.string().min(1).max(150).optional(),
  funcaoId: z.string().cuid("Função inválida").optional(),
  ativo: z.boolean().optional(),
});

export type ColaboradorUpdateInput = z.infer<typeof colaboradorUpdateInputSchema>;

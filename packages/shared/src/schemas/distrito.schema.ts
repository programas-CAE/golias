import { z } from "zod";

export const distritoCreateInputSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(120),
  frenteId: z.string().cuid("Frente inválida"),
  ativo: z.boolean().default(true),
});

export type DistritoCreateInput = z.infer<typeof distritoCreateInputSchema>;

export const distritoUpdateInputSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  ativo: z.boolean().optional(),
});

export type DistritoUpdateInput = z.infer<typeof distritoUpdateInputSchema>;

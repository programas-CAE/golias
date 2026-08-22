import { z } from "zod";

export const contratoUpdateInputSchema = z.object({
  nome: z.string().max(300).nullable().optional(),
  ativo: z.boolean().optional(),
});

export type ContratoUpdateInput = z.infer<typeof contratoUpdateInputSchema>;

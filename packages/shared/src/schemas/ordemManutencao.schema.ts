import { z } from "zod";

export const ordemManutencaoCreateInputSchema = z.object({
  // .trim() antes do .min() — sem isso, "202602273896" e " 202602273896"
  // (espaço a mais, comum ao colar de um PDF/planilha) passam como números
  // "diferentes" e driblam o @unique do banco, virando OM duplicada.
  numero: z.string().trim().min(1, "Número é obrigatório").max(40),
  frenteId: z.string().cuid("Frente inválida"),
  dataEmissao: z.coerce.date(),
  kmInicial: z.number().nonnegative().nullable().optional(),
  kmFinal: z.number().nonnegative().nullable().optional(),
  lado: z.string().max(60).nullable().optional(),
  detalhes: z.string().max(2000).nullable().optional(),
});

export type OrdemManutencaoCreateInput = z.infer<typeof ordemManutencaoCreateInputSchema>;

export const ordemManutencaoUpdateInputSchema = z.object({
  numero: z.string().trim().min(1).max(40).optional(),
  frenteId: z.string().cuid("Frente inválida").optional(),
  dataEmissao: z.coerce.date().optional(),
  kmInicial: z.number().nonnegative().nullable().optional(),
  kmFinal: z.number().nonnegative().nullable().optional(),
  lado: z.string().max(60).nullable().optional(),
  detalhes: z.string().max(2000).nullable().optional(),
});

export type OrdemManutencaoUpdateInput = z.infer<typeof ordemManutencaoUpdateInputSchema>;

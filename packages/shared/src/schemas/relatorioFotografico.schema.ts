import { z } from "zod";

export const relatorioFotograficoUpdateInputSchema = z.object({
  dataConclusao: z.coerce.date().nullable().optional(),
  atividadesExecutadas: z.boolean().optional(),
  comentarios: z.string().max(4000).nullable().optional(),
});

export type RelatorioFotograficoUpdateInput = z.infer<typeof relatorioFotograficoUpdateInputSchema>;

export const relatorioFotograficoFotoUpdateInputSchema = z.object({
  legenda: z.string().max(300).nullable().optional(),
  ordem: z.number().int().nonnegative().optional(),
});

export type RelatorioFotograficoFotoUpdateInput = z.infer<typeof relatorioFotograficoFotoUpdateInputSchema>;

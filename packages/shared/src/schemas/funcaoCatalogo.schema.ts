import { z } from "zod";

/** Catálogo de funções (mão de obra) — cresce conforme aparece função nova em campo, igual equipamentos. */
export const funcaoCatalogoCreateInputSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(120),
});

export type FuncaoCatalogoCreateInput = z.infer<typeof funcaoCatalogoCreateInputSchema>;

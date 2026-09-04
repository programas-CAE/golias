import { z } from "zod";

/**
 * Etapa/fase PLANEJADA da obra (cronograma) — datas previstas, cadastradas
 * pelo escritório antes de acontecer. Ver model ObraEtapa em schema.prisma;
 * diferente dos RDOs vinculados à obra, que são o que foi realmente
 * executado.
 */
export const obraEtapaInputSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório").max(160),
    dataInicioPrevista: z.coerce.date(),
    dataFimPrevista: z.coerce.date(),
  })
  .refine((data) => data.dataFimPrevista >= data.dataInicioPrevista, {
    message: "Data fim não pode ser antes da data início",
    path: ["dataFimPrevista"],
  });

export type ObraEtapaInput = z.infer<typeof obraEtapaInputSchema>;

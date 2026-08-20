import { z } from "zod";

/**
 * Schemas de validação para a criação/edição de um RDO (Relatório Diário de
 * Obra). Os campos espelham o modelo Prisma `Rdo` / `RdoLocal` /
 * `RdoAtividade` definido em packages/server/prisma/schema.prisma.
 */

export const TEMPO_CLIMA_VALUES = ["SOL", "CHUVA", "NUBLADO"] as const;
export const tempoClimaSchema = z.enum(TEMPO_CLIMA_VALUES);
export type TempoClima = z.infer<typeof tempoClimaSchema>;

export const UNIDADE_MEDIDA_VALUES = ["M", "M2", "M3", "UND", "HH", "M3KM"] as const;
export const unidadeMedidaSchema = z.enum(UNIDADE_MEDIDA_VALUES);
export type UnidadeMedidaSchema = z.infer<typeof unidadeMedidaSchema>;

/** Horário no formato HH:mm (24h). */
const horarioSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido, use o formato HH:mm");

export const rdoAtividadeInputSchema = z
  .object({
    atividadeCatalogoId: z.string().cuid(),
    altura: z.number().positive().nullable().optional(),
    largura: z.number().positive().nullable().optional(),
    comprimento: z.number().positive().nullable().optional(),
    quantidadeDireta: z.number().positive().nullable().optional(),
    unidade: unidadeMedidaSchema,
  })
  .superRefine((data, ctx) => {
    const usaDimensoes = data.unidade === "M" || data.unidade === "M2" || data.unidade === "M3";

    if (usaDimensoes) {
      if (data.unidade === "M3" && (data.altura == null || data.largura == null || data.comprimento == null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Atividades em M3 exigem altura, largura e comprimento",
          path: ["altura"],
        });
      }
      if (data.unidade === "M2" && (data.largura == null || data.comprimento == null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Atividades em M2 exigem largura e comprimento",
          path: ["largura"],
        });
      }
      if (data.unidade === "M" && data.comprimento == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Atividades em M exigem comprimento",
          path: ["comprimento"],
        });
      }
    } else if (data.quantidadeDireta == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe a quantidade diretamente para esta unidade",
        path: ["quantidadeDireta"],
      });
    }
  });

export type RdoAtividadeInput = z.infer<typeof rdoAtividadeInputSchema>;

export const rdoLocalInputSchema = z.object({
  descricao: z.string().min(1, "Descrição do local é obrigatória"),
  kmInicial: z.number().nonnegative().nullable().optional(),
  kmFinal: z.number().nonnegative().nullable().optional(),
  lado: z.string().nullable().optional(),
  ordem: z.number().int().nonnegative().default(0),
  atividades: z.array(rdoAtividadeInputSchema).min(1, "Informe ao menos uma atividade para o local"),
});

export type RdoLocalInput = z.infer<typeof rdoLocalInputSchema>;

export const rdoCreateInputSchema = z.object({
  frenteId: z.string().cuid(),
  equipeId: z.string().cuid(),
  ordemManutencaoId: z.string().cuid().nullable().optional(),
  data: z.coerce.date(),
  horarioInicial: horarioSchema.nullable().optional(),
  horarioFinal: horarioSchema.nullable().optional(),
  clima: tempoClimaSchema.nullable().optional(),
  encarregadoId: z.string().cuid().nullable().optional(),
  observacoesContratada: z.string().max(4000).nullable().optional(),
  locais: z.array(rdoLocalInputSchema).min(1, "Informe ao menos um local trabalhado"),
});

export type RdoCreateInput = z.infer<typeof rdoCreateInputSchema>;

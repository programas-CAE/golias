import { z } from "zod";

export const equipeCreateInputSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(120),
  distritoId: z.string().cuid("Distrito inválido"),
  encarregadoId: z.string().cuid().nullable().optional(),
  ativo: z.boolean().default(true),
});

export type EquipeCreateInput = z.infer<typeof equipeCreateInputSchema>;

export const equipeUpdateInputSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  distritoId: z.string().cuid("Distrito inválido").optional(),
  encarregadoId: z.string().cuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

export type EquipeUpdateInput = z.infer<typeof equipeUpdateInputSchema>;

export const equipeMembroInputSchema = z.object({
  // Opcional: quando ausente, a linha é um posto genérico da função (ex.:
  // "3 Pedreiro"), sem vincular a uma pessoa nomeada.
  colaboradorId: z.string().cuid("Colaborador inválido").nullable().optional(),
  funcaoId: z.string().cuid("Função inválida"),
  quantidade: z.number().int().positive().default(1),
});

export type EquipeMembroInput = z.infer<typeof equipeMembroInputSchema>;

export const equipeMembroUpdateInputSchema = z.object({
  quantidade: z.number().int().positive(),
});

export type EquipeMembroUpdateInput = z.infer<typeof equipeMembroUpdateInputSchema>;

import { z } from "zod";

export const equipeCreateInputSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(120),
  frenteId: z.string().cuid("Frente inválida"),
  encarregadoId: z.string().cuid().nullable().optional(),
  ativo: z.boolean().default(true),
});

export type EquipeCreateInput = z.infer<typeof equipeCreateInputSchema>;

export const equipeUpdateInputSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  frenteId: z.string().cuid("Frente inválida").optional(),
  encarregadoId: z.string().cuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

export type EquipeUpdateInput = z.infer<typeof equipeUpdateInputSchema>;

export const equipeMembroInputSchema = z.object({
  colaboradorId: z.string().cuid("Colaborador inválido"),
  funcaoId: z.string().cuid("Função inválida"),
  quantidade: z.number().int().positive().default(1),
});

export type EquipeMembroInput = z.infer<typeof equipeMembroInputSchema>;

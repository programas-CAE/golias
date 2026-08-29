import { z } from "zod";

/**
 * Schemas de validação para a criação/edição de um RDO (Relatório Diário de
 * Obra). Os campos espelham o modelo Prisma `Rdo` / `RdoBlocoHorario` /
 * `RdoLocal` / `RdoAtividade` definido em packages/server/prisma/schema.prisma.
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

/**
 * Um bloco da linha do tempo do dia (ex.: "07:00–08:50 Deslocamento para o
 * Km 767+520"), como preenchido linha a linha no RDO em papel — inclui
 * blocos sem produção medida (deslocamento, montagem de área de vivência,
 * almoço), não só os que viram RdoAtividade.
 */
export const rdoBlocoHorarioInputSchema = z.object({
  horarioInicial: horarioSchema,
  horarioFinal: horarioSchema,
  descricao: z.string().min(1, "Descrição do bloco é obrigatória").max(2000),
  ordem: z.number().int().nonnegative().default(0),
});

export type RdoBlocoHorarioInput = z.infer<typeof rdoBlocoHorarioInputSchema>;

export const STATUS_OM_DECLARADO_VALUES = ["EM_ANDAMENTO", "CONCLUIDA"] as const;
export const statusOmDeclaradoSchema = z.enum(STATUS_OM_DECLARADO_VALUES);
export type StatusOmDeclarado = z.infer<typeof statusOmDeclaradoSchema>;

/** Mão de obra por função dedicada a uma atividade específica (ex.: "1 TST, 3 Pedreiro" só para ela). */
export const rdoAtividadeMaoDeObraInputSchema = z.object({
  funcaoId: z.string().cuid(),
  quantidade: z.number().int().positive().default(1),
});

export type RdoAtividadeMaoDeObraInput = z.infer<typeof rdoAtividadeMaoDeObraInputSchema>;

/**
 * Ponto de medição adicional de uma atividade — mesma atividade/OM, outro
 * trecho medido no mesmo dia (ex.: "ponto 1 rocei 1x5x20, ponto 2 rocei
 * 2x5x4"). Sem OM/km/horário/mão de obra próprios porque continua sendo a
 * mesma atividade, só outras dimensões — ver RdoAtividade.pontosExtras em
 * packages/server/prisma/schema.prisma.
 */
export const rdoAtividadePontoInputSchema = z.object({
  ordem: z.number().int().nonnegative().default(0),
  altura: z.number().positive().nullable().optional(),
  largura: z.number().positive().nullable().optional(),
  larguraFinal: z.number().positive().nullable().optional(),
  comprimento: z.number().positive().nullable().optional(),
  quantidadeDireta: z.number().positive().nullable().optional(),
});

export type RdoAtividadePontoInput = z.infer<typeof rdoAtividadePontoInputSchema>;

interface DimensoesInput {
  altura?: number | null;
  largura?: number | null;
  comprimento?: number | null;
  quantidadeDireta?: number | null;
}

/** Mesma regra de "que dimensão essa unidade exige" aplicada ao Ponto 1 (a atividade) e a cada ponto extra. */
function validarDimensoesPorUnidade(
  unidade: UnidadeMedidaSchema,
  dados: DimensoesInput,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const usaDimensoes = unidade === "M" || unidade === "M2" || unidade === "M3";

  if (usaDimensoes) {
    if (unidade === "M3" && (dados.altura == null || dados.largura == null || dados.comprimento == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Atividades em M3 exigem altura, largura e comprimento",
        path: [...path, "altura"],
      });
    }
    if (unidade === "M2" && (dados.largura == null || dados.comprimento == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Atividades em M2 exigem largura e comprimento",
        path: [...path, "largura"],
      });
    }
    if (unidade === "M" && dados.comprimento == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Atividades em M exigem comprimento",
        path: [...path, "comprimento"],
      });
    }
  } else if (dados.quantidadeDireta == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe a quantidade diretamente para esta unidade",
      path: [...path, "quantidadeDireta"],
    });
  }
}

export const rdoAtividadeInputSchema = z
  .object({
    atividadeCatalogoId: z.string().cuid(),
    // Cada atividade é autorizada por uma OM própria — ver comentário no
    // model RdoAtividade em packages/server/prisma/schema.prisma. O km vem
    // junto, pela mesma razão: um mesmo local pode ter atividades com OMs
    // (e kms) diferentes.
    ordemManutencaoId: z.string().cuid().nullable().optional(),
    // Só faz sentido quando ordemManutencaoId está preenchido — não
    // reforçado aqui porque o formulário já só mostra o campo nesse caso.
    statusOm: statusOmDeclaradoSchema.nullable().optional(),
    kmInicial: z.number().nonnegative().nullable().optional(),
    kmFinal: z.number().nonnegative().nullable().optional(),
    altura: z.number().positive().nullable().optional(),
    largura: z.number().positive().nullable().optional(),
    larguraFinal: z.number().positive().nullable().optional(),
    comprimento: z.number().positive().nullable().optional(),
    quantidadeDireta: z.number().positive().nullable().optional(),
    // Início/fim desta atividade — quando ambos informados, o servidor
    // deriva horasTrabalhadas deles (fim − início) em vez do valor abaixo.
    horarioInicial: horarioSchema.nullable().optional(),
    horarioFinal: horarioSchema.nullable().optional(),
    horasTrabalhadas: z.number().positive().nullable().optional(),
    maoObraDireta: z.number().int().positive().nullable().optional(),
    maoDeObra: z.array(rdoAtividadeMaoDeObraInputSchema).default([]),
    unidade: unidadeMedidaSchema,
    // Ponto 1 é sempre os campos acima (altura/largura/.../quantidadeDireta)
    // — pontosExtras só existe quando a mesma atividade/OM foi medida em
    // mais de um trecho no mesmo dia. Ver rdoAtividadePontoInputSchema.
    pontosExtras: z.array(rdoAtividadePontoInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    validarDimensoesPorUnidade(data.unidade, data, ctx, []);
    data.pontosExtras.forEach((ponto, indice) => {
      validarDimensoesPorUnidade(data.unidade, ponto, ctx, ["pontosExtras", indice]);
    });
  });

export type RdoAtividadeInput = z.infer<typeof rdoAtividadeInputSchema>;

export const rdoLocalInputSchema = z.object({
  descricao: z.string().min(1, "Descrição do local é obrigatória"),
  lado: z.string().nullable().optional(),
  ordem: z.number().int().nonnegative().default(0),
  atividades: z.array(rdoAtividadeInputSchema).min(1, "Informe ao menos uma atividade para o local"),
});

export type RdoLocalInput = z.infer<typeof rdoLocalInputSchema>;

export const rdoMaoDeObraInputSchema = z.object({
  funcaoId: z.string().cuid(),
  colaboradorId: z.string().cuid().nullable().optional(),
  quantidade: z.number().int().positive().default(1),
  horasImprodutivas: z.number().nonnegative().nullable().optional(),
  causaImprodutividade: z.string().max(500).nullable().optional(),
});

export type RdoMaoDeObraInput = z.infer<typeof rdoMaoDeObraInputSchema>;

export const rdoEquipamentoInputSchema = z.object({
  equipamentoCatalogoId: z.string().cuid(),
  quantidade: z.number().int().positive().default(1),
});

export type RdoEquipamentoInput = z.infer<typeof rdoEquipamentoInputSchema>;

/**
 * Material consumido no dia, escolhido do catálogo oficial (MaterialCatalogo
 * — Price List do contrato, com preço unitário).
 */
export const rdoMaterialInputSchema = z.object({
  materialCatalogoId: z.string().cuid("Material inválido"),
  quantidade: z.number().positive(),
  ordem: z.number().int().nonnegative().default(0),
});

export type RdoMaterialInput = z.infer<typeof rdoMaterialInputSchema>;

export const rdoCreateInputSchema = z.object({
  frenteId: z.string().cuid(),
  equipeId: z.string().cuid(),
  data: z.coerce.date(),
  blocosHorario: z.array(rdoBlocoHorarioInputSchema).default([]),
  horaExtraInicio: horarioSchema.nullable().optional(),
  horaExtraFim: horarioSchema.nullable().optional(),
  clima: tempoClimaSchema.nullable().optional(),
  encarregadoId: z.string().cuid().nullable().optional(),
  totalDesvios: z.number().int().nonnegative().nullable().optional(),
  observacoesContratada: z.string().max(4000).nullable().optional(),
  locais: z.array(rdoLocalInputSchema).min(1, "Informe ao menos um local trabalhado"),
  maoDeObra: z.array(rdoMaoDeObraInputSchema).default([]),
  equipamentos: z.array(rdoEquipamentoInputSchema).default([]),
  materiais: z.array(rdoMaterialInputSchema).default([]),
});

export type RdoCreateInput = z.infer<typeof rdoCreateInputSchema>;

/** Cria um RDO em rascunho vazio a partir do escritório (packages/desktop). */
export const rdoDraftCreateInputSchema = z.object({
  frenteId: z.string().cuid(),
  equipeId: z.string().cuid(),
  data: z.coerce.date(),
});

export type RdoDraftCreateInput = z.infer<typeof rdoDraftCreateInputSchema>;

/**
 * Salva o preenchimento de campo de um RDO via link público (token). Mais
 * permissivo que `rdoCreateInputSchema` (locais/mão de obra podem estar
 * vazios) porque o encarregado pode salvar o formulário em progresso antes
 * de terminar de preencher.
 */
export const rdoCampoUpdateInputSchema = z.object({
  blocosHorario: z.array(rdoBlocoHorarioInputSchema).default([]),
  horaExtraInicio: horarioSchema.nullable().optional(),
  horaExtraFim: horarioSchema.nullable().optional(),
  clima: tempoClimaSchema.nullable().optional(),
  encarregadoId: z.string().cuid().nullable().optional(),
  totalDesvios: z.number().int().nonnegative().nullable().optional(),
  observacoesContratada: z.string().max(4000).nullable().optional(),
  locais: z.array(rdoLocalInputSchema).default([]),
  maoDeObra: z.array(rdoMaoDeObraInputSchema).default([]),
  equipamentos: z.array(rdoEquipamentoInputSchema).default([]),
  materiais: z.array(rdoMaterialInputSchema).default([]),
});

export type RdoCampoUpdateInput = z.infer<typeof rdoCampoUpdateInputSchema>;

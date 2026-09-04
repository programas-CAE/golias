import { z } from "zod";

/** E-mail pro fiscal, matrícula pra encarregado — o login aceita os dois campos e tenta achar por qualquer um deles. */
export const loginInputSchema = z.object({
  identificador: z.string().trim().min(1, "Informe seu e-mail ou matrícula"),
  senha: z.string().min(1, "Informe sua senha"),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const USUARIO_ROLE_VALUES = ["ADMIN", "ESCRITORIO", "FISCAL", "ENCARREGADO"] as const;
export const usuarioRoleSchema = z.enum(USUARIO_ROLE_VALUES);

export const usuarioCreateInputSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório").max(150),
    email: z.string().trim().email("E-mail inválido").nullable().optional(),
    colaboradorId: z.string().cuid().nullable().optional(),
    senha: z.string().min(6, "A senha precisa de pelo menos 6 caracteres"),
    role: usuarioRoleSchema,
    frenteId: z.string().cuid().nullable().optional(),
    ativo: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.role === "FISCAL" && !data.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fiscal precisa de e-mail", path: ["email"] });
    }
    if (data.role === "ENCARREGADO" && !data.colaboradorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Encarregado precisa estar ligado a um colaborador já cadastrado",
        path: ["colaboradorId"],
      });
    }
  });

export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;

export const usuarioUpdateInputSchema = z.object({
  nome: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email("E-mail inválido").nullable().optional(),
  colaboradorId: z.string().cuid().nullable().optional(),
  senha: z.string().min(6, "A senha precisa de pelo menos 6 caracteres").optional(),
  frenteId: z.string().cuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;

/** Troca de senha por quem já está logado (sabe a senha atual) — uma das duas formas de trocar senha. */
export const trocarSenhaInputSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual"),
  novaSenha: z.string().min(6, "A nova senha precisa de pelo menos 6 caracteres"),
});

export type TrocarSenhaInput = z.infer<typeof trocarSenhaInputSchema>;

/** "Esqueci minha senha" — outra forma de trocar, via link de e-mail (não precisa da senha atual). */
export const esqueciSenhaInputSchema = z.object({
  identificador: z.string().trim().min(1, "Informe seu e-mail ou matrícula"),
});

export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaInputSchema>;

export const redefinirSenhaInputSchema = z.object({
  token: z.string().min(1),
  novaSenha: z.string().min(6, "A nova senha precisa de pelo menos 6 caracteres"),
});

export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaInputSchema>;

/** Fiscal/encarregado editando o próprio e-mail (ex.: pra receber notificações de RDO). */
export const perfilUpdateInputSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export type PerfilUpdateInput = z.infer<typeof perfilUpdateInputSchema>;

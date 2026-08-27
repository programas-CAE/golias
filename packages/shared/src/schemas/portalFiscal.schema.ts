import { z } from "zod";

/**
 * Reprovar não precisa de imagem de assinatura (só assinatura confirma
 * aprovação) — por isso vai como JSON puro, ao contrário de "assinar", que
 * é multipart (tem a imagem do canvas junto).
 */
export const portalFiscalReprovarInputSchema = z.object({
  fiscalNome: z.string().trim().min(1, "Informe seu nome"),
  fiscalEmail: z.string().trim().email("E-mail inválido"),
  comentario: z.string().trim().min(1, "Descreva o motivo da reprovação").max(2000),
});

export type PortalFiscalReprovarInput = z.infer<typeof portalFiscalReprovarInputSchema>;

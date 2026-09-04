import nodemailer, { type Transporter } from "nodemailer";

/**
 * Notificações por e-mail (fiscal com RDO esperando aprovação, encarregado
 * com RDO reprovado) — best-effort: se o SMTP não estiver configurado (dev,
 * teste, ou produção antes de alguém preencher o .env), só loga e segue,
 * nunca quebra o fluxo do RDO por causa de e-mail. Mesma razão pro catch em
 * volta do envio em si — uma falha do provedor SMTP não pode derrubar a
 * aprovação/reprovação que já foi salva no banco.
 */

let transportadorCache: Transporter | null | undefined;

function obterTransportador(): Transporter | null {
  if (transportadorCache !== undefined) return transportadorCache;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transportadorCache = null;
    return transportadorCache;
  }

  const porta = Number(SMTP_PORT) || 587;
  transportadorCache = nodemailer.createTransport({
    host: SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transportadorCache;
}

export async function enviarEmail(params: { para: string; assunto: string; texto: string }): Promise<void> {
  const transportador = obterTransportador();
  if (!transportador) {
    console.warn(`[email] SMTP não configurado — não enviado para ${params.para}: "${params.assunto}"`);
    return;
  }

  try {
    await transportador.sendMail({
      from: process.env.SMTP_USER,
      to: params.para,
      subject: params.assunto,
      text: params.texto,
    });
  } catch (error) {
    console.error(`[email] falha ao enviar para ${params.para}:`, error);
  }
}

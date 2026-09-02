import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateToken } from "./tokens.js";

/**
 * Extraído de routes/rdos.ts pra ser reaproveitado também pelo upload de
 * fotos do Relatório Fotográfico (routes/relatoriosFotograficos.ts), que
 * precisa da mesma validação de arquivo mas não é um anexo de RDO.
 */
export const ANEXO_TIPOS = ["FOTO", "NOTA_FISCAL", "DOCUMENTO"] as const;

export const ANEXO_MIME_EXTENSAO: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

/**
 * Confere os primeiros bytes do arquivo contra a assinatura esperada do tipo
 * declarado — o Content-Type do multipart é só uma alegação do cliente, não
 * prova do conteúdo real (endpoint público, sem login).
 */
export function assinaturaValida(mimetype: string, buffer: Buffer): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/pdf":
      return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
    default:
      return false;
  }
}

/** Grava um arquivo de anexo já validado em UPLOADS_ROOT/<subpasta>/<token><extensao>. */
export async function salvarArquivoAnexo(
  buffer: Buffer,
  mimetype: string,
  ...subpastas: string[]
): Promise<{ caminhoArquivo: string; nomeArquivo: string }> {
  const extensao = ANEXO_MIME_EXTENSAO[mimetype] ?? "";
  const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
  const dir = path.join(uploadsRoot, ...subpastas);
  await mkdir(dir, { recursive: true });
  const nomeArquivo = `${generateToken()}${extensao}`;
  const caminhoArquivo = path.join(dir, nomeArquivo);
  await writeFile(caminhoArquivo, buffer);
  return { caminhoArquivo, nomeArquivo };
}

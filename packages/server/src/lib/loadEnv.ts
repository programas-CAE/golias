/** Carrega um arquivo .env relativo a `baseUrl` (import.meta.url do chamador). */
export function loadEnv(relativePath: string, baseUrl: string): void {
  try {
    process.loadEnvFile(new URL(relativePath, baseUrl));
  } catch {
    // .env é opcional (ex.: quando as variáveis já estão definidas no ambiente)
  }
}

/** Lê uma variável de ambiente obrigatória, falhando cedo e com mensagem clara se ausente. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

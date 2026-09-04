import { getSettings } from "./settingsStore";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Um item de `ZodError.issues` — path é o caminho até o campo (ex.: ["locais", 0, "atividades", 0, "largura"]). */
interface ErroDeCampo {
  path?: Array<string | number>;
  message?: string;
}

/**
 * "Dados inválidos" sozinho não dizia QUAL campo faltou — o servidor já
 * manda os `issues` do Zod (parseBody em lib/validate.ts), só não estavam
 * sendo lidos aqui. Junta o caminho de cada campo com a mensagem, pra dar
 * pra identificar de cara o que precisa ser corrigido.
 */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    const base = body.error;
    if ("issues" in body && Array.isArray(body.issues) && body.issues.length > 0) {
      const detalhes = (body.issues as ErroDeCampo[])
        .map((issue) => {
          const caminho = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : null;
          return caminho ? `${caminho}: ${issue.message ?? "inválido"}` : (issue.message ?? "inválido");
        })
        .join("; ");
      return `${base} — ${detalhes}`;
    }
    return base;
  }
  return `Erro ${status} ao comunicar com o servidor`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { apiUrl } = await getSettings();
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;

  const response = await fetch(url, {
    ...options,
    headers:
      options.body == null || options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(extractErrorMessage(body, response.status), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData): Promise<T> => request<T>(path, { method: "POST", body: form }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),
};

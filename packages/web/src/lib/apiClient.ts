import { atualizarAccessToken, lerSessao, limparSessao } from "./session";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return `Erro ${status} ao comunicar com o servidor`;
}

/** Troca o refresh token guardado por um access token novo — usado quando uma chamada autenticada leva 401. */
async function tentarRenovarSessao(): Promise<string | null> {
  const sessao = lerSessao();
  if (!sessao) return null;
  try {
    const resposta = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: sessao.refreshToken }),
    });
    if (!resposta.ok) return null;
    const { accessToken } = (await resposta.json()) as { accessToken: string };
    atualizarAccessToken(accessToken);
    return accessToken;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}, tentandoDeNovo = false): Promise<T> {
  const sessao = lerSessao();
  const headersBase: HeadersInit =
    options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (sessao) {
    (headersBase as Record<string, string>).Authorization = `Bearer ${sessao.accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headersBase, ...options.headers },
  });

  // Rotas autenticadas (/fiscal/*, /encarregado/*) — um 401 pode só significar
  // que o access token venceu (dura 8h); tenta renovar com o refresh token
  // guardado e repete a chamada uma vez antes de desistir.
  if (response.status === 401 && sessao && !tentandoDeNovo) {
    const novoToken = await tentarRenovarSessao();
    if (novoToken) {
      return request<T>(path, options, true);
    }
    limparSessao();
  }

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
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData): Promise<T> => request<T>(path, { method: "POST", body: form }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),
};

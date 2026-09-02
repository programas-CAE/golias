/**
 * Sessão de login (fiscal/encarregado) guardada no navegador — primeiro uso
 * de localStorage pra isso no pacote web (antes só existia o token do link
 * público, que não precisa disso). Ver packages/server/src/lib/auth.ts.
 */
export interface SessaoUsuario {
  accessToken: string;
  refreshToken: string;
  usuario: {
    id: string;
    nome: string;
    email: string | null;
    role: "ADMIN" | "ESCRITORIO" | "FISCAL" | "ENCARREGADO";
    frenteId: string | null;
    colaboradorId: string | null;
  };
}

const CHAVE = "golias:sessao";

export function lerSessao(): SessaoUsuario | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as SessaoUsuario) : null;
  } catch {
    return null;
  }
}

export function salvarSessao(sessao: SessaoUsuario): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(sessao));
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem persistir
  }
}

export function atualizarAccessToken(accessToken: string): void {
  const atual = lerSessao();
  if (!atual) return;
  salvarSessao({ ...atual, accessToken });
}

export function limparSessao(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // ignora
  }
}

/**
 * Tema claro/escuro do app — persistido em localStorage (só nesta máquina,
 * cada instalação do desktop guarda a própria escolha) e aplicado via
 * atributo `data-theme` na tag <html> (ver os tokens de cor em index.css).
 * A aplicação inicial (antes do React montar) acontece num script inline
 * em index.html, pra não piscar claro antes de trocar pra escuro.
 */

export type Tema = "light" | "dark";

const CHAVE_TEMA = "golias:tema";

function preferenciaDoSistema(): Tema {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function lerTemaSalvo(): Tema | null {
  const valor = localStorage.getItem(CHAVE_TEMA);
  return valor === "light" || valor === "dark" ? valor : null;
}

export function temaAtual(): Tema {
  const salvo = lerTemaSalvo();
  if (salvo) return salvo;
  const atributo = document.documentElement.dataset.theme;
  return atributo === "dark" ? "dark" : atributo === "light" ? "light" : preferenciaDoSistema();
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema;
}

export function definirTema(tema: Tema): void {
  localStorage.setItem(CHAVE_TEMA, tema);
  aplicarTema(tema);
}

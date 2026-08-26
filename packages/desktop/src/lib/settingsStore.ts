/**
 * Wrapper de acesso ao endereço do servidor GOLIAS (fixo no processo
 * principal — ver electron/main.ts). O acesso real acontece através da
 * ponte exposta pelo preload script (electron/preload.ts) em
 * `window.golias`; este módulo apenas oferece uma API tipada e um pouco
 * mais amigável para os componentes React consumirem.
 */

export interface GoliasSettings {
  apiUrl: string;
  webUrl: string;
}

export async function getSettings(): Promise<GoliasSettings> {
  return window.golias.getSettings();
}

export function getAppVersion(): string {
  return window.golias.appVersion ?? "0.0.0";
}

/** Abre uma URL do próprio servidor GOLIAS no navegador padrão do sistema (ex.: baixar o PDF de um RDO). */
export async function abrirExterno(url: string): Promise<void> {
  await window.golias.abrirExterno(url);
}

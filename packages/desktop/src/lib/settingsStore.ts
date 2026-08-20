/**
 * Wrapper de acesso às configurações persistidas do aplicativo (via
 * electron-store no processo principal). O acesso real acontece através da
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

export async function setSettings(settings: GoliasSettings): Promise<GoliasSettings> {
  return window.golias.setSettings(settings);
}

export function getAppVersion(): string {
  return window.golias.appVersion ?? "0.0.0";
}

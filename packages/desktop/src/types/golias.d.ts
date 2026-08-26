import type { GoliasSettings } from "../lib/settingsStore";

export interface GoliasBridge {
  getSettings: () => Promise<GoliasSettings>;
  abrirExterno: (url: string) => Promise<void>;
  appVersion: string | undefined;
}

declare global {
  interface Window {
    golias: GoliasBridge;
  }
}

export {};

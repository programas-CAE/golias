import type { GoliasSettings } from "../lib/settingsStore";

export interface GoliasBridge {
  getSettings: () => Promise<GoliasSettings>;
  setSettings: (settings: GoliasSettings) => Promise<GoliasSettings>;
  appVersion: string | undefined;
}

declare global {
  interface Window {
    golias: GoliasBridge;
  }
}

export {};

import { contextBridge, ipcRenderer } from "electron";

interface GoliasSettings {
  apiUrl: string;
}

contextBridge.exposeInMainWorld("golias", {
  getSettings: (): Promise<GoliasSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (settings: GoliasSettings): Promise<GoliasSettings> =>
    ipcRenderer.invoke("settings:set", settings),
  appVersion: process.env.npm_package_version,
});

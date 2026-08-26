import { contextBridge, ipcRenderer } from "electron";

interface GoliasSettings {
  apiUrl: string;
  webUrl: string;
}

contextBridge.exposeInMainWorld("golias", {
  getSettings: (): Promise<GoliasSettings> => ipcRenderer.invoke("settings:get"),
  abrirExterno: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),
  appVersion: process.env.npm_package_version,
});

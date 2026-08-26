import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import path from "node:path";

interface GoliasSettings {
  apiUrl: string;
  webUrl: string;
}

// Endereço do servidor GOLIAS de produção, fixo no instalador — não existe
// mais tela de configurações para trocar isso em runtime. Constante (não
// electron-store): instalações anteriores a essa mudança já tinham salvo
// "http://localhost:3333" no store do usuário, e o default do electron-store
// só vale na primeira execução — nunca sobrescreve um valor já persistido.
// Fixando a constante aqui, todo mundo aponta pra produção sempre.
const SETTINGS: GoliasSettings = {
  apiUrl: "https://api.golias.engecomengenharia.online",
  webUrl: "https://campo.golias.engecomengenharia.online",
};

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "GOLIAS",
    backgroundColor: "#f4faf6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("settings:get", (): GoliasSettings => SETTINGS);

// Só abre URLs do próprio servidor GOLIAS (API ou web) no navegador padrão do
// sistema — evita que a página vire um abridor de links arbitrários.
ipcMain.handle("shell:openExternal", (_event, url: string): void => {
  if (url.startsWith(SETTINGS.apiUrl) || url.startsWith(SETTINGS.webUrl)) {
    void shell.openExternal(url);
  }
});

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

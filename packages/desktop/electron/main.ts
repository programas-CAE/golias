import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } from "electron";
import { autoUpdater } from "electron-updater";
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

const UMA_HORA_MS = 60 * 60 * 1000;

/**
 * Auto-update via electron-updater, contra as releases do GitHub do
 * repositório (ver `publish` em electron-builder.yml). Só roda em build
 * empacotado (`app.isPackaged`) — em dev não há instalador nem release pra
 * comparar, e o electron-updater loga erro sem isso.
 */
function configurarAutoUpdate(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox({
        type: "info",
        title: "Atualização disponível",
        message: `Uma nova versão do GOLIAS (${info.version}) foi baixada.`,
        detail: "Reinicie agora para aplicar, ou deixe para a próxima vez que abrir o programa.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (error) => {
    console.error("[auto-update]", error);
  });

  void autoUpdater.checkForUpdates();
  setInterval(() => void autoUpdater.checkForUpdates(), UMA_HORA_MS);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "GOLIAS",
    // Cor de fundo da janela antes do HTML/CSS pintar — segue a preferência
    // de tema do próprio SO como melhor palpite (o processo principal não
    // tem acesso ao localStorage do renderer, onde a escolha explícita de
    // tema fica salva; ver src/lib/theme.ts). Evita o "flash" claro numa
    // janela que vai abrir escura na maioria dos casos reais.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#14201a" : "#f4faf6",
    icon: path.join(__dirname, "../build/icon.png"),
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

  registrarNavegacaoPorHistorico(mainWindow);
}

/**
 * O app não tem um botão "Voltar" em cada tela, e sem isso a única forma de
 * sair de uma tela era ir lá no menu lateral de novo (perdendo o contexto,
 * ex.: filtro aplicado numa lista). O HashRouter já registra cada navegação
 * como uma entrada no histórico da janela (igual um navegador comum) — só
 * faltava ligar isso ao botão lateral do mouse e ao atalho de teclado.
 */
function registrarNavegacaoPorHistorico(win: BrowserWindow): void {
  win.on("app-command", (_event, cmd) => {
    if (cmd === "browser-backward" && win.webContents.navigationHistory.canGoBack()) {
      win.webContents.navigationHistory.goBack();
    } else if (cmd === "browser-forward" && win.webContents.navigationHistory.canGoForward()) {
      win.webContents.navigationHistory.goForward();
    }
  });

  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown" || !input.alt) return;
    if (input.key === "ArrowLeft" && win.webContents.navigationHistory.canGoBack()) {
      win.webContents.navigationHistory.goBack();
    } else if (input.key === "ArrowRight" && win.webContents.navigationHistory.canGoForward()) {
      win.webContents.navigationHistory.goForward();
    }
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
  configurarAutoUpdate();

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

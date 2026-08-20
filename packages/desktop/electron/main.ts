import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import Store from "electron-store";

interface GoliasSettings {
  apiUrl: string;
}

const store = new Store<GoliasSettings>({
  defaults: {
    apiUrl: "http://localhost:3333",
  },
});

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "GOLIAS",
    backgroundColor: "#0f172a",
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

ipcMain.handle("settings:get", (): GoliasSettings => {
  return { apiUrl: store.get("apiUrl") };
});

ipcMain.handle(
  "settings:set",
  (_event: IpcMainInvokeEvent, settings: Partial<GoliasSettings>): GoliasSettings => {
    if (typeof settings.apiUrl === "string" && settings.apiUrl.trim().length > 0) {
      store.set("apiUrl", settings.apiUrl.trim());
    }
    return { apiUrl: store.get("apiUrl") };
  },
);

void app.whenReady().then(() => {
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

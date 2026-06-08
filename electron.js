const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
const DATA_DIR = path.join(require("os").homedir(), "Documents", "MigraineLog");

// Crée le dossier de données si inexistant
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "MigraineLog",
    icon: path.join(__dirname, "public", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC : lire un fichier de données
ipcMain.handle("read-data", (_e, filename) => {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, "utf8");
});

// ── IPC : écrire un fichier de données (auto-save)
ipcMain.handle("write-data", (_e, filename, content) => {
  const fp = path.join(DATA_DIR, filename);
  fs.writeFileSync(fp, content, "utf8");
  return true;
});

// ── IPC : lister les fichiers de données
ipcMain.handle("list-data", () => {
  return fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
});

// ── IPC : obtenir le dossier de données actuel
ipcMain.handle("get-data-dir", () => DATA_DIR);

// ── IPC : choisir un autre dossier de sauvegarde
ipcMain.handle("choose-data-dir", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Choisir le dossier de sauvegarde MigraineLog",
    defaultPath: DATA_DIR,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── IPC : exporter tout en JSON vers un fichier choisi
ipcMain.handle("export-json", async (e, content) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showSaveDialog(win, {
    title: "Exporter les données MigraineLog",
    defaultPath: path.join(require("os").homedir(), "Downloads", `migrainelog_export_${Date.now()}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, content, "utf8");
  return true;
});

// ── IPC : importer depuis un fichier JSON
ipcMain.handle("import-json", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Importer des données MigraineLog",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled) return null;
  return fs.readFileSync(result.filePaths[0], "utf8");
});

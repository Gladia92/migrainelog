const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { execFile, spawn } = require("child_process");
const os = require("os");

// ── Ollama
const OLLAMA_DIR  = path.join(app.getPath("userData"), "ollama");
const OLLAMA_BIN  = path.join(OLLAMA_DIR, "ollama.exe");
const OLLAMA_URL  = "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.exe";
const MODEL_NAME  = "meditron";
let ollamaProcess = null;

function ensureOllamaDir() {
  if (!fs.existsSync(OLLAMA_DIR)) fs.mkdirSync(OLLAMA_DIR, { recursive: true });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { follow(res.headers.location); return; }
        const total = parseInt(res.headers["content-length"] || "0");
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on("data", chunk => { received += chunk.length; file.write(chunk); if (total) onProgress(Math.round(received / total * 100)); });
        res.on("end", () => { file.end(); resolve(); });
        res.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

function startOllama() {
  return new Promise((resolve) => {
    ollamaProcess = spawn(OLLAMA_BIN, ["serve"], {
      env: { ...process.env, OLLAMA_MODELS: OLLAMA_DIR },
      detached: false, stdio: "ignore"
    });
    setTimeout(resolve, 2000);
  });
}

function ollamaRunning() {
  return new Promise((resolve) => {
    const req = require("http").get("http://127.0.0.1:11434", () => resolve(true));
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

app.on("before-quit", () => { if (ollamaProcess) ollamaProcess.kill(); });

const isDev = !app.isPackaged;
const DATA_DIR = path.join(os.homedir(), "Documents", "MigraineLog");

// Crée le dossier de données si inexistant
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "MigraineLog",
    icon: path.join(__dirname, "icon.png"),
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

// ── IPC : statut et setup Ollama
ipcMain.handle("ollama-status", async () => {
  const binExists  = fs.existsSync(OLLAMA_BIN);
  const modelPath  = path.join(OLLAMA_DIR, "models", "manifests", "registry.ollama.ai", "library", MODEL_NAME);
  const modelExists = fs.existsSync(modelPath);
  const running    = await ollamaRunning();
  return { binExists, modelExists, running };
});

ipcMain.handle("ollama-setup", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const send = (step, progress) => win.webContents.send("ollama-progress", { step, progress });

  ensureOllamaDir();

  // 1. Télécharger Ollama si absent
  if (!fs.existsSync(OLLAMA_BIN)) {
    send("download-ollama", 0);
    await downloadFile(OLLAMA_URL, OLLAMA_BIN, p => send("download-ollama", p));
    fs.chmodSync(OLLAMA_BIN, 0o755);
  }

  // 2. Démarrer Ollama
  if (!(await ollamaRunning())) {
    send("starting", 0);
    await startOllama();
  }

  // 3. Télécharger le modèle si absent
  const modelPath = path.join(OLLAMA_DIR, "models", "manifests", "registry.ollama.ai", "library", MODEL_NAME);
  if (!fs.existsSync(modelPath)) {
    send("download-model", 0);
    await new Promise((resolve, reject) => {
      const pull = spawn(OLLAMA_BIN, ["pull", MODEL_NAME], {
        env: { ...process.env, OLLAMA_MODELS: OLLAMA_DIR }
      });
      pull.stdout.on("data", d => {
        const m = d.toString().match(/(\d+)%/);
        if (m) send("download-model", parseInt(m[1]));
      });
      pull.on("close", resolve);
      pull.on("error", reject);
    });
  }

  send("ready", 100);
  return true;
});

ipcMain.handle("ollama-start", async () => {
  if (!(await ollamaRunning())) await startOllama();
  return true;
});

ipcMain.handle("ollama-analyze", async (_e, prompt) => {
  const resp = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_NAME, prompt, stream: false })
  });
  const json = await resp.json();
  return json.response || "";
});
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

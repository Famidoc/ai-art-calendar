const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const BOUNDS_FILE = path.join(__dirname, 'data', 'window-bounds.json');

function loadBounds() {
  try {
    if (fs.existsSync(BOUNDS_FILE)) {
      return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return { width: 1080, height: 720, alwaysOnTop: false, opacity: 0.98 };
}

function saveBounds(bounds) {
  try {
    const dir = path.dirname(BOUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds, null, 2), 'utf-8');
  } catch (_) {}
}

async function createWindow() {
  // Dynamically import the ES module server
  const { startServer } = await import('./server.mjs');
  const { port } = await startServer(3207);

  const saved = loadBounds();

  mainWindow = new BrowserWindow({
    width: saved.width || 1080,
    height: saved.height || 720,
    x: saved.x,
    y: saved.y,
    minWidth: 780,
    minHeight: 540,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: Boolean(saved.alwaysOnTop),
    opacity: saved.opacity || 0.98,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  const persistState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    saveBounds({
      ...b,
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      opacity: mainWindow.getOpacity()
    });
  };

  mainWindow.on('moved', persistState);
  mainWindow.on('resized', persistState);

  ipcMain.handle('window:toggle-pin', () => {
    if (!mainWindow) return false;
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next, 'normal');
    persistState();
    return next;
  });

  ipcMain.handle('window:set-opacity', (_, val) => {
    if (!mainWindow) return 1;
    const clamped = Math.max(0.4, Math.min(1, Number(val) || 1));
    mainWindow.setOpacity(clamped);
    persistState();
    return clamped;
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:open-images-folder', () => {
    const imgDir = path.join(__dirname, 'images');
    shell.openPath(imgDir);
  });

  ipcMain.handle('window:get-state', () => {
    if (!mainWindow) return { isElectron: true, alwaysOnTop: false, opacity: 1 };
    return {
      isElectron: true,
      alwaysOnTop: mainWindow.isAlwaysOnTop(),
      opacity: mainWindow.getOpacity()
    };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

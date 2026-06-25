const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');

const isDev = !app.isPackaged;

function getBotDir() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return path.join(process.resourcesPath, 'bot');
}

function getEnvPath() {
  return path.join(getBotDir(), '.env');
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function getTrayIcon() {
  const icoPath = path.join(__dirname, 'build', 'icon.ico');
  if (fs.existsSync(icoPath)) {
    return nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 });
  }
  return null;
}

let mainWindow = null;
let tray = null;
let botProcess = null;
let botStatus = 'stopped';
let pendingRestart = false;
let pendingUpdatePath = null;
let closeToTray = true;
let autoStart = false;
let appTheme = 'original';
let firstClose = true;

function loadSettings() {
  try {
    if (fs.existsSync(getSettingsPath())) {
      const data = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
      if (typeof data.closeToTray === 'boolean') closeToTray = data.closeToTray;
      if (typeof data.autoStart === 'boolean') autoStart = data.autoStart;
      if (typeof data.appTheme === 'string') appTheme = data.appTheme;
      if (typeof data.firstClose === 'boolean') firstClose = data.firstClose;
    }
  } catch {}
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify({ closeToTray, autoStart, appTheme, firstClose }, null, 2));
  } catch {}
}

function loadEnv() {
  const envPath = getEnvPath();
  const env = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key) env[key] = value;
      }
    }
  } catch {}
  return env;
}

function saveEnv(settings) {
  const envPath = getEnvPath();
  let content = '# Synk — Music Bot\n';
  content += `DISCORD_TOKEN=${settings.DISCORD_TOKEN || ''}\n`;
  content += `DISCORD_CLIENT_ID=${settings.DISCORD_CLIENT_ID || ''}\n`;
  content += `LOG_LEVEL=${settings.LOG_LEVEL || 'info'}\n`;
  try {
    fs.writeFileSync(envPath, content, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function saveSecureSettings(token, clientId) {
  try {
    const settings = JSON.parse(fs.existsSync(getSettingsPath()) ? fs.readFileSync(getSettingsPath(), 'utf8') : '{}');
    settings.discordToken = token;
    settings.discordClientId = clientId;
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
    return true;
  } catch { return false; }
}

function loadSecureSettings() {
  try {
    if (fs.existsSync(getSettingsPath())) {
      const data = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
      return { token: data.discordToken || '', clientId: data.discordClientId || '' };
    }
  } catch {}
  return { token: '', clientId: '' };
}

function setStatus(status) {
  botStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-change', status);
  }
  if (tray) {
    const contextMenu = buildTrayMenu();
    tray.setContextMenu(contextMenu);
  }
}

function buildTrayMenu() {
  const template = [
    {
      label: 'Show Synk',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: botStatus === 'running' ? 'Stop Bot' : 'Run Bot',
      click: () => {
        if (botStatus === 'running') {
          stopBot();
        } else {
          runBot();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopBot();
        app.isQuitting = true;
        app.quit();
      }
    }
  ];
  return Menu.buildFromTemplate(template);
}

function createTray() {
  const icon = getTrayIcon() || nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Synk — Music Bot');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    resizable: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting && closeToTray) {
      event.preventDefault();
      mainWindow.hide();
      if (firstClose) {
        firstClose = false;
        saveSettings();
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Synk is still running',
            body: 'The application is minimized to the system tray. You can change this behavior in Settings > General.'
          });
          notif.show();
        }
      }
      return;
    }
    app.isQuitting = true;
    stopBot();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function runBot() {
  if (botProcess) {
    return;
  }

  const env = loadEnv();
  if (!env.DISCORD_TOKEN) {
    dialog.showErrorBox('Configuration Required', 'Please set your Discord Bot Token in Settings before running the bot.');
    return;
  }
  if (!env.DISCORD_CLIENT_ID) {
    dialog.showErrorBox('Configuration Required', 'Please set your Discord Client ID in Settings before running the bot.');
    return;
  }

  setStatus('starting');

  const botDir = getBotDir();
  const botScript = path.join(botDir, 'dist', 'index.js');

  if (!fs.existsSync(botScript)) {
    dialog.showErrorBox('Bot Not Found', `Could not find bot entry point at:\n${botScript}\n\nMake sure you have built the bot first (npm run build).`);
    setStatus('stopped');
    return;
  }

  const childEnv = {
    ...process.env,
    DISCORD_TOKEN: env.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
    LOG_LEVEL: env.LOG_LEVEL || 'info'
  };

  const ffmpegDir = isDev ? path.join(__dirname, 'ffmpeg') : path.join(process.resourcesPath, 'ffmpeg');
  if (fs.existsSync(ffmpegDir)) {
    childEnv.PATH = ffmpegDir + ';' + (childEnv.PATH || '');
  }

  botProcess = spawn(process.execPath, [botScript], {
    cwd: botDir,
    env: { ...childEnv, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  botProcess.stdout.on('data', (data) => {
    const lines = data.toString();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-output', lines);
    }
  });

  botProcess.stderr.on('data', (data) => {
    const lines = data.toString();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-output', '[stderr] ' + lines);
    }
  });

  botProcess.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-output', `[error] ${err.message}\n`);
    }
    botProcess = null;
    setStatus('stopped');
    if (pendingRestart) {
      pendingRestart = false;
      setTimeout(() => runBot(), 1000);
    }
  });

  botProcess.on('exit', (code, signal) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-output', `[bot] Process exited (code: ${code}, signal: ${signal})\n`);
    }
    botProcess = null;
    setStatus('stopped');
    if (pendingRestart) {
      pendingRestart = false;
      setTimeout(() => runBot(), 1000);
    }
  });

  setStatus('running');
}

function stopBot() {
  if (!botProcess) return;

  pendingRestart = false;
  setStatus('stopping');

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', botProcess.pid.toString(), '/f', '/t']);
    } else {
      botProcess.kill('SIGTERM');
    }
  } catch {
    botProcess.kill();
  }

  botProcess = null;
  setStatus('stopped');
}

function restartBot() {
  if (botProcess) {
    pendingRestart = true;
    stopBot();
  } else {
    runBot();
  }
}

function checkForUpdates() {
  return new Promise((resolve) => {
    const currentVersion = app.getVersion();
    const repo = 'Axemanhd/Synk';
    const url = `https://api.github.com/repos/${repo}/releases/latest`;

    const req = https.get(url, {
      headers: { 'User-Agent': 'Synk-Desktop', 'Accept': 'application/vnd.github.v3+json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          if (release.tag_name) {
            const latestVersion = release.tag_name.replace(/^v/, '');
            const current = currentVersion.replace(/^v/, '');
            const updateAvailable = compareVersions(latestVersion, current) > 0;
            resolve({
              updateAvailable,
              currentVersion,
              latestVersion: release.tag_name,
              releaseUrl: release.html_url,
              releaseNotes: release.body ? release.body.slice(0, 500) : ''
            });
          } else {
            resolve({ updateAvailable: false, currentVersion, latestVersion: null, error: 'No release found' });
          }
        } catch {
          resolve({ updateAvailable: false, currentVersion, latestVersion: null, error: 'Failed to parse release data' });
        }
      });
    });

    req.on('error', () => {
      resolve({ updateAvailable: false, currentVersion, latestVersion: null, error: 'Could not reach GitHub' });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ updateAvailable: false, currentVersion, latestVersion: null, error: 'Request timed out' });
    });
  });
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

app.whenReady().then(() => {
  loadSettings();
  app.setLoginItemSettings({ openAtLogin: autoStart });
  createTray();
  createWindow();

  ipcMain.handle('get-status', () => botStatus);

  ipcMain.handle('run-bot', () => {
    runBot();
    return botStatus;
  });

  ipcMain.handle('stop-bot', () => {
    stopBot();
    return botStatus;
  });

  ipcMain.handle('restart-bot', () => {
    restartBot();
    return botStatus;
  });

  ipcMain.handle('load-settings', () => {
    const env = loadEnv();
    const secure = loadSecureSettings();
    if (secure.token && !env.DISCORD_TOKEN) env.DISCORD_TOKEN = secure.token;
    if (secure.clientId && !env.DISCORD_CLIENT_ID) env.DISCORD_CLIENT_ID = secure.clientId;
    return {
      env,
      preferences: { closeToTray, autoStart, theme: appTheme, firstClose }
    };
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    const ok = saveEnv(settings);
    saveSecureSettings(settings.DISCORD_TOKEN, settings.DISCORD_CLIENT_ID);
    return ok;
  });

  ipcMain.handle('set-preference', (_event, key, value) => {
    if (key === 'closeToTray') {
      closeToTray = value;
      saveSettings();
      return true;
    }
    if (key === 'autoStart') {
      autoStart = value;
      app.setLoginItemSettings({ openAtLogin: value });
      saveSettings();
      return true;
    }
    if (key === 'theme') {
      appTheme = value;
      saveSettings();
      return true;
    }
    return false;
  });

  ipcMain.handle('check-for-updates', () => {
    return checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    try {
      const repo = 'Axemanhd/Synk';
      const releaseUrl = `https://api.github.com/repos/${repo}/releases/latest`;
      const release = await new Promise((resolve, reject) => {
        https.get(releaseUrl, {
          headers: { 'User-Agent': 'Synk-Desktop', 'Accept': 'application/vnd.github.v3+json' }
        }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve(JSON.parse(data)));
          res.on('error', reject);
        }).on('error', reject);
      });

      const exeAsset = release.assets.find((a) => a.name.endsWith('.exe') && a.name.includes('Setup'));
      if (!exeAsset) return { error: 'No installer found in release' };

      const downloadPath = path.join(app.getPath('downloads'), exeAsset.name);
      const file = fs.createWriteStream(downloadPath);
      const totalSize = exeAsset.size;

      await new Promise((resolve, reject) => {
        https.get(exeAsset.browser_download_url, {
          headers: { 'User-Agent': 'Synk-Desktop', 'Accept': 'application/octet-stream' }
        }, (res) => {
          if (res.statusCode === 302) {
            https.get(res.headers.location, {
              headers: { 'User-Agent': 'Synk-Desktop' }
            }, (redirectRes) => {
              let downloaded = 0;
              redirectRes.on('data', (chunk) => {
                downloaded += chunk.length;
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('download-progress', { downloaded, total: totalSize });
                }
              });
              redirectRes.pipe(file);
              redirectRes.on('end', () => { file.end(); resolve(downloadPath); });
              redirectRes.on('error', reject);
            }).on('error', reject);
            return;
          }
          let downloaded = 0;
          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-progress', { downloaded, total: totalSize });
            }
          });
          res.pipe(file);
          res.on('end', () => { file.end(); resolve(downloadPath); });
          res.on('error', reject);
        }).on('error', reject);
      });

      return { path: downloadPath };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('install-update', async (_event, filePath) => {
    stopBot();
    pendingUpdatePath = filePath;
    app.isQuitting = true;
    if (mainWindow) mainWindow.close();
    return true;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBot();
});

app.on('will-quit', () => {
  if (pendingUpdatePath) {
    try {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '', pendingUpdatePath], { detached: true, stdio: 'ignore' });
      }
    } catch {}
  }
});

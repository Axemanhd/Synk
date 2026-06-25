const api = window.synkAPI;

// DOM refs
const tabs = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');
const logOutput = document.getElementById('log-output');
const btnClearLog = document.getElementById('btn-clear-log');
const btnSaveSettings = document.getElementById('btn-save-settings');
const saveStatus = document.getElementById('save-status');
const inputToken = document.getElementById('input-token');
const inputClientId = document.getElementById('input-client-id');
const inputLogLevel = document.getElementById('input-log-level');
const inputCloseToTray = document.getElementById('input-close-to-tray');
const inputAutoStart = document.getElementById('input-auto-start');
const btnToggleToken = document.getElementById('btn-toggle-token');
const updateBar = document.getElementById('update-bar');
const currentVersion = document.getElementById('current-version');
const btnCheckUpdates = document.getElementById('btn-check-updates');
const updateResult = document.getElementById('update-result');
const btnDownloadUpdate = document.getElementById('btn-download-update');
const downloadProgressBar = document.getElementById('download-progress-bar');
const downloadProgressFill = document.getElementById('download-progress-fill');

let autoScroll = true;

// Tab navigation
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Status updates
function updateUI(status) {
  statusIndicator.className = 'status-' + status;
  const labels = { stopped: 'Stopped', starting: 'Starting...', running: 'Running', stopping: 'Stopping...' };
  statusText.textContent = labels[status] || status;
  btnRun.disabled = status === 'running' || status === 'starting';
  btnStop.disabled = status !== 'running';
  btnRestart.disabled = status === 'starting' || status === 'stopping';
}

api.onStatusChange((status) => {
  updateUI(status);
});

// Log output
api.onLogOutput((data) => {
  logOutput.textContent += data;
  if (autoScroll) {
    logOutput.scrollTop = logOutput.scrollHeight;
  }
});

btnClearLog.addEventListener('click', () => {
  logOutput.textContent = '';
});

// Auto-scroll on any scroll action
logOutput.addEventListener('scroll', () => {
  const atBottom = logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight < 30;
  autoScroll = atBottom;
});

// Bot controls
btnRun.addEventListener('click', async () => {
  btnRun.disabled = true;
  updateUI('starting');
  await api.runBot();
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await api.stopBot();
});

btnRestart.addEventListener('click', async () => {
  btnRestart.disabled = true;
  await api.restartBot();
});

// Token show/hide
let tokenVisible = false;
btnToggleToken.addEventListener('click', () => {
  tokenVisible = !tokenVisible;
  inputToken.type = tokenVisible ? 'text' : 'password';
  btnToggleToken.textContent = tokenVisible ? 'Hide' : 'Show';
});

// Settings
async function loadSettings() {
  const data = await api.loadSettings();
  const env = data.env || {};
  inputToken.value = env.DISCORD_TOKEN || '';
  inputClientId.value = env.DISCORD_CLIENT_ID || '';
  if (env.LOG_LEVEL) {
    inputLogLevel.value = env.LOG_LEVEL;
  }
  inputCloseToTray.checked = data.preferences.closeToTray !== false;
  inputAutoStart.checked = data.preferences.autoStart === true;
}

btnSaveSettings.addEventListener('click', async () => {
  const settings = {
    DISCORD_TOKEN: inputToken.value.trim(),
    DISCORD_CLIENT_ID: inputClientId.value.trim(),
    LOG_LEVEL: inputLogLevel.value
  };
  if (!settings.DISCORD_TOKEN) {
    saveStatus.textContent = 'Token is required!';
    saveStatus.style.color = '#e74c3c';
    return;
  }
  if (!settings.DISCORD_CLIENT_ID) {
    saveStatus.textContent = 'Client ID is required!';
    saveStatus.style.color = '#e74c3c';
    return;
  }
  const ok = await api.saveSettings(settings);
  if (ok) {
    saveStatus.textContent = 'Saved successfully!';
    saveStatus.style.color = '#2ecc71';
  } else {
    saveStatus.textContent = 'Failed to save!';
    saveStatus.style.color = '#e74c3c';
  }
  setTimeout(() => { saveStatus.textContent = ''; }, 3000);
});

inputCloseToTray.addEventListener('change', async () => {
  await api.setPreference('closeToTray', inputCloseToTray.checked);
});

inputAutoStart.addEventListener('change', async () => {
  await api.setPreference('autoStart', inputAutoStart.checked);
});

// Open links in browser
document.querySelectorAll('.fake-link').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const url = el.dataset.url;
    if (url) {
      api.openExternal(url);
    }
  });
});

// Updates
let updateReleaseUrl = null;

async function checkUpdates() {
  const info = await api.checkForUpdates();
  currentVersion.textContent = info.currentVersion || '-';

  if (info.updateAvailable) {
    updateBar.className = 'visible';
    updateBar.innerHTML = `<span class="update-link" id="update-release-link">Update available: ${info.latestVersion}</span>`;
    const link = document.getElementById('update-release-link');
    if (link) {
      link.addEventListener('click', () => {
        if (info.releaseUrl) api.openExternal(info.releaseUrl);
      });
    }
    updateReleaseUrl = info.releaseUrl;
    btnDownloadUpdate.style.display = 'inline-block';
    btnCheckUpdates.textContent = 'Update Available';
    btnCheckUpdates.className = 'btn btn-success';
    updateResult.textContent = `${info.latestVersion} available`;
    updateResult.style.color = '#f0a500';
    downloadProgressBar.style.display = 'none';
  } else if (info.error) {
    updateBar.className = '';
    btnDownloadUpdate.style.display = 'none';
    btnCheckUpdates.textContent = 'Check for Updates';
    btnCheckUpdates.className = 'btn btn-primary';
    updateResult.textContent = 'Unable to check';
    updateResult.style.color = '#888';
    downloadProgressBar.style.display = 'none';
  } else {
    updateBar.className = '';
    btnDownloadUpdate.style.display = 'none';
    btnCheckUpdates.textContent = 'Check for Updates';
    btnCheckUpdates.className = 'btn btn-primary';
    updateResult.textContent = 'Up to date';
    updateResult.style.color = '#2ecc71';
    downloadProgressBar.style.display = 'none';
  }
}

btnCheckUpdates.addEventListener('click', async () => {
  updateResult.textContent = 'Checking...';
  updateResult.style.color = '#888';
  btnCheckUpdates.disabled = true;
  await checkUpdates();
  btnCheckUpdates.disabled = false;
});

btnDownloadUpdate.addEventListener('click', async () => {
  btnDownloadUpdate.disabled = true;
  updateResult.textContent = 'Downloading...';
  updateResult.style.color = '#f0a500';
  downloadProgressBar.style.display = 'block';
  downloadProgressFill.style.width = '0%';

  api.onDownloadProgress(({ downloaded, total }) => {
    const pct = Math.round((downloaded / total) * 100);
    downloadProgressFill.style.width = pct + '%';
    updateResult.textContent = `Downloading... ${pct}%`;
  });

  const result = await api.downloadUpdate();

  if (result.error) {
    updateResult.textContent = 'Download failed: ' + result.error;
    updateResult.style.color = '#e74c3c';
    btnDownloadUpdate.disabled = false;
  } else {
    updateResult.textContent = 'Downloaded. Launching installer...';
    updateResult.style.color = '#2ecc71';
    await api.openFile(result.path);
  }
});

// Init
(async function init() {
  const status = await api.getStatus();
  updateUI(status);
  await loadSettings();
  checkUpdates();
})();

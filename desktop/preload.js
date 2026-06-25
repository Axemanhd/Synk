const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('synkAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  runBot: () => ipcRenderer.invoke('run-bot'),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  restartBot: () => ipcRenderer.invoke('restart-bot'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  setPreference: (key, value) => ipcRenderer.invoke('set-preference', key, value),
  onLogOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('log-output', handler);
    return () => ipcRenderer.removeListener('log-output', handler);
  },
  onStatusChange: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('status-change', handler);
    return () => ipcRenderer.removeListener('status-change', handler);
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openExternal: (url) => shell.openExternal(url)
});

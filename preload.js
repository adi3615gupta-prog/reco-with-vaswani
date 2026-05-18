const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto-updater communication methods
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_event, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (_event, progressObj) => callback(progressObj)),
  downloadUpdate: () => ipcRenderer.invoke('download_update'),
  restartApp: () => ipcRenderer.invoke('restart_app'),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto-updater communication methods
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_event, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (_event, progressObj) => callback(progressObj)),
  checkForUpdates: () => ipcRenderer.invoke('check_for_updates'),
  downloadUpdate: () => ipcRenderer.invoke('download_update'),
  restartApp: () => ipcRenderer.invoke('restart_app'),
  
  // Tally Integration
  fetchTallyData: (port, xmlPayload) => ipcRenderer.invoke('fetch_tally_data', { port, xmlPayload }),

  // Generic Invoke for IPC handles
  invoke: (channel, data) => ipcRenderer.invoke(channel, data)
});

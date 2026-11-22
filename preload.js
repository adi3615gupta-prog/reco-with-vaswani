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

  // Folder Picker Dialog
  selectFolder: (defaultPath) => ipcRenderer.invoke('select_folder', defaultPath),

  // Windows Background Auto-Start & System Tray
  getStartupSettings: () => ipcRenderer.invoke('get_startup_settings'),
  setStartupSettings: (enabled) => ipcRenderer.invoke('set_startup_settings', enabled),

  // Universal Desktop Copilot IPC
  resizeCopilot: (expanded) => ipcRenderer.send('resize_copilot', { expanded }),
  toggleCopilot: () => ipcRenderer.send('toggle_copilot'),
  onCopilotToggleState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('copilot_toggle_state', handler);
    return () => ipcRenderer.removeListener('copilot_toggle_state', handler);
  },

  // Bidirectional App Navigation Bridge ("Loco Pilot")
  navigateApp: (data) => ipcRenderer.send('navigate_app', data),
  onAppNavigate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app_navigate', handler);
    return () => ipcRenderer.removeListener('app_navigate', handler);
  },

  // Explicit App Mode, Activation & LAN Discovery IPC methods
  getAppMode: () => ipcRenderer.invoke('get_app_mode'),
  setAppMode: (mode) => ipcRenderer.invoke('set_app_mode', mode),
  saveActivationInfo: (info) => ipcRenderer.invoke('save_activation_info', info),
  scanNetwork: () => ipcRenderer.invoke('scan_network'),
  getSystemInfo: () => ipcRenderer.invoke('get_system_info'),
  getDeviceId: () => ipcRenderer.invoke('get_device_id')
});

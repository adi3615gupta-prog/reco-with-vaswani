const { app, BrowserWindow, dialog, ipcMain, Tray, Menu, screen, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');
const os = require('os');
const dns = require('dns');

// Prioritize IPv4 for DNS resolution to avoid localhost lookup issues on Windows
dns.setDefaultResultOrder('ipv4first');

// Global logger to help diagnose startup failures
let mainLogPath = null;
function logMain(message) {
  if (!mainLogPath) {
    try {
      mainLogPath = path.join(app.getPath('userData'), 'main.log');
    } catch (e) {
      console.error('Failed to get userData path for logMain:', e);
      return;
    }
  }
  try {
    fs.appendFileSync(mainLogPath, `[${new Date().toISOString()}] ${message}\n`);
    console.log(message);
  } catch (e) {
    console.error('Failed to write to main.log:', e);
  }
}


// Fix for white screen / "Not an electron process" errors
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.log('Unsetting ELECTRON_RUN_AS_NODE to fix process initialization...');
  delete process.env.ELECTRON_RUN_AS_NODE;
}

// Single-instance lock to ensure background service and tray don't launch duplicates
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logMain('Another instance of AUDIT WITH VASWANI is already running. Quitting duplicate instance.');
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    logMain('Second instance launch intercepted. Restoring and focusing mainWindow.');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Global reference for updater
let autoUpdater = null;

function initializeUpdater() {
  try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;
    autoUpdater.logger = require('electron-log');
    autoUpdater.logger.transports.file.level = 'info';
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Auto-updater events
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });

    autoUpdater.on('update-available', (info) => {
      sendUpdateStatus('update_available', info);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available. It will be downloaded in the background.`,
        buttons: ['OK']
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      sendUpdateStatus('update_downloaded', info);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart the application to apply the update.',
        buttons: ['Restart Now', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      sendUpdateStatus('download_progress', progressObj);
    });

    console.log('Auto-updater initialized successfully');
  } catch (err) {
    console.error('Failed to initialize auto-updater:', err);
  }
}

let mainWindow = null;
let copilotWindow = null;
let tray = null;
let isQuitting = false;
let backendProcess = null;
let currentAppMode = 'server';
const BACKEND_PORT = 3001; // Single port — Express serves both API and frontend

// Helper to resolve app icon across development and packaged builds
function getAppIconPath() {
  const candidates = [
    path.join(__dirname, 'public/icons/icon-192x192.png'),
    path.join(__dirname, 'public/favicon.png'),
    path.join(__dirname, 'dist/favicon.png'),
    path.join(__dirname, 'public/logo.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startBackendServer(serverJsPath) {
  try {
    logMain(`startBackendServer called with path: ${serverJsPath}`);
    const logFilePath = path.join(app.getPath('userData'), 'backend.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    
    logStream.write(`\n--- Starting backend server process at ${new Date().toISOString()} ---\n`);
    logStream.write(`Server path: ${serverJsPath}\n`);
    logStream.write(`User data path: ${app.getPath('userData')}\n`);
    logStream.write(`Node execPath: ${process.execPath}\n`);
    logStream.write(`Process env keys count: ${Object.keys(process.env).length}\n`);

    logMain('Forking backend process...');
    backendProcess = fork(serverJsPath, [], {
      env: { ...process.env, USER_DATA_PATH: app.getPath('userData') },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    logMain(`Backend process spawned with PID: ${backendProcess.pid}`);
    
    backendProcess.stdout.on('data', (data) => {
      logStream.write(`[STDOUT] ${data}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      logStream.write(`[STDERR] ${data}`);
    });

    backendProcess.on('error', (err) => {
      logMain(`Backend Process Error Event: ${err.message}`);
      console.error('Backend Process Error:', err);
      logStream.write(`[ERROR] Backend process error: ${err.stack || err.message || err}\n`);
    });

    backendProcess.on('close', (code, signal) => {
      logMain(`Backend Process Close Event: code=${code}, signal=${signal}`);
      logStream.write(`[CLOSE] Backend process closed with code ${code} and signal ${signal}\n`);
    });

    logMain('Started backend server process listeners successfully');
  } catch (err) {
    logMain(`Failed to fork backend process catch block: ${err.stack || err.message}`);
    console.error('Failed to fork backend process:', err);
  }
}


const sendUpdateStatus = (channel, payload) => {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
};

/**
 * Wait for the Express backend server to be ready before loading the window.
 * Polls the /api/ping endpoint until it responds.
 */
function waitForBackend(port, timeoutMs = 45000) {
  logMain(`waitForBackend initiated. Port: ${port}, Timeout: ${timeoutMs}ms`);
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let attempt = 0;
    const check = () => {
      attempt++;
      logMain(`waitForBackend ping attempt #${attempt} to http://127.0.0.1:${port}/api/ping`);
      const req = http.get(`http://127.0.0.1:${port}/api/ping`, { timeout: 1000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          logMain(`waitForBackend received status ${res.statusCode} from attempt #${attempt}`);
          if (res.statusCode === 200) {
            logMain(`waitForBackend connection successful on attempt #${attempt} (status 200)!`);
            resolve();
            return;
          }
          try {
            const json = JSON.parse(data);
            if (json.success || json.status === 'ok') {
              logMain(`waitForBackend connection successful on attempt #${attempt}!`);
              resolve();
              return;
            }
          } catch (e) {
            logMain(`waitForBackend parsing failed on attempt #${attempt}: ${e.message}`);
          }
          retry();
        });
      });
      req.on('error', (err) => {
        logMain(`waitForBackend ping error on attempt #${attempt}: ${err.message}`);
        retry();
      });
      req.on('timeout', () => {
        logMain(`waitForBackend ping timeout on attempt #${attempt}`);
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        logMain(`waitForBackend TIMED OUT after ${elapsed}ms`);
        reject(new Error(`Backend did not start within ${timeoutMs}ms`));
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

async function getFrontendBaseUrl() {
  // 1. Check if Vite dev server on 8080 is active (e.g. during development / npm run electron:dev)
  const isDevRunning = await new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8080', { timeout: 800 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });

  if (isDevRunning) {
    logMain('Vite dev server detected on http://localhost:8080');
    return 'http://localhost:8080';
  }

  // 2. Client mode in packaged app
  if (currentAppMode === 'client') {
    return `file://${path.join(__dirname, 'dist/index.html')}`;
  }

  // 3. Normal server mode: wait for local Express backend server on port 3001
  await waitForBackend(BACKEND_PORT);
  return `http://localhost:${BACKEND_PORT}`;
}

async function createWindow(appMode = currentAppMode) {
  const isHiddenLaunch = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
  logMain(`createWindow called. isHiddenLaunch: ${isHiddenLaunch}`);

  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: !isHiddenLaunch,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Re-enabled for security (was dangerously set to false)
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath,
    backgroundColor: '#090d18'
  });

  // Intercept window close to minimize to tray instead of killing the background server
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      logMain('mainWindow close intercepted: minimized to background System Tray.');
      return false;
    }
    logMain('mainWindow closing for app quit.');
  });

  try {
    const baseUrl = await getFrontendBaseUrl();
    logMain(`Loading mainWindow from: ${baseUrl}`);
    if (baseUrl.startsWith('file://')) {
      await mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    } else {
      await mainWindow.loadURL(baseUrl);
    }
    logMain('mainWindow loaded successfully');
  } catch (error) {
    logMain(`Failed to start app: ${error.stack || error.message}`);
    const logFilePath = path.join(app.getPath('userData'), 'backend.log');
    const mainLogFilePath = path.join(app.getPath('userData'), 'main.log');
    let logSnippet = 'No backend log file found.';
    let mainLogSnippet = 'No main log file found.';
    try {
      if (fs.existsSync(logFilePath)) {
        logSnippet = fs.readFileSync(logFilePath, 'utf8').slice(-1500); // last 1500 chars
      }
    } catch (e) {
      logSnippet = `Could not read log file: ${e.message}`;
    }
    try {
      if (fs.existsSync(mainLogFilePath)) {
        mainLogSnippet = fs.readFileSync(mainLogFilePath, 'utf8').slice(-1500); // last 1500 chars
      }
    } catch (e) {
      mainLogSnippet = `Could not read main log file: ${e.message}`;
    }
    dialog.showErrorBox(
      'Application Failed to Start',
      `Could not load the application.\n\nError: ${error.message}\nWorking directory: ${__dirname}\n\n--- ELECTRON MAIN LOGS ---\n${mainLogSnippet}\n\n--- BACKEND LOGS ---\n${logSnippet}`
    );
    app.quit();
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Web content failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('Web contents crashed');
  });
  
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`Renderer console [${level}]: ${message}`);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Web content loaded successfully');
  });
}

function updateTrayContextMenu() {
  if (!tray) return;
  try {
    const loginSettings = app.getLoginItemSettings();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open AUDIT WITH VASWANI',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Toggle Sourav AI Copilot (Ctrl+Alt+S)',
        click: () => {
          toggleCopilotWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Start with Windows (Background)',
        type: 'checkbox',
        checked: loginSettings.openAtLogin,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            openAsHidden: true,
            args: ['--hidden']
          });
          logMain(`System Tray context menu: openAtLogin set to ${menuItem.checked}`);
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Completely',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  } catch (err) {
    logMain(`updateTrayContextMenu error: ${err.message}`);
  }
}

function createTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  if (!iconPath) {
    logMain('Warning: No icon available for System Tray');
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('AUDIT WITH VASWANI — Enterprise Compliance & Sourav AI');
    updateTrayContextMenu();

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    logMain('System Tray created successfully');
  } catch (err) {
    logMain(`createTray error: ${err.message}`);
  }
}

async function createCopilotWindow() {
  if (copilotWindow) return;

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    
    // Initial compact floating orb at bottom right
    const orbSize = 64;
    const initialX = Math.max(0, screenW - orbSize - 24);
    const initialY = Math.max(0, screenH - orbSize - 40);

    const iconPath = getAppIconPath();

    copilotWindow = new BrowserWindow({
      width: orbSize,
      height: orbSize,
      x: initialX,
      y: initialY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    copilotWindow.setAlwaysOnTop(true, 'screen-saver');
    copilotWindow.setVisibleOnAllWorkspaces(true);

    const baseUrl = await getFrontendBaseUrl();
    const copilotUrl = baseUrl.startsWith('file://')
      ? `${baseUrl}#/copilot-desktop`
      : `${baseUrl}/#/copilot-desktop`;

    logMain(`Loading copilotWindow from: ${copilotUrl}`);
    await copilotWindow.loadURL(copilotUrl);

    copilotWindow.on('closed', () => {
      copilotWindow = null;
    });

    logMain('copilotWindow created and loaded successfully (always-on-top desktop overlay)');
  } catch (err) {
    logMain(`createCopilotWindow error: ${err.message}`);
  }
}

async function toggleCopilotWindow() {
  if (!copilotWindow) {
    await createCopilotWindow();
    return;
  }
  if (!copilotWindow.isVisible()) {
    copilotWindow.show();
  }
  copilotWindow.focus();
  copilotWindow.webContents.send('copilot_toggle_state');
}

function registerGlobalHotkeys() {
  try {
    const hotkeys = ['CommandOrControl+Alt+S', 'CommandOrControl+Shift+S'];
    for (const hotkey of hotkeys) {
      try {
        const registered = globalShortcut.register(hotkey, () => {
          logMain(`Global hotkey ${hotkey} triggered.`);
          toggleCopilotWindow();
        });
        if (registered) {
          logMain(`Global hotkey ${hotkey} registered successfully.`);
        } else {
          logMain(`Could not register global hotkey ${hotkey}`);
        }
      } catch (e) {
        logMain(`Error registering ${hotkey}: ${e.message}`);
      }
    }
  } catch (err) {
    logMain(`registerGlobalHotkeys error: ${err.message}`);
  }
}

app.whenReady().then(async () => {
  logMain('app.whenReady triggered');
  
  let serverJsPath = path.join(__dirname, 'server.obfuscated.cjs');
  logMain(`Checking for server.obfuscated.cjs at: ${serverJsPath}`);
  let exists = fs.existsSync(serverJsPath);
  logMain(`server.obfuscated.cjs exists: ${exists}`);
  if (!exists) {
    serverJsPath = path.join(__dirname, 'server.js');
    logMain(`Checking for server.js at: ${serverJsPath}`);
    exists = fs.existsSync(serverJsPath);
    logMain(`server.js exists: ${exists}`);
  }
  
  const modeFilePath = path.join(app.getPath('userData'), 'app_mode.json');
  let appMode = 'server';
  if (fs.existsSync(modeFilePath)) {
    try { 
      appMode = JSON.parse(fs.readFileSync(modeFilePath)).mode; 
      logMain(`Loaded appMode from config: ${appMode}`);
    } catch (e) {
      logMain(`Error parsing app_mode.json: ${e.message}`);
    }
  } else {
    logMain(`app_mode.json not found, defaulting appMode to: ${appMode}`);
  }
  
  currentAppMode = appMode;

  if (appMode !== 'client' && exists) {
    logMain('Triggering startBackendServer...');
    startBackendServer(serverJsPath);
  } else if (appMode === 'client') {
    logMain('Running in CLIENT mode. Backend server bypassed.');
  } else {
    logMain(`Error: Backend server script not found! Path check was: ${serverJsPath}`);
  }

  createTray();
  await createWindow(currentAppMode);
  await createCopilotWindow();
  registerGlobalHotkeys();

  // Initialize updater after window is ready
  initializeUpdater();
  
  // Check for updates after window opens
  if (autoUpdater) {
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
          console.error('Error checking for updates:', err);
        });
      } catch (err) {
        console.error('Synchronous error checking for updates:', err);
      }
    }, 3000);
  }
});

ipcMain.handle('select_folder', async (_event, defaultPath) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const options = {
    title: 'Select Centralized Returns & Client Storage Folder',
    properties: ['openDirectory', 'createDirectory']
  };
  if (defaultPath && typeof defaultPath === 'string') {
    const clean = defaultPath.replace(/^["']|["']$/g, '').trim();
    if (fs.existsSync(clean)) options.defaultPath = clean;
  }
  const result = await dialog.showOpenDialog(win, options);
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return { success: true, folderPath: result.filePaths[0] };
  }
  return { success: false, canceled: true };
});

ipcMain.handle('check_for_updates', () => {
  if (!autoUpdater) return null;
  try {
    return autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('Error in manual update check:', err);
    return null;
  }
});

ipcMain.handle('download_update', () => {
  if (!autoUpdater) return null;
  return autoUpdater.downloadUpdate();
});

ipcMain.handle('restart_app', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('get_app_mode', () => {
  const modeFilePath = path.join(app.getPath('userData'), 'app_mode.json');
  if (fs.existsSync(modeFilePath)) {
    try { 
      const mode = JSON.parse(fs.readFileSync(modeFilePath)).mode;
      if (mode) return mode;
    } catch (e) {}
  }
  return 'server';
});

ipcMain.handle('set_app_mode', (event, mode) => {
  const modeFilePath = path.join(app.getPath('userData'), 'app_mode.json');
  fs.writeFileSync(modeFilePath, JSON.stringify({ mode }));
  
  // Kill backend if switching to client or null (factory reset)
  if ((mode === 'client' || mode === null) && backendProcess) {
    backendProcess.kill();
    backendProcess = null;
    console.log('Backend process killed due to mode switch to', mode);
  }
  
  // Start backend if switching to server and it's not running
  if (mode === 'server' && !backendProcess) {
    let serverJsPath = path.join(__dirname, 'server.obfuscated.cjs');
    if (!fs.existsSync(serverJsPath)) {
      serverJsPath = path.join(__dirname, 'server.js');
    }
    if (fs.existsSync(serverJsPath)) {
      console.log('Dynamically starting backend server process...');
      startBackendServer(serverJsPath);
    }
  }
  
  return true;
});

ipcMain.handle('save_activation_info', (event, info) => {
  try {
    const userDataDir = app.getPath('userData');
    const appDir = path.dirname(process.execPath);
    
    // Save activation_info.json in AppData
    const actPathUserData = path.join(userDataDir, 'activation_info.json');
    fs.writeFileSync(actPathUserData, JSON.stringify(info, null, 2));
    
    // Save activation_info.json in installation directory (appDir) if writable
    try {
      const actPathApp = path.join(appDir, 'activation_info.json');
      fs.writeFileSync(actPathApp, JSON.stringify(info, null, 2));
    } catch(e) {}

    // Define the PowerShell script contents
    const psScript = `$actFile = Join-Path $PSScriptRoot "activation_info.json"
if (-Not (Test-Path $actFile)) {
    $actFile = Join-Path $env:APPDATA "AUDIT WITH VASWANI\\activation_info.json"
}
if (-Not (Test-Path $actFile)) {
    $actFile = Join-Path $env:APPDATA "RECO WITH VASWANI\\activation_info.json"
}
if (-Not (Test-Path $actFile)) {
    $actFile = Join-Path $env:APPDATA "com.vite.react.shadcn.ts\\activation_info.json"
}
if (Test-Path $actFile) {
    try {
        $info = Get-Content $actFile -Raw | ConvertFrom-Json
        if ($info.serial_key) {
            $body = @{
                fields = @{
                    device_id = @{ nullValue = $null }
                    bound_mac = @{ nullValue = $null }
                }
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Method Patch -Uri "https://firestore.googleapis.com/v1/projects/reco-vaswani-license/databases/(default)/documents/serial_keys/$($info.serial_key)?updateMask.fieldPaths=device_id&updateMask.fieldPaths=bound_mac" -ContentType "application/json" -Body $body -ErrorAction SilentlyContinue | Out-Null
        }
        if ($info.user_doc_id) {
            $body = @{
                fields = @{
                    device_id = @{ nullValue = $null }
                    status = @{ stringValue = "offline" }
                }
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Method Patch -Uri "https://firestore.googleapis.com/v1/projects/reco-vaswani-license/databases/(default)/documents/network_users/$($info.user_doc_id)?updateMask.fieldPaths=device_id&updateMask.fieldPaths=status" -ContentType "application/json" -Body $body -ErrorAction SilentlyContinue | Out-Null
        }
    } catch {}
}`;

    // Save uninstall_unbind.ps1 in installation directory (appDir)
    try {
      const psPathApp = path.join(appDir, 'uninstall_unbind.ps1');
      fs.writeFileSync(psPathApp, psScript);
    } catch(e) {}
    
    // Also save in AppData for backup
    try {
      const psPathUserData = path.join(userDataDir, 'uninstall_unbind.ps1');
      fs.writeFileSync(psPathUserData, psScript);
    } catch(e) {}

    return true;
  } catch(err) {
    console.error("save_activation_info error:", err);
    return false;
  }
});

ipcMain.handle('scan_network', async () => {
  return new Promise((resolve) => {
    const interfaces = os.networkInterfaces();
    let localIp = null;
    let subnet = null;
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') {
                localIp = iface.address;
                const parts = localIp.split('.');
                subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
                break;
            }
        }
        if (subnet) break;
    }

    if (!subnet) return resolve(null);

    let activeServers = [];
    let pending = 255;
    let timeout = setTimeout(() => resolve(activeServers[0] || null), 2000); // 2 second max timeout

    for (let i = 1; i <= 255; i++) {
        const ip = `${subnet}.${i}`;
        const req = http.get(`http://${ip}:3001/api/ping`, { timeout: 1000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.isServer) activeServers.push({ ip, pcName: json.pcName });
                } catch (e) {}
                checkDone();
            });
        }).on('error', () => checkDone()).on('timeout', () => { req.destroy(); checkDone(); });
        
        function checkDone() {
            pending--;
            if (pending === 0) {
                clearTimeout(timeout);
                resolve(activeServers[0] || null);
            }
        }
    }
  });
});

// --- Tally Integration ---
ipcMain.handle('fetch_tally_data', async (event, { port = 9000, xmlPayload }) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    });

    req.on('error', (e) => {
      console.error(`Tally request error: ${e.message}`);
      reject(e.message);
    });

    req.write(xmlPayload);
    req.end();
  });
});

// --- Windows Auto-Start & Desktop Copilot IPC ---
ipcMain.handle('get_startup_settings', () => {
  try {
    const settings = app.getLoginItemSettings();
    return {
      openAtLogin: settings.openAtLogin,
      openAsHidden: settings.openAsHidden
    };
  } catch (err) {
    return { openAtLogin: false, openAsHidden: false };
  }
});

ipcMain.handle('set_startup_settings', (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
      args: ['--hidden']
    });
    logMain(`set_startup_settings: openAtLogin set to ${!!enabled}`);
    updateTrayContextMenu();
    return { success: true, openAtLogin: !!enabled };
  } catch (err) {
    logMain(`set_startup_settings failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.on('resize_copilot', (_event, { expanded }) => {
  if (!copilotWindow) return;
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    if (expanded) {
      const width = 420;
      const height = 640;
      copilotWindow.setBounds({
        x: Math.max(0, screenW - width - 20),
        y: Math.max(0, screenH - height - 30),
        width,
        height
      });
    } else {
      const orbSize = 64;
      copilotWindow.setBounds({
        x: Math.max(0, screenW - orbSize - 24),
        y: Math.max(0, screenH - orbSize - 40),
        width: orbSize,
        height: orbSize
      });
    }
  } catch (e) {
    logMain(`resize_copilot error: ${e.message}`);
  }
});

ipcMain.on('toggle_copilot', () => {
  toggleCopilotWindow();
});

ipcMain.on('navigate_app', (_event, data) => {
  logMain(`navigate_app bridge invoked: ${JSON.stringify(data)}`);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('app_navigate', data);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}
  if (backendProcess) backendProcess.kill();
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}
});

app.on('window-all-closed', () => {
  // If tray is active on Windows, do NOT quit on window close — keep running in background!
  if (isQuitting || process.platform === 'darwin') {
    if (backendProcess) backendProcess.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

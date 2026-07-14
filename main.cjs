const { app, BrowserWindow, dialog, ipcMain } = require('electron');
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
let backendProcess = null;
let currentAppMode = 'server';
const BACKEND_PORT = 3001; // Single port — Express serves both API and frontend

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
          try {
            const json = JSON.parse(data);
            if (json.success) {
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

async function createWindow(appMode = currentAppMode) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Re-enabled for security (was dangerously set to false)
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public/icon.png'),
    backgroundColor: '#090d18'
  });

  try {
    if (appMode !== 'client') {
      logMain('createWindow: waiting for backend ready status...');
      // Wait for the Express backend (started in app.whenReady) to be ready
      await waitForBackend(BACKEND_PORT);
      logMain(`Backend ready. Loading app from http://localhost:${BACKEND_PORT}`);
      await mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
    } else {
      logMain('createWindow: CLIENT mode. Loading index.html from local files...');
      await mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    }
    logMain('App loaded successfully');
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

app.whenReady().then(() => {
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

  createWindow(currentAppMode);

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
    try { return JSON.parse(fs.readFileSync(modeFilePath)).mode; } catch (e) {}
  }
  return null;
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

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});

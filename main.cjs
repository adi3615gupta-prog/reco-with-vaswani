const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');
const os = require('os');

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

let server = null;
let serverPort = 8080;
let mainWindow = null;
let backendProcess = null;

const sendUpdateStatus = (channel, payload) => {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, 'dist');
    
    // Check if dist folder exists
    if (!fs.existsSync(distPath)) {
      reject(new Error('dist folder not found'));
      return;
    }
    
    const server = http.createServer((req, res) => {
      let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
      
      // Get file extension
      const extname = String(path.extname(filePath)).toLowerCase();
      
      // Content type map
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'application/font-woff',
        '.woff2': 'application/font-woff2',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf'
      };
      
      const contentType = mimeTypes[extname] || 'application/octet-stream';
      
      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - File Not Found</h1>', 'utf-8');
          } else {
            res.writeHead(500);
            res.end('Server Error: ' + error.code, 'utf-8');
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });
    
    // Try to start server on port 8080, increment if taken
    function tryStart(port) {
      server.listen(port, () => {
        console.log(`Local server running on http://localhost:${port}`);
        resolve({ server, port });
      });
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 8090) {
          tryStart(port + 1);
        } else {
          reject(err);
        }
      });
    }
    
    tryStart(serverPort);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public/icon.png'),
    backgroundColor: '#090d18'
  });

  const isPackaged = app.isPackaged;
  const startApp = async () => {
    if (isPackaged) {
      const indexPath = path.join(__dirname, 'dist', 'index.html');
      console.log(`Loading packaged app from file://${indexPath}`);
      await mainWindow.loadURL(`file://${indexPath}`);
      console.log('Packaged app loaded successfully');
      return;
    }

    console.log('Starting local HTTP server...');
    const { server: httpServer, port } = await startLocalServer();
    server = httpServer;
    serverPort = port;

    console.log(`Loading app from http://localhost:${port}`);
    await mainWindow.loadURL(`http://localhost:${port}`);
    console.log('App loaded successfully');
  };

  try {
    await startApp();
  } catch (error) {
    console.error('Failed to start app:', error);
    mainWindow.loadURL('data:text/html,<html><body style="font-family: Arial; padding: 20px; background: #f0f0f0;"><h1 style="color: #e74c3c;">Application Failed to Start</h1><p style="color: #666;">Could not load the application.</p><p style="color: #999;">Error: ' + error.message + '</p><p style="color: #999;">Working directory: ' + __dirname + '</p></body></html>');
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
  createWindow();
  
  let serverJsPath = path.join(__dirname, 'server.obfuscated.js');
  if (!fs.existsSync(serverJsPath)) {
    serverJsPath = path.join(__dirname, 'server.js');
  }

  console.log('Checking for server backend at:', serverJsPath);
  
  const modeFilePath = path.join(app.getPath('userData'), 'app_mode.json');
  let appMode = 'server';
  if (fs.existsSync(modeFilePath)) {
    try { appMode = JSON.parse(fs.readFileSync(modeFilePath)).mode; } catch (e) {}
  }

  if (appMode !== 'client' && fs.existsSync(serverJsPath)) {
    backendProcess = fork(serverJsPath, [], {
      env: { ...process.env, USER_DATA_PATH: app.getPath('userData') }
    });
    backendProcess.on('error', (err) => console.error('Backend Process Error:', err));
    console.log('Started backend server process');
  } else if (appMode === 'client') {
    console.log('Running in CLIENT mode. Backend server bypassed.');
  } else {
    console.error('server.js not found at', serverJsPath);
  }

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
    let serverJsPath = path.join(__dirname, 'server.obfuscated.js');
    if (!fs.existsSync(serverJsPath)) {
      serverJsPath = path.join(__dirname, 'server.js');
    }
    if (fs.existsSync(serverJsPath)) {
      console.log('Dynamically starting backend server process...');
      backendProcess = fork(serverJsPath, [], {
        env: { ...process.env, USER_DATA_PATH: app.getPath('userData') }
      });
      backendProcess.on('error', (err) => console.error('Backend Process Error:', err));
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
  // Close server before quitting
  if (server) {
    server.close();
  }
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
  // Close server before quitting
  if (server) {
    server.close();
  }
});

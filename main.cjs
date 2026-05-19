const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const fs = require('fs');

// Auto-updater logging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoInstallOnAppQuit = true;

let server = null;
let serverPort = 8080;
let mainWindow = null;

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
      
      server.on('error', (err) => {
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
  
  // Check for updates after window opens
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

ipcMain.handle('check_for_updates', () => {
  return autoUpdater.checkForUpdates();
});

ipcMain.handle('download_update', () => {
  return autoUpdater.downloadUpdate();
});

ipcMain.handle('restart_app', () => {
  autoUpdater.quitAndInstall();
});

// Auto-updater events
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
    message: `Version ${info.version} has been downloaded. Restart the app to install it.`,
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

app.on('window-all-closed', () => {
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
  // Close server before quitting
  if (server) {
    server.close();
  }
});

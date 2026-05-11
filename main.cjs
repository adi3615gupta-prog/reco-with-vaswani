const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Auto-updater logging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public/icon.png')
  });

  // Load the React app using a local web server
  const { spawn } = require('child_process');
  const http = require('http');
  const fs = require('fs');
  
  console.log('Starting local web server for app...');
  
  // Start a simple web server to serve the dist folder
  let server;
  let port = 8080;
  
  function startServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
        
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          
          const ext = path.extname(filePath);
          const contentType = ext === '.css' ? 'text/css' : 
                           ext === '.js' ? 'application/javascript' : 
                           'text/html';
          
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });
      
      server.listen(port, () => {
        console.log(`Local server running on http://localhost:${port}`);
        resolve(server);
      });
      
      server.on('error', () => {
        port++;
        if (port < 8090) {
          startServer().then(resolve);
        } else {
          reject(new Error('Could not start server'));
        }
      });
    });
  }
  
  // Start server and then load the app
  startServer().then((serverInstance) => {
    server = serverInstance;
    
    // Wait a moment for server to start
    setTimeout(() => {
      console.log('Loading app from local server...');
      mainWindow.loadURL(`http://localhost:${port}`).catch(err => {
        console.error('Failed to load from local server:', err);
        
        // Fallback: try loading from file directly
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(fileErr => {
          console.error('Failed to load from file:', fileErr);
          mainWindow.loadURL('data:text/html,<html><body><h1>App Loading Failed</h1><p>Could not load the application.</p><p>Try restarting the app.</p></body></html>');
        });
      });
    }, 1000);
  }).catch(err => {
    console.error('Failed to start server:', err);
    
    // Fallback to file loading
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(fileErr => {
      console.error('Failed to load from file:', fileErr);
      mainWindow.loadURL('data:text/html,<html><body><h1>App Loading Failed</h1><p>Could not load the application.</p><p>Try restarting the app.</p></body></html>');
    });
  });

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  // Log any web content errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Web content failed to load:', errorCode, errorDescription);
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

// Auto-updater events
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply updates.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

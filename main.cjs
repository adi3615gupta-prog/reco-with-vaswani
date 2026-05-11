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

  // Try to load the React app with multiple methods
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  
  console.log('Loading app from:', indexPath);
  
  // First try loading from file
  mainWindow.loadFile(indexPath).catch(err => {
    console.error('Failed to load index.html:', err);
    
    // Try loading from Vite dev server as fallback
    console.log('Trying to load from Vite dev server...');
    mainWindow.loadURL('http://localhost:5173').then(() => {
      console.log('Successfully loaded from Vite dev server');
    }).catch(e => {
      console.error('Failed to load from Vite dev server:', e);
      
      // Last resort: show error page
      mainWindow.loadURL('data:text/html,<html><body><h1>App Loading Failed</h1><p>Could not load the application.</p><p>Check console for details.</p></body></html>');
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

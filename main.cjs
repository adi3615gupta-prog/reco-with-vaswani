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

  // Try to load the React app with reliable path resolution
  let indexPath;
  
  if (process.env.NODE_ENV === 'development') {
    // Development: load from dist folder
    indexPath = path.join(__dirname, 'dist', 'index.html');
  } else {
    // Production: use app.getPath for reliable location
    const appPath = app.getPath('exe');
    const appDir = path.dirname(appPath);
    indexPath = path.join(appDir, 'resources', 'app', 'dist', 'index.html');
  }
  
  console.log('Loading app from:', indexPath);
  
  // Load the app
  mainWindow.loadFile(indexPath).catch(err => {
    console.error('Failed to load index.html:', err);
    
    // Try fallback paths
    const fallbackPaths = [
      path.join(__dirname, 'dist', 'index.html'),
      path.join(__dirname, '..', 'app', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html')
    ];
    
    let loaded = false;
    for (const fallbackPath of fallbackPaths) {
      console.log('Trying fallback path:', fallbackPath);
      mainWindow.loadFile(fallbackPath).then(() => {
        console.log('Successfully loaded from:', fallbackPath);
        loaded = true;
      }).catch(e => {
        console.log('Failed to load from:', fallbackPath, e);
      });
      
      if (loaded) break;
    }
    
    if (!loaded) {
      console.error('All paths failed');
      mainWindow.loadURL('data:text/html,<html><body><h1>App Loading Failed</h1><p>Could not load the application.</p><p>Check console for details.</p></body></html>');
    }
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

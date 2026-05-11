const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Auto-updater logging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

async function createWindow() {
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

  // Load the React app with simple, reliable approach
  console.log('Current working directory:', __dirname);
  console.log('Environment:', process.env.NODE_ENV || 'production');
  
  // Try different paths for index.html
  const pathsToTry = [
    // Development paths
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, 'index.html'),
    
    // Packaged app paths (asar)
    path.join(__dirname, '..', 'app', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
    
    // Additional fallback paths
    path.join(app.getPath('exe'), '..', 'resources', 'app', 'dist', 'index.html'),
    path.join(app.getPath('exe'), '..', 'resources', 'app.asar', 'dist', 'index.html'),
    path.join(app.getAppPath(), 'dist', 'index.html')
  ];
  
  let loadedSuccessfully = false;
  
  // Try each path until one works
  for (const indexPath of pathsToTry) {
    console.log('Trying to load from:', indexPath);
    
    try {
      // Check if file exists
      if (require('fs').existsSync(indexPath)) {
        console.log('File exists at:', indexPath);
        
        // Try to load it
        await mainWindow.loadFile(indexPath);
        console.log('Successfully loaded from:', indexPath);
        loadedSuccessfully = true;
        break;
      } else {
        console.log('File does not exist at:', indexPath);
      }
    } catch (error) {
      console.log('Failed to load from:', indexPath, error.message);
    }
  }
  
  // If all paths failed, show error page
  if (!loadedSuccessfully) {
    console.error('All paths failed to load');
    mainWindow.loadURL('data:text/html,<html><body style="font-family: Arial; padding: 20px;"><h1 style="color: #e74c3c;">Application Loading Failed</h1><p style="color: #666;">Could not load the application files.</p><p style="color: #666;">Please check the console for details.</p><p style="color: #999;">Working directory: ' + __dirname + '</p></body></html>');
  }

  // Open DevTools only in development (remove for production)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // Log any web content errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Web content failed to load:', errorCode, errorDescription);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Web content loaded successfully');
    // Inject a visible error logger
    mainWindow.webContents.executeJavaScript(`
      window.onerror = function(msg, url, line, col, error) {
        document.body.innerHTML += '<div style="color:red; padding:20px; font-family:Arial;"><h3>JavaScript Error:</h3><p>' + msg + '</p><p>at line ' + line + '</p></div>';
        return false;
      };
    `);
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

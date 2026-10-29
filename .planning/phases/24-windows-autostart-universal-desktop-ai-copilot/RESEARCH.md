# Research: Phase 24 — Windows Background Auto-Start & Universal Desktop AI Copilot (PC Loco Pilot)

## Objective
Evaluate the architectural requirements, Electron native capabilities, Windows OS integration patterns, and IPC mechanisms needed to run **AUDIT WITH VASWANI** as a persistent background desktop service with an always-on-top, universal floating Sourav AI copilot ("PC Loco Pilot").

---

## 1. Windows Auto-Startup Architecture

### Native Electron API: `app.setLoginItemSettings`
Electron provides built-in Windows login item management:
```javascript
app.setLoginItemSettings({
  openAtLogin: boolean,       // true to start with Windows
  openAsHidden: boolean,      // true to launch minimized / in tray
  path: process.execPath,     // path to the executable
  args: ['--hidden']          // CLI arg to signal background launch
});
```

### Detection on Launch:
When Windows starts and launches the application:
```javascript
const isHiddenLaunch = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
```
If `isHiddenLaunch` is true:
- Spawn the backend server process (`startBackendServer`).
- Create `mainWindow` without calling `mainWindow.show()`.
- Create and show the System Tray icon.
- Create the floating `copilotWindow` (or keep it in tray until summoned or floating orb enabled).

---

## 2. Windows System Tray & Lifecycle Protection

### Preventing App Termination on Window Close
Currently in `main.cjs`:
```javascript
app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```
To keep the app alive in the background:
1. Introduce an `app.isQuitting = false;` flag.
2. In `mainWindow`:
   ```javascript
   mainWindow.on('close', (event) => {
     if (!app.isQuitting) {
       event.preventDefault();
       mainWindow.hide();
       return false;
     }
   });
   ```
3. In `Tray` context menu:
   - "Open AUDIT WITH VASWANI" $\to$ `mainWindow.show(); mainWindow.focus();`
   - "Toggle Sourav Copilot" $\to$ `toggleCopilotWindow();`
   - "Start with Windows" $\to$ Checkbox toggling `app.setLoginItemSettings`
   - "Quit Completely" $\to$ `app.isQuitting = true; app.quit();`

---

## 3. Universal Floating Copilot Window Architecture

### Transparent, Frameless, Always-On-Top Window
To make Sourav AI an overlay that floats over any application (Excel, Tally, Chrome, Desktop):
```javascript
copilotWindow = new BrowserWindow({
  width: 64,
  height: 64,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  focusable: true,
  hasShadow: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});
```
- **Level of Always-on-Top:** `copilotWindow.setAlwaysOnTop(true, 'screen-saver')` or `copilotWindow.setAlwaysOnTop(true, 'floating')` ensures it stays above full-screen spreadsheets and accounting software.
- **Initial Positioning:**
  ```javascript
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  // Position near bottom-right corner, e.g. x: screenW - 80, y: screenH - 120
  ```

### Dynamic Sizing via IPC (`resize_copilot`)
Because Electron windows have fixed bounds, when the user clicks the floating orb to expand the chat panel:
- Renderer sends `ipcRenderer.send('resize_copilot', { expanded: true })`.
- Main process adjusts window bounds:
  ```javascript
  ipcMain.on('resize_copilot', (_event, { expanded }) => {
    if (!copilotWindow) return;
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    if (expanded) {
      copilotWindow.setBounds({
        x: screenW - 440,
        y: screenH - 680,
        width: 420,
        height: 660
      });
    } else {
      copilotWindow.setBounds({
        x: screenW - 80,
        y: screenH - 120,
        width: 64,
        height: 64
      });
    }
  });
  ```

---

## 4. Global System Hotkey Integration

### Native Electron API: `globalShortcut`
```javascript
const { globalShortcut } = require('electron');

app.whenReady().then(() => {
  // Register global hotkey
  const ret = globalShortcut.register('CommandOrControl+Alt+S', () => {
    toggleCopilotWindow();
  });
  if (!ret) {
    console.warn('Global shortcut registration failed');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```
- When pressed from anywhere in Windows, `toggleCopilotWindow()`:
  - If collapsed, expands and focuses.
  - If expanded and focused, hides or collapses.

---

## 5. Bidirectional Navigation Bridge ("Loco Pilot")

### Inter-Window IPC Flow
1. **Floating Window $\to$ Main Process:**
   - User clicks `[ACTION:navigate:3b:27AAQCS1984G1ZT]` inside the desktop copilot.
   - Copilot sends `ipcRenderer.send('navigate_app', { target: '3b', gstin: '27AAQCS1984G1ZT' })`.
2. **Main Process $\to$ Main Window:**
   - Main process receives `navigate_app`.
   - Restores and focuses `mainWindow`:
     ```javascript
     if (mainWindow.isMinimized()) mainWindow.restore();
     mainWindow.show();
     mainWindow.focus();
     mainWindow.webContents.send('app_navigate', { target, gstin });
     ```
3. **Main Window Renderer:**
   - `AppShell.tsx` / `Index.tsx` listens via `electronAPI.onAppNavigate((data) => { ... })`.
   - Automatically switches client if `gstin` provided.
   - Activates target tab (e.g. `returns`, subtab `3b`).

---

## 6. Implementation Risk & Mitigation Matrix

| Risk | Impact | Mitigation |
|---|---|---|
| Background app consumes high memory | Low to Medium | Backend is already optimized with single Express instance; secondary copilot window is lightweight without heavy DOM trees. |
| Window transparency flickering on Windows | Low | Use standard `-webkit-app-region: drag` for draggable header; disable frame, keep `backgroundColor: '#00000000'`. |
| Port 3001 conflict on boot | Low | `main.cjs` already handles single-instance locking via `app.requestSingleInstanceLock()`. |
| Shortcut conflict with other apps | Low | Default to `Ctrl+Alt+S` (rarely bound in Windows apps); support configurable hotkey in Settings. |

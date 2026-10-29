# Context: Phase 24 — Windows Background Auto-Start & Universal Desktop AI Copilot (PC Loco Pilot)

## User Intent & Vision
The user asked:
> "can we make this app starts with the windows on means default startup in windows in background also can we make this sourav ai icon universal in pc means even minimizing the window of the app it still there and will work in app and outside app also both ways can we do that menas it will be loco pilot for full pc ? can we do that ?"

The goal is to elevate **AUDIT WITH VASWANI** and its **Sourav AI** assistant from a standard in-window app into an autonomous **system-wide PC Loco Pilot**:
1. **Silent Windows Boot in Background:**
   The desktop app auto-starts with Windows on system boot/login, running silently in the background (System Tray) with its Express backend server ready immediately.
2. **Persistent System Tray Presence:**
   Windows system tray icon with quick actions: Open Full App, Toggle Sourav AI, Start with Windows on/off, Quit.
   Closing the main app window minimizes it to tray instead of terminating the backend process.
3. **Universal Always-On-Top Floating Desktop Copilot:**
   Sourav AI exists as an independent, floating, transparent, draggable desktop widget that stays visible even when the main app is minimized or hidden.
4. **Global System Hotkey (`Ctrl+Alt+S`):**
   Users can press `Ctrl+Alt+S` (or `Alt+Space`) anywhere in Windows (while in Excel, Tally, Chrome, or Desktop) to instantly summon Sourav AI.
5. **Bidirectional "Loco Pilot" Control:**
   When the user gives an action in the floating copilot (e.g. "open 3b working of siddha", "reconcile 2b"), clicking the action button restores and focuses the main application window, automatically switches to that client, and opens the requested module!

---

## Technical Feasibility & Design Decisions

### 1. Auto-Start with Windows (`app.setLoginItemSettings`)
- Electron provides native API:
  ```javascript
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    args: ['--hidden']
  });
  ```
- Also fallback / direct check with Windows Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Settings UI toggle in Settings $\to$ "Auto-start on Windows Boot".

### 2. System Tray & Window Close Interception
- `tray = new Tray(iconPath)` created on app launch.
- Intercept `mainWindow.on('close')`:
  ```javascript
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  ```
- Tray context menu:
  - "Open AUDIT WITH VASWANI"
  - "Toggle Sourav AI Copilot"
  - "Launch on Windows Startup (Checkmark)"
  - "Quit Completely"

### 3. Dedicated Transparent Always-On-Top Floating Copilot Window
- Secondary Electron `BrowserWindow`:
  - `alwaysOnTop: true`
  - `skipTaskbar: true`
  - `frame: false`
  - `transparent: true`
  - `hasShadow: false`
- Dynamic Resizing via IPC:
  - **Collapsed State (Floating Orb/Pill):** 64x64 px circular amber badge with glowing icon. Draggable across screen edges.
  - **Expanded State (Chat Console):** 420x640 px obsidian card with full markdown chat, statutory citations, and action buttons.
- Route in React App: `#/copilot-desktop` (using existing `HashRouter`).

### 4. Global System Hotkey
- Register `globalShortcut.register('CommandOrControl+Alt+S')`.
- Toggles `copilotWindow` visible/hidden and focused.

### 5. Bidirectional IPC Navigation Bridge
- In Floating Copilot: User clicks `[ACTION:navigate:3b:27AAQCS1984G1ZT]`.
- Renderer emits `ipcRenderer.send('navigate_app', { target: '3b', gstin: '27AAQCS1984G1ZT' })`.
- Main Process (`main.cjs`):
  ```javascript
  ipcMain.on('navigate_app', (_event, data) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app_navigate', data);
    }
  });
  ```
- `AppShell` receives `electronAPI.onAppNavigate` and activates the target tab/module + selects the client via `handleSelectClientFromHub`.

---

## Scope & Non-Goals
- Scope is strictly Windows desktop application (Electron).
- No external heavy C++ native addons required (native Electron APIs `app`, `Tray`, `BrowserWindow`, `globalShortcut`, `screen` fully cover all requirements).
- Preserves all existing functionality and performance benchmarks.

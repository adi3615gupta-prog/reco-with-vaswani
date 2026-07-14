const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// We need to run inside Electron context to get app.getPath('userData')
// But we can just search typical paths since the app name is "RECO WITH VASWANI" or "com.vite.react.shadcn.ts"
const appData = process.env.APPDATA;
const searchDirs = [
  path.join(appData, 'RECO WITH VASWANI'),
  path.join(appData, 'com.vite.react.shadcn.ts'),
  path.join(appData, 'reco-with-vaswani')
];

searchDirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    console.log('Found appData dir:', dir);
    const mainLog = path.join(dir, 'main.log');
    const backendLog = path.join(dir, 'backend.log');
    
    if (fs.existsSync(mainLog)) {
      console.log('--- main.log (last 10 lines) ---');
      console.log(fs.readFileSync(mainLog, 'utf8').split('\n').slice(-15).join('\n'));
    }
    if (fs.existsSync(backendLog)) {
      console.log('--- backend.log (last 15 lines) ---');
      console.log(fs.readFileSync(backendLog, 'utf8').split('\n').slice(-20).join('\n'));
    }
  }
});

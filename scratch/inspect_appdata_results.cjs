const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.APPDATA, 'vite_react_shadcn_ts');
const mainLog = path.join(dir, 'main.log');
const backendLog = path.join(dir, 'backend.log');

if (fs.existsSync(mainLog)) {
  console.log('--- main.log (last 15 lines) ---');
  console.log(fs.readFileSync(mainLog, 'utf8').split('\n').slice(-15).join('\n'));
}
if (fs.existsSync(backendLog)) {
  console.log('--- backend.log (last 15 lines) ---');
  console.log(fs.readFileSync(backendLog, 'utf8').split('\n').slice(-15).join('\n'));
}

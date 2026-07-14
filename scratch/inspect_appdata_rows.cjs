const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA;
const dirs = fs.readdirSync(appData);
console.log('AppDirs containing reco, vaswani or shadcn:');
dirs.forEach(d => {
  if (d.toLowerCase().includes('reco') || d.toLowerCase().includes('vaswani') || d.toLowerCase().includes('shadcn') || d.toLowerCase().includes('antigravity')) {
    console.log(d, '-> exists:', fs.existsSync(path.join(appData, d)));
    try {
      const files = fs.readdirSync(path.join(appData, d));
      console.log('  Files:', files);
    } catch(e) {}
  }
});

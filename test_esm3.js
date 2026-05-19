import { createRequire } from 'module'; const require = createRequire(import.meta.url); const electron = require('electron'); console.log('APP:', !!electron.app); process.exit(0);

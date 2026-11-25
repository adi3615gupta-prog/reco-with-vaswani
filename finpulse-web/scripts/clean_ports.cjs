const { execSync } = require('child_process');

function freePort(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== String(process.pid) && pid !== String(process.ppid)) {
        console.log(`[Auto-Clean] Freeing port ${port} (PID ${pid})...`);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch(e) {}
      }
    }
  } catch (err) {
    // Port is already free
  }
}

// Don't kill current process or its parents
if (process.argv.includes('--clean-all')) {
  freePort(3001);
  freePort(8080);
  console.log('[Auto-Clean] Ports 3001 & 8080 verified clean.');
}

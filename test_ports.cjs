const { JSDOM } = require('jsdom');
global.DOMParser = new JSDOM().window.DOMParser;
global.window = {};

const tallyApi = require('./src/lib/tallyApi.ts');

async function test() {
  console.log("Scanning ports 9000-9010 to find live Tally Prime instance...");
  for (let port = 9000; port <= 9010; port++) {
    try {
      const config = { host: '127.0.0.1', port };
      const alive = await tallyApi.pingTally(config);
      if (alive) {
        console.log(`FOUND TALLY ON PORT ${port}!`);
        const info = await tallyApi.fetchCompanyInfo(config);
        console.log("Company Info:", info);
        
        console.log("Fetching metadata...");
        const meta = await tallyApi.fetchTallyMetadata(config);
        console.log(`GSTIN Map size: ${meta.gstinMap.size}`);
        console.log(`Tax Map size: ${meta.taxMap.size}`);
        
        process.exit(0);
      }
    } catch (e) {
      // ignore
    }
  }
  console.log("Tally Prime not found on any port in range 9000-9010 on 127.0.0.1.");
  process.exit(1);
}

test();

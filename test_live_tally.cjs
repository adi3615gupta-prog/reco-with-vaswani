const { JSDOM } = require('jsdom');
global.DOMParser = new JSDOM().window.DOMParser;
global.window = {};

const tallyApi = require('./src/lib/tallyApi.ts');

async function test() {
  try {
    console.log("Connecting to live Tally...");
    const config = { host: '127.0.0.1', port: 9000 };
    const alive = await tallyApi.pingTally(config);
    console.log("Tally ping response:", alive);
    if (!alive) {
      console.log("Tally is not responding on 127.0.0.1:9000. Make sure Tally is running.");
      process.exit(1);
    }

    const coInfo = await tallyApi.fetchCompanyInfo(config);
    console.log("Active Company Info:", coInfo);

    console.log("Fetching live Tally metadata...");
    const start = Date.now();
    const meta = await tallyApi.fetchTallyMetadata(config);
    const end = Date.now();

    console.log(`Fetched metadata in ${end - start}ms.`);
    console.log(`GSTIN Map size: ${meta.gstinMap.size}`);
    console.log(`Tax Map size: ${meta.taxMap.size}`);

    console.log("\nSample GSTIN Map entries (first 5):");
    let count = 0;
    for (const [name, gstin] of meta.gstinMap.entries()) {
      if (count++ >= 5) break;
      console.log(`  - ${name}: ${gstin}`);
    }

    console.log("\nSample Tax Map entries (first 5):");
    count = 0;
    for (const [name, info] of meta.taxMap.entries()) {
      if (count++ >= 5) break;
      console.log(`  - ${name}: category=${info.taxCategory}, isITC=${info.isITC}, isOutput=${info.isOutput}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error connecting to live Tally:", err);
    process.exit(1);
  }
}

test();

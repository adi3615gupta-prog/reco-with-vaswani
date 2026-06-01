const { DOMParser } = require('xmldom');
const { fetchTallyMetadata } = require('./src/lib/tallyApi.ts');

async function test() {
  try {
    const meta = await fetchTallyMetadata();
    console.log(`Groups fetched: ${meta.taxMap.size}`);
    
    // Check if taxMap has 'Input CGST 14%'
    let found = false;
    meta.taxMap.forEach((info, name) => {
       if (name.toUpperCase().includes('CGST')) {
           console.log(`Found tax ledger: ${name}, isITC: ${info.isITC}, isOutput: ${info.isOutput}`);
           found = true;
       }
    });
    if (!found) {
       console.log("No CGST ledgers found in taxMap.");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
test();

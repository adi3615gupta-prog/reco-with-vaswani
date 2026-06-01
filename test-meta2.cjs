const { fetchTallyMetadata } = require('./dist/assets/index-D097Uwq7.js');

async function test() {
  try {
    const meta = await fetchTallyMetadata();
    console.log(`Groups fetched: ${meta.taxMap.size}`);
    meta.taxMap.forEach((info, name) => {
       if (name.includes('CGST')) {
           console.log(`Found tax ledger: ${name}, isITC: ${info.isITC}`);
       }
    });
  } catch (err) {
    console.error("Error:", err);
  }
}
test();

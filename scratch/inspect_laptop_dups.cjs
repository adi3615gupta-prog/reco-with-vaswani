const fs = require('fs');

function getTagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

try {
  const xml = fs.readFileSync('scratch_res_chunk1.xml', 'utf8');
  const entryRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/gi;
  let match;
  const entries = [];
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const name = getTagValue(block, 'LEDGERNAME').trim().toUpperCase();
    const vNum = getTagValue(block, 'VCHNUMBER');
    const amt = getTagValue(block, 'AMOUNT');
    const date = getTagValue(block, 'VCHDATE');
    const isDeemedPos = getTagValue(block, 'ISDEEMEDPOSITIVE');
    
    if (name.includes('LAPTOP') && vNum === '1874') {
      entries.push({ block, name, vNum, amt, date, isDeemedPos });
    }
  }
  
  console.log("Total entries matching LAPTOP and Voucher 1874:", entries.length);
  console.log("Details:");
  entries.forEach((e, idx) => {
    console.log(`Entry ${idx + 1}:`);
    console.log(e.block.trim());
    console.log("------------------------");
  });
} catch (err) {
  console.error(err);
}

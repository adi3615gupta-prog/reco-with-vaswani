const http = require('http');
const fs = require('fs');

function sendTallyRequest(xml, port = 9000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: port,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(xml)
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

function getTagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

async function test() {
  // Let's load the saved XML response from scratch_res_chunk1.xml
  try {
    const res = fs.readFileSync('scratch_res_chunk1.xml', 'utf8');
    
    // Test regex parsing of LEDGERENTRY
    const entryRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/gi;
    let match;
    let count = 0;
    const additions = [];
    
    // Let's identify the FA ledgers we found earlier
    const faLedgers = new Set([
      'SAW MACHINE',
      'SEWAGE SUBMARSIBLE PUMP',
      'RAPID MOISTURE METER',
      'REGISTRATION CHARGES FOR NEW OFFICE',
      'LENOVO LAPTOP'
    ]);
    
    while ((match = entryRegex.exec(res)) !== null) {
      const block = match[1];
      const name = getTagValue(block, 'LEDGERNAME').trim().toUpperCase();
      count++;
      
      if (faLedgers.has(name) || name.includes('COMP') || name.includes('LAPT') || name.includes('MACH')) {
        const amt = getTagValue(block, 'AMOUNT');
        const date = getTagValue(block, 'VCHDATE');
        const isDeemedPos = getTagValue(block, 'ISDEEMEDPOSITIVE');
        additions.push({ name, amt, date, isDeemedPos });
      }
    }
    
    console.log("Total entries in chunk 1 XML:", count);
    console.log("Matched entries:", additions.length);
    console.log("Sample additions:", additions.slice(0, 10));
  } catch (err) {
    console.error(err);
  }
}

test();

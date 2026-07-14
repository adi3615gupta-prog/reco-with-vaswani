import http from 'http';

function postTally(xml) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 9000,
            method: 'POST',
            headers: {
              'Content-Type': 'text/xml',
              'Content-Length': Buffer.byteLength(xml)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(xml);
        req.end();
    });
}

const ledgerXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerMaster</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyLedgerMaster">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, PartyGSTIN, GSTRegistrationType, LEDGSTREGDETAILS.LIST.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function run() {
    try {
        console.log("Fetching ledgers with FETCH method...");
        const start = Date.now();
        const data = await postTally(ledgerXml);
        console.log("Fetched in", (Date.now() - start)/1000, "seconds");
        console.log("Response length:", data.length, "bytes");
        
        // Find S P TRADING COMPANY in raw XML
        const idx = data.indexOf('S P TRADING');
        if (idx >= 0) {
            console.log("\n=== RAW XML around S P TRADING ===");
            console.log(data.substring(Math.max(0, idx - 200), idx + 500));
        } else {
            console.log("S P TRADING not found in response!");
        }
        
        // Find WINDAIR in raw XML
        const idx2 = data.indexOf('WINDAIR');
        if (idx2 >= 0) {
            console.log("\n=== RAW XML around WINDAIR ===");
            console.log(data.substring(Math.max(0, idx2 - 200), idx2 + 500));
        }
        
        // Count how many PARTYGSTIN we find
        const partyGstinCount = (data.match(/PARTYGSTIN/g) || []).length;
        const gstinCount = (data.match(/GSTIN/g) || []).length;
        const ledgstregCount = (data.match(/LEDGSTREGDETAILS/g) || []).length;
        console.log("\nTag counts in response:");
        console.log("  PARTYGSTIN:", partyGstinCount);
        console.log("  GSTIN:", gstinCount);
        console.log("  LEDGSTREGDETAILS:", ledgstregCount);
        
    } catch (e) {
        console.error(e);
    }
}
run();

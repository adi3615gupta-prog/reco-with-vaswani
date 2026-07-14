const http = require('http');

const port = 9000;

function sendTallyRequest(xml) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': Buffer.byteLength(xml)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', (err) => reject(err));
        req.write(xml);
        req.end();
    });
}

// Fetch all ledger entries on the target dates 20251204 and 20260304
const queryXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>TargetDateVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20251204</SVFROMDATE>
        <SVTODATE>20260304</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="TargetDateVouchersSrc">
            <TYPE>Voucher</TYPE>
            <FILTER>IsTargetDate</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetDate">$Date = "20251204" OR $Date = "20260304"</SYSTEM>
          <COLLECTION NAME="TargetDateVouchers">
            <SOURCECOLLECTION>TargetDateVouchersSrc</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyName : $..PartyLedgerName</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function main() {
    try {
        console.log("Sending query to Tally Prime on port:", port);
        const resp = await sendTallyRequest(queryXml);
        
        // Parse matches for J S KABIN
        const ledgerBlockRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/g;
        let match;
        const matchedEntries = [];
        while ((match = ledgerBlockRegex.exec(resp)) !== null) {
            const block = match[1];
            if (block.toUpperCase().includes('KABIN')) {
                matchedEntries.push(block);
            }
        }
        console.log(`=== Matches found for KABIN on target dates (Count: ${matchedEntries.length}) ===`);
        matchedEntries.forEach((entry, idx) => {
            console.log(`--- Match #${idx+1} ---`);
            console.log(entry.trim());
        });
    } catch (e) {
        console.error("Error:", e.message);
    }
}
main();

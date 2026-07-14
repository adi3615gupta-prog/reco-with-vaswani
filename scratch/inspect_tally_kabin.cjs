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

const queryXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>KabinVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20260331</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="KabinVouchersSrc">
            <TYPE>Voucher</TYPE>
            <FILTER>IsKabinVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsKabinVch">$$IsBelongsTo:$$GroupSundryCreditors OR $PartyLedgerName = "J S KABIN" OR $PartyName = "J S KABIN"</SYSTEM>
          <COLLECTION NAME="KabinVouchers">
            <SOURCECOLLECTION>KabinVouchersSrc</SOURCECOLLECTION>
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
        console.log("Sending query to Tally Prime...");
        const resp = await sendTallyRequest(queryXml);
        
        // Parse matches for J S KABIN
        const ledgerBlockRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/g;
        let match;
        const matchedEntries = [];
        while ((match = ledgerBlockRegex.exec(resp)) !== null) {
            const block = match[1];
            if (block.toUpperCase().includes('KABIN')) {
                // Parse date
                const dateMatch = block.match(/<VCHDATE[^>]*>([^<]+)<\/VCHDATE>/i);
                const amtMatch = block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
                const numMatch = block.match(/<VCHNUMBER[^>]*>([^<]+)<\/VCHNUMBER>/i);
                const typeMatch = block.match(/<VCHTYPE[^>]*>([^<]+)<\/VCHTYPE>/i);
                const ledgerMatch = block.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i);
                const positiveMatch = block.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i);
                
                matchedEntries.push({
                    date: dateMatch ? dateMatch[1] : '',
                    vchNumber: numMatch ? numMatch[1] : '',
                    vchType: typeMatch ? typeMatch[1] : '',
                    ledgerName: ledgerMatch ? ledgerMatch[1] : '',
                    amount: amtMatch ? amtMatch[1] : '',
                    isDebit: positiveMatch ? positiveMatch[1] : ''
                });
            }
        }
        
        // Deduplicate by guid/key to count vouchers
        console.log(`=== All entries for KABIN in Tally (Count: ${matchedEntries.length}) ===`);
        console.table(matchedEntries);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
main();

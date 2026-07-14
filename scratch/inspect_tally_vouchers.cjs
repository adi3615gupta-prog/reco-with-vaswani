const http = require('http');

const port = 9000; // Tally default port

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
    <ID>DebugVouchers</ID>
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
          <COLLECTION NAME="DebugVouchersSrc">
            <TYPE>Voucher</TYPE>
            <FILTER>IsTargetVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetVch">$VoucherNumber = "2919" OR $VoucherNumber = "3412" OR $VoucherNumber = "2921"</SYSTEM>
          <COLLECTION NAME="DebugVouchers">
            <SOURCECOLLECTION>DebugVouchersSrc</SOURCECOLLECTION>
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
        console.log("=== Response from Tally ===");
        console.log(resp);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
main();

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

const targetLedger = "4 DELL COMPUTERS";

// Method: Using standard Voucher collection with FilterCount
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VchsOfLedgerFilter</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20240401</SVFROMDATE>
        <SVTODATE>20250331</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VchsOfLedgerFilter">
            <TYPE>Voucher</TYPE>
            <FETCH>Date, VoucherTypeName, VoucherNumber, AllLedgerEntries.*</FETCH>
            <FILTER>LedgerMatch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="LedgerMatch">
            $$FilterCount:AllLedgerEntries:IsTargetLedger > 0
          </SYSTEM>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetLedger">
            $LedgerName = "${targetLedger}"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function test() {
  try {
    console.log("Fetching vouchers for", targetLedger);
    const start = Date.now();
    const res = await sendTallyRequest(xml);
    console.log("Time taken:", Date.now() - start, "ms");
    console.log("Response size:", res.length);
    fs.writeFileSync('scratch_debug_filter_res.xml', res);
    console.log("Saved response to scratch_debug_filter_res.xml");
  } catch (err) {
    console.error(err);
  }
}
test();

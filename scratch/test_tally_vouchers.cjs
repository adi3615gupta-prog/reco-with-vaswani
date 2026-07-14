const http = require('http');

function sendTallyRequest(xml, port = 9000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: port,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
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

const ledgerName = "Computers"; // change to a known fixed asset ledger in the test data
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerEntriesCol</ID>
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
          <COLLECTION NAME="LedgerEntriesCol">
            <TYPE>Voucher</TYPE>
            <FETCH>Date, VoucherNumber, LedgerEntries.*</FETCH>
            <FILTER>MyLedgerFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="MyLedgerFilter">
            $$FilterCount:AllLedgerEntries:IsMyLedger > 0
          </SYSTEM>
          <SYSTEM TYPE="FORMULAS" NAME="IsMyLedger">
            $LedgerName = "${ledgerName}"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function test() {
  try {
    console.log("Fetching vouchers for", ledgerName);
    const start = Date.now();
    const res = await sendTallyRequest(xml);
    console.log("Time taken:", Date.now() - start, "ms");
    console.log("Response size:", res.length);
    console.log(res.substring(0, 500));
  } catch (err) {
    console.error(err);
  }
}
test();

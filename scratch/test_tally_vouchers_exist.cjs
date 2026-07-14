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

const targetLedger = "LENOVO LAPTOP";

// Method A: Query custom collection using ##SVLedgerName
const xmlA = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomLedgerVchs</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVLEDGERNAME>${targetLedger}</SVLEDGERNAME>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20260331</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomLedgerVchs">
            <TYPE>Voucher</TYPE>
            <CHILDOF>##SVLedgerName</CHILDOF>
            <FETCH>Date, VoucherTypeName, VoucherNumber, AllLedgerEntries.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

// Method B: Query "Ledger Vouchers" report
const xmlB = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Ledger Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <LEDGERNAME>${targetLedger}</LEDGERNAME>
        <SVFROMDATE>20240401</SVFROMDATE>
        <SVTODATE>20250331</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function test() {
  try {
    console.log("Fetching Method A...");
    const startA = Date.now();
    const resA = await sendTallyRequest(xmlA);
    console.log("Method A Time:", Date.now() - startA, "ms. Size:", resA.length);
    fs.writeFileSync('scratch_res_A.xml', resA);

    console.log("Fetching Method B...");
    const startB = Date.now();
    const resB = await sendTallyRequest(xmlB);
    console.log("Method B Time:", Date.now() - startB, "ms. Size:", resB.length);
    fs.writeFileSync('scratch_res_B.xml', resB);
  } catch (err) {
    console.error(err);
  }
}
test();

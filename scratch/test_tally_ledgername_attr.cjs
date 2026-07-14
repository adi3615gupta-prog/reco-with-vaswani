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

// We define a collection of Voucher and set LEDGERNAME attribute
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FAVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20240401</SVFROMDATE>
        <SVTODATE>20260331</SVTODATE> <!-- Large range covering both years -->
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FAVouchers">
            <TYPE>Voucher</TYPE>
            <LEDGERNAME>${targetLedger}</LEDGERNAME>
            <FETCH>Date, VoucherTypeName, VoucherNumber, AllLedgerEntries.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function test() {
  try {
    console.log("Fetching using LEDGERNAME attribute for LENOVO LAPTOP...");
    const start = Date.now();
    const res = await sendTallyRequest(xml);
    console.log("Time taken:", Date.now() - start, "ms. Size:", res.length);
    fs.writeFileSync('scratch_res_ledgername_attr.xml', res);
    console.log("Saved response to scratch_res_ledgername_attr.xml");
  } catch (err) {
    console.error(err);
  }
}
test();

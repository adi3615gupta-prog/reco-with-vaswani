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

// First, get all Fixed Asset ledgers
const ledgersXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Ledgers">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance</FETCH>
            <FILTER>IsFA</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsFA">
            $$IsSysNameEqual:FixedAssets:$Parent
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function run() {
  try {
    console.log("Fetching FA ledgers...");
    const ledgersRes = await sendTallyRequest(ledgersXml);
    fs.writeFileSync('scratch_debug_ledgers.xml', ledgersRes);
    console.log("Saved ledgers response. Length:", ledgersRes.length);

    // Let's parse names
    const names = [];
    const nameRegex = /<LEDGER[^>]*NAME="([^"]+)"/g;
    let match;
    while ((match = nameRegex.exec(ledgersRes)) !== null) {
      names.push(match[1]);
    }
    console.log("Found FA Ledgers:", names);

    if (names.length === 0) {
      console.log("No FA ledgers found. Try fetching all ledgers to see parents.");
      return;
    }

    // Now let's try to query vouchers for the first ledger using multiple methods
    const targetLedger = names[0];
    console.log(`Testing voucher fetch for: ${targetLedger}`);

    // Method 1: Using CHILDOF
    const vchChildOfXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VchsOfLedger</ID>
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
          <COLLECTION NAME="VchsOfLedger">
            <TYPE>Voucher</TYPE>
            <CHILDOF>${targetLedger}</CHILDOF>
            <FETCH>Date, VoucherTypeName, VoucherNumber, AllLedgerEntries.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    console.log("Sending Method 1 (CHILDOF) request...");
    const res1 = await sendTallyRequest(vchChildOfXml);
    fs.writeFileSync('scratch_debug_vch_method1.xml', res1);
    console.log("Method 1 Response Length:", res1.length);
    if (res1.includes('<VOUCHER>')) {
      console.log("Method 1 SUCCESS: Found Vouchers!");
    } else {
      console.log("Method 1 returned no vouchers.");
    }

    // Method 2: Using standard Voucher collection with Filter
    const vchFilterXml = `<ENVELOPE>
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

    console.log("Sending Method 2 (FilterCount) request...");
    const res2 = await sendTallyRequest(vchFilterXml);
    fs.writeFileSync('scratch_debug_vch_method2.xml', res2);
    console.log("Method 2 Response Length:", res2.length);
    if (res2.includes('<VOUCHER>')) {
      console.log("Method 2 SUCCESS: Found Vouchers!");
    } else {
      console.log("Method 2 returned no vouchers.");
    }

  } catch (err) {
    console.error("Error running debug:", err);
  }
}

run();

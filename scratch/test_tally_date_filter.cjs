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

const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerEntries_FA</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20250430</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVouchers_FA">
            <TYPE>Voucher</TYPE>
            <FILTER>IsFAVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsFAVch">
            ($$IsJournal:$VoucherTypeName OR $$IsPayment:$VoucherTypeName OR $$IsPurchase:$VoucherTypeName OR $$IsReceipt:$VoucherTypeName OR $VoucherTypeName = "Journal" OR $VoucherTypeName = "Payment" OR $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Receipt") 
            AND NOT $IsCancelled AND NOT $IsOptional
            AND $Date &gt;= ##SVFromDate AND $Date &lt;= ##SVToDate
          </SYSTEM>
          
          <COLLECTION NAME="MyLedgerEntries_FA">
            <SOURCECOLLECTION>MyVouchers_FA</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function test() {
  try {
    console.log("Fetching with TDL date filter...");
    const res = await sendTallyRequest(xml);
    fs.writeFileSync('scratch_res_filtered.xml', res);
    console.log("Saved response. Size:", res.length);
    
    // Parse using regex
    const entryRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/gi;
    let match;
    let count = 0;
    const dates = new Set();
    
    while ((match = entryRegex.exec(res)) !== null) {
      count++;
      const block = match[1];
      const m = block.match(/<VCHDATE[^>]*>([^<]*)<\/VCHDATE>/i);
      if (m) dates.add(m[1].trim());
    }
    
    console.log("Total entries returned:", count);
    console.log("Unique dates in response:", Array.from(dates));
  } catch (err) {
    console.error(err);
  }
}
test();

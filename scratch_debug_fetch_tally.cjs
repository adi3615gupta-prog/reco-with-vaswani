const http = require('http');

const xmlPayload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerEntries_Purchase</ID>
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
          <COLLECTION NAME="MyVouchers_Purchase">
            <TYPE>Voucher</TYPE>
            <FILTER>IsPurchase</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsPurchase">($$IsPurchase:$VoucherTypeName OR $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Purchase GST" OR $VoucherTypeName = "URD PURCHASE" OR $VoucherTypeName = "Pur" OR $$IsJournal:$VoucherTypeName OR $VoucherTypeName = "Journal" OR $VoucherTypeName = "JV REGISTER" OR $VoucherTypeName = "JV/GST/FIXED ASST" OR $VoucherTypeName = "JV" OR $$IsPayment:$VoucherTypeName OR $VoucherTypeName = "Payment") AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
          
          <COLLECTION NAME="MyLedgerEntries_Purchase">
            <SOURCECOLLECTION>MyVouchers_Purchase</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyGSTIN : $..PartyGSTIN</COMPUTE>
            <COMPUTE>ConsigneeGSTIN : $..ConsigneeGSTIN</COMPUTE>
            <COMPUTE>BasicBuyerName : $..BasicBuyerName</COMPUTE>
            <COMPUTE>PartyName : $..PartyLedgerName</COMPUTE>
            <COMPUTE>Reference : $..Reference</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({
    hostname: '127.0.0.1',
    port: 9000,
    method: 'POST',
    headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload)
    }
}, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log("Response Status:", res.statusCode);
        console.log("Response Length:", data.length);
        if (data.length < 500) {
            console.log("Short Response Content:", data);
        } else {
            console.log("Snippet:", data.substring(0, 1000));
        }

        // Search for WINDAIR inside the response XML
        const matches = [];
        const regex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/g;
        let match;
        let windairCount = 0;
        while ((match = regex.exec(data)) !== null) {
            const block = match[1];
            if (block.includes("WINDAIR") || block.includes("Windair")) {
                windairCount++;
                if (matches.length < 5) {
                    matches.push(match[0]);
                }
            }
        }
        console.log("Total LEDGERENTRY blocks containing WINDAIR:", windairCount);
        console.log("Sample blocks:\n", matches.join("\n---\n"));
    });
});

req.on('error', (e) => {
    console.error("HTTP request error:", e.message);
});

req.write(xmlPayload);
req.end();

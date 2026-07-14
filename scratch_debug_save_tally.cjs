const http = require('http');
const fs = require('fs');

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
    const fileStream = fs.createWriteStream('tally_response.xml');
    res.pipe(fileStream);
    fileStream.on('finish', () => {
        console.log("XML response successfully saved to tally_response.xml");
    });
});

req.on('error', (e) => {
    console.error("HTTP request error:", e.message);
});

req.write(xmlPayload);
req.end();

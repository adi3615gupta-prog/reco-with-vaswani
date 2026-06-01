const http = require('http');

const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyLedgerEntries_Purchase</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20260528</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVouchers_Purchase">
            <TYPE>Voucher</TYPE>
            <FILTER>IsPurchase</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsPurchase">$VoucherTypeName = "Purchase" AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
          
          <COLLECTION NAME="MyLedgerEntries_Purchase">
            <SOURCECOLLECTION>MyVouchers_Purchase</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({
  hostname: 'localhost',
  port: 9000,
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.substring(0, 500));
  });
});

req.on('error', e => console.error(e));
req.write(xml);
req.end();

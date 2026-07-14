const http = require('http');
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>TestVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="TestVouchersBase">
            <TYPE>Voucher</TYPE>
          </COLLECTION>
          <COLLECTION NAME="TestVouchers">
            <SOURCECOLLECTION>TestVouchersBase</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({hostname: 'localhost', port: 9880, method: 'POST', headers: {'Content-Type': 'text/xml'}}, res => {
  let data = '';
  res.on('data', c => data+=c);
  res.on('end', () => console.log('DATA LEN:', data.length, 'START:', data.substring(0, 800)));
});
req.write(xml);
req.end();

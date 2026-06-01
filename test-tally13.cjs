const fs = require('fs');
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerEntriesCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVoucherCollection">
            <TYPE>Voucher</TYPE>
            <FILTER>IsSales</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsSales">$VoucherTypeName = "Sales"</SYSTEM>

          <COLLECTION NAME="MyLedgerEntriesCollection">
            <SOURCECOLLECTION>MyVoucherCollection</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyGSTIN : $..PartyGSTIN</COMPUTE>
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

fetch('http://localhost:9000', { method: 'POST', body: xml })
  .then(r => r.text())
  .then(t => {
    fs.writeFileSync('test-tally13.xml', t);
    console.log('Saved to test-tally13.xml');
  })
  .catch(console.error);

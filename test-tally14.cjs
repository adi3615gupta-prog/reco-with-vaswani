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
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

fetch('http://localhost:9000', { method: 'POST', body: xml })
  .then(r => r.text())
  .then(t => {
    console.log('GUID COUNT:', t.split('<GUID').length-1);
  })
  .catch(console.error);

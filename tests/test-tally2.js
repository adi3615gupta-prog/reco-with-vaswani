const fs = require('fs');
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>PurchaseVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20250415</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="PurchaseVouchers">
            <TYPE>Voucher</TYPE>
            <FILTER>IsPurchase</FILTER>
            <FETCHLIST>
              <FETCH>Date,VoucherNumber,VoucherTypeName,PartyLedgerName,Reference,PartyGSTIN,Amount,LedgerEntries.*,AllLedgerEntries.*</FETCH>
            </FETCHLIST>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsPurchase">$VoucherTypeName = "Purchase"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

fetch('http://localhost:9000', { method: 'POST', body: xml })
  .then(r => r.text())
  .then(t => {
    fs.writeFileSync('tally_test.xml', t);
    console.log("Written to tally_test.xml");
  })
  .catch(console.error);

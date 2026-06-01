const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SalesVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SalesVouchers">
            <TYPE>Voucher</TYPE>
            <FILTER>IsSales</FILTER>
            <FETCHLIST>
              <FETCH>Date</FETCH>
              <FETCH>VoucherTypeName</FETCH>
              <FETCH>VoucherNumber</FETCH>
              <FETCH>PartyLedgerName</FETCH>
              <FETCH>Amount</FETCH>
            </FETCHLIST>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsSales">$VoucherTypeName = "Sales"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

fetch('http://localhost:9000', { method: 'POST', body: xml })
  .then(r => r.text())
  .then(t => {
    console.log('PARTYLEDGERNAME COUNT:', t.split('<PARTYLEDGERNAME').length-1);
    console.log('AMOUNT COUNT:', t.split('<AMOUNT').length-1);
  })
  .catch(console.error);

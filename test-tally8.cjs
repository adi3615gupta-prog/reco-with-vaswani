const fs = require('fs');
const xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVFROMDATE TYPE="Date">20250401</SVFROMDATE>
          <SVTODATE TYPE="Date">20260331</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

fetch('http://localhost:9000', { method: 'POST', body: xml })
  .then(r => r.text())
  .then(t => {
    console.log('VOUCHER COUNT:', t.split('<VOUCHER').length-1);
    console.log('ALLLEDGERENTRIES COUNT:', t.split('<ALLLEDGERENTRIES.LIST').length-1);
  })
  .catch(console.error);

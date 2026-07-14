const http = require('http');

const xmlPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

const req = http.request(
  {
    hostname: 'localhost',
    port: 9000,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(xmlPayload)
    }
  },
  (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('TALLY_RAW_RESPONSE_START\\n' + data + '\\nTALLY_RAW_RESPONSE_END'));
  }
);
req.on('error', e => console.error('ERROR:', e.message));
req.write(xmlPayload);
req.end();

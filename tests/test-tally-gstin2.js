import http from 'http';

// Try using NATIVEMETHOD instead of FETCH
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerGSTIN</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyLedgerGSTIN">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
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
    'Content-Type': 'text/xml',
    'Content-Length': Buffer.byteLength(xml)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Find ledgers WITH actual GSTIN content
    const lines = data.split('\n');
    const gstinLines = lines.filter(l => 
      (l.includes('PARTYGSTIN') || l.includes('GSTIN') || l.includes('GSTREGISTRATIONTYPE')) && 
      !l.match(/><\//) && // skip empty tags
      !l.includes('GSTCLASSIFICATION') &&
      !l.includes('GSTREGISTRATIONTYPE') ||
      l.includes('LEDGER NAME=')
    );
    console.log('GSTIN-related lines (first 100):');
    gstinLines.slice(0, 100).forEach(l => console.log(l.trim()));
  });
});

req.on('error', e => console.error(e));
req.write(xml);
req.end();

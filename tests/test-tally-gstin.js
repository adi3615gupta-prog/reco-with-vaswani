import http from 'http';

const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Ledgers">
            <FETCH>Name, Parent, PartyGSTIN, ConsigneeGSTIN, GSTIN</FETCH>
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
    // Print just the first 5000 chars to see the structure
    console.log('RESPONSE (first 5000 chars):');
    console.log(data.substring(0, 5000));
    
    // Count how many PARTYGSTIN fields have actual values
    const gstinMatches = data.match(/<PARTYGSTIN[^>]*>([^<]+)<\/PARTYGSTIN>/g) || [];
    console.log('\n--- PARTYGSTIN hits:', gstinMatches.slice(0, 20));
    
    const gstinAttrMatches = data.match(/PARTYGSTIN="([^"]+)"/g) || [];
    console.log('--- PARTYGSTIN attr hits:', gstinAttrMatches.slice(0, 20));
  });
});

req.on('error', e => console.error(e));
req.write(xml);
req.end();

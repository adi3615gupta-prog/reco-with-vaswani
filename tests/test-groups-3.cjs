const http = require('http');
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyGroupsTest</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyGroupsTest">
            <TYPE>Group</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({hostname: 'localhost', port: 9000, method: 'POST', headers: {'Content-Type': 'text/xml'}}, res => {
  let data = '';
  res.on('data', c => data+=c);
  res.on('end', () => console.log('DATA LEN:', data.length, 'START:', data.substring(0, 300)));
});
req.write(xml);
req.end();

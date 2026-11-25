const http = require('http');
const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllGroups</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllGroups">
            <TYPE>Group</TYPE>
            <FETCH>Name, Parent</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const req = http.request({hostname: 'localhost', port: 9000, method: 'POST', headers: {'Content-Type': 'text/xml'}}, res => {
  let data = '';
  res.on('data', c => data+=c);
  res.on('end', () => console.log('RESPONSE:', data.substring(0, 100)));
});
req.write(xml);
req.end();

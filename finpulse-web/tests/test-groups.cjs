const http = require('http');

async function testGroups() {
  const xml = `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Groups</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: 'localhost', port: 9000, method: 'POST', headers: { 'Content-Type': 'text/xml' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    request.on('error', reject);
    request.write(xml);
    request.end();
  });
}

testGroups().then(data => console.log(data.substring(0, 1000))).catch(console.error);

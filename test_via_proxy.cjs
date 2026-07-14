const fetch = require('node-fetch');

async function test() {
  console.log("Querying Tally through Express Proxy (127.0.0.1:3001)...");
  
  const xmlPayload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ListOfCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ListOfCompanies">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  // Try ports 9000-9010 through the proxy
  for (let port = 9000; port <= 9010; port++) {
    try {
      const response = await fetch('http://127.0.0.1:3001/api/tally-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'x-tally-port': port.toString()
        },
        body: xmlPayload
      });
      
      if (response.ok) {
        const text = await response.text();
        if (text.includes('COMPANY') || text.includes('NAME')) {
          console.log(`FOUND ACTIVE TALLY VIA PROXY ON PORT ${port}!`);
          console.log("Response Preview:", text.substring(0, 300));
          process.exit(0);
        }
      }
    } catch (e) {
      console.log(`Port ${port} failed with error: ${e.message}`);
    }
  }
  
  console.log("Could not reach Tally via Express proxy on ports 9000-9010.");
  process.exit(1);
}

test();

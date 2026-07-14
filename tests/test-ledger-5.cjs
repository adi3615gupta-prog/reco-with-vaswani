const http = require('http');

function sendTallyRequest(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 9000,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xml)
        }
      },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

async function run() {
  try {
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
    const res = await sendTallyRequest(xml);
    const d = res.indexOf('<LEDGER');
    console.log("Length:", res.length);
    if (d !== -1) {
      console.log(res.substring(d, d + 1500));
    } else {
      console.log("No <LEDGER> found!");
    }
  } catch (err) {
    console.error(err);
  }
}
run();

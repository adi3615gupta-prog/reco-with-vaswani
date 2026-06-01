import http from 'http';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

function postTally(xml) {
    return new Promise((resolve, reject) => {
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
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(xml);
        req.end();
    });
}

const ledgerXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerMaster</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyLedgerMaster">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function run() {
    try {
        console.log("Fetching ledger metadata...");
        const start = Date.now();
        const data = await postTally(ledgerXml);
        console.log("Fetched in", (Date.now() - start)/1000, "seconds");
        
        const dom = new JSDOM(data.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#x?\\d+;)/g, '&amp;'), { contentType: 'text/xml' });
        const doc = dom.window.document;
        const ledgers = Array.from(doc.getElementsByTagName('LEDGER'));
        
        for (const ledger of ledgers) {
            const name = (ledger.getElementsByTagName('NAME')[0]?.textContent || ledger.getAttribute('NAME') || '').trim();
            if (name.includes('WINDAIR')) {
               console.log("LEDGER MATCH:", name);
               console.log("  PARTYGSTIN:", ledger.getElementsByTagName('PARTYGSTIN')[0]?.textContent);
               console.log("  GSTIN:", ledger.getElementsByTagName('GSTIN')[0]?.textContent);
               console.log("  RAW XML:", ledger.outerHTML);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();

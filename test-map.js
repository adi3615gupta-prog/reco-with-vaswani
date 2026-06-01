import http from 'http';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

function parseXml(xmlStr) {
  const sanitized = xmlStr.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#x?\\d+;)/g, '&amp;');
  const dom = new JSDOM(sanitized, { contentType: 'text/xml' });
  return dom.window.document;
}

function getTextContent(el, tag) {
  if (!el) return '';
  if (el.hasAttribute(tag)) {
    return el.getAttribute(tag) || '';
  }
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

function getAllElements(el, tag) {
  return Array.from(el.getElementsByTagName(tag));
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
            <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

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

async function run() {
    try {
        console.log("Fetching ledgers...");
        const ledgerData = await postTally(ledgerXml);
        const doc = parseXml(ledgerData);
        const ledgers = getAllElements(doc, 'LEDGER');
        
        let gstinMap = new Map();
        for (const ledger of ledgers) {
            const name = (getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '').trim();
            const gstin = getTextContent(ledger, 'PARTYGSTIN').trim();
            if (name && gstin && gstin.length >= 15) {
                gstinMap.set(name.toUpperCase(), gstin.toUpperCase());
            }
        }
        console.log(`Loaded ${gstinMap.size} GSTINs into map.`);
        console.log(`'S P TRADING COMPANY' in map?`, gstinMap.has('S P TRADING COMPANY'));
        console.log(`'WINDAIR GAS SOLUTIONS LLP' in map?`, gstinMap.has('WINDAIR GAS SOLUTIONS LLP'));
        
    } catch (e) {
        console.error(e);
    }
}

run();

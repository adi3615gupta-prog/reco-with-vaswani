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

const xml = `<ENVELOPE>
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
    try {
        const doc = parseXml(data);
        const ledgers = getAllElements(doc, 'LEDGER');
        let gstinCount = 0;
        let sampleMap = {};
        for (const ledger of ledgers) {
            const name = getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '';
            const parent = getTextContent(ledger, 'PARENT') || '';
            const gstin = getTextContent(ledger, 'PARTYGSTIN').trim();
            if (name && gstin && gstin.length >= 15) {
                gstinCount++;
                if (gstinCount <= 10) {
                    sampleMap[name.toUpperCase()] = gstin.toUpperCase();
                }
            }
        }
        console.log(`Parsed ${ledgers.length} ledgers. Found ${gstinCount} with valid GSTINs.`);
        console.log('Sample GSTIN Map:', sampleMap);
    } catch (e) {
        console.error('Error parsing:', e);
    }
  });
});

req.on('error', e => console.error(e));
req.write(xml);
req.end();

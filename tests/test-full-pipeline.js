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

async function run() {
    try {
        console.log("Fetching ledger metadata...");
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
        console.log(`Map has S P TRADING COMPANY: ${gstinMap.has('S P TRADING COMPANY')}`);
        
        console.log("Fetching vouchers for a single date...");
        const vchXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>DayBook</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20250401</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="DayBook">
            <TYPE>Voucher</TYPE>
            <FETCH>Date,VoucherTypeName,VoucherNumber,Reference,PartyName,BasicBuyerName,ConsigneeName,LedgerEntries.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

        const vchData = await postTally(vchXml);
        const vchDoc = parseXml(vchData);
        const vouchers = getAllElements(vchDoc, 'VOUCHER');
        
        for (const v of vouchers) {
             const rawXml = v.outerHTML || v.innerHTML || '';
             if (rawXml.includes('S P TRADING') || rawXml.includes('WINDAIR')) {
                 const vchNum = getTextContent(v, 'VOUCHERNUMBER');
                 let partyName = getTextContent(v, 'PARTYNAME').trim();
                 let basicBuyerName = getTextContent(v, 'BASICBUYERNAME').trim();
                 let consigneeName = getTextContent(v, 'CONSIGNEENAME').trim();
                 let partyLedgerName = getTextContent(v, 'PARTYLEDGERNAME').trim();

                 const entries = getAllElements(v, 'ALLLEDGERENTRIES.LIST');
                 let firstEntry = entries[0];
                 
                 let fallbackPartyName = '';
                 let maxAmt = 0;
                 for(const e of entries) {
                    const ln = getTextContent(e, 'LEDGERNAME');
                    const amt = Math.abs(parseFloat(getTextContent(e, 'AMOUNT') || '0'));
                    if (!ln.includes('PURCHASE') && !ln.includes('SALES') && !ln.includes('GST')) {
                        if (amt > maxAmt) { maxAmt = amt; fallbackPartyName = ln.trim(); }
                    }
                 }

                 if (!partyName) {
                     partyName = getTextContent(firstEntry, 'BASICBUYERNAME').trim() || fallbackPartyName || 'Unknown Party';
                 }

                 let partyGstin = '';
                 if (gstinMap.has(partyName.toUpperCase())) {
                     partyGstin = gstinMap.get(partyName.toUpperCase());
                 } else if (fallbackPartyName && gstinMap.has(fallbackPartyName.toUpperCase())) {
                     partyGstin = gstinMap.get(fallbackPartyName.toUpperCase());
                 }
                 
                 console.log("VOUCHER:", vchNum);
                 console.log("  partyName:", partyName, `(${partyName.length} chars)`);
                 console.log("  fallbackPartyName:", fallbackPartyName, `(${fallbackPartyName.length} chars)`);
                 console.log("  PARTYLEDGERNAME:", partyLedgerName);
                 console.log("  MAPPED GSTIN:", partyGstin);
             }
        }
    } catch (e) {
        console.error(e);
    }
}
run();

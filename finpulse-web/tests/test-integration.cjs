const http = require('http');
const { DOMParser } = require('@xmldom/xmldom');

function parseXml(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'text/xml');
}

function getTextContent(el, tag) {
  if (!el) return '';
  if (el.hasAttribute && el.hasAttribute(tag)) {
    return el.getAttribute(tag) || '';
  }
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

function getAllElements(el, tag) {
  if (!el || !el.getElementsByTagName) return [];
  return Array.from(el.getElementsByTagName(tag));
}

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

const groupsXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Groups</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="List of Groups"><FETCH>Name, Parent</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
const ledgersXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Ledgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="List of Ledgers"><FETCH>Name, Parent, PartyGSTIN, ConsigneeGSTIN, GSTIN</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

async function run() {
  try {
    console.log("Fetching groups...");
    const gRes = await sendTallyRequest(groupsXml);
    const gDoc = parseXml(gRes);
    const groups = getAllElements(gDoc, 'GROUP');
    console.log("Groups found:", groups.length);

    const groupParentMap = new Map();
    for (const g of groups) {
      const name = getTextContent(g, 'NAME').toUpperCase();
      const parent = getTextContent(g, 'PARENT').toUpperCase();
      if (name) groupParentMap.set(name, parent);
    }
    console.log("ITC parent:", groupParentMap.get('ITC'));
    console.log("CGST parent:", groupParentMap.get('CGST'));
    
    const belongsTo = (group, target) => {
      let current = group.toUpperCase();
      const visited = new Set();
      while (current && !visited.has(current)) {
        if (current === target) return true;
        visited.add(current);
        current = groupParentMap.get(current) || '';
      }
      return false;
    };

    console.log("Fetching ledgers...");
    const lRes = await sendTallyRequest(ledgersXml);
    const lDoc = parseXml(lRes);
    const ledgers = getAllElements(lDoc, 'LEDGER');
    console.log("Ledgers found:", ledgers.length);

    const taxMap = new Map();
    for (const l of ledgers) {
      const name = getTextContent(l, 'NAME').toUpperCase();
      const parent = getTextContent(l, 'PARENT').toUpperCase();
      
      const isITC = belongsTo(parent, 'ITC') || belongsTo(parent, 'DUTIES & TAXES') || belongsTo(parent, 'DUTIES AND TAXES');
      const isOutput = belongsTo(parent, 'OUTPUT');
      const isRCM = belongsTo(parent, 'RCM');
      
      if (isITC || isOutput || isRCM) {
        taxMap.set(name, { parent, isITC, isOutput, isRCM });
      }
    }
    console.log("Tax map size:", taxMap.size);
    for (const [k, v] of taxMap.entries()) {
      if (taxMap.size <= 20 || v.parent === 'ITC') {
        console.log(" -", k, v);
      }
    }
    if (taxMap.size > 20) console.log("... (truncated)");

    console.log("Fetching a few vouchers...");
    const vchXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>MyLedgerEntries_Purchase</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="MyVouchers_Purchase"><TYPE>Voucher</TYPE><FILTER>IsPurchase</FILTER></COLLECTION><SYSTEM TYPE="FORMULAS" NAME="IsPurchase">($VoucherTypeName = "Purchase") AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM><COLLECTION NAME="MyLedgerEntries_Purchase"><SOURCECOLLECTION>MyVouchers_Purchase</SOURCECOLLECTION><WALK>AllLedgerEntries</WALK><COMPUTE>Guid : $..GUID</COMPUTE><COMPUTE>VchNumber : $..VoucherNumber</COMPUTE><COMPUTE>LedgerName : $LedgerName</COMPUTE><COMPUTE>Amount : $Amount</COMPUTE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    const vRes = await sendTallyRequest(vchXml);
    const vDoc = parseXml(vRes);
    const entries = getAllElements(vDoc, 'LEDGERENTRY');
    console.log("Ledger entries found:", entries.length);

    let matchCount = 0;
    const unmatched = new Set();
    for (const e of entries) {
      const ln = getTextContent(e, 'LEDGERNAME').toUpperCase();
      if (taxMap.has(ln)) {
        matchCount++;
      } else {
        unmatched.add(ln);
      }
    }
    console.log("Entries matched in tax map:", matchCount);
    console.log("Some unmatched ledgers:");
    Array.from(unmatched).slice(0, 10).forEach(x => console.log(" -", x));

  } catch (err) {
    console.error(err);
  }
}
run();

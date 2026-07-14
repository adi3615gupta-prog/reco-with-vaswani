import http from 'http';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

const xml = `<ENVELOPE>
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
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="DayBook">
            <TYPE>Voucher</TYPE>
            <FETCH>Date,VoucherTypeName,VoucherNumber,Reference,PartyName,BasicBuyerName,ConsigneeName,LedgerEntries.*</FETCH>
            <FILTERS>VchTypeFilter</FILTERS>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="VchTypeFilter">
            $VoucherNumber = "4" OR $VoucherNumber = "12/2025-25" OR $VoucherNumber = "GST/PUR/1100"
          </SYSTEM>
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
        console.log("Fetching vouchers...");
        const data = await postTally(xml);
        const doc = parseXml(data);
        const vouchers = getAllElements(doc, 'VOUCHER');
        console.log(`Fetched ${vouchers.length} vouchers`);
        for (const v of vouchers) {
            const vchNum = getTextContent(v, 'VOUCHERNUMBER');
            console.log("Found Voucher:", vchNum);
            console.log("  PARTYNAME:", getTextContent(v, 'PARTYNAME'));
            console.log("  BASICBUYERNAME:", getTextContent(v, 'BASICBUYERNAME'));
            console.log("  CONSIGNEENAME:", getTextContent(v, 'CONSIGNEENAME'));
                 
            // extract all ledger names
            const entries = getAllElements(v, 'ALLLEDGERENTRIES.LIST');
            for(const e of entries) {
               console.log("  Ledger:", getTextContent(e, 'LEDGERNAME'), "Amt:", getTextContent(e, 'AMOUNT'));
            }
            const invEntries = getAllElements(v, 'ALLINVENTORYENTRIES.LIST');
            for(const e of invEntries) {
               const accounting = getAllElements(e, 'ACCOUNTINGALLOCATIONS.LIST');
               for(const a of accounting) {
                  console.log("  Inv Ledger:", getTextContent(a, 'LEDGERNAME'), "Amt:", getTextContent(a, 'AMOUNT'));
               }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();

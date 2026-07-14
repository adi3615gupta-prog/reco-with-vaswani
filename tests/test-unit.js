import jsdom from 'jsdom';
const { JSDOM } = jsdom;

const ledgerXml = `
<ENVELOPE>
  <BODY>
    <DESC>
        <TDLMESSAGE>
            <LEDGER NAME="S P TRADING COMPANY">
               <PARTYGSTIN>27AADPO5820H1ZQ</PARTYGSTIN>
            </LEDGER>
        </TDLMESSAGE>
    </DESC>
  </BODY>
</ENVELOPE>
`;

const voucherXml = `
<ENVELOPE>
  <BODY>
    <DESC>
        <TDLMESSAGE>
            <VOUCHER>
               <VOUCHERNUMBER>4</VOUCHERNUMBER>
               <PARTYNAME>S P TRADING COMPANY</PARTYNAME>
               <BASICBUYERNAME>S P TRADING COMPANY</BASICBUYERNAME>
               <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>S P TRADING COMPANY</LEDGERNAME>
                  <AMOUNT>-1581.00</AMOUNT>
               </ALLLEDGERENTRIES.LIST>
            </VOUCHER>
        </TDLMESSAGE>
    </DESC>
  </BODY>
</ENVELOPE>
`;

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

let gstinMap = new Map();
const lDoc = parseXml(ledgerXml);
const ledgers = getAllElements(lDoc, 'LEDGER');
for (const ledger of ledgers) {
    const name = (getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '').trim();
    const gstin = getTextContent(ledger, 'PARTYGSTIN').trim();
    if (name && gstin) {
        gstinMap.set(name.toUpperCase(), gstin.toUpperCase());
    }
}
console.log("gstinMap:", gstinMap);

const vDoc = parseXml(voucherXml);
const vouchers = getAllElements(vDoc, 'VOUCHER');
for (const v of vouchers) {
    let partyName = getTextContent(v, 'PARTYNAME').trim();
    
    let partyGstin = '';
    if (gstinMap.has(partyName.toUpperCase())) {
        partyGstin = gstinMap.get(partyName.toUpperCase());
    }
    console.log("partyName:", partyName);
    console.log("partyGstin:", partyGstin);
}

import jsdom from 'jsdom';
const { JSDOM } = jsdom;

const xml = `<ENVELOPE>
 <BODY>
  <DATA>
   <COLLECTION>
    <LEDGER NAME="AAR-EM ELECTRONICS PVT LTD" RESERVEDNAME="">
     <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
       <NAME>AAR-EM ELECTRONICS PVT LTD</NAME>
      </NAME.LIST>
      <LANGUAGEID> 1033</LANGUAGEID>
     </LANGUAGENAME.LIST>
     <PARTYGSTIN TYPE="String">27AABCA5148B1Z4</PARTYGSTIN>
    </LEDGER>
   </COLLECTION>
  </DATA>
 </BODY>
</ENVELOPE>`;

const dom = new JSDOM(xml, { contentType: 'text/xml' });
const doc = dom.window.document;

function getTextContent(el, tag) {
  if (!el) return '';
  if (el.hasAttribute(tag)) {
    return el.getAttribute(tag) || '';
  }
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

const ledgers = Array.from(doc.getElementsByTagName('LEDGER'));

for (const ledger of ledgers) {
  const name = getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '';
  const gstin = getTextContent(ledger, 'PARTYGSTIN').trim();
  console.log(`Name: '${name}', GSTIN: '${gstin}'`);
}

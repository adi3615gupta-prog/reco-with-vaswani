import { parseXml, getAllElements, getTextContent } from './src/lib/tallyApi.ts';

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

const doc = parseXml(xml);
const ledgers = getAllElements(doc, 'LEDGER');

for (const ledger of ledgers) {
  const name = getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '';
  const gstin = getTextContent(ledger, 'PARTYGSTIN').trim();
  console.log(`Name: '${name}', GSTIN: '${gstin}'`);
}

import { parseXml, getAllElements, getTextContent } from './src/lib/tallyApi.ts';

const xml = `<ENVELOPE>
 <BODY>
  <DATA>
   <COLLECTION>
    <COMPANY NAME="DYP INFRAPROJECTS PVT.LTD." RESERVEDNAME="">
     <NAME TYPE="String">DYP INFRAPROJECTS PVT.LTD.</NAME>
    </COMPANY>
   </COLLECTION>
  </DATA>
 </BODY>
</ENVELOPE>`;

const doc = parseXml(xml);
const companies = getAllElements(doc, 'COMPANY');
const co = companies[0];

const name1 = getTextContent(co, 'NAME');
const name2 = co.getAttribute('NAME');

console.log('NAME element:', name1);
console.log('NAME attribute:', name2);

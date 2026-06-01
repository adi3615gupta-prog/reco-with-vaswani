const { DOMParser } = require('@xmldom/xmldom');

function parseXml(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'text/xml');
}

function getTextContent(element, tagName) {
  const nodes = element.getElementsByTagName(tagName);
  return nodes.length > 0 ? (nodes[0].textContent || '').trim() : '';
}

function getAllElements(doc, tagName) {
  const collection = doc.getElementsByTagName(tagName);
  return Array.from(collection);
}

function safeNum(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

const xml = `
<ENVELOPE>
  <MyLedgerEntries_Purchase>
    <GUID>abc-123</GUID>
    <VCHTYPE>Purchase</VCHTYPE>
    <LEDGERNAME>S P TRADING COMPANY</LEDGERNAME>
    <AMOUNT>1581.00</AMOUNT>
  </MyLedgerEntries_Purchase>
  <MyLedgerEntries_Purchase>
    <GUID>abc-123</GUID>
    <VCHTYPE>Purchase</VCHTYPE>
    <LEDGERNAME>Purchase A/c</LEDGERNAME>
    <AMOUNT>-1500.00</AMOUNT>
  </MyLedgerEntries_Purchase>
  <MyLedgerEntries_Purchase>
    <GUID>abc-123</GUID>
    <VCHTYPE>Purchase</VCHTYPE>
    <LEDGERNAME>1.CGST @ 9% Input</LEDGERNAME>
    <AMOUNT>-40.50</AMOUNT>
  </MyLedgerEntries_Purchase>
  <MyLedgerEntries_Purchase>
    <GUID>abc-123</GUID>
    <VCHTYPE>Purchase</VCHTYPE>
    <LEDGERNAME>1.SGST @ 9% Input</LEDGERNAME>
    <AMOUNT>-40.50</AMOUNT>
  </MyLedgerEntries_Purchase>
</ENVELOPE>
`;

const doc = parseXml(xml);
const ledgerEntries = getAllElements(doc, 'LEDGERENTRY');
console.log("LEDGERENTRY count:", ledgerEntries.length);

const allNodes = getAllElements(doc, 'MyLedgerEntries_Purchase');
console.log("MyLedgerEntries_Purchase count:", allNodes.length);

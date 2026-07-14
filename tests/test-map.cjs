const http = require('http');
const { DOMParser } = require('@xmldom/xmldom');

function parseXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const errorNode = doc.getElementsByTagName('parsererror')[0];
  if (errorNode) throw new Error('Error parsing XML');
  return doc;
}

function getTextContent(element, tagName) {
  const nodes = element.getElementsByTagName(tagName);
  return nodes.length > 0 ? (nodes[0].textContent || '').trim() : '';
}

function getAllElements(doc, tagName) {
  const collection = doc.getElementsByTagName(tagName);
  return Array.from(collection);
}

async function test() {
  const config = { hostname: 'localhost', port: 9000 };
  
  const req = (xml) => new Promise((resolve, reject) => {
    const request = http.request({ ...config, method: 'POST', headers: { 'Content-Type': 'text/xml' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    request.on('error', reject);
    request.write(xml);
    request.end();
  });

  const groupXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AllGroups</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="AllGroups"><TYPE>Group</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const ledgerXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerGstins</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="LedgerGstins"><TYPE>Ledger</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

  const groupDoc = parseXml(await req(groupXml));
  const groupParentMap = new Map();
  for (const g of getAllElements(groupDoc, 'GROUP')) {
    groupParentMap.set(getTextContent(g, 'NAME').toUpperCase(), getTextContent(g, 'PARENT').toUpperCase());
  }

  const belongsTo = (groupName, targetGroup) => {
    let current = groupName.toUpperCase();
    const target = targetGroup.toUpperCase();
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === target) return true;
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return false;
  };

  const getTaxCategory = (ledgerName, startGroup) => {
    if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED')) return 'IGST';
    if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL')) return 'CGST';
    if (ledgerName.includes('SGST') || ledgerName.includes('STATE') || ledgerName.includes('UTGST')) return 'SGST';

    let current = startGroup.toUpperCase();
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current.includes('IGST') || current.includes('INTEGRATED')) return 'IGST';
      if (current.includes('CGST') || current.includes('CENTRAL')) return 'CGST';
      if (current.includes('SGST') || current.includes('STATE') || current.includes('UTGST')) return 'SGST';
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return null;
  };

  const ledgerDoc = parseXml(await req(ledgerXml));
  const taxMap = new Map();
  for (const ledger of getAllElements(ledgerDoc, 'LEDGER')) {
    const name = getTextContent(ledger, 'NAME').toUpperCase();
    const parent = getTextContent(ledger, 'PARENT').toUpperCase();
    const isITC = belongsTo(parent, 'ITC');
    const isOutput = belongsTo(parent, 'OUTPUT');
    if (isITC || isOutput) taxMap.set(name, { parent, isITC, isOutput, taxCategory: getTaxCategory(name, parent) });
  }

  console.log(`Groups parsed: ${groupParentMap.size}`);
  console.log(`Ledgers mapped to ITC/OUTPUT: ${taxMap.size}`);
  console.log(taxMap);
}
test().catch(console.error);

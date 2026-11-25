const fs = require('fs');
async function test() {
  const xml = `<ENVELOPE>
  <BODY>
    <DESC>
    </DESC>
    <DATA>
      <COLLECTION>
        <GROUP>
          <NAME>Duties &amp; Taxes</NAME>
          <PARENT>Current Liabilities</PARENT>
        </GROUP>
        <GROUP>
          <NAME>ITC</NAME>
          <PARENT>Duties &amp; Taxes</PARENT>
        </GROUP>
        <LEDGER>
          <NAME>Input CGST 14%</NAME>
          <PARENT>ITC</PARENT>
        </LEDGER>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;
  
  const { DOMParser } = require('@xmldom/xmldom');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  
  const groupParentMap = new Map();
  const groups = doc.getElementsByTagName('GROUP');
  for (let i = 0; i < groups.length; i++) {
    const name = groups[i].getElementsByTagName('NAME')[0]?.textContent?.trim().toUpperCase();
    const parent = groups[i].getElementsByTagName('PARENT')[0]?.textContent?.trim().toUpperCase();
    if (name && parent) {
      groupParentMap.set(name, parent);
    }
  }
  console.log(groupParentMap);
  
  const belongsTo = (group, target) => {
    let current = group;
    const visited = new Set();
    while (current) {
      if (current === target) return true;
      if (visited.has(current)) break;
      visited.add(current);
      current = groupParentMap.get(current);
    }
    return false;
  };
  
  console.log('isITC:', belongsTo('ITC', 'ITC'));
  console.log('isITC Parent:', belongsTo('DUTIES & TAXES', 'ITC')); // false
}
test();

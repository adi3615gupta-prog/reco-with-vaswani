const fs = require('fs');

async function fetchTallyMetadata() {
  const groupXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllGroups</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllGroups">
            <TYPE>Group</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  const groupResp = await fetch('http://localhost:9000', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: groupXml,
  }).then(r => r.text());

  // Parse XML using regex instead of DOM for the test script
  const groupParentMap = new Map();
  const groupMatches = groupResp.match(/<GROUP NAME="([^"]+)"[^>]*>\s*<PARENT[^>]*>([^<]+)<\/PARENT>/g) || [];
  for (const match of groupMatches) {
    const nameMatch = match.match(/NAME="([^"]+)"/);
    const parentMatch = match.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/);
    if (nameMatch && parentMatch) {
      groupParentMap.set(nameMatch[1].toUpperCase(), parentMatch[1].toUpperCase());
    }
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

  console.log("ITC Parent:", groupParentMap.get('ITC'));
  console.log("Duties & Taxes Parent:", groupParentMap.get('DUTIES & TAXES'));
  console.log("Does ITC belong to Duties & Taxes?", belongsTo('ITC', 'DUTIES & TAXES'));
  console.log("Does Input CGST 9% (parent ITC) belong to ITC?", belongsTo('ITC', 'ITC'));
}

fetchTallyMetadata().catch(console.error);

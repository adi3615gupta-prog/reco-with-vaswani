const http = require('http');

const xmlPayload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyGroupExport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="MyGroupExport">
            <FORMS>MyGroupForm</FORMS>
          </REPORT>
          <FORM NAME="MyGroupForm">
            <PARTS>MyGroupPart</PARTS>
          </FORM>
          <PART NAME="MyGroupPart">
            <LINES>MyGroupLine</LINES>
            <REPEAT>MyGroupLine : MyGroupCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="MyGroupLine">
            <FIELDS>GroupName, GroupParent</FIELDS>
            <XMLTAG>"GROUP"</XMLTAG>
          </LINE>
          <FIELD NAME="GroupName">
            <SET>$Name</SET>
            <XMLTAG>"NAME"</XMLTAG>
          </FIELD>
          <FIELD NAME="GroupParent">
            <SET>$Parent</SET>
            <XMLTAG>"PARENT"</XMLTAG>
          </FIELD>
          <COLLECTION NAME="MyGroupCollection">
            <TYPE>Group</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const fs = require('fs');
const req = http.request(
  {
    hostname: 'localhost',
    port: 9000,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(xmlPayload)
    }
  },
  (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      fs.writeFileSync('tally_response.xml', data);
      console.log('Saved to tally_response.xml');
    });
  }
);
req.on('error', e => console.error('ERROR:', e.message));
req.write(xmlPayload);
req.end();

const http = require('http');

function sendTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: 'localhost',
      port: 9000,
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

async function run() {
  const queryXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyVouchers_Pramod</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20260331</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVouchers_Pramod">
            <TYPE>Voucher</TYPE>
            <FETCH>Date, VoucherNumber, VoucherTypeName, PartyLedgerName, PartyName, BasicBuyerName, AllLedgerEntries.List.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  console.log('Sending Tally query...');
  const xmlRes = await sendTally(queryXml);
  console.log('Received XML length:', xmlRes.length);

  // Search for PRAMOD in XML
  const vchRegex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let vchMatch;
  let count = 0;
  while ((vchMatch = vchRegex.exec(xmlRes)) !== null) {
    const vchXml = vchMatch[1];
    if (vchXml.includes('PRAMOD') || vchXml.includes('BPCPM4049H') || vchXml.includes('9419') || vchXml.includes('5694')) {
      count++;
      const vchNum = (vchXml.match(/<VOUCHERNUMBER[^>]*>([^<]+)<\/VOUCHERNUMBER>/i) || [])[1];
      const vchType = (vchXml.match(/<VOUCHERTYPENAME[^>]*>([^<]+)<\/VOUCHERTYPENAME>/i) || [])[1];
      const date = (vchXml.match(/<DATE[^>]*>([^<]+)<\/DATE>/i) || [])[1];
      const party = (vchXml.match(/<PARTYLEDGERNAME[^>]*>([^<]+)<\/PARTYLEDGERNAME>/i) || [])[1];
      
      console.log(`\n=== VOUCHER #${vchNum} (${vchType}) Date: ${date} Party: ${party} ===`);
      
      const ledgerRegex = /<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/gi;
      let lMatch;
      while ((lMatch = ledgerRegex.exec(vchXml)) !== null) {
        const lXml = lMatch[1];
        const lname = (lXml.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i) || [])[1];
        const amount = (lXml.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i) || [])[1];
        const isPos = (lXml.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i) || [])[1];
        console.log(`   Ledger: "${lname}" | Amount: ${amount} | IsDeemedPositive: ${isPos}`);
      }
    }
  }
  console.log(`\nTotal matching vouchers found: ${count}`);
}

run().catch(console.error);

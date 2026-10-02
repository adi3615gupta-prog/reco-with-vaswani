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
    <ID>MyLedgerEntries_Journal</ID>
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
          <COLLECTION NAME="MyVouchers_Journal">
            <TYPE>Voucher</TYPE>
            <FILTER>IsJournalOrPayment</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsJournalOrPayment">($$IsJournal:$VoucherTypeName OR $$IsPayment:$VoucherTypeName OR $$IsPurchase:$VoucherTypeName) AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
          <COLLECTION NAME="MyLedgerEntries_Journal">
            <SOURCECOLLECTION>MyVouchers_Journal</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyNameTag : $..PartyLedgerName</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  console.log('Sending Tally query...');
  const xmlRes = await sendTally(queryXml);
  console.log('Received XML length:', xmlRes.length);

  const entries = xmlRes.split(/<MYLEDGERENTRIES_JOURNAL\b/i);
  console.log('Total ledger entry blocks:', entries.length - 1);

  // Group by VchNumber + VchType
  const vchs = {};
  for (let i = 1; i < entries.length; i++) {
    const block = entries[i];
    const vchNum = (block.match(/<VCHNUMBER[^>]*>([^<]+)<\/VCHNUMBER>/i) || [])[1] || '';
    const vchType = (block.match(/<VCHTYPE[^>]*>([^<]+)<\/VCHTYPE>/i) || [])[1] || '';
    const vchDate = (block.match(/<VCHDATE[^>]*>([^<]+)<\/VCHDATE>/i) || [])[1] || '';
    const partyTag = (block.match(/<PARTYNAMETAG[^>]*>([^<]+)<\/PARTYNAMETAG>/i) || [])[1] || '';
    const ledger = (block.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i) || [])[1] || '';
    const amount = (block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i) || [])[1] || '';
    const isPos = (block.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i) || [])[1] || '';

    const key = `${vchType} #${vchNum} (${vchDate})`;
    if (!vchs[key]) vchs[key] = { partyTag, entries: [] };
    vchs[key].entries.push({ ledger, amount, isPos });
  }

  let matchedVchs = 0;
  for (const [key, vch] of Object.entries(vchs)) {
    const str = JSON.stringify(vch);
    if (str.includes('PRAMOD') || str.includes('BPCPM4049H') || str.includes('9419') || str.includes('5694')) {
      matchedVchs++;
      console.log(`\n=== ${key} | PartyTag: "${vch.partyTag}" ===`);
      vch.entries.forEach(e => {
        console.log(`   Ledger: "${e.ledger}" | Amount: ${e.amount} | IsDeemedPositive: ${e.isPos}`);
      });
    }
  }
  console.log(`\nMatched ${matchedVchs} vouchers related to Pramod Mali.`);
}

run().catch(console.error);

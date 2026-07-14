const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9000;

function postTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

const companyXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ListOfCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ListOfCompanies">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const voucherXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20250401</SVFROMDATE>
        <SVTODATE>20250410</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVouchers">
            <TYPE>Voucher</TYPE>
            <FILTER>IsPurchase</FILTER>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyName : $..PartyLedgerName</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsPurchase">$VoucherTypeName = "Purchase" AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function run() {
  try {
    console.log("Checking active company...");
    const coResp = await postTally(companyXml);
    fs.writeFileSync('tally_debug_company.xml', coResp);
    console.log("Saved tally_debug_company.xml");

    console.log("Fetching sample Purchase vouchers...");
    const vchResp = await postTally(voucherXml);
    fs.writeFileSync('tally_debug_vouchers.xml', vchResp);
    console.log("Saved tally_debug_vouchers.xml");

    // Let's do a simple regex parse to output to console
    const ledgerBlockRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/g;
    let match;
    let count = 0;
    console.log("\n--- Parsed Ledger Entries (Sample) ---");
    while ((match = ledgerBlockRegex.exec(vchResp)) !== null && count < 30) {
      const block = match[1];
      const vchNum = (block.match(/<VCHNUMBER[^>]*>([^<]+)<\/VCHNUMBER>/) || [])[1] || '';
      const party = (block.match(/<PARTYNAME[^>]*>([^<]+)<\/PARTYNAME>/) || [])[1] || '';
      const ledger = (block.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/) || [])[1] || '';
      const amt = (block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/) || [])[1] || '';
      const isDebit = (block.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/) || [])[1] || '';
      console.log(`Vch: ${vchNum} | Party: ${party} | Ledger: ${ledger} | Amt: ${amt} | Debit: ${isDebit}`);
      count++;
    }

  } catch (err) {
    console.error("Diagnostic execution error:", err.message);
  }
}

run();

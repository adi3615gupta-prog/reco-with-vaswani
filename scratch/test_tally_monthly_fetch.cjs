const http = require('http');
const fs = require('fs');

function sendTallyRequest(xml, port = 9000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: port,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(xml)
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

function parseXml(xmlStr) {
  // Simple regex parser for testing
  const parser = {
    getElementsByTagName: (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
      const matches = [];
      let m;
      while ((m = regex.exec(xmlStr)) !== null) {
        matches.push(m[1]);
      }
      return matches;
    }
  };
  return parser;
}

// Regex helpers to get tag value
function getTagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

async function test() {
  const fromDate = '2025-04-01';
  const toDate = '2026-03-31';

  // 1. Get FA ledgers
  const ledgerXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FALedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FALedgers">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    console.log("Fetching ledgers...");
    const ledgersRes = await sendTallyRequest(ledgerXml);
    
    // We clean the ledgers and filter by name or parent group
    // In our main code, we fetch metadata first. For this test, let's just parse all ledgers
    // and identify ledgers that are under "Fixed Assets" or have fixed asset keywords.
    const faLedgers = new Set();
    const ledgerRegex = /<LEDGER[^>]*NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g;
    let m;
    while ((m = ledgerRegex.exec(ledgersRes)) !== null) {
      const name = m[1].trim().toUpperCase();
      const parent = getTagValue(m[2], 'PARENT').trim().toUpperCase();
      
      // Keep only fixed assets group (fuzzy parent check)
      if (parent.includes('FIXED') || parent.includes('PLANT') || parent.includes('COMPUTER') || parent.includes('VEHICLE') || parent.includes('BUILDING') || parent.includes('FURNITURE')) {
        faLedgers.add(name);
      }
    }
    console.log("Found FA Ledgers for test:", Array.from(faLedgers).slice(0, 10));

    // Generate monthly chunks
    const getMonthlyIntervals = (fromDateStr, toDateStr) => {
      const start = new Date(fromDateStr);
      const end = new Date(toDateStr);
      const intervals = [];
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth();
        const monthStart = new Date(y, m, 1);
        const clampStart = monthStart < start ? start : monthStart;
        const monthEnd = new Date(y, m + 1, 0);
        const clampEnd = monthEnd > end ? end : monthEnd;
        if (clampStart <= clampEnd) {
          intervals.push({
            from: clampStart.toISOString().split('T')[0].replace(/-/g, ''),
            to: clampEnd.toISOString().split('T')[0].replace(/-/g, '')
          });
        }
        current.setMonth(current.getMonth() + 1);
      }
      return intervals;
    };

    const chunks = getMonthlyIntervals(fromDate, toDate);
    console.log("Monthly chunks:", chunks);

    // Let's test the first chunk (April 2025)
    const chunk = chunks[0];
    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerEntries_FA</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${chunk.from}</SVFROMDATE>
        <SVTODATE>${chunk.to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVouchers_FA">
            <TYPE>Voucher</TYPE>
            <FILTER>IsFAVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsFAVch">
            ($$IsJournal:$VoucherTypeName OR $$IsPayment:$VoucherTypeName OR $$IsPurchase:$VoucherTypeName OR $$IsReceipt:$VoucherTypeName OR $VoucherTypeName = "Journal" OR $VoucherTypeName = "Payment" OR $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Receipt") AND NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>
          
          <COLLECTION NAME="MyLedgerEntries_FA">
            <SOURCECOLLECTION>MyVouchers_FA</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    console.log("Fetching first chunk XML...");
    const res = await sendTallyRequest(xml);
    fs.writeFileSync('scratch_res_chunk1.xml', res);
    console.log("Saved chunk 1 response. Size:", res.length);
    
    // Check if we got entries
    const entries = res.match(/<MYLEDGERENTRIES_FA[^>]*>([\s\S]*?)<\/MYLEDGERENTRIES_FA>/gi);
    console.log("Total matched entries in chunk 1:", entries ? entries.length : 0);
    if (entries && entries.length > 0) {
      console.log("Sample entries:");
      entries.slice(0, 5).forEach(e => {
        const name = getTagValue(e, 'LEDGERNAME');
        const amt = getTagValue(e, 'AMOUNT');
        const date = getTagValue(e, 'VCHDATE');
        const pos = getTagValue(e, 'ISDEEMEDPOSITIVE');
        console.log(`- ${name} | Amt: ${amt} | Date: ${date} | Debit: ${pos}`);
      });
    }

  } catch (err) {
    console.error(err);
  }
}
test();

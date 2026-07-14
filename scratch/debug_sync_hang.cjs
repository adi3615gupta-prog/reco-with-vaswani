const http = require('http');

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

function unescapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function safeNum(val) {
  if (!val) return 0;
  const cleaned = val.replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

function tallyDateToISO(tallyDate) {
  if (!tallyDate || tallyDate.length !== 8) return '';
  const y = tallyDate.slice(0, 4);
  const m = tallyDate.slice(4, 6);
  const d = tallyDate.slice(6, 8);
  return `${y}-${m}-${d}`;
}

const buildAuditLedgersXml = (to) => {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AuditLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVTODATE>${to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AuditLedgers">
            <TYPE>Ledger</TYPE>
            <COMPUTE>ClosingBalance : $ClosingBalance</COMPUTE>
            <COMPUTE>PartyGSTIN : $GSTRegistrationNo</COMPUTE>
            <COMPUTE>Email : $Email</COMPUTE>
            <COMPUTE>Phone : $PhoneNumber</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
};

const buildAuditLedgerEntriesXml = (from, to) => {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AuditLedgerEntries</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${from}</SVFROMDATE>
        <SVTODATE>${to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AuditVouchers">
            <TYPE>Voucher</TYPE>
            <FILTER>IsAuditVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsAuditVch">
            ($$IsJournal:$VoucherTypeName OR $$IsPayment:$VoucherTypeName OR $$IsPurchase:$VoucherTypeName OR $$IsReceipt:$VoucherTypeName OR $$IsSales:$VoucherTypeName OR $$IsCreditNote:$VoucherTypeName OR $$IsDebitNote:$VoucherTypeName OR $VoucherTypeName = "Journal" OR $VoucherTypeName = "Payment" OR $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Receipt" OR $VoucherTypeName = "Sales" OR $VoucherTypeName = "Credit Note" OR $VoucherTypeName = "Debit Note") AND NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>
          
          <COLLECTION NAME="AuditLedgerEntries">
            <SOURCECOLLECTION>AuditVouchers</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
};

const getMetadataXml = () => {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerMetadata</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="LedgerMetadata">
            <TYPE>Ledger</TYPE>
            <COMPUTE>ParentGroup : $Parent</COMPUTE>
            <COMPUTE>GSTIN : $GSTRegistrationNo</COMPUTE>
          </COLLECTION>
          <COLLECTION NAME="GroupMetadata">
            <TYPE>Group</TYPE>
            <COMPUTE>ParentGroup : $Parent</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
};

async function runDebug() {
  console.log("Starting debug run...");
  const config = { port: 9000 };
  
  // 1. Fetch Company Metadata
  console.log("Fetching metadata from Tally...");
  const metaXml = getMetadataXml();
  const metaResp = await sendTallyRequest(metaXml, config.port);
  console.log("Metadata response received, size:", metaResp.length);
  
  const ledgerParentMap = new Map();
  const groupParentMap = new Map();
  const gstinMap = new Map();

  const ledgerRegex = /<LEDGER[^>]*>([\s\S]*?)<\/LEDGER>/ig;
  let lMatch;
  while ((lMatch = ledgerRegex.exec(metaResp)) !== null) {
    const block = lMatch[1];
    const nameTag = block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
    const parentTag = block.match(/<PARENTGROUP[^>]*>([^<]+)<\/PARENTGROUP>/i);
    const gstinTag = block.match(/<GSTIN[^>]*>([^<]+)<\/GSTIN>/i);
    if (nameTag && parentTag) {
      const name = nameTag[1].trim().toUpperCase();
      const parent = parentTag[1].trim().toUpperCase();
      ledgerParentMap.set(name, parent);
      if (gstinTag) gstinMap.set(name, gstinTag[1].trim());
    }
  }

  const groupRegex = /<GROUP[^>]*>([\s\S]*?)<\/GROUP>/ig;
  let gMatch;
  while ((gMatch = groupRegex.exec(metaResp)) !== null) {
    const block = gMatch[1];
    const nameTag = block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
    const parentTag = block.match(/<PARENTGROUP[^>]*>([^<]+)<\/PARENTGROUP>/i);
    if (nameTag && parentTag) {
      groupParentMap.set(nameTag[1].trim().toUpperCase(), parentTag[1].trim().toUpperCase());
    }
  }
  
  console.log("Parsed ledgerParentMap size:", ledgerParentMap.size);
  console.log("Parsed groupParentMap size:", groupParentMap.size);

  const isDebtorOrCreditor = (partyName) => {
    const nameUpper = partyName.toUpperCase().trim();
    const parentGroup = ledgerParentMap.get(nameUpper);
    if (!parentGroup) return null;
    
    let current = parentGroup;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === 'SUNDRY DEBTORS' || current.includes('DEBTORS')) return 'Sundry Debtors';
      if (current === 'SUNDRY CREDITORS' || current.includes('CREDITORS')) return 'Sundry Creditors';
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return null;
  };

  // 2. Fetch closing balances
  console.log("Fetching ledger closing balances...");
  const evaluationDate = '2025-03-31';
  const fromDate = '2024-04-01';
  const to = '20250331';
  const from = '20240401';
  
  const ledgersXml = buildAuditLedgersXml(to);
  const ledgersResp = await sendTallyRequest(ledgersXml, config.port);
  console.log("Ledgers response size:", ledgersResp.length);

  const activeParties = new Map();
  let lMatch2;
  const ledgerRegex2 = /<LEDGER[^>]*>([\s\S]*?)<\/LEDGER>/ig;
  while ((lMatch2 = ledgerRegex2.exec(ledgersResp)) !== null) {
    const block = lMatch2[1];
    const nameTag = block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
    const balTag = block.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i);
    const gstinTag = block.match(/<PARTYGSTIN[^>]*>([^<]+)<\/PARTYGSTIN>/i);
    const emailTag = block.match(/<EMAIL[^>]*>([^<]+)<\/EMAIL>/i);
    const phoneTag = block.match(/<PHONE[^>]*>([^<]+)<\/PHONE>/i);
    
    if (!nameTag) continue;
    
    const partyName = unescapeXml(nameTag[1]).trim();
    const group = isDebtorOrCreditor(partyName);
    if (!group) continue;
    
    const balStr = balTag ? balTag[1].trim() : '0';
    let rawBal = parseFloat(balStr.replace(/[₹,\s]/g, '').trim());
    if (isNaN(rawBal)) rawBal = 0;
    
    let isDebit = false;
    if (balTag && balTag[1].toUpperCase().includes('DR')) {
      isDebit = true;
    } else if (balTag && balTag[1].toUpperCase().includes('CR')) {
      isDebit = false;
    } else {
      isDebit = rawBal < 0;
    }
    
    const absBal = Math.abs(rawBal);
    let outstanding = 0;
    if (group === 'Sundry Debtors') {
      outstanding = isDebit ? absBal : -absBal;
    } else {
      outstanding = !isDebit ? absBal : -absBal;
    }
    
    if (Math.abs(outstanding) < 0.01) continue;
    
    activeParties.set(partyName.toUpperCase(), {
      partyName,
      gstin: gstinTag ? gstinTag[1].trim() : (gstinMap.get(partyName.toUpperCase()) || ''),
      closingBalance: outstanding,
      parentGroup: group,
      email: emailTag ? emailTag[1].trim() : '',
      phone: phoneTag ? phoneTag[1].trim() : ''
    });
  }
  
  console.log("Found active debtors/creditors with non-zero balances:", activeParties.size);

  // 3. Fetch transaction entries
  console.log("Fetching ledger vouchers...");
  const entriesXml = buildAuditLedgerEntriesXml(from, to);
  const resp = await sendTallyRequest(entriesXml, config.port);
  console.log("Vouchers response size:", resp.length);

  const partyVouchers = new Map();
  const entryBlockRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/ig;
  let match;
  let matchCount = 0;
  
  while ((match = entryBlockRegex.exec(resp)) !== null) {
    const block = match[1];
    const ledgerNameTag = block.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i);
    if (!ledgerNameTag) continue;
    
    const ledgerName = unescapeXml(ledgerNameTag[1]).trim().toUpperCase();
    if (!activeParties.has(ledgerName)) continue;
    
    matchCount++;
    const dateTag = block.match(/<VCHDATE[^>]*>([^<]+)<\/VCHDATE>/i);
    const numTag = block.match(/<VCHNUMBER[^>]*>([^<]+)<\/VCHNUMBER>/i);
    const typeTag = block.match(/<VCHTYPE[^>]*>([^<]+)<\/VCHTYPE>/i);
    const amtTag = block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
    const posTag = block.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i);
    
    const vDate = dateTag ? tallyDateToISO(dateTag[1].trim()) : '';
    const vNum = numTag ? numTag[1].trim() : 'Ref';
    const vType = typeTag ? typeTag[1].trim() : 'Voucher';
    const amt = amtTag ? safeNum(amtTag[1]) : 0;
    const isDebit = posTag ? posTag[1].trim() === 'Yes' : true;
    
    if (amt === 0) continue;
    
    if (!partyVouchers.has(ledgerName)) {
      partyVouchers.set(ledgerName, []);
    }
    partyVouchers.get(ledgerName).push({
      date: vDate,
      voucherType: vType,
      voucherNumber: vNum,
      amount: amt,
      isDebit: isDebit
    });
  }

  console.log("Total matching vouchers parsed:", matchCount);
  console.log("Running FIFO calculations loop...");
  
  const parsedFromDate = new Date(fromDate);
  const priorDate = new Date(parsedFromDate);
  priorDate.setDate(priorDate.getDate() - 1);
  const priorDateStr = priorDate.toISOString().split('T')[0];

  let loopCount = 0;
  for (const [key, party] of activeParties.entries()) {
    loopCount++;
    console.log(`Processing party ${loopCount}/${activeParties.size}: ${party.partyName}`);
    const isDebtor = party.parentGroup === 'Sundry Debtors';
    const periodVouchers = partyVouchers.get(key) || [];
    
    let netChange = 0;
    periodVouchers.forEach(v => {
      const change = isDebtor
        ? (v.isDebit ? v.amount : -v.amount)
        : (!v.isDebit ? v.amount : -v.amount);
      netChange += change;
    });

    const openingBal = party.closingBalance - netChange;
    
    const combinedVouchers = [...periodVouchers];
    if (Math.abs(openingBal) > 0.01) {
      const opIsDebit = isDebtor ? (openingBal >= 0) : (openingBal < 0);
      combinedVouchers.unshift({
        date: priorDateStr,
        voucherType: 'Opening Balance',
        voucherNumber: 'Opening Bal',
        amount: Math.abs(openingBal),
        isDebit: opIsDebit
      });
    }

    // Call computeFifoAgeing simulation code
    const res = runFifoSim(combinedVouchers, evaluationDate, isDebtor);
    console.log(`  FIFO done for ${party.partyName}. Outstanding: ${res.totalOutstanding}`);
  }
  
  console.log("Finished FIFO processing without getting stuck!");
}

function runFifoSim(vouchers, ageingDateStr, isDebtor) {
  const ageingDate = new Date(ageingDateStr);
  const evaluationTime = ageingDate.getTime();

  // Sort vouchers
  const sorted = [...vouchers].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const isChargeA = isDebtor ? a.isDebit : !a.isDebit;
    const isChargeB = isDebtor ? b.isDebit : !b.isDebit;
    if (isChargeA !== isChargeB) return isChargeA ? -1 : 1;
    return 0;
  });

  let netBalance = 0;
  let latestDate = '2025-03-31';
  if (sorted.length > 0) {
    latestDate = sorted[sorted.length - 1].date;
  }
  sorted.forEach(v => {
    const change = isDebtor ? (v.isDebit ? v.amount : -v.amount) : (!v.isDebit ? v.amount : -v.amount);
    netBalance += change;
  });

  const isAdvancePending = netBalance < -0.01;
  const openCharges = [];
  let paymentPool = 0;

  for (const v of sorted) {
    const isCharge = isDebtor ? v.isDebit : !v.isDebit;
    const amount = v.amount;

    if (isCharge) {
      openCharges.push({ date: v.date, amount: amount, remaining: amount });
    } else {
      paymentPool += amount;
    }

    let iterations = 0;
    while (paymentPool > 0.001 && openCharges.length > 0) {
      iterations++;
      if (iterations > 10000) {
        console.error("INFINITE LOOP DETECTED in runFifoSim! openCharges size:", openCharges.length, "paymentPool:", paymentPool);
        process.exit(1);
      }
      const earliest = openCharges[0];
      if (paymentPool >= earliest.remaining) {
        paymentPool -= earliest.remaining;
        openCharges.shift();
      } else {
        earliest.remaining -= paymentPool;
        paymentPool = 0;
      }
    }
  }

  return { totalOutstanding: Math.abs(netBalance) };
}

runDebug().catch(err => {
  console.error("Debug failed with error:", err);
});

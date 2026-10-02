const fs = require('fs');

const rawTxns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

// Build panMap
const panMap = new Map();
rawTxns.forEach(t => {
  if (t.partyName && t.partyPan) {
    const u = t.partyName.toUpperCase().trim();
    panMap.set(u, t.partyPan.trim());
    panMap.set(u.replace(/\s*\([^)]*\)/g, '').trim(), t.partyPan.trim());
  }
});

function isBankOrTaxLedger(name, hierarchy = []) {
  const u = name.toUpperCase().trim();
  if (u.includes('BANK') || u.includes('CASH') || u.includes('TDS') || u.includes('CGST') || u.includes('SGST') || u.includes('IGST') || u.includes('ROUND OFF')) return true;
  return hierarchy.some(g =>
    g.includes('BANK ACCOUNTS') || g.includes('BANK OCC') || g.includes('BANK OD') ||
    g.includes('CASH-IN-HAND') || g.includes('DUTIES & TAXES') || g.includes('DUTIES AND TAXES')
  );
}

function isPartyLedger(name, hierarchy = []) {
  const nameUpper = name.toUpperCase().trim();
  if (isBankOrTaxLedger(nameUpper, hierarchy)) return false;
  if (panMap.has(nameUpper)) return true;
  const clean = nameUpper.replace(/\s*\([^)]*\)/g, '').trim();
  if (clean && panMap.has(clean)) return true;
  const alpha = nameUpper.replace(/[^A-Z0-9]/g, '');
  if (alpha && panMap.has(alpha)) return true;
  return hierarchy.some(g =>
    g.includes('SUNDRY CREDITORS') || g.includes('SUNDRY DEBTORS') ||
    g.includes('CREDITOR') || g.includes('DEBTOR') || g.includes('VENDOR') ||
    g.includes('SUPPLIER') || g.includes('PARTY') || g.includes('TRANSPORTER') ||
    g.includes('CONTRACT DRIVERS')
  );
}

// Let's summarize Pramod Mali entries if we filter partyPan === 'BPCPM4049H' or party name matches PRAMOD
let pramodSpend = 0;
let pramodTds = 0;

// All txns in dataset where party is Pramod or ledger was Pramod
rawTxns.forEach(t => {
  const pName = (t.partyName || '').toUpperCase();
  const lName = (t.ledgerName || '').toUpperCase();
  const pPan = (t.partyPan || '').toUpperCase();

  const isPramodParty = pPan === 'BPCPM4049H' || pName.includes('PRAMOD') || pName.includes('9419') || pName.includes('5694');
  const isPramodLedger = lName.includes('PRAMOD') || lName.includes('9419') || lName.includes('5694');

  if (isPramodParty || isPramodLedger) {
    if (t.isPayment) return; // skip payment lines for spend calc

    const amt = Math.abs(t.amount);
    const tds = t.actualTdsDeducted || 0;

    // If it was misattributed as ledger under another party, we redirect it to Pramod Mali
    pramodSpend += amt;
    pramodTds += tds;
    console.log(`Date: ${t.date.slice(0, 10)} | Party: ${t.partyName} | Ledger: ${t.ledgerName} | Amt: ${amt} | TDS: ${tds}`);
  }
});

console.log(`\n=== PRAMOD MALI RECONCILIATION SUMMARY ===`);
console.log(`Calculated Total Spend: ₹${pramodSpend}`);
console.log(`Calculated Actual TDS: ₹${pramodTds}`);

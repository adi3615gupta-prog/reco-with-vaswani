const fs = require('fs');

// We will construct sample vouchers from scratch_all_txns.json to see how the new parsing logic handles them.

// Let's test the logic for detecting party ledgers and splitting expenses:

function isBankOrTaxLedger(name, hierarchy = []) {
  const u = name.toUpperCase().trim();
  if (u.includes('BANK') || u.includes('CASH') || u.includes('TDS') || u.includes('CGST') || u.includes('SGST') || u.includes('IGST') || u.includes('ROUND OFF')) return true;
  return hierarchy.some(g =>
    g.includes('BANK ACCOUNTS') || g.includes('BANK OCC') || g.includes('BANK OD') ||
    g.includes('CASH-IN-HAND') || g.includes('DUTIES & TAXES') || g.includes('DUTIES AND TAXES')
  );
}

function isPartyLedger(name, hierarchy = [], panMap = new Map()) {
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

console.log('Parser test script loaded successfully');

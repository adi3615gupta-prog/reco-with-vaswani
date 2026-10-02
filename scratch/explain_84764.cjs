const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

// Filter all txns for PAN BPCPM4049H
const pramodTxns = data.filter(t => t.partyPan === 'BPCPM4049H');

console.log(`Total transactions for PAN BPCPM4049H: ${pramodTxns.length}\n`);

const breakdown = {};

pramodTxns.forEach(t => {
  if (t.isPayment) return; // skip payments
  const name = t.partyName || 'Unknown';
  if (!breakdown[name]) {
    breakdown[name] = { spend: 0, tds: 0, count: 0 };
  }
  breakdown[name].spend += (t.amount || 0);
  breakdown[name].tds += (t.actualTdsDeducted || 0);
  breakdown[name].count++;
});

console.log("=== BREAKDOWN BY TALLY LEDGER NAME FOR PAN BPCPM4049H ===");
let totalSpend = 0;
let totalTds = 0;

for (const [name, info] of Object.entries(breakdown)) {
  console.log(`Ledger Name: "${name}"`);
  console.log(`  -> Spend: ₹${info.spend.toFixed(2)}`);
  console.log(`  -> Actual TDS: ₹${info.tds.toFixed(2)}`);
  console.log(`  -> Voucher Count: ${info.count}\n`);
  totalSpend += info.spend;
  totalTds += info.tds;
}

console.log(`GRAND TOTAL FOR PAN BPCPM4049H:`);
console.log(`Total Spend (Books): ₹${totalSpend.toFixed(2)}  (Rounds to ₹${Math.round(totalSpend).toLocaleString('en-IN')})`);
console.log(`Total Actual TDS (Books): ₹${totalTds.toFixed(2)}  (Rounds to ₹${Math.round(totalTds).toLocaleString('en-IN')})`);

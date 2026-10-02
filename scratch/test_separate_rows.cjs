const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

// Test per-party-name grouping with same PAN

const partySectionTotals = {};

data.forEach(txn => {
  if (txn.isPayment) return;
  const rawPan = (txn.partyPan || '').toUpperCase().trim();
  const isMissing = !rawPan || rawPan === 'PAN-MISSING' || rawPan === 'PAN MISSING' || rawPan === 'UNREGISTERED';
  const cleanPan = isMissing ? '' : rawPan.replace(/\s+/g, '');
  const cleanName = (txn.partyName || 'Unknown').toUpperCase().trim();
  const section = '194C';

  const groupKey = isMissing
    ? `NOPAN-${cleanName}_${section}`
    : `${cleanName}_${cleanPan}_${section}`;

  if (!partySectionTotals[groupKey]) {
    partySectionTotals[groupKey] = {
      partyName: txn.partyName,
      pan: cleanPan,
      spend: 0,
      actualTds: 0
    };
  }

  partySectionTotals[groupKey].spend += (txn.amount || 0);
  partySectionTotals[groupKey].actualTds += (txn.actualTdsDeducted || 0);
});

console.log("=== PER-PARTY-NAME GROUPING RESULTS FOR PAN BPCPM4049H ===");
for (const [k, v] of Object.entries(partySectionTotals)) {
  if (v.pan === 'BPCPM4049H') {
    console.log(`Key: ${k}`);
    console.log(`  Party Name: "${v.partyName}"`);
    console.log(`  Spend: ₹${v.spend.toFixed(2)}`);
    console.log(`  Actual TDS: ₹${v.actualTds.toFixed(2)}\n`);
  }
}

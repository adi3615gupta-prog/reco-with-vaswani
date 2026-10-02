const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

console.log(`Total transactions in scratch_all_txns.json: ${data.length}`);

const matches = [];

data.forEach((t, index) => {
  const pName = (t.partyName || '').toUpperCase();
  const lName = (t.ledgerName || '').toUpperCase();
  const pPan = (t.partyPan || '').toUpperCase();
  const tdsName = (t.tdsLedgerName || '').toUpperCase();

  const isPramod = pPan.includes('BPCPM4049H') ||
    pName.includes('PRAMOD') || lName.includes('PRAMOD') ||
    pName.includes('9419') || lName.includes('9419') ||
    pName.includes('5694') || lName.includes('5694');

  if (isPramod) {
    matches.push({ index, ...t });
  }
});

console.log(`Found ${matches.length} matching transactions:`);
console.log(JSON.stringify(matches, null, 2));

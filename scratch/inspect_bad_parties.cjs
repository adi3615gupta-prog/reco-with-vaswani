const fs = require('fs');
const txns = JSON.parse(fs.readFileSync('scratch_all_txns.json', 'utf8'));

const badPartyTxns = txns.filter(t => 
    t.partyName === "Purchase - Labour Charges" || 
    t.partyName === "Crane & Other M/C Hiring Charges" ||
    (t.partyName || '').toUpperCase().includes('CHARGES')
);
console.log("=== Transactions where Party Name is EXACTLY an Expense Ledger or has CHARGES ===");
console.log("Count:", badPartyTxns.length);
if (badPartyTxns.length > 0) {
    console.log(JSON.stringify(badPartyTxns.slice(0, 5), null, 2));
}

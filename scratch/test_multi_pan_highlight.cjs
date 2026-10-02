const { reconcileTds } = require('../src/lib/tdsEngine.ts'); // Or we can test with ts-node or plain CJS snippet logic

const booksLiability = {
  "BALAJI SURVASE (VEHICLE PAYMENT)_BQYPS2017L_194C": {
    partyName: "BALAJI SURVASE (VEHICLE PAYMENT)",
    annualSpend: 348780,
    taxableAmount: 348780,
    requiredTds: 3488,
    actualTds: 3488,
    ledgers: new Set(["Vehicle Hire 194C"])
  },
  "BALAJI SURVASE- REIMBURSEMENT_BQYPS2017L_194C": {
    partyName: "BALAJI SURVASE- Reimbursement",
    annualSpend: 1365082,
    taxableAmount: 1365082,
    requiredTds: 13651,
    actualTds: 0,
    ledgers: new Set(["Reimbursement Expense"])
  }
};

const tracesData = [
  { partyPan: "BQYPS2017L", partyName: "BALAJI SURVASE", section: "194C", amountPaid: 1713862, tdsDeducted: 17139 }
];

console.log("Testing Multi-PAN Separation...");

const fs = require('fs');

// Let's test the ledger-matching logic on raw Tally data

/*
Rule:
For each voucher in Tally:
1. Find all Party Ledgers present in the voucher (`isPartyLedger`).
2. Find all Expense Ledgers present in the voucher (`isExpenseLedger`).
3. Find all TDS Tax Ledgers present in the voucher (`isTdsLedger`).
4. Find all Bank/Cash Ledgers present in the voucher (`isBankOrCash`).

Case 1: Standard Purchase / Journal Voucher
- Party Credited (or Debited for sales)
- Expense Debited (or Credited)
- TDS Credited (or Debited)
-> Spend = Expense Amount
-> Actual TDS = TDS Amount

Case 2: Separate TDS Voucher (like Vch 752, Vch 775, Vch 4560)
- Party Debited (or Credited)
- TDS Credited (or Debited)
- No Expense line
-> Spend = 0
-> Actual TDS = TDS Amount

Case 3: Bank Payment / Receipt (like Vch 2577, Vch 320)
- Party Debited (or Credited)
- Bank Credited (or Debited)
-> Spend = 0
-> Payment Amount = Bank Amount
*/

console.log("Testing Tally Party Matcher Logic...");

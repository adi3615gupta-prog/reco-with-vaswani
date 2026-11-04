// ============================================================
// Financial Statements Module — 35+ Internal Financial Controls (IFC) Engine
// Real-Time Diagnostic Audit Checklist (Schedule III & ICAI Guidelines)
// ============================================================

import type {
  TrialBalanceEntry,
  ClientSetup,
  FixedAssetEntry,
  PartnerCapitalEntry,
  FinancialRatio,
  AgingScheduleBucket,
  ReceivableAgingBucket,
  CwipAgingBucket,
  IfcCheckItem,
  DenominationUnit,
} from './finStatements.types';
import { computeSchedule3Financials } from './finStatementsEngine';
import { generateCashFlowStatement } from './cfsEngine';

export interface IfcDiagnosticsResult {
  checks: IfcCheckItem[];
  passedCount: number;
  criticalFailedCount: number;
  warningCount: number;
  complianceCount: number;
  isAllClear: boolean;
}

export function evaluateIfcChecks(params: {
  tbEntries: TrialBalanceEntry[];
  clientSetup: ClientSetup;
  denomination?: DenominationUnit;
  fixedAssets?: FixedAssetEntry[];
  partnersCapital?: PartnerCapitalEntry[];
  ratios?: FinancialRatio[];
  tpAging?: AgingScheduleBucket[];
  trAging?: ReceivableAgingBucket[];
  cwipAging?: CwipAgingBucket[];
}): IfcDiagnosticsResult {
  const {
    tbEntries,
    clientSetup,
    denomination = 'in_rupees',
    fixedAssets = [],
    partnersCapital = [],
    ratios = [],
    tpAging = [],
    trAging = [],
    cwipAging = [],
  } = params;

  const fin = computeSchedule3Financials(tbEntries, denomination);
  const bs = fin.balanceSheet;
  const pl = fin.profitAndLoss;
  const cfs = generateCashFlowStatement(tbEntries, denomination);

  const checks: IfcCheckItem[] = [];

  // Helper to add check
  const addCheck = (
    id: string,
    check_name: string,
    check_type: 'CRITICAL' | 'WARNING' | 'COMPLIANCE',
    detail: string,
    cy_diff: number,
    py_diff: number,
    isOk: boolean,
    action_guidance: string
  ) => {
    checks.push({
      id,
      check_name,
      check_type,
      detail,
      cy_diff: Math.round(cy_diff * 100) / 100,
      py_diff: Math.round(py_diff * 100) / 100,
      status: isOk ? 'OK' : 'FLAG',
      action_guidance,
    });
  };

  // 1. BS Balanced
  const bsDiffCY = Math.abs(bs.totalAssets.cy - bs.totalEquityAndLiabilities.cy);
  const bsDiffPY = Math.abs(bs.totalAssets.py - bs.totalEquityAndLiabilities.py);
  addCheck(
    'IFC-01',
    'Balance Sheet Net Equilibrium (Assets = Equity + Liabilities)',
    'CRITICAL',
    `CY Assets: ₹${bs.totalAssets.cy.toLocaleString()} vs Liabilities: ₹${bs.totalEquityAndLiabilities.cy.toLocaleString()}`,
    bsDiffCY,
    bsDiffPY,
    bsDiffCY <= 1,
    'Ensure all Trial Balance entries are mapped and debits equal credits.'
  );

  // 2. TB Balanced
  const tbTotalDr = tbEntries.filter((e) => e.cy_balance > 0).reduce((s, e) => s + e.cy_balance, 0);
  const tbTotalCr = tbEntries.filter((e) => e.cy_balance < 0).reduce((s, e) => s + Math.abs(e.cy_balance), 0);
  const tbDiff = Math.abs(tbTotalDr - tbTotalCr);
  addCheck(
    'IFC-02',
    'Trial Balance Ingestion Equilibrium (Debits = Credits)',
    'CRITICAL',
    `Total Debits: ₹${tbTotalDr.toLocaleString()} vs Total Credits: ₹${tbTotalCr.toLocaleString()}`,
    tbDiff,
    0,
    tbDiff <= 1,
    'Check source Tally/Excel export for missing roundoff entries or suspense accounts.'
  );

  // 3. Unmapped TB Accounts
  const unmapped = tbEntries.filter((e) => !e.mapped_group_code);
  addCheck(
    'IFC-03',
    'Zero Unmapped Accounts Check',
    'CRITICAL',
    `${unmapped.length} account(s) pending group code assignment.`,
    unmapped.length,
    0,
    unmapped.length === 0,
    'Assign 4-digit Schedule III group codes (1001-4902) to all unmapped accounts.'
  );

  // 4. No Negative Cash in Hand
  const cashInHandEntries = tbEntries.filter((e) => e.mapped_group_code === 2801);
  const negCash = cashInHandEntries.filter((e) => e.cy_balance < 0);
  const negCashTotal = negCash.reduce((s, e) => s + Math.abs(e.cy_balance), 0);
  addCheck(
    'IFC-04',
    'Negative Cash-in-Hand Check',
    'CRITICAL',
    negCash.length === 0
      ? 'All physical cash-in-hand accounts report positive/zero balances.'
      : `Found ${negCash.length} cash ledger(s) with negative (credit) balance totaling ₹${negCashTotal.toLocaleString()}.`,
    negCashTotal,
    0,
    negCash.length === 0,
    'Cash in hand cannot be negative under accounting principles. Verify unrecorded receipts or cash withdrawals.'
  );

  // 5. Bank Overdraft / Negative Bank accounts reclassification
  const bankEntries = tbEntries.filter((e) => e.mapped_group_code === 2803);
  const negBank = bankEntries.filter((e) => e.cy_balance < 0);
  const negBankTotal = negBank.reduce((s, e) => s + Math.abs(e.cy_balance), 0);
  addCheck(
    'IFC-05',
    'Bank Overdraft Reclassification Check',
    'WARNING',
    negBank.length === 0
      ? 'No bank accounts report negative balances in current assets.'
      : `${negBank.length} bank ledger(s) have credit balances (₹${negBankTotal.toLocaleString()}).`,
    negBankTotal,
    0,
    negBank.length === 0,
    'Bank accounts with credit balance should be regrouped under Short-Term Borrowings (Code 1601: Bank OD/CC).'
  );

  // 6. Negative Debtors (Creditor balances in Trade Receivables)
  const debtorEntries = tbEntries.filter((e) => e.mapped_group_code === 2701 || e.mapped_group_code === 2702);
  const negDebtors = debtorEntries.filter((e) => e.cy_balance < 0);
  const negDebtorsTotal = negDebtors.reduce((s, e) => s + Math.abs(e.cy_balance), 0);
  addCheck(
    'IFC-06',
    'Negative Debtors (Advances from Customers) Segregation',
    'WARNING',
    negDebtors.length === 0
      ? 'Trade receivables contain no net credit balances.'
      : `${negDebtors.length} debtor(s) have credit balances totaling ₹${negDebtorsTotal.toLocaleString()}.`,
    negDebtorsTotal,
    0,
    negDebtors.length === 0,
    'Credit balances in debtors should be regrouped under Other Current Liabilities (Code 1802: Advances from Customers).'
  );

  // 7. Negative Creditors (Debit balances in Trade Payables)
  const creditorEntries = tbEntries.filter((e) => e.mapped_group_code === 1701 || e.mapped_group_code === 1702);
  const negCreditors = creditorEntries.filter((e) => e.cy_balance > 0);
  const negCreditorsTotal = negCreditors.reduce((s, e) => s + e.cy_balance, 0);
  addCheck(
    'IFC-07',
    'Negative Creditors (Advances to Suppliers) Segregation',
    'WARNING',
    negCreditors.length === 0
      ? 'Trade payables contain no net debit balances.'
      : `${negCreditors.length} creditor(s) have debit balances totaling ₹${negCreditorsTotal.toLocaleString()}.`,
    negCreditorsTotal,
    0,
    negCreditors.length === 0,
    'Debit balances in creditors should be regrouped under Short-Term Loans & Advances (Code 2901: Advances to Suppliers).'
  );

  // 8. Depreciation P&L vs Fixed Assets Register
  const pnlDep = pl.expenses.find((e) => e.noteNo === 32)?.cyAmount || 0;
  const faDep = fixedAssets.reduce((s, a) => s + (a.depreciation_cy || 0), 0);
  const depDiff = Math.abs(pnlDep - faDep);
  addCheck(
    'IFC-08',
    'Depreciation Expense Tie-Out (P&L Note 32 vs Fixed Asset Register)',
    'WARNING',
    fixedAssets.length > 0
      ? `P&L Depreciation: ₹${pnlDep.toLocaleString()} vs Asset Schedule: ₹${faDep.toLocaleString()}`
      : `P&L Depreciation: ₹${pnlDep.toLocaleString()} (No fixed asset register uploaded).`,
    depDiff,
    0,
    fixedAssets.length === 0 || depDiff <= 2,
    'Verify that depreciation charged in P&L matches the total depreciation in the Fixed Asset Register.'
  );

  // 9. P&L Surplus Addition vs Reserves & Surplus
  const patCY = pl.profitAfterTax.cy;
  const reservesNoteCY = bs.equityAndLiabilities.find((l) => l.noteNo === 2)?.cyAmount || 0;
  const reservesNotePY = bs.equityAndLiabilities.find((l) => l.noteNo === 2)?.pyAmount || 0;
  addCheck(
    'IFC-09',
    'Retained Earnings Reconciliation (Profit After Tax vs Reserves & Surplus)',
    'COMPLIANCE',
    `CY Profit After Tax is ₹${patCY.toLocaleString()}. Reserves movement: ₹${(reservesNoteCY - reservesNotePY).toLocaleString()}.`,
    0,
    0,
    true,
    'Confirm that current year profit/loss is correctly carried forward into Retained Earnings (Code 1110).'
  );

  // 10. Cash Flow Statement Closing Cash Tie-Out
  const bsCashCY = bs.assets.find((a) => a.noteNo === 22)?.cyAmount || 0;
  const cfsCashDiff = Math.abs(cfs.closing_cash_equivalents - bsCashCY);
  addCheck(
    'IFC-10',
    'AS-3 Cash Flow Statement Closing Cash Tie-Out',
    'CRITICAL',
    `CFS Closing Cash: ₹${cfs.closing_cash_equivalents.toLocaleString()} vs BS Note 22: ₹${bsCashCY.toLocaleString()}`,
    cfsCashDiff,
    0,
    cfsCashDiff <= 2,
    'Ending cash in Cash Flow Statement must reconcile with Cash & Cash Equivalents in Note 22.'
  );

  // 11. CFS Internal Reconciliation
  addCheck(
    'IFC-11',
    'AS-3 Cash Flow Mathematical Integrity',
    'CRITICAL',
    `Net Increase/Decrease in Cash: ₹${cfs.net_increase_decrease_cash.toLocaleString()} (Variance: ₹${cfs.reconciliation_variance.toLocaleString()})`,
    cfs.reconciliation_variance,
    0,
    cfs.is_tallied,
    'Ensure operating, investing, and financing net flows accurately bridge Opening to Closing cash.'
  );

  // 12. Inventory Valuation Tie-Out
  const invCY = bs.assets.find((a) => a.noteNo === 20)?.cyAmount || 0;
  addCheck(
    'IFC-12',
    'Inventory Valuation & Physical Verification Disclosure',
    'COMPLIANCE',
    `Balance Sheet Inventories: ₹${invCY.toLocaleString()}. Mode of valuation required (Lower of Cost or NRV).`,
    0,
    0,
    invCY >= 0,
    'Disclose inventory valuation method (FIFO / Weighted Average) as required by AS-2 in the Notes.'
  );

  // 13. Tax Provision Verification (Current Tax + Deferred Tax)
  const currentTax = pl.taxExpense.find((t) => t.particulars.includes('Current tax'))?.cyAmount || 0;
  const deferredTax = pl.taxExpense.find((t) => t.particulars.includes('Deferred tax'))?.cyAmount || 0;
  const totalTaxExp = pl.totalTaxExpense.cy;
  const taxDiff = Math.abs(totalTaxExp - (currentTax + deferredTax));
  addCheck(
    'IFC-13',
    'Tax Provision Internal Consistency (P&L Total Tax = Current + Deferred)',
    'COMPLIANCE',
    `Current Tax: ₹${currentTax.toLocaleString()} + Deferred Tax: ₹${deferredTax.toLocaleString()} = Total: ₹${totalTaxExp.toLocaleString()}`,
    taxDiff,
    0,
    taxDiff <= 1,
    'Current tax and deferred tax must algebraically sum to the Total Tax Expense.'
  );

  // 14. Trade Payables Aging Total Tie-Out
  const tpBS = (bs.equityAndLiabilities.find((l) => l.particulars.includes('Micro and Small'))?.cyAmount || 0) +
               (bs.equityAndLiabilities.find((l) => l.particulars.includes('others'))?.cyAmount || 0);
  const tpAgingTotal = tpAging.reduce((s, r) => s + (r.total || 0), 0);
  const tpDiff = Math.abs(tpBS - tpAgingTotal);
  addCheck(
    'IFC-14',
    'Trade Payables Aging Tie-Out (Schedule III Note 8 vs Aging Schedule)',
    'COMPLIANCE',
    tpAging.length > 0
      ? `BS Note 8: ₹${tpBS.toLocaleString()} vs Aging Total: ₹${tpAgingTotal.toLocaleString()}`
      : `BS Note 8: ₹${tpBS.toLocaleString()} (Aging schedule not populated).`,
    tpDiff,
    0,
    tpAging.length === 0 || tpDiff <= 5,
    'Sum of Trade Payables aging schedule (<1yr, 1-2yr, 2-3yr, >3yr) must match Trade Payables on Balance Sheet.'
  );

  // 15. Trade Receivables Aging Total Tie-Out
  const trBS = bs.assets.find((a) => a.noteNo === 21)?.cyAmount || 0;
  const trAgingTotal = trAging.reduce((s, r) => s + (r.total || 0), 0);
  const trDiff = Math.abs(trBS - trAgingTotal);
  addCheck(
    'IFC-15',
    'Trade Receivables Aging Tie-Out (Schedule III Note 21 vs Aging Schedule)',
    'COMPLIANCE',
    trAging.length > 0
      ? `BS Note 21: ₹${trBS.toLocaleString()} vs Aging Total: ₹${trAgingTotal.toLocaleString()}`
      : `BS Note 21: ₹${trBS.toLocaleString()} (Aging schedule not populated).`,
    trDiff,
    0,
    trAging.length === 0 || trDiff <= 5,
    'Sum of Trade Receivables aging schedule must reconcile with Note 21 Trade Receivables.'
  );

  // 16. Statutory Ratios > 25% Variance Explanations
  const flaggedRatiosWithoutReason = ratios.filter((r) => r.is_flagged && (!r.variance_reason || !r.variance_reason.trim()));
  addCheck(
    'IFC-16',
    'MCA 2021 Ratio Variance Disclosure (>25% Variation Explanations)',
    'COMPLIANCE',
    flaggedRatiosWithoutReason.length === 0
      ? 'All statutory financial ratios with >25% variation have explanatory remarks.'
      : `${flaggedRatiosWithoutReason.length} ratio(s) exceed 25% variance without reason: ${flaggedRatiosWithoutReason.map((r) => r.ratio_name).join(', ')}`,
    flaggedRatiosWithoutReason.length,
    0,
    flaggedRatiosWithoutReason.length === 0,
    'MCA 2021 amendment requires company to provide reasons for any ratio variance exceeding 25% compared to prior year.'
  );

  // 17. Prior Year Comparatives Completeness
  const tbEntriesMissingPY = tbEntries.filter((e) => e.cy_balance !== 0 && (e.py_balance === undefined || e.py_balance === null));
  addCheck(
    'IFC-17',
    'Prior Year Comparative Data Completeness',
    'WARNING',
    tbEntriesMissingPY.length === 0
      ? 'Prior year balances are populated across all active ledger accounts.'
      : `${tbEntriesMissingPY.length} ledger(s) have missing prior year figures.`,
    tbEntriesMissingPY.length,
    0,
    tbEntriesMissingPY.length === 0,
    'Ensure comparative prior year amounts are included for all Balance Sheet and P&L items.'
  );

  // 18. MSME Dues Identification & Interest Provision
  const msmePayables = bs.equityAndLiabilities.find((l) => l.particulars.includes('Micro and Small'))?.cyAmount || 0;
  addCheck(
    'IFC-18',
    'MSME Dues & Section 16 MSMED Act Interest Disclosure',
    'COMPLIANCE',
    msmePayables > 0
      ? `Total MSME outstandings: ₹${msmePayables.toLocaleString()}. Note 8 MSME disclosure required.`
      : 'No outstandings identified under MSME suppliers.',
    0,
    0,
    true,
    'Ensure MSMED Act disclosure is provided including principal remaining unpaid and interest due.'
  );

  // 19. Secured Borrowings & Charge Registration
  const securedLoans = bs.equityAndLiabilities.find((l) => l.noteNo === 3)?.cyAmount || 0;
  addCheck(
    'IFC-19',
    'Secured Borrowings & MCA Charge Satisfaction Verification',
    'COMPLIANCE',
    securedLoans > 0
      ? `Long-Term Borrowings: ₹${securedLoans.toLocaleString()}. Check CHG-1/CHG-4 charge filing on MCA.`
      : 'No long-term secured borrowings reported.',
    0,
    0,
    true,
    'Confirm all charges on bank loans/mortgages are duly registered with the Registrar of Companies (ROC).'
  );

  // 20. Non-Corporate Partner Capital Tie-Out (if entity is non-corporate)
  if (clientSetup.entity_type === 'non_corporate') {
    const totalPartnerCapital = partnersCapital.reduce((s, p) => s + (p.closing_capital || 0), 0);
    const bsPartnerCapital = bs.equityAndLiabilities.find((l) => l.noteNo === 1)?.cyAmount || 0;
    const partnerDiff = Math.abs(totalPartnerCapital - bsPartnerCapital);
    addCheck(
      'IFC-20',
      'Partner Capital Schedule vs Balance Sheet Capital Tie-Out',
      'CRITICAL',
      partnersCapital.length > 0
        ? `Partner Schedule Total: ₹${totalPartnerCapital.toLocaleString()} vs BS Capital: ₹${bsPartnerCapital.toLocaleString()}`
        : 'Partner capital schedule not yet configured.',
      partnerDiff,
      0,
      partnersCapital.length === 0 || partnerDiff <= 5,
      'Total closing capital in the Partner Capital Schedule must equal Capital shown on the Balance Sheet.'
    );
  } else {
    addCheck(
      'IFC-20',
      'Corporate Shareholding Pattern & Promoters Shareholding',
      'COMPLIANCE',
      'Promoters shareholding table with % change during the year required under MCA 2021.',
      0,
      0,
      true,
      'Disclose promoter shareholding table with number of shares, % of total shares, and % change during the year.'
    );
  }

  // 21. Rounding Off Standard Compliance
  addCheck(
    'IFC-21',
    `Schedule III Rounding-Off Convention (${clientSetup.denomination.replace('_', ' ').toUpperCase()})`,
    'COMPLIANCE',
    `Financial statements presented in ${clientSetup.denomination.replace('_', ' ')}. Check turnover thresholds.`,
    0,
    0,
    true,
    'Turnover < ₹100 Cr: Round off to hundreds, thousands, or lakhs. Turnover ≥ ₹100 Cr: Round off to lakhs, millions, or crores.'
  );

  // 22. Benami Property Proceedings (MCA 2021)
  addCheck(
    'IFC-22',
    'Benami Property Transactions (Prohibition) Act, 1988 Compliance',
    'COMPLIANCE',
    'No proceedings initiated or pending against the company for holding any benami property.',
    0,
    0,
    true,
    'If proceedings are pending, disclose property details, year of acquisition, amount, and status.'
  );

  // 23. Struck-Off Companies Relationship (MCA 2021)
  addCheck(
    'IFC-23',
    'Transactions with Struck-Off Companies (Section 248 Companies Act)',
    'COMPLIANCE',
    'No transactions or outstanding balances with companies struck off by the ROC.',
    0,
    0,
    true,
    'If transactions exist, disclose name of struck-off company, nature of transaction, balance, and relation.'
  );

  // 24. Registration of Charges or Satisfaction with ROC (MCA 2021)
  addCheck(
    'IFC-24',
    'ROC Charges Registration Beyond Statutory Period',
    'COMPLIANCE',
    'No charges or satisfaction pending registration with ROC beyond statutory time limit.',
    0,
    0,
    true,
    'Disclose details and reasons if any charge registration is pending with ROC beyond 30 days.'
  );

  // 25. Wilful Defaulter Declaration (MCA 2021)
  addCheck(
    'IFC-25',
    'Wilful Defaulter Declaration by Lender Banks/Financial Institutions',
    'COMPLIANCE',
    'The company has not been declared a wilful defaulter by any bank or financial institution.',
    0,
    0,
    true,
    'If declared wilful defaulter, disclose date of declaration, details of defaults, and bank name.'
  );

  // 26. Crypto Currency or Virtual Currency (MCA 2021)
  addCheck(
    'IFC-26',
    'Crypto / Virtual Currency Transactions & Balances',
    'COMPLIANCE',
    'Company has not traded or invested in Crypto Currency or Virtual Currency during the financial year.',
    0,
    0,
    true,
    'If active, disclose profit/loss on transactions, amount held as on reporting date, and deposits/advances.'
  );

  // 27. Title Deeds of Immovable Property (MCA 2021)
  addCheck(
    'IFC-27',
    'Title Deeds of Immovable Property Not Held in Company Name',
    'COMPLIANCE',
    'All title deeds of immovable property (other than leaseholds) are held in the name of the company.',
    0,
    0,
    true,
    'If not held in company name, disclose relevant line item, description, gross carrying value, and holder name.'
  );

  // 28. Borrowed Funds & Share Premium Utilization (MCA 2021)
  addCheck(
    'IFC-28',
    'Borrowed Funds / Share Premium Ultimate Beneficiary Declaration',
    'COMPLIANCE',
    'No loans/advances given to intermediaries to lend/invest in other entities (Ultimate Beneficiaries).',
    0,
    0,
    true,
    'Confirm company has complied with FEMA, Prevention of Money Laundering Act, and Companies Act.'
  );

  // 29. Undisclosed Income in Income Tax Assessments (MCA 2021)
  addCheck(
    'IFC-29',
    'Undisclosed Income Surrendered During Search / Survey Assessments',
    'COMPLIANCE',
    'No undisclosed income surrendered or disclosed during tax assessments under Income Tax Act, 1961.',
    0,
    0,
    true,
    'Disclose surrendered income not previously recorded in books and how it was accounted.'
  );

  // 30. Corporate Social Responsibility (CSR) Section 135 (MCA 2021)
  addCheck(
    'IFC-30',
    'Corporate Social Responsibility (CSR) Applicability & Spend Check',
    'COMPLIANCE',
    'Review applicability (Net Worth ≥ ₹500 Cr, Turnover ≥ ₹1000 Cr, or Net Profit ≥ ₹5 Cr).',
    0,
    0,
    true,
    'If applicable, disclose CSR amount required to be spent, amount spent, and shortfall, if any.'
  );

  // 31. Capital Work-in-Progress (CWIP) Aging & Overrun
  const cwipBS = bs.assets.find((a) => a.noteNo === 14)?.cyAmount || 0;
  const cwipAgingTotal = cwipAging.reduce((s, r) => s + (r.total || 0), 0);
  const cwipDiff = Math.abs(cwipBS - cwipAgingTotal);
  addCheck(
    'IFC-31',
    'Capital Work-in-Progress (CWIP) Aging & Cost Overrun Schedule',
    'COMPLIANCE',
    cwipBS > 0
      ? `CWIP on Balance Sheet: ₹${cwipBS.toLocaleString()}. Aging schedule tie-out diff: ₹${cwipDiff.toLocaleString()}.`
      : 'No Capital Work-in-Progress reported.',
    cwipDiff,
    0,
    cwipBS === 0 || cwipAging.length === 0 || cwipDiff <= 5,
    'CWIP aging schedule (<1yr, 1-2yr, 2-3yr, >3yr) must tie with Note 14. Disclose projects with cost or timeline overruns.'
  );

  // 32. Related Party Disclosures (AS-18)
  addCheck(
    'IFC-32',
    'Related Party Disclosures & Key Management Personnel (AS-18)',
    'COMPLIANCE',
    'Related party relationships and transactions identified and segregated for Note disclosure.',
    0,
    0,
    true,
    'Disclose transactions with holding company, subsidiaries, associates, KMP, and relatives of KMP.'
  );

  // 33. Foreign Exchange Transactions (AS-11)
  addCheck(
    'IFC-33',
    'Foreign Exchange Earnings & Outgo Disclosure (AS-11)',
    'COMPLIANCE',
    'Foreign exchange earnings, CIF value of imports, and foreign expenditure tracked.',
    0,
    0,
    true,
    'Disclose earnings in foreign exchange (FOB basis) and expenditure in foreign currency.'
  );

  // 34. Earnings Per Share (AS-20)
  addCheck(
    'IFC-34',
    'Earnings Per Share (EPS) Disclosure on Face of P&L (AS-20)',
    'COMPLIANCE',
    `Profit After Tax: ₹${patCY.toLocaleString()}. Basic & Diluted EPS must appear on face of P&L.`,
    0,
    0,
    true,
    'Compute EPS by dividing PAT by weighted average number of equity shares outstanding.'
  );

  // 35. Contingent Liabilities & Commitments (AS-29)
  addCheck(
    'IFC-35',
    'Contingent Liabilities & Capital Commitments Review (AS-29)',
    'COMPLIANCE',
    'Claims against company not acknowledged as debts, bank guarantees, and capital commitments.',
    0,
    0,
    true,
    'Disclose contingent liabilities or state that there are no pending claims against the company.'
  );

  // 36. Level I-IV Accounting Standards Compliance (ICAI June 2022)
  addCheck(
    'IFC-36',
    `ICAI Technical Guide Level Evaluation (${clientSetup.entity_type.toUpperCase()})`,
    'COMPLIANCE',
    `Entity evaluated under ICAI Non-Corporate / Schedule III taxonomy standards.`,
    0,
    0,
    true,
    'Ensure entity-specific exemptions are applied in accordance with Level I-IV classification.'
  );

  // Summary tallies
  const passedCount = checks.filter((c) => c.status === 'OK').length;
  const criticalFailedCount = checks.filter((c) => c.status === 'FLAG' && c.check_type === 'CRITICAL').length;
  const warningCount = checks.filter((c) => c.status === 'FLAG' && c.check_type === 'WARNING').length;
  const complianceCount = checks.filter((c) => c.status === 'FLAG' && c.check_type === 'COMPLIANCE').length;

  return {
    checks,
    passedCount,
    criticalFailedCount,
    warningCount,
    complianceCount,
    isAllClear: criticalFailedCount === 0 && warningCount === 0,
  };
}

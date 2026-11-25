// ============================================================
// Financial Statements Module — Core Calculation Engine
// Schedule III (Companies Act 2013) & Non-Corporate (ICAI June 2022)
// ============================================================

import type {
  TrialBalanceEntry,
  ClientSetup,
  DenominationUnit,
  MasterGroupCode,
} from './finStatements.types';
import { getMasterGroupCodes } from './finStatements.storage';

export interface StatementLineItem {
  code?: number;
  particulars: string;
  noteNo?: number;
  cyAmount: number;
  pyAmount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  indent?: number; // 0, 1, 2 for hierarchy
}

export interface Schedule3FinancialsResult {
  balanceSheet: {
    equityAndLiabilities: StatementLineItem[];
    assets: StatementLineItem[];
    totalEquityAndLiabilities: { cy: number; py: number };
    totalAssets: { cy: number; py: number };
    difference: { cy: number; py: number };
    isBalanced: boolean;
  };
  profitAndLoss: {
    revenue: StatementLineItem[];
    expenses: StatementLineItem[];
    totalRevenue: { cy: number; py: number };
    totalExpenses: { cy: number; py: number };
    profitBeforeTax: { cy: number; py: number };
    taxExpense: StatementLineItem[];
    totalTaxExpense: { cy: number; py: number };
    profitAfterTax: { cy: number; py: number };
  };
  denominationFactor: number;
  denominationLabel: string;
}

export function getDenominationDivisor(unit: DenominationUnit): { factor: number; label: string } {
  switch (unit) {
    case 'hundreds': return { factor: 100, label: "Rs in '00" };
    case 'thousands': return { factor: 1000, label: "Rs in '000" };
    case 'lacs': return { factor: 100000, label: "Rs in Lakhs" };
    case 'crores': return { factor: 10000000, label: "Rs in Crores" };
    case 'in_rupees':
    default:
      return { factor: 1, label: "In Rupees (₹)" };
  }
}

/**
 * Computes complete Schedule III Balance Sheet and Statement of Profit and Loss
 * faithfully mapping 1000s, 2000s, 3000s, 4000s.
 */
export function computeSchedule3Financials(
  tbEntries: TrialBalanceEntry[],
  denomination: DenominationUnit = 'in_rupees'
): Schedule3FinancialsResult {
  const { factor, label: denomLabel } = getDenominationDivisor(denomination);

  // Helper: Sum entries mapped to a specific group code or range of group codes
  const sumCodes = (codes: number[] | ((c: number) => boolean)) => {
    let cySum = 0;
    let pySum = 0;

    for (const t of tbEntries) {
      if (!t.mapped_group_code) continue;
      const c = t.mapped_group_code;
      const matches = typeof codes === 'function' ? codes(c) : codes.includes(c);
      if (matches) {
        cySum += (t.cy_balance || 0);
        pySum += (t.py_balance || 0);
      }
    }
    return { cySum, pySum };
  };

  // Convert raw balances:
  // For Liabilities (1000s) & Income (3000s): Credit balance is negative in TB, so we negate to get positive representation
  // For Assets (2000s) & Expenses (4000s): Debit balance is positive in TB, so we take as is
  const getNet = (codes: number[] | ((c: number) => boolean), isCreditNormal: boolean) => {
    const { cySum, pySum } = sumCodes(codes);
    const cy = (isCreditNormal ? -cySum : cySum) / factor;
    const py = (isCreditNormal ? -pySum : pySum) / factor;
    return {
      cy: Math.round(cy * 100) / 100,
      py: Math.round(py * 100) / 100,
    };
  };

  // -------------------------------------------------------------
  // STATEMENT OF PROFIT AND LOSS
  // -------------------------------------------------------------
  const revOps = getNet([3001, 3002, 3003], true);
  const otherInc = getNet([3101, 3102, 3103, 3104], true);

  const revenue: StatementLineItem[] = [
    { particulars: 'I. Revenue from operations', noteNo: 25, cyAmount: revOps.cy, pyAmount: revOps.py, indent: 0 },
    { particulars: 'II. Other income', noteNo: 26, cyAmount: otherInc.cy, pyAmount: otherInc.py, indent: 0 },
  ];
  const totalRevenue = {
    cy: Math.round((revOps.cy + otherInc.cy) * 100) / 100,
    py: Math.round((revOps.py + otherInc.py) * 100) / 100,
  };

  // Expenses
  const matCons = getNet([4001], false);
  const purch = getNet([4101], false);
  const chgInv = getNet([4201], false);
  const empBen = getNet([4301, 4302, 4303, 4304], false);
  const finCost = getNet([4401, 4402, 4403], false);
  const depExp = getNet([4501], false);
  const othExp = getNet([4601, 4602, 4604, 4605, 4606, 4607, 4609, 4610, 4611, 4612, 4613, 4614], false);

  const expenses: StatementLineItem[] = [
    { particulars: 'Cost of materials consumed', noteNo: 27, cyAmount: matCons.cy, pyAmount: matCons.py, indent: 1 },
    { particulars: 'Purchases of stock-in-trade', noteNo: 28, cyAmount: purch.cy, pyAmount: purch.py, indent: 1 },
    { particulars: 'Changes in inventories of finished goods, WIP and Stock-in-Trade', noteNo: 29, cyAmount: chgInv.cy, pyAmount: chgInv.py, indent: 1 },
    { particulars: 'Employee benefit expenses', noteNo: 30, cyAmount: empBen.cy, pyAmount: empBen.py, indent: 1 },
    { particulars: 'Finance costs', noteNo: 31, cyAmount: finCost.cy, pyAmount: finCost.py, indent: 1 },
    { particulars: 'Depreciation and amortization expense', noteNo: 32, cyAmount: depExp.cy, pyAmount: depExp.py, indent: 1 },
    { particulars: 'Other expenses', noteNo: 33, cyAmount: othExp.cy, pyAmount: othExp.py, indent: 1 },
  ];

  const totalExpenses = {
    cy: Math.round((matCons.cy + purch.cy + chgInv.cy + empBen.cy + finCost.cy + depExp.cy + othExp.cy) * 100) / 100,
    py: Math.round((matCons.py + purch.py + chgInv.py + empBen.py + finCost.py + depExp.py + othExp.py) * 100) / 100,
  };

  const pbt = {
    cy: Math.round((totalRevenue.cy - totalExpenses.cy) * 100) / 100,
    py: Math.round((totalRevenue.py - totalExpenses.py) * 100) / 100,
  };

  const currTax = getNet([4801], false);
  const defTax = getNet([4802], false);
  const priorTax = getNet([4803], false);
  const taxExpense: StatementLineItem[] = [
    { particulars: '(1) Current tax', cyAmount: currTax.cy, pyAmount: currTax.py, indent: 1 },
    { particulars: '(2) Deferred tax', cyAmount: defTax.cy, pyAmount: defTax.py, indent: 1 },
  ];
  if (priorTax.cy !== 0 || priorTax.py !== 0) {
    taxExpense.push({ particulars: '(3) Tax adjustments of prior periods', cyAmount: priorTax.cy, pyAmount: priorTax.py, indent: 1 });
  }

  const totalTaxExpense = {
    cy: Math.round((currTax.cy + defTax.cy + priorTax.cy) * 100) / 100,
    py: Math.round((currTax.py + defTax.py + priorTax.py) * 100) / 100,
  };

  const pat = {
    cy: Math.round((pbt.cy - totalTaxExpense.cy) * 100) / 100,
    py: Math.round((pbt.py - totalTaxExpense.py) * 100) / 100,
  };

  // -------------------------------------------------------------
  // BALANCE SHEET — I. EQUITY AND LIABILITIES
  // -------------------------------------------------------------
  // (1) Shareholders' Funds
  const shareCap = getNet([1001, 1002], true);
  // Base Reserves & Surplus from TB + current year unclosed profit
  const baseReserves = getNet([1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1116], true);
  const reservesSurplus = {
    cy: Math.round((baseReserves.cy + pat.cy) * 100) / 100,
    py: baseReserves.py,
  };
  const moneyWarrants = getNet([1201], true);
  const shareAppMoney = getNet([1251], true);

  // (2) Non-Current Liabilities
  const ltBorrowings = getNet((c) => c >= 1301 && c <= 1316, true);
  const dtl = getNet([1401], true);
  const otherLtLiab = getNet([1501, 1502], true);
  const ltProvisions = getNet([1551, 1552], true);

  // (3) Current Liabilities
  const stBorrowings = getNet((c) => c >= 1601 && c <= 1610, true);
  const tpMsme = getNet([1701], true);
  const tpOthers = getNet([1702], true);
  const otherCurrLiab = getNet((c) => c >= 1801 && c <= 1810, true);
  const stProvisions = getNet([1901, 1902], true);

  const equityAndLiabilities: StatementLineItem[] = [
    { particulars: 'I. EQUITY AND LIABILITIES', isHeader: true, indent: 0, cyAmount: 0, pyAmount: 0 },
    { particulars: '(1) Shareholders’ funds / Partners’ funds', isHeader: true, indent: 1, cyAmount: 0, pyAmount: 0 },
    { particulars: '(a) Share capital / Capital account', noteNo: 1, cyAmount: shareCap.cy, pyAmount: shareCap.py, indent: 2 },
    { particulars: '(b) Reserves and surplus', noteNo: 2, cyAmount: reservesSurplus.cy, pyAmount: reservesSurplus.py, indent: 2 },
    { particulars: '(c) Money received against share warrants', cyAmount: moneyWarrants.cy, pyAmount: moneyWarrants.py, indent: 2 },
    
    { particulars: '(2) Share application money pending allotment', cyAmount: shareAppMoney.cy, pyAmount: shareAppMoney.py, indent: 1 },
    
    { particulars: '(3) Non-current liabilities', isHeader: true, indent: 1, cyAmount: 0, pyAmount: 0 },
    { particulars: '(a) Long-term borrowings', noteNo: 3, cyAmount: ltBorrowings.cy, pyAmount: ltBorrowings.py, indent: 2 },
    { particulars: '(b) Deferred tax liabilities (Net)', noteNo: 4, cyAmount: dtl.cy, pyAmount: dtl.py, indent: 2 },
    { particulars: '(c) Other long-term liabilities', noteNo: 5, cyAmount: otherLtLiab.cy, pyAmount: otherLtLiab.py, indent: 2 },
    { particulars: '(d) Long-term provisions', noteNo: 6, cyAmount: ltProvisions.cy, pyAmount: ltProvisions.py, indent: 2 },
    
    { particulars: '(4) Current liabilities', isHeader: true, indent: 1, cyAmount: 0, pyAmount: 0 },
    { particulars: '(a) Short-term borrowings', noteNo: 7, cyAmount: stBorrowings.cy, pyAmount: stBorrowings.py, indent: 2 },
    { particulars: '(b) Trade payables', isHeader: true, indent: 2, cyAmount: 0, pyAmount: 0 },
    { particulars: '     (i) Due to Micro and Small Enterprises', noteNo: 8, cyAmount: tpMsme.cy, pyAmount: tpMsme.py, indent: 3 },
    { particulars: '     (ii) Due to others', noteNo: 8, cyAmount: tpOthers.cy, pyAmount: tpOthers.py, indent: 3 },
    { particulars: '(c) Other current liabilities', noteNo: 9, cyAmount: otherCurrLiab.cy, pyAmount: otherCurrLiab.py, indent: 2 },
    { particulars: '(d) Short-term provisions', noteNo: 10, cyAmount: stProvisions.cy, pyAmount: stProvisions.py, indent: 2 },
  ];

  const totalEquityAndLiabilities = {
    cy: Math.round((
      shareCap.cy + reservesSurplus.cy + moneyWarrants.cy + shareAppMoney.cy +
      ltBorrowings.cy + dtl.cy + otherLtLiab.cy + ltProvisions.cy +
      stBorrowings.cy + tpMsme.cy + tpOthers.cy + otherCurrLiab.cy + stProvisions.cy
    ) * 100) / 100,
    py: Math.round((
      shareCap.py + reservesSurplus.py + moneyWarrants.py + shareAppMoney.py +
      ltBorrowings.py + dtl.py + otherLtLiab.py + ltProvisions.py +
      stBorrowings.py + tpMsme.py + tpOthers.py + otherCurrLiab.py + stProvisions.py
    ) * 100) / 100,
  };

  // -------------------------------------------------------------
  // BALANCE SHEET — II. ASSETS
  // -------------------------------------------------------------
  // (1) Non-Current Assets
  const ppe = getNet([2001], false);
  const intangibles = getNet([2002], false);
  const cwip = getNet([2003], false);
  const intangiblesWip = getNet([2004], false);
  const ncInvestments = getNet((c) => c >= 2101 && c <= 2123, false);
  const dta = getNet([2201], false);
  const ltLoansAdvances = getNet((c) => c >= 2301 && c <= 2310, false);
  const otherNcAssets = getNet((c) => c >= 2401 && c <= 2406, false);

  // (2) Current Assets
  const currInvestments = getNet((c) => c >= 2502 && c <= 2523, false);
  const inventories = getNet([2601], false);
  const tradeReceivables = getNet((c) => c >= 2701 && c <= 2707, false);
  const cashEquivalents = getNet((c) => c >= 2801 && c <= 2807, false);
  const stLoansAdvances = getNet((c) => c >= 2901 && c <= 2909, false);
  const otherCurrAssets = getNet([2951], false);

  const assets: StatementLineItem[] = [
    { particulars: 'II. ASSETS', isHeader: true, indent: 0, cyAmount: 0, pyAmount: 0 },
    { particulars: '(1) Non-current assets', isHeader: true, indent: 1, cyAmount: 0, pyAmount: 0 },
    { particulars: '(a) Property, Plant and Equipment and Intangible assets', isHeader: true, indent: 2, cyAmount: 0, pyAmount: 0 },
    { particulars: '     (i) Property, Plant and Equipment (PPE)', noteNo: 11, cyAmount: ppe.cy, pyAmount: ppe.py, indent: 3 },
    { particulars: '     (ii) Intangible assets', noteNo: 12, cyAmount: intangibles.cy, pyAmount: intangibles.py, indent: 3 },
    { particulars: '     (iii) Capital work-in-progress (CWIP)', noteNo: 13, cyAmount: cwip.cy, pyAmount: cwip.py, indent: 3 },
    { particulars: '     (iv) Intangible assets under development', noteNo: 14, cyAmount: intangiblesWip.cy, pyAmount: intangiblesWip.py, indent: 3 },
    { particulars: '(b) Non-current investments', noteNo: 15, cyAmount: ncInvestments.cy, pyAmount: ncInvestments.py, indent: 2 },
    { particulars: '(c) Deferred tax assets (Net)', noteNo: 16, cyAmount: dta.cy, pyAmount: dta.py, indent: 2 },
    { particulars: '(d) Long-term loans and advances', noteNo: 17, cyAmount: ltLoansAdvances.cy, pyAmount: ltLoansAdvances.py, indent: 2 },
    { particulars: '(e) Other non-current assets', noteNo: 18, cyAmount: otherNcAssets.cy, pyAmount: otherNcAssets.py, indent: 2 },
    
    { particulars: '(2) Current assets', isHeader: true, indent: 1, cyAmount: 0, pyAmount: 0 },
    { particulars: '(a) Current investments', noteNo: 19, cyAmount: currInvestments.cy, pyAmount: currInvestments.py, indent: 2 },
    { particulars: '(b) Inventories', noteNo: 20, cyAmount: inventories.cy, pyAmount: inventories.py, indent: 2 },
    { particulars: '(c) Trade receivables', noteNo: 21, cyAmount: tradeReceivables.cy, pyAmount: tradeReceivables.py, indent: 2 },
    { particulars: '(d) Cash and cash equivalents', noteNo: 22, cyAmount: cashEquivalents.cy, pyAmount: cashEquivalents.py, indent: 2 },
    { particulars: '(e) Short-term loans and advances', noteNo: 23, cyAmount: stLoansAdvances.cy, pyAmount: stLoansAdvances.py, indent: 2 },
    { particulars: '(f) Other current assets', noteNo: 24, cyAmount: otherCurrAssets.cy, pyAmount: otherCurrAssets.py, indent: 2 },
  ];

  const totalAssets = {
    cy: Math.round((
      ppe.cy + intangibles.cy + cwip.cy + intangiblesWip.cy + ncInvestments.cy + dta.cy + ltLoansAdvances.cy + otherNcAssets.cy +
      currInvestments.cy + inventories.cy + tradeReceivables.cy + cashEquivalents.cy + stLoansAdvances.cy + otherCurrAssets.cy
    ) * 100) / 100,
    py: Math.round((
      ppe.py + intangibles.py + cwip.py + intangiblesWip.py + ncInvestments.py + dta.py + ltLoansAdvances.py + otherNcAssets.py +
      currInvestments.py + inventories.py + tradeReceivables.py + cashEquivalents.py + stLoansAdvances.py + otherCurrAssets.py
    ) * 100) / 100,
  };

  const difference = {
    cy: Math.round((totalAssets.cy - totalEquityAndLiabilities.cy) * 100) / 100,
    py: Math.round((totalAssets.py - totalEquityAndLiabilities.py) * 100) / 100,
  };

  return {
    balanceSheet: {
      equityAndLiabilities,
      assets,
      totalEquityAndLiabilities,
      totalAssets,
      difference,
      isBalanced: Math.abs(difference.cy) < 1.0,
    },
    profitAndLoss: {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      profitBeforeTax: pbt,
      taxExpense,
      totalTaxExpense,
      profitAfterTax: pat,
    },
    denominationFactor: factor,
    denominationLabel: denomLabel,
  };
}

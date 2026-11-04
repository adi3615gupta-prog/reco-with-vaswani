// ============================================================
// Financial Statements Module — Cash Flow Statement Engine
// AS-3 / Ind AS 7 Indirect Method (Automated Working Capital & Tax Derivation)
// ============================================================

import type {
  TrialBalanceEntry,
  CashFlowStatementData,
  DenominationUnit,
} from './finStatements.types';
import { getDenominationDivisor } from './finStatementsEngine';

export function computeCashFlowStatement(
  tbEntries: TrialBalanceEntry[],
  denomination: DenominationUnit = 'in_rupees'
): CashFlowStatementData {
  const { factor } = getDenominationDivisor(denomination);

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

  const getNet = (codes: number[] | ((c: number) => boolean), isCreditNormal: boolean) => {
    const { cySum, pySum } = sumCodes(codes);
    const cy = (isCreditNormal ? -cySum : cySum) / factor;
    const py = (isCreditNormal ? -pySum : pySum) / factor;
    return {
      cy: Math.round(cy * 100) / 100,
      py: Math.round(py * 100) / 100,
    };
  };

  // 1. P&L Items for Operating Base
  const revOps = getNet([3001, 3002, 3003], true);
  const otherInc = getNet([3101, 3102, 3103, 3104], true);
  const totalRev = revOps.cy + otherInc.cy;

  const matCons = getNet([4001], false);
  const purch = getNet([4101], false);
  const chgInv = getNet([4201], false);
  const empBen = getNet([4301, 4302, 4303, 4304], false);
  const finCost = getNet([4401, 4402, 4403], false);
  const depExp = getNet([4501], false);
  const othExp = getNet((c) => c >= 4601 && c <= 4614, false);
  const totalExp = matCons.cy + purch.cy + chgInv.cy + empBen.cy + finCost.cy + depExp.cy + othExp.cy;

  const pbt = Math.round((totalRev - totalExp) * 100) / 100;

  // Non-Cash Adjustments
  const interestIncome = getNet([3101], true).cy;
  const dividendIncome = getNet([3102], true).cy;
  const gainOnInvestments = getNet([3103], true).cy;
  const financeCosts = finCost.cy;
  const depreciation = depExp.cy;

  const adjustmentsNonCash = [
    { label: 'Depreciation and amortization expense', cy_amount: depreciation, py_amount: depExp.py },
    { label: 'Finance costs', cy_amount: financeCosts, py_amount: finCost.py },
    { label: 'Interest income', cy_amount: -interestIncome, py_amount: -getNet([3101], true).py },
    { label: 'Dividend income', cy_amount: -dividendIncome, py_amount: -getNet([3102], true).py },
    { label: 'Net gain on sale of investments', cy_amount: -gainOnInvestments, py_amount: -getNet([3103], true).py },
  ];

  const nonCashTotal = adjustmentsNonCash.reduce((sum, item) => sum + item.cy_amount, 0);
  const operatingProfitBeforeWc = Math.round((pbt + nonCashTotal) * 100) / 100;

  // Working Capital Movements (Opening PY - Closing CY for Assets; Closing CY - Opening PY for Liabilities)
  const inv = getNet([2601], false);
  const deltaInv = Math.round((inv.py - inv.cy) * 100) / 100; // Decrease is positive cash

  const rec = getNet((c) => c >= 2701 && c <= 2707, false);
  const deltaRec = Math.round((rec.py - rec.cy) * 100) / 100; // Decrease is positive cash

  const othCa = getNet([2951], false);
  const deltaOthCa = Math.round((othCa.py - othCa.cy) * 100) / 100;

  const tp = getNet([1701, 1702], true);
  const deltaTp = Math.round((tp.cy - tp.py) * 100) / 100; // Increase is positive cash

  const othCl = getNet((c) => c >= 1801 && c <= 1810, true);
  const deltaOthCl = Math.round((othCl.cy - othCl.py) * 100) / 100;

  const prov = getNet([1901], true); // Short-term provisions (excluding tax)
  const deltaProv = Math.round((prov.cy - prov.py) * 100) / 100;

  const wcChanges = [
    { label: '(Increase) / Decrease in Inventories', cy_amount: deltaInv, py_amount: 0 },
    { label: '(Increase) / Decrease in Trade Receivables', cy_amount: deltaRec, py_amount: 0 },
    { label: '(Increase) / Decrease in Other Current Assets', cy_amount: deltaOthCa, py_amount: 0 },
    { label: 'Increase / (Decrease) in Trade Payables', cy_amount: deltaTp, py_amount: 0 },
    { label: 'Increase / (Decrease) in Other Current Liabilities', cy_amount: deltaOthCl, py_amount: 0 },
    { label: 'Increase / (Decrease) in Provisions', cy_amount: deltaProv, py_amount: 0 },
  ];

  const totalWcMovement = wcChanges.reduce((sum, item) => sum + item.cy_amount, 0);
  const cashGeneratedFromOps = Math.round((operatingProfitBeforeWc + totalWcMovement) * 100) / 100;

  // Direct Taxes Paid Derivation:
  // Tax Paid = Opening Prov for Tax (1902) + Current Tax (4801) - Closing Prov for Tax (1902)
  const provTax = getNet([1902], true);
  const currentTaxExp = getNet([4801], false).cy;
  const taxesPaid = Math.max(0, Math.round((provTax.py + currentTaxExp - provTax.cy) * 100) / 100);

  const netCashFromOperating = Math.round((cashGeneratedFromOps - taxesPaid) * 100) / 100;

  // -------------------------------------------------------------
  // 2. INVESTING ACTIVITIES
  // -------------------------------------------------------------
  const ppe = getNet([2001, 2002, 2003, 2004], false);
  // Net capex = Closing PPE - Opening PPE + Depreciation
  const netCapex = Math.round((ppe.cy - ppe.py + depreciation) * 100) / 100;

  const nonCurrInv = getNet((c) => c >= 2101 && c <= 2123, false);
  const deltaInvSec = Math.round((nonCurrInv.cy - nonCurrInv.py) * 100) / 100;

  const investingItems = [
    { label: 'Purchase of Property, Plant & Equipment / Intangibles', cy_amount: -Math.abs(netCapex), py_amount: 0 },
    { label: 'Purchase / (Sale) of Non-Current Investments', cy_amount: -deltaInvSec, py_amount: 0 },
    { label: 'Interest received', cy_amount: interestIncome, py_amount: 0 },
    { label: 'Dividend received', cy_amount: dividendIncome, py_amount: 0 },
  ];

  const netCashFromInvesting = Math.round(investingItems.reduce((sum, item) => sum + item.cy_amount, 0) * 100) / 100;

  // -------------------------------------------------------------
  // 3. FINANCING ACTIVITIES
  // -------------------------------------------------------------
  const shareCap = getNet([1001, 1002], true);
  const deltaShareCap = Math.round((shareCap.cy - shareCap.py) * 100) / 100;

  const secPremium = getNet([1104], true);
  const deltaSecPrem = Math.round((secPremium.cy - secPremium.py) * 100) / 100;

  const ltBorrow = getNet((c) => c >= 1301 && c <= 1316, true);
  const deltaLtBorrow = Math.round((ltBorrow.cy - ltBorrow.py) * 100) / 100;

  const stBorrow = getNet((c) => c >= 1601 && c <= 1610, true);
  const deltaStBorrow = Math.round((stBorrow.cy - stBorrow.py) * 100) / 100;

  const financingItems = [
    { label: 'Proceeds from issue of Share Capital / Partner Capital', cy_amount: deltaShareCap, py_amount: 0 },
    { label: 'Proceeds from Securities Premium', cy_amount: deltaSecPrem, py_amount: 0 },
    { label: 'Proceeds / (Repayment) of Long-term Borrowings', cy_amount: deltaLtBorrow, py_amount: 0 },
    { label: 'Proceeds / (Repayment) of Short-term Borrowings', cy_amount: deltaStBorrow, py_amount: 0 },
    { label: 'Finance costs paid', cy_amount: -financeCosts, py_amount: 0 },
  ];

  const netCashFromFinancing = Math.round(financingItems.reduce((sum, item) => sum + item.cy_amount, 0) * 100) / 100;

  // -------------------------------------------------------------
  // 4. CASH RECONCILIATION
  // -------------------------------------------------------------
  const netIncreaseDecrease = Math.round((netCashFromOperating + netCashFromInvesting + netCashFromFinancing) * 100) / 100;

  const cashBank = getNet((c) => c >= 2801 && c <= 2807, false);
  const openingCash = cashBank.py;
  const closingCashExpected = Math.round((openingCash + netIncreaseDecrease) * 100) / 100;
  const closingCashActual = cashBank.cy;
  const variance = Math.round((closingCashActual - closingCashExpected) * 100) / 100;

  return {
    operating_activities: {
      net_profit_before_tax: pbt,
      adjustments_non_cash: adjustmentsNonCash,
      operating_profit_before_wc: operatingProfitBeforeWc,
      working_capital_changes: wcChanges,
      cash_generated_from_operations: cashGeneratedFromOps,
      direct_taxes_paid: taxesPaid,
      net_cash_from_operating: netCashFromOperating,
    },
    investing_activities: {
      items: investingItems,
      net_cash_from_investing: netCashFromInvesting,
    },
    financing_activities: {
      items: financingItems,
      net_cash_from_financing: netCashFromFinancing,
    },
    net_increase_decrease_cash: netIncreaseDecrease,
    opening_cash_equivalents: openingCash,
    closing_cash_equivalents: closingCashActual,
    reconciliation_variance: variance,
    is_tallied: Math.abs(variance) < 1.0,
  };
}

export const generateCashFlowStatement = computeCashFlowStatement;


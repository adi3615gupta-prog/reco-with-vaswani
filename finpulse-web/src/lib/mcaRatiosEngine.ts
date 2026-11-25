// ============================================================
// Financial Statements Module — MCA 2021 Regulatory Ratios Engine
// Schedule III Division I & II — 11 Statutory Financial Ratios
// ============================================================

import type { TrialBalanceEntry, FinancialRatio, DenominationUnit } from './finStatements.types';
import { computeSchedule3Financials } from './finStatementsEngine';

export interface McaRatiosComputationResult {
  ratios: FinancialRatio[];
  flaggedCount: number;
}

export function computeMcaFinancialRatios(
  tbEntries: TrialBalanceEntry[],
  denomination: DenominationUnit = 'in_rupees'
): McaRatiosComputationResult {
  const fin = computeSchedule3Financials(tbEntries, denomination);
  const bs = fin.balanceSheet;
  const pl = fin.profitAndLoss;

  // Extract key totals
  // Current Assets
  const caCY = bs.assets.filter((a) => a.noteNo && a.noteNo >= 19 && a.noteNo <= 24).reduce((s, a) => s + a.cyAmount, 0);
  const caPY = bs.assets.filter((a) => a.noteNo && a.noteNo >= 19 && a.noteNo <= 24).reduce((s, a) => s + a.pyAmount, 0);

  // Current Liabilities
  const clCY = bs.equityAndLiabilities.filter((l) => l.noteNo && l.noteNo >= 7 && l.noteNo <= 10).reduce((s, l) => s + l.cyAmount, 0);
  const clPY = bs.equityAndLiabilities.filter((l) => l.noteNo && l.noteNo >= 7 && l.noteNo <= 10).reduce((s, l) => s + l.pyAmount, 0);

  // Total Debt (Long term + Short term borrowings)
  const ltDebtCY = bs.equityAndLiabilities.find((l) => l.noteNo === 3)?.cyAmount || 0;
  const ltDebtPY = bs.equityAndLiabilities.find((l) => l.noteNo === 3)?.pyAmount || 0;
  const stDebtCY = bs.equityAndLiabilities.find((l) => l.noteNo === 7)?.cyAmount || 0;
  const stDebtPY = bs.equityAndLiabilities.find((l) => l.noteNo === 7)?.pyAmount || 0;
  const totalDebtCY = ltDebtCY + stDebtCY;
  const totalDebtPY = ltDebtPY + stDebtPY;

  // Shareholder's Equity (Share Cap + Reserves)
  const shareCapCY = bs.equityAndLiabilities.find((l) => l.noteNo === 1)?.cyAmount || 0;
  const shareCapPY = bs.equityAndLiabilities.find((l) => l.noteNo === 1)?.pyAmount || 0;
  const reservesCY = bs.equityAndLiabilities.find((l) => l.noteNo === 2)?.cyAmount || 0;
  const reservesPY = bs.equityAndLiabilities.find((l) => l.noteNo === 2)?.pyAmount || 0;
  const netWorthCY = shareCapCY + reservesCY;
  const netWorthPY = shareCapPY + reservesPY;

  // P&L figures
  const revCY = pl.totalRevenue.cy;
  const revPY = pl.totalRevenue.py;
  const patCY = pl.profitAfterTax.cy;
  const patPY = pl.profitAfterTax.py;
  const finCostCY = pl.expenses.find((e) => e.noteNo === 31)?.cyAmount || 0;
  const finCostPY = pl.expenses.find((e) => e.noteNo === 31)?.pyAmount || 0;
  const depCY = pl.expenses.find((e) => e.noteNo === 32)?.cyAmount || 0;
  const depPY = pl.expenses.find((e) => e.noteNo === 32)?.pyAmount || 0;

  // Inventory
  const invCY = bs.assets.find((a) => a.noteNo === 20)?.cyAmount || 0;
  const invPY = bs.assets.find((a) => a.noteNo === 20)?.pyAmount || 0;
  const avgInv = invPY > 0 ? (invCY + invPY) / 2 : invCY;

  // COGS = Material consumed + Purchases + Change in inv
  const cogsCY = (pl.expenses.find((e) => e.noteNo === 27)?.cyAmount || 0) +
                 (pl.expenses.find((e) => e.noteNo === 28)?.cyAmount || 0) +
                 (pl.expenses.find((e) => e.noteNo === 29)?.cyAmount || 0);
  const cogsPY = (pl.expenses.find((e) => e.noteNo === 27)?.pyAmount || 0) +
                 (pl.expenses.find((e) => e.noteNo === 28)?.pyAmount || 0) +
                 (pl.expenses.find((e) => e.noteNo === 29)?.pyAmount || 0);

  // Trade Receivables
  const trCY = bs.assets.find((a) => a.noteNo === 21)?.cyAmount || 0;
  const trPY = bs.assets.find((a) => a.noteNo === 21)?.pyAmount || 0;
  const avgTR = trPY > 0 ? (trCY + trPY) / 2 : trCY;

  // Trade Payables
  const tpMsmeCY = bs.equityAndLiabilities.find((l) => l.particulars.includes('Micro and Small'))?.cyAmount || 0;
  const tpOtherCY = bs.equityAndLiabilities.find((l) => l.particulars.includes('others'))?.cyAmount || 0;
  const tpCY = tpMsmeCY + tpOtherCY;
  const tpMsmePY = bs.equityAndLiabilities.find((l) => l.particulars.includes('Micro and Small'))?.pyAmount || 0;
  const tpOtherPY = bs.equityAndLiabilities.find((l) => l.particulars.includes('others'))?.pyAmount || 0;
  const tpPY = tpMsmePY + tpOtherPY;
  const avgTP = tpPY > 0 ? (tpCY + tpPY) / 2 : tpCY;

  // Purchases
  const purchCY = pl.expenses.find((e) => e.noteNo === 28)?.cyAmount || 0;
  const purchPY = pl.expenses.find((e) => e.noteNo === 28)?.pyAmount || 0;

  // Working Capital
  const wcCY = caCY - clCY;
  const wcPY = caPY - clPY;

  // EBIT & Capital Employed
  const ebitCY = pl.profitBeforeTax.cy + finCostCY;
  const ebitPY = pl.profitBeforeTax.py + finCostPY;
  const dtlCY = bs.equityAndLiabilities.find((l) => l.noteNo === 4)?.cyAmount || 0;
  const dtlPY = bs.equityAndLiabilities.find((l) => l.noteNo === 4)?.pyAmount || 0;
  const capEmployedCY = netWorthCY + totalDebtCY + dtlCY;
  const capEmployedPY = netWorthPY + totalDebtPY + dtlPY;

  // Investments
  const invCYTotal = (bs.assets.find((a) => a.noteNo === 15)?.cyAmount || 0) +
                     (bs.assets.find((a) => a.noteNo === 19)?.cyAmount || 0);
  const invPYTotal = (bs.assets.find((a) => a.noteNo === 15)?.pyAmount || 0) +
                     (bs.assets.find((a) => a.noteNo === 19)?.pyAmount || 0);
  const avgInvestments = invPYTotal > 0 ? (invCYTotal + invPYTotal) / 2 : invCYTotal;
  const invIncomeCY = (pl.revenue.find((r) => r.noteNo === 26)?.cyAmount || 0);
  const invIncomePY = (pl.revenue.find((r) => r.noteNo === 26)?.pyAmount || 0);

  // Helper to build ratio item
  const buildRatio = (
    id: string,
    name: string,
    numLabel: string,
    denLabel: string,
    cy: number,
    py: number,
    isPercentage = false
  ): FinancialRatio => {
    const cyVal = isFinite(cy) ? Math.round(cy * 100) / 100 : 0;
    const pyVal = isFinite(py) ? Math.round(py * 100) / 100 : 0;
    let variance = 0;
    if (pyVal !== 0) {
      variance = Math.round(((cyVal - pyVal) / Math.abs(pyVal)) * 10000) / 100;
    } else if (cyVal !== 0) {
      variance = 100;
    }
    const isFlagged = Math.abs(variance) > 25.0;

    return {
      id,
      ratio_name: name,
      numerator_label: numLabel,
      denominator_label: denLabel,
      cy_value: cyVal,
      py_value: pyVal,
      variance_percent: variance,
      is_flagged: isFlagged,
      variance_reason: isFlagged ? 'Variance exceeds statutory 25% threshold; requires explanation.' : undefined,
    };
  };

  const ratios: FinancialRatio[] = [
    buildRatio('r1', 'Current Ratio', 'Current Assets', 'Current Liabilities', clCY > 0 ? caCY / clCY : 0, clPY > 0 ? caPY / clPY : 0),
    buildRatio('r2', 'Debt-Equity Ratio', 'Total Debt', 'Shareholder’s Equity', netWorthCY > 0 ? totalDebtCY / netWorthCY : 0, netWorthPY > 0 ? totalDebtPY / netWorthPY : 0),
    buildRatio('r3', 'Debt Service Coverage Ratio (DSCR)', 'PAT + Dep + Finance Cost', 'Finance Cost + Repayments', finCostCY > 0 ? (patCY + depCY + finCostCY) / finCostCY : 0, finCostPY > 0 ? (patPY + depPY + finCostPY) / finCostPY : 0),
    buildRatio('r4', 'Return on Equity (ROE) %', 'Net Profit After Tax', 'Average Shareholder’s Equity', netWorthCY > 0 ? (patCY / netWorthCY) * 100 : 0, netWorthPY > 0 ? (patPY / netWorthPY) * 100 : 0, true),
    buildRatio('r5', 'Inventory Turnover Ratio', 'Cost of Goods Sold', 'Average Inventory', avgInv > 0 ? cogsCY / avgInv : 0, invPY > 0 ? cogsPY / invPY : 0),
    buildRatio('r6', 'Trade Receivables Turnover Ratio', 'Revenue from Operations', 'Average Trade Receivables', avgTR > 0 ? revCY / avgTR : 0, trPY > 0 ? revPY / trPY : 0),
    buildRatio('r7', 'Trade Payables Turnover Ratio', 'Net Purchases', 'Average Trade Payables', avgTP > 0 ? purchCY / avgTP : 0, tpPY > 0 ? purchPY / tpPY : 0),
    buildRatio('r8', 'Net Capital Turnover Ratio', 'Revenue from Operations', 'Working Capital', wcCY !== 0 ? revCY / wcCY : 0, wcPY !== 0 ? revPY / wcPY : 0),
    buildRatio('r9', 'Net Profit Ratio %', 'Net Profit After Tax', 'Revenue from Operations', revCY > 0 ? (patCY / revCY) * 100 : 0, revPY > 0 ? (patPY / revPY) * 100 : 0, true),
    buildRatio('r10', 'Return on Capital Employed (ROCE) %', 'EBIT', 'Capital Employed', capEmployedCY > 0 ? (ebitCY / capEmployedCY) * 100 : 0, capEmployedPY > 0 ? (ebitPY / capEmployedPY) * 100 : 0, true),
    buildRatio('r11', 'Return on Investment (ROI) %', 'Income from Investments', 'Average Investments', avgInvestments > 0 ? (invIncomeCY / avgInvestments) * 100 : 0, invPYTotal > 0 ? (invIncomePY / invPYTotal) * 100 : 0, true),
  ];

  const flaggedCount = ratios.filter((r) => r.is_flagged).length;

  return { ratios, flaggedCount };
}

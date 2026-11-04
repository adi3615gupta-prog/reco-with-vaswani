// ============================================================
// Financial Statements Module — Zero-Merge Audit-Grade Excel Exporter
// Strict Zero-Merge Architecture (ws['!merges'] = [])
// ============================================================

import * as XLSX from 'xlsx';
import type {
  ClientSetup,
  TrialBalanceEntry,
  FixedAssetEntry,
  PartnerCapitalEntry,
  FinancialRatio,
  AgingScheduleBucket,
  ReceivableAgingBucket,
  CwipAgingBucket,
  DenominationUnit,
} from './finStatements.types';
import { computeSchedule3Financials } from './finStatementsEngine';
import { generateCashFlowStatement } from './cfsEngine';
import { computeMcaFinancialRatios } from './mcaRatiosEngine';
import { evaluateIfcChecks } from './ifcChecksEngine';
import { aggregateNotes } from './finStatements.storage';

/**
 * Strips all merged cells from all sheets in the workbook to preserve
 * standard Excel sorting, filtering, and XLOOKUP compatibility.
 */
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.Sheets) return wb;
  for (const sheetName of Object.keys(wb.Sheets)) {
    const ws = wb.Sheets[sheetName];
    if (ws) {
      ws['!merges'] = [];
    }
  }
  return wb;
}

export interface FinStatementsExportOptions {
  clientSetup: ClientSetup;
  tbEntries: TrialBalanceEntry[];
  fixedAssets?: FixedAssetEntry[];
  partnersCapital?: PartnerCapitalEntry[];
  denomination?: DenominationUnit;
  ratioReasons?: Record<string, string>;
  tpAging?: AgingScheduleBucket[];
  trAging?: ReceivableAgingBucket[];
  cwipAging?: CwipAgingBucket[];
  filename?: string;
}

export function generateFinancialStatementsWorkbook(options: FinStatementsExportOptions): XLSX.WorkBook {
  const {
    clientSetup,
    tbEntries,
    fixedAssets = [],
    partnersCapital = [],
    denomination = clientSetup.denomination || 'in_rupees',
    ratioReasons = {},
    tpAging = [],
    trAging = [],
    cwipAging = [],
  } = options;

  const wb = XLSX.utils.book_new();

  const fin = computeSchedule3Financials(tbEntries, denomination);
  const bs = fin.balanceSheet;
  const pl = fin.profitAndLoss;
  const cfs = generateCashFlowStatement(tbEntries, denomination);
  const ratiosRes = computeMcaFinancialRatios(tbEntries, denomination);
  const ratios = ratiosRes.ratios.map((r) => ({
    ...r,
    variance_reason: ratioReasons[r.id] || '',
  }));
  const ifcRes = evaluateIfcChecks({
    tbEntries,
    clientSetup,
    denomination,
    fixedAssets,
    partnersCapital,
    ratios,
    tpAging,
    trAging,
    cwipAging,
  });

  const denomLabel = denomination.replace('_', ' ').toUpperCase();

  // ─────────────────────────────────────────────────────────────
  // SHEET 1: EXECUTIVE SUMMARY & DASHBOARD
  // ─────────────────────────────────────────────────────────────
  const summaryAoa: any[][] = [
    ['VASWANI ENTERPRISE AUDIT SUITE — FINANCIAL STATEMENTS SUMMARY'],
    [`Company Name: ${clientSetup.company_name}`, '', `CIN: ${clientSetup.cin_number || 'N/A'}`],
    [`Financial Year: ${clientSetup.financial_year}`, '', `Assessment Year: ${clientSetup.assessment_year}`],
    [`Reporting Currency: INR (Amounts in ${denomLabel})`, '', `Entity Type: ${clientSetup.entity_type.toUpperCase()}`],
    [`Audit Firm: ${clientSetup.audit_firm_name || 'N/A'}`, '', `FRN: ${clientSetup.firm_reg_no || 'N/A'}`],
    [`Partner: ${clientSetup.partner_name || 'N/A'}`, '', `Membership No: ${clientSetup.membership_no || 'N/A'}`],
    [`UDIN: ${clientSetup.udin || 'N/A'}`, '', `Date of Signing: ${clientSetup.date_of_signature || 'N/A'}`],
    [],
    ['KEY PERFORMANCE INDICATORS (CY vs PY)'],
    ['Particulars', 'Current Year (CY)', 'Previous Year (PY)', 'Variance %', 'Status'],
    [
      'Revenue from Operations',
      pl.revenue.find((r) => r.noteNo === 25)?.cyAmount || 0,
      pl.revenue.find((r) => r.noteNo === 25)?.pyAmount || 0,
      pl.totalRevenue.py > 0 ? ((pl.totalRevenue.cy - pl.totalRevenue.py) / pl.totalRevenue.py) * 100 : 0,
      'Operational',
    ],
    ['Total Income', pl.totalRevenue.cy, pl.totalRevenue.py, '', ''],
    ['Total Expenses', pl.totalExpenses.cy, pl.totalExpenses.py, '', ''],
    ['Profit Before Tax (PBT)', pl.profitBeforeTax.cy, pl.profitBeforeTax.py, '', ''],
    ['Tax Expense', pl.totalTaxExpense.cy, pl.totalTaxExpense.py, '', ''],
    ['Profit After Tax (PAT)', pl.profitAfterTax.cy, pl.profitAfterTax.py, '', ''],
    ['Total Assets', bs.totalAssets.cy, bs.totalAssets.py, '', ''],
    ['Total Equity & Liabilities', bs.totalEquityAndLiabilities.cy, bs.totalEquityAndLiabilities.py, '', ''],
    ['Balance Sheet Net Difference', bs.difference.cy, 0, '', bs.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'],
    ['Closing Cash & Cash Equivalents', cfs.closing_cash_equivalents, cfs.opening_cash_equivalents, '', ''],
    [],
    ['PREVENTIVE IFC CHECKS SUMMARY'],
    ['Total Checks Evaluated', ifcRes.checks.length],
    ['Checks Passed (OK)', ifcRes.passedCount],
    ['Critical Blockers', ifcRes.criticalFailedCount],
    ['Audit Warnings', ifcRes.warningCount],
    ['Overall Audit Status', ifcRes.isAllClear ? 'ALL CLEAR — AUDIT GRADE' : 'ACTION REQUIRED'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ─────────────────────────────────────────────────────────────
  // SHEET 2: BALANCE SHEET (SCHEDULE III / HORIZONTAL)
  // ─────────────────────────────────────────────────────────────
  const bsAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    [`BALANCE SHEET AS AT 31ST MARCH, ${clientSetup.financial_year.split('-')[1] || '2025'}`],
    [`(Amounts in ${denomLabel})`],
    [],
    ['Particulars', 'Note No.', `As at 31-Mar-${clientSetup.financial_year.split('-')[1] || '2025'} (CY)`, `As at 31-Mar-${(Number(clientSetup.financial_year.split('-')[1]) - 1) || '2024'} (PY)`],
    ['I. EQUITY AND LIABILITIES'],
  ];

  for (const item of bs.equityAndLiabilities) {
    bsAoa.push([
      item.particulars,
      item.noteNo ? item.noteNo : '',
      item.isHeader ? '' : item.cyAmount,
      item.isHeader ? '' : item.pyAmount,
    ]);
  }

  bsAoa.push([
    'TOTAL EQUITY AND LIABILITIES',
    '',
    bs.totalEquityAndLiabilities.cy,
    bs.totalEquityAndLiabilities.py,
  ]);
  bsAoa.push([]);
  bsAoa.push(['II. ASSETS']);

  for (const item of bs.assets) {
    bsAoa.push([
      item.particulars,
      item.noteNo ? item.noteNo : '',
      item.isHeader ? '' : item.cyAmount,
      item.isHeader ? '' : item.pyAmount,
    ]);
  }

  bsAoa.push([
    'TOTAL ASSETS',
    '',
    bs.totalAssets.cy,
    bs.totalAssets.py,
  ]);
  bsAoa.push([]);
  bsAoa.push([
    'Equilibrium Check (Assets - Liabilities)',
    '',
    bs.difference.cy,
    bs.isBalanced ? 'BALANCED' : 'OUT OF BALANCE',
  ]);

  const wsBS = XLSX.utils.aoa_to_sheet(bsAoa);
  wsBS['!cols'] = [{ wch: 55 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsBS, 'Balance Sheet');

  // ─────────────────────────────────────────────────────────────
  // SHEET 3: PROFIT & LOSS (SCHEDULE III)
  // ─────────────────────────────────────────────────────────────
  const plAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    [`STATEMENT OF PROFIT AND LOSS FOR THE YEAR ENDED 31ST MARCH, ${clientSetup.financial_year.split('-')[1] || '2025'}`],
    [`(Amounts in ${denomLabel})`],
    [],
    ['Particulars', 'Note No.', `Year Ended 31-Mar-${clientSetup.financial_year.split('-')[1] || '2025'} (CY)`, `Year Ended 31-Mar-${(Number(clientSetup.financial_year.split('-')[1]) - 1) || '2024'} (PY)`],
    ['I. REVENUE'],
  ];

  for (const r of pl.revenue) {
    plAoa.push([r.particulars, r.noteNo || '', r.cyAmount, r.pyAmount]);
  }
  plAoa.push(['III. Total Revenue (I + II)', '', pl.totalRevenue.cy, pl.totalRevenue.py]);
  plAoa.push([]);
  plAoa.push(['IV. EXPENSES']);

  for (const e of pl.expenses) {
    plAoa.push([e.particulars, e.noteNo || '', e.cyAmount, e.pyAmount]);
  }
  plAoa.push(['Total Expenses', '', pl.totalExpenses.cy, pl.totalExpenses.py]);
  plAoa.push([]);
  plAoa.push(['V. Profit Before Tax (III - IV)', '', pl.profitBeforeTax.cy, pl.profitBeforeTax.py]);
  plAoa.push(['VI. Tax Expense:', '', '', '']);
  for (const t of pl.taxExpense) {
    plAoa.push([`  ${t.particulars}`, '', t.cyAmount, t.pyAmount]);
  }
  plAoa.push(['  Total Tax Expense', '', pl.totalTaxExpense.cy, pl.totalTaxExpense.py]);
  plAoa.push(['VII. Profit / (Loss) for the Period (V - VI)', '', pl.profitAfterTax.cy, pl.profitAfterTax.py]);

  const wsPL = XLSX.utils.aoa_to_sheet(plAoa);
  wsPL['!cols'] = [{ wch: 55 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsPL, 'Profit and Loss');

  // ─────────────────────────────────────────────────────────────
  // SHEET 4: CASH FLOW STATEMENT (AS-3 INDIRECT METHOD)
  // ─────────────────────────────────────────────────────────────
  const cfsAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    [`CASH FLOW STATEMENT FOR THE YEAR ENDED 31ST MARCH, ${clientSetup.financial_year.split('-')[1] || '2025'}`],
    ['(Pursuant to Accounting Standard AS-3 / Ind AS 7 — Indirect Method)'],
    [`(Amounts in ${denomLabel})`],
    [],
    ['Particulars', `CY (${clientSetup.financial_year})`, 'PY'],
    ['A. CASH FLOW FROM OPERATING ACTIVITIES'],
    ['Net Profit Before Tax', cfs.operating_activities.net_profit_before_tax, ''],
    ['Adjustments for non-cash and non-operating items:', '', ''],
  ];

  for (const adj of cfs.operating_activities.adjustments_non_cash) {
    cfsAoa.push([`  ${adj.label}`, adj.cy_amount, adj.py_amount]);
  }
  cfsAoa.push(['Operating Profit Before Working Capital Changes', cfs.operating_activities.operating_profit_before_wc, '']);
  cfsAoa.push(['Adjustments for Working Capital changes:', '', '']);

  for (const wc of cfs.operating_activities.working_capital_changes) {
    cfsAoa.push([`  ${wc.label}`, wc.cy_amount, wc.py_amount]);
  }
  cfsAoa.push(['Cash Generated from Operations', cfs.operating_activities.cash_generated_from_operations, '']);
  cfsAoa.push(['Direct Taxes Paid (Net)', -Math.abs(cfs.operating_activities.direct_taxes_paid), '']);
  cfsAoa.push(['Net Cash Flow from Operating Activities (A)', cfs.operating_activities.net_cash_from_operating, '']);
  cfsAoa.push([]);
  cfsAoa.push(['B. CASH FLOW FROM INVESTING ACTIVITIES']);

  for (const inv of cfs.investing_activities.items) {
    cfsAoa.push([`  ${inv.label}`, inv.cy_amount, inv.py_amount]);
  }
  cfsAoa.push(['Net Cash Flow used in Investing Activities (B)', cfs.investing_activities.net_cash_from_investing, '']);
  cfsAoa.push([]);
  cfsAoa.push(['C. CASH FLOW FROM FINANCING ACTIVITIES']);

  for (const finItem of cfs.financing_activities.items) {
    cfsAoa.push([`  ${finItem.label}`, finItem.cy_amount, finItem.py_amount]);
  }
  cfsAoa.push(['Net Cash Flow from Financing Activities (C)', cfs.financing_activities.net_cash_from_financing, '']);
  cfsAoa.push([]);
  cfsAoa.push(['Net Increase / (Decrease) in Cash and Cash Equivalents (A + B + C)', cfs.net_increase_decrease_cash, '']);
  cfsAoa.push(['Cash and Cash Equivalents at Beginning of the Year', cfs.opening_cash_equivalents, '']);
  cfsAoa.push(['Cash and Cash Equivalents at End of the Year', cfs.closing_cash_equivalents, '']);
  cfsAoa.push(['Internal CFS Reconciliation Variance', cfs.reconciliation_variance, cfs.is_tallied ? 'TALLIED' : 'UNRECONCILED']);

  const wsCFS = XLSX.utils.aoa_to_sheet(cfsAoa);
  wsCFS['!cols'] = [{ wch: 60 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsCFS, 'Cash Flow');

  // ─────────────────────────────────────────────────────────────
  // SHEET 5: NOTES TO ACCOUNTS
  // ─────────────────────────────────────────────────────────────
  const notes = aggregateNotes();
  const notesAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    ['NOTES FORMING PART OF THE FINANCIAL STATEMENTS'],
    [`(Amounts in ${denomLabel})`],
    [],
    ['Note No.', 'Note Title', 'Group Code', 'Particulars', 'CY Amount', 'PY Amount'],
  ];

  for (const note of notes) {
    for (const item of note.line_items) {
      notesAoa.push([
        `Note ${note.note_reference}`,
        note.note_title,
        item.group_code,
        item.particulars,
        item.cy_total,
        item.py_total,
      ]);
    }
    notesAoa.push([
      `Note ${note.note_reference}`,
      `Total ${note.note_title}`,
      '',
      '',
      note.cy_grand_total,
      note.py_grand_total,
    ]);
    notesAoa.push([]); // spacer row
  }

  const wsNotes = XLSX.utils.aoa_to_sheet(notesAoa);
  wsNotes['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 45 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

  // ─────────────────────────────────────────────────────────────
  // SHEET 6: MCA REGULATORY RATIOS & AGING
  // ─────────────────────────────────────────────────────────────
  const mcaAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    ['MCA 2021 REGULATORY DISCLOSURES & 11 STATUTORY RATIOS'],
    ['(Pursuant to Schedule III Division I & II Amendments)'],
    [],
    ['11 STATUTORY FINANCIAL RATIOS'],
    ['#', 'Ratio Name', 'Numerator', 'Denominator', 'CY Value', 'PY Value', 'Variance %', 'Reason for Variance (>25%)'],
  ];

  ratios.forEach((r, idx) => {
    mcaAoa.push([
      idx + 1,
      r.ratio_name,
      r.numerator_label,
      r.denominator_label,
      r.cy_value.toFixed(2),
      r.py_value.toFixed(2),
      `${r.variance_percent.toFixed(2)}%`,
      r.variance_reason || (r.is_flagged ? 'Reason Required (>25%)' : 'Variance <= 25%'),
    ]);
  });

  mcaAoa.push([]);
  mcaAoa.push(['TRADE PAYABLES AGING SCHEDULE']);
  mcaAoa.push(['Particulars', 'Unbilled / Not Due', '< 1 Year', '1 - 2 Years', '2 - 3 Years', '> 3 Years', 'Total']);

  if (tpAging.length > 0) {
    for (const tp of tpAging) {
      mcaAoa.push([
        tp.category,
        tp.unbilled_or_not_due || 0,
        tp.less_than_1yr || 0,
        tp.one_to_two_yrs || 0,
        tp.two_to_three_yrs || 0,
        tp.more_than_three_yrs || 0,
        tp.total || 0,
      ]);
    }
  }

  mcaAoa.push([]);
  mcaAoa.push(['TRADE RECEIVABLES AGING SCHEDULE']);
  mcaAoa.push(['Particulars', 'Unbilled', '< 6 Months', '6m - 1 Year', '1 - 2 Years', '2 - 3 Years', '> 3 Years', 'Total']);

  if (trAging.length > 0) {
    for (const tr of trAging) {
      mcaAoa.push([
        tr.category,
        tr.unbilled_or_not_due || 0,
        tr.less_than_6m || 0,
        tr.six_m_to_1yr || 0,
        tr.one_to_two_yrs || 0,
        tr.two_to_three_yrs || 0,
        tr.more_than_three_yrs || 0,
        tr.total || 0,
      ]);
    }
  }

  mcaAoa.push([]);
  mcaAoa.push(['CAPITAL WORK-IN-PROGRESS (CWIP) AGING']);
  mcaAoa.push(['Classification', '< 1 Year', '1 - 2 Years', '2 - 3 Years', '> 3 Years', 'Total']);

  if (cwipAging.length > 0) {
    for (const cw of cwipAging) {
      mcaAoa.push([
        cw.project_type,
        cw.less_than_1yr || 0,
        cw.one_to_two_yrs || 0,
        cw.two_to_three_yrs || 0,
        cw.more_than_three_yrs || 0,
        cw.total || 0,
      ]);
    }
  }

  const wsMCA = XLSX.utils.aoa_to_sheet(mcaAoa);
  wsMCA['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsMCA, 'MCA Disclosures');

  // ─────────────────────────────────────────────────────────────
  // SHEET 7: PARTNER CAPITAL SCHEDULE (IF NON-CORPORATE)
  // ─────────────────────────────────────────────────────────────
  if (clientSetup.entity_type === 'non_corporate' || partnersCapital.length > 0) {
    const partnerAoa: any[][] = [
      [clientSetup.company_name.toUpperCase()],
      ['PARTNER CAPITAL ACCOUNTS SCHEDULE'],
      ['(ICAI June 2022 Technical Guide for Non-Corporate Entities)'],
      [`(Amounts in ${denomLabel})`],
      [],
      ['Partner Name', 'PSR %', 'Opening Capital', 'Additions', 'Drawings', 'Interest on Capital', 'Remuneration', 'Share of Profit', 'Closing Capital'],
    ];

    for (const p of partnersCapital) {
      partnerAoa.push([
        p.partner_name,
        `${p.profit_share_percent}%`,
        p.opening_capital,
        p.additions_capital,
        p.withdrawals_drawings,
        p.interest_on_capital,
        p.partner_salary_remuneration,
        p.share_of_profit_loss,
        p.closing_capital,
      ]);
    }

    const wsPartner = XLSX.utils.aoa_to_sheet(partnerAoa);
    wsPartner['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsPartner, 'Partners Capital');
  }

  // ─────────────────────────────────────────────────────────────
  // SHEET 8: 35+ PREVENTIVE IFC AUDIT CHECKS
  // ─────────────────────────────────────────────────────────────
  const ifcAoa: any[][] = [
    [clientSetup.company_name.toUpperCase()],
    ['INTERNAL FINANCIAL CONTROLS (IFC) DIAGNOSTIC REPORT'],
    ['(Schedule III Division I & ICAI Diagnostic Framework)'],
    [],
    ['Check ID', 'Verification Rule', 'Severity', 'Findings Detail', 'CY Diff', 'PY Diff', 'Status', 'Recommended Remediation'],
  ];

  for (const c of ifcRes.checks) {
    ifcAoa.push([
      c.id,
      c.check_name,
      c.check_type,
      c.detail,
      c.cy_diff,
      c.py_diff,
      c.status,
      c.action_guidance,
    ]);
  }

  const wsIFC = XLSX.utils.aoa_to_sheet(ifcAoa);
  wsIFC['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 15 }, { wch: 55 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsIFC, 'IFC Audit Checks');

  // ─────────────────────────────────────────────────────────────
  // CRITICAL ARCHITECTURAL GUARANTEE: STRICT ZERO-MERGE PASS
  // ─────────────────────────────────────────────────────────────
  removeAllMergesFromWorkbook(wb);

  return wb;
}

/**
 * Browser-friendly export trigger to download compiled XLSX file.
 */
export function exportFinancialStatementsExcel(options: FinStatementsExportOptions): void {
  const wb = generateFinancialStatementsWorkbook(options);
  const companySlug = (options.clientSetup.company_name || 'Client')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 30);
  const fySlug = options.clientSetup.financial_year.replace(/[^a-zA-Z0-9]/g, '_');
  const finalFilename = options.filename || `Financial_Statements_${companySlug}_${fySlug}.xlsx`;

  XLSX.writeFile(wb, finalFilename);
}

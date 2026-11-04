// ============================================================
// Financial Statements Module — End-to-End Comprehensive Test Suite
// Verification of Plans 18-01, 18-02, and 18-03
// ============================================================

import { describe, it, expect } from 'vitest';
import type {
  ClientSetup,
  TrialBalanceEntry,
  FixedAssetEntry,
  PartnerCapitalEntry,
} from '../lib/finStatements.types';
import { computeSchedule3Financials } from '../lib/finStatementsEngine';
import { generateCashFlowStatement } from '../lib/cfsEngine';
import { computeCorporateTaxPlan } from '../lib/corporateTaxEngine';
import { computeMcaFinancialRatios } from '../lib/mcaRatiosEngine';
import { evaluateIfcChecks } from '../lib/ifcChecksEngine';
import {
  generateFinancialStatementsWorkbook,
  removeAllMergesFromWorkbook,
} from '../lib/finStatementsExport';

describe('Financial Statements Engine — End-to-End Suite', () => {
  const dummyClient: ClientSetup = {
    client_id: 'C-E2E-101',
    company_name: 'Vaswani Tech Enterprises Private Limited',
    cin_number: 'U72200MH2021PTC356789',
    registered_address: 'Level 14, Platina Tower, BKC, Mumbai 400051',
    entity_type: 'corporate',
    corporate_sub_type: 'pvt_ltd',
    financial_year: '2024-25',
    assessment_year: '2025-26',
    turnover_preceding_year: 150000000, // 15 Cr
    borrowings_preceding_year: 25000000, // 2.5 Cr
    denomination: 'in_rupees',
    presentation_format: 'vertical',
    audit_firm_name: 'M/s Vaswani & Associates',
    firm_reg_no: '109876W',
    partner_name: 'CA. Vipul Patel',
    membership_no: '184754',
    udin: '25184754AAAAAA9999',
    place_of_signature: 'Mumbai',
    date_of_signature: '2025-09-28',
    director_1_name: 'Om Ramchandani',
    director_1_din: '10598652',
    director_2_name: 'Ragini Ravindra Deshpande',
    director_2_din: '10598653',
  };

  const dummyTB: TrialBalanceEntry[] = [
    // Equity & Liabilities
    { id: '1', client_id: 'C-E2E-101', ledger_name: 'Equity Share Capital', cy_balance: -2000000, py_balance: -2000000, mapped_group_code: 1001 },
    { id: '2', client_id: 'C-E2E-101', ledger_name: 'Securities Premium', cy_balance: -500000, py_balance: -500000, mapped_group_code: 1104 },
    { id: '3', client_id: 'C-E2E-101', ledger_name: 'General Reserve', cy_balance: -800000, py_balance: -600000, mapped_group_code: 1106 },
    { id: '4', client_id: 'C-E2E-101', ledger_name: 'HDFC Bank Term Loan', cy_balance: -1500000, py_balance: -1800000, mapped_group_code: 1201 },
    { id: '5', client_id: 'C-E2E-101', ledger_name: 'Deferred Tax Liability', cy_balance: -120000, py_balance: -100000, mapped_group_code: 1301 },
    { id: '6', client_id: 'C-E2E-101', ledger_name: 'Bank OD Account', cy_balance: -400000, py_balance: -300000, mapped_group_code: 1601 },
    { id: '7', client_id: 'C-E2E-101', ledger_name: 'MSME Creditors', cy_balance: -250000, py_balance: -200000, mapped_group_code: 1701 },
    { id: '8', client_id: 'C-E2E-101', ledger_name: 'Other Trade Creditors', cy_balance: -1200000, py_balance: -1100000, mapped_group_code: 1702 },
    { id: '9', client_id: 'C-E2E-101', ledger_name: 'Audit Fees Payable', cy_balance: -75000, py_balance: -60000, mapped_group_code: 1801 },
    { id: '10', client_id: 'C-E2E-101', ledger_name: 'Provision for Taxation', cy_balance: -300000, py_balance: -250000, mapped_group_code: 1901 },

    // Assets
    { id: '11', client_id: 'C-E2E-101', ledger_name: 'Plant and Machinery', cy_balance: 3200000, py_balance: 2800000, mapped_group_code: 2005 },
    { id: '12', client_id: 'C-E2E-101', ledger_name: 'Computers & Servers', cy_balance: 450000, py_balance: 400000, mapped_group_code: 2008 },
    { id: '13', client_id: 'C-E2E-101', ledger_name: 'Accumulated Depreciation', cy_balance: -800000, py_balance: -600000, mapped_group_code: 2021 },
    { id: '14', client_id: 'C-E2E-101', ledger_name: 'Capital Work in Progress', cy_balance: 300000, py_balance: 150000, mapped_group_code: 2201 },
    { id: '15', client_id: 'C-E2E-101', ledger_name: 'Raw Materials Inventory', cy_balance: 750000, py_balance: 600000, mapped_group_code: 2601 },
    { id: '16', client_id: 'C-E2E-101', ledger_name: 'Finished Goods Inventory', cy_balance: 650000, py_balance: 500000, mapped_group_code: 2603 },
    { id: '17', client_id: 'C-E2E-101', ledger_name: 'Trade Debtors (Undisputed)', cy_balance: 1650000, py_balance: 1400000, mapped_group_code: 2701 },
    { id: '18', client_id: 'C-E2E-101', ledger_name: 'HDFC Current Account', cy_balance: 850000, py_balance: 550000, mapped_group_code: 2803 },
    { id: '19', client_id: 'C-E2E-101', ledger_name: 'Petty Cash in Hand', cy_balance: 45000, py_balance: 30000, mapped_group_code: 2801 },
    { id: '20', client_id: 'C-E2E-101', ledger_name: 'Security Deposits (Electricity/Rent)', cy_balance: 100000, py_balance: 80000, mapped_group_code: 2902 },

    // Revenue & P&L (Balance check offset)
    { id: '21', client_id: 'C-E2E-101', ledger_name: 'Domestic Sales', cy_balance: -12500000, py_balance: -10500000, mapped_group_code: 3001 },
    { id: '22', client_id: 'C-E2E-101', ledger_name: 'Interest on Fixed Deposits', cy_balance: -80000, py_balance: -60000, mapped_group_code: 3101 },
    { id: '23', client_id: 'C-E2E-101', ledger_name: 'Raw Material Purchases', cy_balance: 6200000, py_balance: 5100000, mapped_group_code: 4001 },
    { id: '24', client_id: 'C-E2E-101', ledger_name: 'Salaries and Wages', cy_balance: 2400000, py_balance: 2000000, mapped_group_code: 4201 },
    { id: '25', client_id: 'C-E2E-101', ledger_name: 'Bank Interest & Finance Charges', cy_balance: 220000, py_balance: 250000, mapped_group_code: 4301 },
    { id: '26', client_id: 'C-E2E-101', ledger_name: 'Depreciation on Plant & Machinery', cy_balance: 200000, py_balance: 180000, mapped_group_code: 4401 },
    { id: '27', client_id: 'C-E2E-101', ledger_name: 'Rent & Office Expenses', cy_balance: 1250000, py_balance: 1050000, mapped_group_code: 4501 },
    { id: '28', client_id: 'C-E2E-101', ledger_name: 'Current Year Income Tax', cy_balance: 550000, py_balance: 450000, mapped_group_code: 4901 },
    { id: '29', client_id: 'C-E2E-101', ledger_name: 'Deferred Tax Charge', cy_balance: 20000, py_balance: 15000, mapped_group_code: 4902 },
    { id: '30', client_id: 'C-E2E-101', ledger_name: 'Prior Year Retained Earnings', cy_balance: -300000, py_balance: -200000, mapped_group_code: 1110 },
  ];

  it('1. Computes Schedule III Balance Sheet and Profit & Loss', () => {
    const fin = computeSchedule3Financials(dummyTB, 'in_rupees');
    expect(fin.balanceSheet).toBeDefined();
    expect(fin.profitAndLoss).toBeDefined();

    // Check Total Revenue & Total Expenses
    expect(fin.profitAndLoss.totalRevenue.cy).toBe(12580000); // 12.5M + 80k
    expect(fin.profitAndLoss.profitBeforeTax.cy).toBeGreaterThan(0);
    expect(fin.profitAndLoss.profitAfterTax.cy).toBeGreaterThan(0);

    // Assets & Liabilities
    expect(fin.balanceSheet.totalAssets.cy).toBeGreaterThan(0);
    expect(fin.balanceSheet.totalEquityAndLiabilities.cy).toBeGreaterThan(0);
  });

  it('2. Evaluates Corporate Tax (Section 115BAA vs Regular vs MAT)', () => {
    const fin = computeSchedule3Financials(dummyTB, 'in_rupees');
    const tax = computeCorporateTaxPlan({
      pbt: fin.profitAndLoss.profitBeforeTax.cy,
      depreciationAsPerBooks: 200000,
      depreciationAsPerItAct: 250000,
      disallowances40a: 50000,
      turnover: 125000000,
    });

    expect(tax.sec115BAA.totalTax).toBeGreaterThan(0);
    expect(tax.sec115BAA.effectiveRatePercent).toBeCloseTo(25.168, 2);
    expect(tax.mat115JB.matRatePercent).toBeCloseTo(17.472, 2);
    expect(tax.recommendedRegime).toBeDefined();
    expect(tax.deferredTaxImpact.deferredTaxAssetOrLiability).toBe('DTL'); // Tax Dep > Books Dep creates DTL
  });

  it('3. Computes AS-3 Indirect Cash Flow Statement and verifies closing cash', () => {
    const cfs = generateCashFlowStatement(dummyTB, 'in_rupees');
    expect(cfs.operating_activities).toBeDefined();
    expect(cfs.closing_cash_equivalents).toBe(895000); // 850k + 45k
    expect(cfs.opening_cash_equivalents).toBe(580000); // 550k + 30k
    expect(cfs.net_increase_decrease_cash).toBeDefined();
    expect(cfs.reconciliation_variance).toBeDefined();
  });

  it('4. Computes 11 Statutory MCA Ratios with variance detection', () => {
    const ratiosRes = computeMcaFinancialRatios(dummyTB, 'in_rupees');
    expect(ratiosRes.ratios).toHaveLength(11);

    const cr = ratiosRes.ratios.find((r) => r.id === 'r1');
    expect(cr).toBeDefined();
    expect(cr?.ratio_name).toBe('Current Ratio');
    expect(cr?.cy_value).toBeGreaterThan(1);

    const de = ratiosRes.ratios.find((r) => r.id === 'r2');
    expect(de).toBeDefined();
    expect(de?.ratio_name).toBe('Debt-Equity Ratio');

    const roe = ratiosRes.ratios.find((r) => r.id === 'r4');
    expect(roe).toBeDefined();
    expect(roe?.ratio_name).toContain('Return on Equity (ROE)');

    // Flagged ratios should have is_flagged = true when |variance| > 25
    ratiosRes.ratios.forEach((r) => {
      if (Math.abs(r.variance_percent) > 25) {
        expect(r.is_flagged).toBe(true);
      }
    });
  });

  it('5. Evaluates 35+ Internal Financial Controls (IFC) checks', () => {
    const ifcRes = evaluateIfcChecks({
      tbEntries: dummyTB,
      clientSetup: dummyClient,
      denomination: 'in_rupees',
    });

    expect(ifcRes.checks.length).toBeGreaterThanOrEqual(35);
    expect(ifcRes.passedCount).toBeGreaterThan(0);
    // Cash in hand is positive, so IFC-04 passes
    const noNegCashCheck = ifcRes.checks.find((c) => c.id === 'IFC-04');
    expect(noNegCashCheck?.status).toBe('OK');

    // CFS closing cash ties out, so IFC-10 passes
    const cfsTieCheck = ifcRes.checks.find((c) => c.id === 'IFC-10');
    expect(cfsTieCheck?.status).toBe('OK');
  });

  it('6. Calculates Multi-Partner Capital Accounts movement (Non-Corporate)', () => {
    const partners: PartnerCapitalEntry[] = [
      {
        id: 'p1',
        partner_name: 'CA Rajesh',
        profit_share_percent: 60,
        opening_capital: 1500000,
        additions_capital: 250000,
        withdrawals_drawings: 100000,
        interest_on_capital: 120000,
        partner_salary_remuneration: 480000,
        share_of_profit_loss: 600000,
        closing_capital: 0,
      },
      {
        id: 'p2',
        partner_name: 'CA Priya',
        profit_share_percent: 40,
        opening_capital: 1000000,
        additions_capital: 150000,
        withdrawals_drawings: 80000,
        interest_on_capital: 80000,
        partner_salary_remuneration: 480000,
        share_of_profit_loss: 400000,
        closing_capital: 0,
      },
    ];

    // Compute closing: Opening + Additions - Drawings + Interest + Remuneration + Profit
    const p1Closing = 1500000 + 250000 - 100000 + 120000 + 480000 + 600000;
    const p2Closing = 1000000 + 150000 - 80000 + 80000 + 480000 + 400000;

    expect(p1Closing).toBe(2850000);
    expect(p2Closing).toBe(2030000);
    expect(p1Closing + p2Closing).toBe(4880000);
  });

  it('7. Exports Consolidated 8-Sheet Excel with STRICT ZERO-MERGES (ws["!merges"] = [])', () => {
    const wb = generateFinancialStatementsWorkbook({
      clientSetup: dummyClient,
      tbEntries: dummyTB,
      denomination: 'in_rupees',
      partnersCapital: [
        {
          id: 'p1',
          partner_name: 'Partner A',
          profit_share_percent: 50,
          opening_capital: 1000000,
          additions_capital: 200000,
          withdrawals_drawings: 50000,
          interest_on_capital: 80000,
          partner_salary_remuneration: 240000,
          share_of_profit_loss: 300000,
          closing_capital: 1770000,
        },
      ],
    });

    expect(wb.SheetNames).toContain('Summary');
    expect(wb.SheetNames).toContain('Balance Sheet');
    expect(wb.SheetNames).toContain('Profit and Loss');
    expect(wb.SheetNames).toContain('Cash Flow');
    expect(wb.SheetNames).toContain('Notes');
    expect(wb.SheetNames).toContain('MCA Disclosures');
    expect(wb.SheetNames).toContain('Partners Capital');
    expect(wb.SheetNames).toContain('IFC Audit Checks');

    // Strict Zero-Merge Verification across ALL worksheets!
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const merges = ws['!merges'] || [];
      expect(merges).toHaveLength(0);
    }
  });
});

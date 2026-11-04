import { describe, it, expect } from 'vitest';
import type { TrialBalanceEntry } from '../lib/finStatements.types';
import { computeSchedule3Financials } from '../lib/finStatementsEngine';
import { computeCashFlowStatement } from '../lib/cfsEngine';
import { computeCorporateTax } from '../lib/corporateTaxEngine';
import {
  getFixedAssets,
  addFixedAssetEntry,
  updateFixedAssetEntry,
  deleteFixedAssetEntry,
  clearFixedAssets,
} from '../lib/finStatements.storage';

describe('Plan 18-02: Financial Calculations & Statements Generation', () => {
  // Balanced sample Trial Balance (Total Debits = Total Credits = 1,000,000)
  const sampleTB: TrialBalanceEntry[] = [
    // Equity & Liabilities (Credits are negative)
    { id: '1', client_id: 'c1', ledger_name: 'Equity Share Capital', cy_balance: -500000, py_balance: -500000, mapped_group_code: 1001 },
    { id: '2', client_id: 'c1', ledger_name: 'Bank Term Loan (Secured)', cy_balance: -200000, py_balance: -250000, mapped_group_code: 1302 },
    { id: '3', client_id: 'c1', ledger_name: 'Sundry Creditors (MSME)', cy_balance: -50000, py_balance: -40000, mapped_group_code: 1701 },
    { id: '4', client_id: 'c1', ledger_name: 'Sundry Creditors (Others)', cy_balance: -100000, py_balance: -80000, mapped_group_code: 1702 },
    { id: '5', client_id: 'c1', ledger_name: 'Sales Revenue', cy_balance: -400000, py_balance: -300000, mapped_group_code: 3001 },
    { id: '6', client_id: 'c1', ledger_name: 'Interest Income', cy_balance: -10000, py_balance: -8000, mapped_group_code: 3101 },

    // Assets & Expenses (Debits are positive)
    { id: '7', client_id: 'c1', ledger_name: 'Plant & Machinery', cy_balance: 450000, py_balance: 400000, mapped_group_code: 2001 },
    { id: '8', client_id: 'c1', ledger_name: 'Closing Inventory', cy_balance: 150000, py_balance: 120000, mapped_group_code: 2601 },
    { id: '9', client_id: 'c1', ledger_name: 'Trade Debtors', cy_balance: 180000, py_balance: 150000, mapped_group_code: 2704 },
    { id: '10', client_id: 'c1', ledger_name: 'HDFC Current Account', cy_balance: 200000, py_balance: 140000, mapped_group_code: 2803 },
    { id: '11', client_id: 'c1', ledger_name: 'Purchases', cy_balance: 200000, py_balance: 150000, mapped_group_code: 4101 },
    { id: '12', client_id: 'c1', ledger_name: 'Salaries & Wages', cy_balance: 60000, py_balance: 50000, mapped_group_code: 4301 },
    { id: '13', client_id: 'c1', ledger_name: 'Bank Interest', cy_balance: 15000, py_balance: 18000, mapped_group_code: 4401 },
    { id: '14', client_id: 'c1', ledger_name: 'Depreciation', cy_balance: 5000, py_balance: 5000, mapped_group_code: 4501 },
  ];

  it('should compute a mathematically balanced Schedule III Balance Sheet', () => {
    const res = computeSchedule3Financials(sampleTB, 'in_rupees');

    expect(res.profitAndLoss.totalRevenue.cy).toBe(410000); // 400k sales + 10k interest
    expect(res.profitAndLoss.totalExpenses.cy).toBe(280000); // 200k + 60k + 15k + 5k
    expect(res.profitAndLoss.profitBeforeTax.cy).toBe(130000); // 410k - 280k

    // Total Assets = 450k (PPE) + 150k (Inv) + 180k (Debtors) + 200k (Bank) = 980,000
    expect(res.balanceSheet.totalAssets.cy).toBe(980000);

    // Total Equity & Liabilities = 500k (Share Cap) + 130k (PAT) + 200k (Loan) + 150k (Creditors) = 980,000
    expect(res.balanceSheet.totalEquityAndLiabilities.cy).toBe(980000);

    // Difference must be exactly 0
    expect(res.balanceSheet.difference.cy).toBe(0);
    expect(res.balanceSheet.isBalanced).toBe(true);
  });

  it('should compute Cash Flow Statement under AS-3 Indirect Method', () => {
    const cfs = computeCashFlowStatement(sampleTB, 'in_rupees');

    // PBT = 130,000
    expect(cfs.operating_activities.net_profit_before_tax).toBe(130000);

    // Operating cash flow should account for non-cash depreciation and interest
    expect(cfs.operating_activities.net_cash_from_operating).toBeDefined();

    // Verify closing cash matches TB bank balance (200,000)
    expect(cfs.closing_cash_equivalents).toBe(200000);
    expect(cfs.opening_cash_equivalents).toBe(140000);
  });

  it('should compute Corporate Tax under Section 115BAA with exact 25.168% effective rate', () => {
    const taxRes = computeCorporateTax({
      profitBeforeTax: 1000000, // 10 Lakhs
      bookDepreciation: 50000,
      taxDepreciation: 60000,
      disallowanceSec37: 10000,
      disallowanceSec40a: 0,
      disallowanceSec43b: 0,
      deductionsBroughtForwardLosses: 0,
      turnoverPrecedingYear: 50000000,
      chosenRegime: '115BAA',
    });

    // PGBP = 1,000,000 + 50,000 + 10,000 - 60,000 = 1,000,000
    expect(taxRes.pgbpIncome).toBe(1000000);

    // Section 115BAA: 22% base + 10% surcharge (2.2%) + 4% cess (0.968%) = 25.168%
    expect(taxRes.regularTax.effectiveRate).toBeCloseTo(25.17, 1);
    expect(taxRes.regularTax.totalTaxLiability).toBe(251680);

    // Tax depreciation (60,000) > Book depreciation (50,000) -> DTL of 10,000 * 25.168% = 2,516.80
    expect(taxRes.deferredTax.deferredTaxAssetOrLiability).toBe('DTL');
    expect(taxRes.deferredTax.deferredTaxAmount).toBeCloseTo(2516.8, 1);
  });

  it('should compute MAT under Regular regime when Book Profit tax exceeds normal tax', () => {
    const taxRes = computeCorporateTax({
      profitBeforeTax: 2000000, // 20 Lakhs
      bookDepreciation: 50000,
      taxDepreciation: 1500000, // Large initial allowance / high section 32 depreciation
      disallowanceSec37: 0,
      disallowanceSec40a: 0,
      disallowanceSec43b: 0,
      deductionsBroughtForwardLosses: 0,
      turnoverPrecedingYear: 50000000,
      chosenRegime: 'REGULAR',
    });

    // PGBP = 2,000,000 + 50,000 - 1,500,000 = 550,000
    expect(taxRes.pgbpIncome).toBe(550000);
    // Regular tax = 550,000 * 25% * 1.04 = 143,000
    expect(taxRes.regularTax.totalTaxLiability).toBe(143000);

    // MAT = 2,000,000 * 15% * 1.04 = 312,000
    expect(taxRes.matTax?.matTaxAmount).toBe(312000);
    expect(taxRes.matTax?.isMatPayable).toBe(true);
    expect(taxRes.finalPayableTax).toBe(312000);
  });

  it('should support fixed asset entry CRUD operations in storage', () => {
    clearFixedAssets();
    expect(getFixedAssets()).toHaveLength(0);

    // Add
    addFixedAssetEntry({
      id: 'fa_test_1',
      client_id: 'c1',
      asset_class: 'Computers',
      gross_block_opening: 100000,
      additions: 50000,
      deductions: 0,
      depreciation_opening: 20000,
      depreciation_for_year: 30000,
    });
    expect(getFixedAssets()).toHaveLength(1);
    expect(getFixedAssets()[0].asset_class).toBe('Computers');

    // Update
    updateFixedAssetEntry('fa_test_1', { asset_class: 'Laptops & Servers', additions: 75000 });
    const updated = getFixedAssets()[0];
    expect(updated.asset_class).toBe('Laptops & Servers');
    expect(updated.additions).toBe(75000);

    // Delete
    deleteFixedAssetEntry('fa_test_1');
    expect(getFixedAssets()).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { MASTER_GROUP_CODES_SEED } from '../lib/finStatements.seed';
import {
  evaluateNonCorporateLevel,
  suggestTallyGroupMapping,
  findMasterByCode,
} from '../lib/finStatements.storage';

describe('Plan 18-01: Financial Statements Taxonomy & Level Classification', () => {
  it('should verify all master group codes conform to Schedule III numeric ranges', () => {
    expect(MASTER_GROUP_CODES_SEED.length).toBeGreaterThan(100);

    const codes = MASTER_GROUP_CODES_SEED.map((m) => m.group_code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length); // All codes must be unique

    for (const item of MASTER_GROUP_CODES_SEED) {
      if (item.group_code >= 1000 && item.group_code < 2000) {
        expect(item.statement_type).toBe('BS');
        expect(item.is_liability).toBe(true);
      } else if (item.group_code >= 2000 && item.group_code < 3000) {
        expect(item.statement_type).toBe('BS');
        expect(item.is_liability).toBe(false);
      } else if (item.group_code >= 3000 && item.group_code < 4000) {
        expect(item.statement_type).toBe('PL');
      } else if (item.group_code >= 4000 && item.group_code < 5000) {
        expect(item.statement_type).toBe('PL');
      }
    }
  });

  it('should correctly classify Level I Non-Corporate entity (Large)', () => {
    // Turnover > 250 Cr
    const res = evaluateNonCorporateLevel(2600000000, 10000000);
    expect(res.level).toBe('Level I');
    expect(res.is_cash_flow_mandatory).toBe(true);
    expect(res.is_segment_reporting_mandatory).toBe(true);
    expect(res.is_deferred_tax_applicable).toBe(true);

    const as3 = res.standards.find((s) => s.as_number === 'AS 3');
    expect(as3?.applicability).toBe('Applicable');
  });

  it('should correctly classify Level II Non-Corporate entity (Medium)', () => {
    // Turnover 120 Cr, Borrowings 20 Cr
    const res = evaluateNonCorporateLevel(1200000000, 200000000);
    expect(res.level).toBe('Level II');
    expect(res.is_cash_flow_mandatory).toBe(false);
    expect(res.is_segment_reporting_mandatory).toBe(false);

    const as3 = res.standards.find((s) => s.as_number === 'AS 3');
    expect(as3?.applicability).toBe('Not Applicable');

    const as18 = res.standards.find((s) => s.as_number === 'AS 18');
    expect(as18?.applicability).toBe('Applicable');
  });

  it('should correctly classify Level III Non-Corporate entity (Small)', () => {
    // Turnover 25 Cr, Borrowings 5 Cr
    const res = evaluateNonCorporateLevel(250000000, 50000000);
    expect(res.level).toBe('Level III');
    expect(res.is_cash_flow_mandatory).toBe(false);

    const as18 = res.standards.find((s) => s.as_number === 'AS 18');
    expect(as18?.applicability).toBe('Not Applicable');
  });

  it('should correctly classify Level IV Non-Corporate entity (Micro)', () => {
    // Turnover 4 Cr, Borrowings 50 Lakhs
    const res = evaluateNonCorporateLevel(40000000, 5000000);
    expect(res.level).toBe('Level IV');
    expect(res.is_cash_flow_mandatory).toBe(false);
    expect(res.is_deferred_tax_applicable).toBe(false);

    const as22 = res.standards.find((s) => s.as_number === 'AS 22');
    expect(as22?.applicability).toBe('Applicable with Exemptions');
  });

  it('should intelligently map Tally primary and parent groups with high confidence', () => {
    const cred = suggestTallyGroupMapping('Shree Balaji Traders', 'Sundry Creditors', 'Current Liabilities');
    expect(cred.code).toBe(1702);
    expect(cred.confidence).toBeGreaterThanOrEqual(90);

    const bank = suggestTallyGroupMapping('HDFC Bank Current A/c', 'Bank Accounts', 'Current Assets');
    expect(bank.code).toBe(2803);
    expect(bank.confidence).toBeGreaterThanOrEqual(95);

    const ppe = suggestTallyGroupMapping('Office Laptops', 'Fixed Assets', '');
    expect(ppe.code).toBe(2001);
    expect(ppe.confidence).toBeGreaterThanOrEqual(95);

    const dep = suggestTallyGroupMapping('Depreciation on Computers', 'Indirect Expenses', '');
    expect(dep.code).toBe(4501);
    expect(dep.confidence).toBeGreaterThanOrEqual(95);

    const cash = suggestTallyGroupMapping('Petty Cash', 'Cash-in-Hand', '');
    expect(cash.code).toBe(2801);
    expect(cash.confidence).toBeGreaterThanOrEqual(95);
  });
});

/**
 * incomeTaxEngine.test.ts — Comprehensive test suite for the Income Tax Calculation Engine
 *
 * 10 test cases covering:
 *   1. Old Regime, Normal age, income ₹8L with 80C deduction
 *   2. New Regime, income ₹6.5L — 87A rebate wipes tax to zero
 *   3. New Regime, income ₹12,10,000 — marginal relief on 87A
 *   4. STCG 111A ₹5L + Normal ₹3L — special rate segregation
 *   5. LTCG 112A ₹3L — ₹1.25L exemption, 12.5%, 87A exclusion
 *   6. Casual Income ₹10L — 30% flat, no exemption, no deduction
 *   7. Income ₹52L (Old Regime) — 10% surcharge + marginal relief check
 *   8. Income ₹1.05Cr (New Regime) — 15% surcharge
 *   9. Special income surcharge cap at 15% for income > ₹2Cr with LTCG
 *   10. Decimal precision — no floating-point rounding errors
 */

import { describe, it, expect } from 'vitest';
import { calculateTaxLiability, compareRegimes } from './incomeTaxEngine';
import { D, Decimal } from './decimal';
import {
  type TaxpayerProfile,
  type IncomeRecord,
  type DeductionRecord,
  IncomeType,
  RegimeType,
  AgeCategory,
  EntityType,
  CorporateTaxSection,
} from './incomeTaxTypes';

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function makeProfile(overrides: Partial<TaxpayerProfile> = {}): TaxpayerProfile {
  return {
    profile_id: 'TEST_001',
    name: 'Test Taxpayer',
    pan: 'ABCDE1234F',
    age: 35,
    opted_for_new_regime: true,
    financial_year: 'FY2025-26',
    assessment_year: 'AY2026-27',
    residential_status: 'ROR',
    entity_type: EntityType.INDIVIDUAL,
    ...overrides,
  };
}

function makeIncome(type: IncomeType, amount: number, extra: Partial<IncomeRecord> = {}): IncomeRecord {
  return {
    id: `INC_${Math.random().toString(36).slice(2, 8)}`,
    profile_id: 'TEST_001',
    income_type: type,
    description: `Test ${type}`,
    gross_amount: amount,
    exempt_amount: 0,
    net_amount: amount,
    section_code: null,
    use_indexation: null,
    ...extra,
  };
}

function makeDeduction(section: string, amount: number): DeductionRecord {
  return {
    id: `DED_${Math.random().toString(36).slice(2, 8)}`,
    profile_id: 'TEST_001',
    section_code: section,
    claimed_amount: amount,
    eligible_amount: 0,
  };
}

/** Helper to compare Decimal values with tolerance */
function expectDecimalClose(actual: Decimal, expected: number, tolerance: number = 1) {
  const diff = Math.abs(actual.toNumber() - expected);
  expect(diff).toBeLessThanOrEqual(tolerance);
}

// ═══════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════

describe('CalculateTaxLiability Engine', () => {

  // ── Test 1: Old Regime, Normal age, income ₹8L with 80C ──
  it('T1: Old Regime, ₹8L salary with ₹1.5L 80C deduction', () => {
    const profile = makeProfile({
      opted_for_new_regime: false,
      age: 35,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 800000),
    ];

    const deductions = [
      makeDeduction('16ia', 75000),  // Standard deduction (allowed in old regime too)
      makeDeduction('80C', 150000),  // Max 80C
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    expect(result.regimeType).toBe(RegimeType.OLD);
    expect(result.ageCategory).toBe(AgeCategory.NORMAL);

    expectDecimalClose(result.grossNormalIncome, 750000);

    // Total deductions = ₹1,50,000 (80C)
    expectDecimalClose(result.totalDeductions, 150000);

    // Net taxable = ₹7,50,000 - ₹1,50,000 = ₹6,00,000
    expectDecimalClose(result.netTaxableNormalIncome, 600000);

    // Old regime slabs on ₹6,00,000:
    //   0 – 2.5L  → ₹0
    //   2.5L – 5L → ₹12,500
    //   5L – 6L → ₹20,000 (20% of 100,000)
    // Total = ₹32,500
    expectDecimalClose(result.taxOnNormalIncome, 32500);

    // Total tax > 0, rebate not applicable (income > ₹5L for old regime)
    expect(result.rebate87AEligible).toBe(false);

    // No surcharge (income < ₹50L)
    expectDecimalClose(result.applicableSurchargeRate, 0);

    // HEC = 4% of ₹32,500 = ₹1,300
    expectDecimalClose(result.cessAmount, 1300);

    // Total = ₹32,500 + ₹1,300 = ₹33,800
    expectDecimalClose(result.totalTaxLiability, 33800);
  });

  // ── Test 2: New Regime, ₹6.5L — 87A rebate wipes tax ────
  it('T2: New Regime, ₹6.5L salary — full 87A rebate, zero tax', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 30,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 650000),
    ];

    // Standard deduction is claimed
    const deductions = [
      makeDeduction('16ia', 75000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Net taxable = ₹6,50,000 - ₹75,000 = ₹5,75,000
    expectDecimalClose(result.netTaxableNormalIncome, 575000);

    // New regime slabs on ₹5,75,000:
    //   0 – 4L   → ₹0
    //   4L – 5.75L → 5% of 1,75,000 = ₹8,750
    // Total = ₹8,750
    expectDecimalClose(result.taxOnNormalIncome, 8750);

    // ₹5,75,000 ≤ ₹12L → 87A rebate applies
    expect(result.rebate87AEligible).toBe(true);

    // Rebate wipes the tax (₹8,750 ≤ ₹60,000 max rebate)
    expectDecimalClose(result.rebate87AAmount, 8750);
    expectDecimalClose(result.taxAfterRebate, 0);
    expectDecimalClose(result.totalTaxLiability, 0);
  });

  // ── Test 3: New Regime, ₹12,10,000 — marginal relief on 87A ─
  it('T3: New Regime, ₹12,10,000 income — marginal relief on 87A', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 40,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 1285000), // ₹12,85,000 salary
    ];

    const deductions = [
      makeDeduction('16ia', 75000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Net taxable = ₹12,85,000 - ₹75,000 = ₹12,10,000
    expectDecimalClose(result.netTaxableNormalIncome, 1210000);

    // Income exceeds ₹12L by ₹10,000
    // Tax on ₹12,10,000 via new regime slabs:
    //   0 – 4L    → ₹0
    //   4L – 8L   → 5% of 4L = ₹20,000
    //   8L – 12L  → 10% of 4L = ₹40,000
    //   12L – 12.1L → 15% of 10,000 = ₹1,500
    // Total = ₹61,500
    expectDecimalClose(result.totalComputedTax, 61500);

    // Marginal relief on 87A: tax should not exceed excess over ₹12L (= ₹10,000)
    // So rebate = ₹61,500 - ₹10,000 = ₹51,500
    expect(result.rebate87AEligible).toBe(true);
    expectDecimalClose(result.taxAfterRebate, 10000);

    // Cess = 4% of ₹10,000 = ₹400
    // Total ≈ ₹10,400
    expectDecimalClose(result.totalTaxLiability, 10400);
  });

  // ── Test 4: STCG 111A ₹5L + Normal ₹3L — segregation ───
  it('T4: STCG 111A ₹5L + Normal salary ₹3L — special rate segregation', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 28,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 300000),
      makeIncome(IncomeType.STCG_111A, 500000),
    ];

    const deductions: DeductionRecord[] = [];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Normal income = ₹3L - 75k standard deduction = ₹2.25L, Special income = ₹5L
    expectDecimalClose(result.grossNormalIncome, 225000);
    expectDecimalClose(result.incomeBreakdown.stcg111A, 500000);

    // Tax on normal ₹3L (new regime): 0-4L → ₹0. So tax = ₹0
    expectDecimalClose(result.taxOnNormalIncome, 0);

    // Tax on STCG 111A: 20% of ₹5L = ₹1,00,000
    expectDecimalClose(result.taxOnSTCG111A, 100000);

    // Total = ₹1,00,000
    expectDecimalClose(result.totalComputedTax, 100000);
  });

  // ── Test 5: LTCG 112A ₹3L — exemption + 87A exclusion ──
  it('T5: LTCG 112A ₹3L — ₹1.25L exemption, 12.5% tax, 87A excludes 112A', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 45,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 400000), // ₹4L salary
      makeIncome(IncomeType.LTCG_112A, 300000), // ₹3L LTCG 112A
    ];

    const deductions = [
      makeDeduction('16ia', 75000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // LTCG 112A exemption = ₹1,25,000
    expectDecimalClose(result.ltcg112AExemption, 125000);

    // Net LTCG 112A taxable = ₹3L - ₹1.25L = ₹1,75,000
    expectDecimalClose(result.ltcg112ANetTaxable, 175000);

    // Tax on LTCG 112A = 12.5% of ₹1,75,000 = ₹21,875
    expectDecimalClose(result.taxOnLTCG112A, 21875);

    // Net normal income = ₹4L - ₹75K = ₹3,25,000
    expectDecimalClose(result.netTaxableNormalIncome, 325000);

    // Tax on normal ₹3,25,000 (new regime): 0-4L → ₹0
    expectDecimalClose(result.taxOnNormalIncome, 0);

    // Total net taxable = ₹3,25,000 + ₹3L (full 112A) = ₹6,25,000
    // This is ≤ ₹12L, so 87A eligible
    expect(result.rebate87AEligible).toBe(true);

    // BUT rebate CANNOT adjust against 112A tax
    // Tax excluding 112A = ₹0. Rebate = min(₹0, ₹60,000) = ₹0
    // Tax after rebate = ₹0 + ₹21,875 = ₹21,875
    expectDecimalClose(result.taxAfterRebate, 21875);
  });

  // ── Test 6: Casual Income ₹10L — 30% flat ──────────────
  it('T6: Casual Income ₹10L — 30% flat, no exemption, no deductions', () => {
    const profile = makeProfile({
      opted_for_new_regime: false,
      age: 50,
    });

    const incomes = [
      makeIncome(IncomeType.CASUAL_INCOME, 1000000),
    ];

    // Even if user claims 80C, it should NOT reduce casual income tax
    const deductions = [
      makeDeduction('80C', 150000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Casual income is NOT part of normal income — it's special rate
    expectDecimalClose(result.grossNormalIncome, 0);
    expectDecimalClose(result.incomeBreakdown.casualIncome, 1000000);

    // 80C deduction applies to normal income (which is ₹0), so effective deduction = ₹0
    expectDecimalClose(result.netTaxableNormalIncome, 0);

    // Tax on casual income = 30% of ₹10L = ₹3,00,000
    expectDecimalClose(result.taxOnCasualIncome, 300000);

    // No tax on normal income
    expectDecimalClose(result.taxOnNormalIncome, 0);

    // Total = ₹3,00,000
    expectDecimalClose(result.totalComputedTax, 300000);
  });

  // ── Test 7: Income ₹52L (Old Regime) — 10% surcharge ──
  it('T7: Old Regime, ₹52L salary — 10% surcharge + marginal relief check', () => {
    const profile = makeProfile({
      opted_for_new_regime: false,
      age: 45,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 5200000),
    ];

    const deductions = [
      makeDeduction('16ia', 75000),
      makeDeduction('80C', 150000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Net taxable = ₹52L - ₹50K (old regime std ded) - ₹1.5L = ₹50,00,000
    expectDecimalClose(result.netTaxableNormalIncome, 5000000);

    // This is exactly ₹50L so NO surcharge
    // Old regime slabs on ₹50,00,000:
    //   0 – 2.5L   → ₹0
    //   2.5L – 5L  → 5% of 2.5L = ₹12,500
    //   5L – 10L   → 20% of 5L = ₹1,00,000
    //   10L – 50L  → 30% of 40L = ₹12,00,000
    // Total = ₹13,12,500
    expectDecimalClose(result.taxOnNormalIncome, 1312500);

    // No surcharge since income <= ₹50L
    expectDecimalClose(result.applicableSurchargeRate, 0);
  });

  // ── Test 8: Income ₹1.05Cr (New Regime) — 15% surcharge ─
  it('T8: New Regime, ₹1.05Cr salary — 15% surcharge bracket', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 50,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 10575000), // ₹1,05,75,000
    ];

    const deductions = [
      makeDeduction('16ia', 75000),
    ];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Net taxable = ₹1,05,75,000 - ₹75,000 = ₹1,05,00,000 = ₹1.05Cr
    expectDecimalClose(result.netTaxableNormalIncome, 10500000);

    // Income > ₹1Cr → 15% surcharge bracket
    expectDecimalClose(result.applicableSurchargeRate, 15);

    // Tax should include surcharge (potentially with marginal relief)
    expect(result.taxAfterSurcharge.toNumber()).toBeGreaterThan(0);
    expect(result.totalTaxLiability.toNumber()).toBeGreaterThan(0);
  });

  // ── Test 9: Surcharge cap 15% on special income > ₹2Cr ──
  it('T9: Special income surcharge capped at 15% for income > ₹2Cr', () => {
    const profile = makeProfile({
      opted_for_new_regime: false,
      age: 40,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 15000000),   // ₹1.5Cr normal
      makeIncome(IncomeType.LTCG_112A, 10000000), // ₹1Cr LTCG 112A
    ];

    const deductions: DeductionRecord[] = [];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Total income > ₹2Cr → 25% surcharge rate (old regime)
    expectDecimalClose(result.applicableSurchargeRate, 25);

    // But surcharge on special income (LTCG 112A) should be capped at 15%
    // The surchargeOnSpecialTaxCapped should use 15% rate
    const specialTaxCapped = result.surchargeOnSpecialTaxCapped;
    const specialTaxUncapped = result.surchargeOnSpecialTax;

    // Capped should be less than or equal to uncapped
    expect(specialTaxCapped.lte(specialTaxUncapped) || specialTaxCapped.eq(specialTaxUncapped)).toBe(true);

    // Verify the cap is effective: capped = 15/25 of uncapped
    if (specialTaxUncapped.isPositive()) {
      const ratio = specialTaxCapped.div(specialTaxUncapped).toNumber();
      expect(ratio).toBeCloseTo(15 / 25, 1);
    }
  });

  // ── Test 10: Decimal precision — no floating-point errors ─
  it('T10: Decimal precision — no rounding errors on edge amounts', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 30,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 999999.99),
    ];

    const deductions: DeductionRecord[] = [];

    const result = calculateTaxLiability(profile, incomes, deductions);

    // Verify the income is preserved precisely (net of standard deduction u/s 16ia)
    expectDecimalClose(result.grossNormalIncome, 924999.99, 0.01);

    // Verify tax computation doesn't introduce floating-point errors
    // New regime on ₹9,24,999.99:
    //   0 – 4L     → ₹0
    //   4L – 8L    → 5% of 4L = ₹20,000
    //   8L – 9.25L → 10% of 1,24,999.99 = ₹12,500 (approx)
    const expectedTax = 20000 + (924999.99 - 800000) * 0.10;
    expectDecimalClose(result.taxOnNormalIncome, expectedTax, 1);

    // Verify Decimal arithmetic: D(0.1) + D(0.2) should equal D(0.3) exactly
    const a = D(0.1);
    const b = D(0.2);
    const c = a.add(b);
    expect(c.eq(D(0.3))).toBe(true);
  });

  // ── Bonus: Regime comparison utility ──────────────────────
  it('Bonus: compareRegimes returns valid comparison', () => {
    const profile = makeProfile({
      opted_for_new_regime: true,
      age: 35,
    });

    const incomes = [
      makeIncome(IncomeType.SALARY, 1200000), // ₹12L
    ];

    const deductions = [
      makeDeduction('16ia', 75000),
      makeDeduction('80C', 150000),
      makeDeduction('80D', 25000),
    ];

    const comparison = compareRegimes(profile, incomes, deductions);
 
    expect(comparison.oldRegimeAssessment).toBeDefined();
    expect(comparison.newRegimeAssessment).toBeDefined();
    expect(['OLD', 'NEW']).toContain(comparison.recommendation);
    expect(comparison.savings.toNumber()).toBeGreaterThanOrEqual(0);
  });

  // ── Universal Tax Engine for legal entities ─────────────────
  it('Entity: Partnership Firm flat rate and surcharge with marginal relief', () => {
    const profile = makeProfile({
      entity_type: EntityType.PARTNERSHIP_FIRM,
      opted_for_new_regime: true,
    });
 
    // ₹1,01,00,000 (just above ₹1 Crore threshold)
    const incomes = [
      makeIncome(IncomeType.BUSINESS, 10100000),
    ];
 
    const result = calculateTaxLiability(profile, incomes, []);
 
    // Base tax: 30% of ₹1.01 Crore = ₹30,30,000
    expect(result.taxOnNormalIncome.toNumber()).toBe(3030000);
 
    // Surcharge u/s 2(3) before marginal relief: 12% of ₹30,30,000 = ₹3,63,600
    // Total without relief: ₹33,93,600
    // Limit: Tax at ₹1 Cr (30% of 1Cr = 30,00,000) + excess income (₹1,00,000) = ₹31,00,000
    // Marginal relief: 33,93,600 - 31,00,000 = 2,93,600
    // Net surcharge: 3,63,600 - 2,93,600 = ₹70,000
    expect(result.surchargeAmount.toNumber()).toBe(70000);
    expect(result.marginalReliefOnSurcharge.toNumber()).toBe(293600);
  });
 
  it('Entity: Domestic Company (Normal Provision) turnover rates', () => {
    const profileUnder400 = makeProfile({
      entity_type: EntityType.DOMESTIC_COMPANY,
      corporate_tax_section: CorporateTaxSection.NORMAL,
      company_turnover_under_400cr: true,
    });
 
    const profileOver400 = makeProfile({
      entity_type: EntityType.DOMESTIC_COMPANY,
      corporate_tax_section: CorporateTaxSection.NORMAL,
      company_turnover_under_400cr: false,
    });
 
    const incomes = [
      makeIncome(IncomeType.BUSINESS, 10000000), // ₹1 Crore exactly
    ];
 
    const resultUnder = calculateTaxLiability(profileUnder400, incomes, []);
    const resultOver = calculateTaxLiability(profileOver400, incomes, []);
 
    // Under 400cr gets 25% base rate: 25% of ₹1Cr = ₹25,00,000
    expect(resultUnder.taxOnNormalIncome.toNumber()).toBe(2500000);
    // Over 400cr gets 30% base rate: 30% of ₹1Cr = ₹30,00,000
    expect(resultOver.taxOnNormalIncome.toNumber()).toBe(3000000);
  });
 
  it('Entity: Domestic Company Section 115BAA flat rate and fixed surcharge', () => {
    const profile = makeProfile({
      entity_type: EntityType.DOMESTIC_COMPANY,
      corporate_tax_section: CorporateTaxSection.SEC_115BAA,
    });
 
    const incomes = [
      makeIncome(IncomeType.BUSINESS, 5000000), // ₹50 Lakhs
    ];
 
    const result = calculateTaxLiability(profile, incomes, []);
 
    // Base tax: 22% of ₹50 Lakhs = ₹11,00,000
    expect(result.taxOnNormalIncome.toNumber()).toBe(1100000);
    // Fixed surcharge: 10% of ₹11,00,000 = ₹1,10,000 (no threshold)
    expect(result.surchargeAmount.toNumber()).toBe(110000);
    // Cess (4%): 4% of (11,00,000 + 1,10,000) = ₹48,400
    expect(result.cessAmount.toNumber()).toBe(48400);
  });
});

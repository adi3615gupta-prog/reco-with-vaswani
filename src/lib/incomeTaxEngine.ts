/**
 * incomeTaxEngine.ts — Core Income Tax Liability Calculation Engine
 *
 * Implements the complete statutory sequence for computing Indian Income Tax:
 *   Step 1: Income Aggregation & Segregation
 *   Step 2: Chapter VI-A Deductions & Regime Validation
 *   Step 3: Tax Computation (Applying Slabs + Special Rates)
 *   Step 4: Rebate u/s 87A (with marginal relief)
 *   Step 5: Surcharge & Marginal Relief (with 15% cap on special incomes)
 *   Step 6: Health & Education Cess (4%)
 *   Step 7: Final TaxAssessment output
 *
 * Target: FY 2025-26 (AY 2026-27) / FY 2026-27 (AY 2027-28)
 * Engine Version: 1.0.0
 *
 * All arithmetic uses the Decimal library to prevent floating-point rounding errors.
 */

import { D, Decimal, ZERO } from './decimal.ts';
import {
  type TaxpayerProfile,
  type IncomeRecord,
  type DeductionRecord,
  type TaxBracketRule,
  type TaxAssessment,
  type DeductionBreakdownItem,
  type SlabComputationDetail,
  type SlabStepAudit,
  type SurchargeAudit,
  type CessAudit,
  type RegimeCalculationSheet,
  type ComputationNote,
  IncomeType,
  RegimeType,
  AgeCategory,
  EntityType,
  CorporateTaxSection,
} from './incomeTaxTypes.ts';
import {
  getAllTaxBracketRules,
  DEDUCTION_LIMITS,
  AGGREGATE_CAPS,
  SURCHARGE_BRACKETS_OLD,
  SURCHARGE_BRACKETS_NEW,
  SPECIAL_INCOME_SURCHARGE_CAP,
  REBATE_87A_NEW,
  REBATE_87A_OLD,
  SPECIAL_RATES,
  HEC_RATE,
  type SurchargeBracket,
} from './taxSlabData.ts';

const ENGINE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════
// HELPER: Determine age category from age
// ═══════════════════════════════════════════════════════════════════

function resolveAgeCategory(age: number): AgeCategory {
  if (age >= 80) return AgeCategory.SUPER_SENIOR;
  if (age >= 60) return AgeCategory.SENIOR;
  return AgeCategory.NORMAL;
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1: Income Aggregation & Segregation
// ═══════════════════════════════════════════════════════════════════

interface IncomeAggregation {
  incomeBreakdown: TaxAssessment['incomeBreakdown'];
  grossTotalIncome: Decimal;
  grossNormalIncome: Decimal;
  totalSpecialIncome: Decimal;
  ltcg112AExemption: Decimal;
  ltcg112ANetTaxable: Decimal;
  /** Raw LTCG 112 details for tax computation */
  ltcg112Details: { amount: Decimal; useIndexation: boolean }[];
  warnings: string[];
  standardDeductionAmount: Decimal;
}

/**
 * Step 1: Fetch all IncomeRecord entries, separate into Special Rate and Normal buckets.
 *
 * Special Rate Incomes (taxed at flat rates, NOT through slabs):
 *   - STCG u/s 111A → 20%
 *   - LTCG u/s 112A → 12.5% on amounts exceeding ₹1,25,000
 *   - LTCG u/s 112  → 12.5% (without indexation) or 20% (with indexation)
 *   - Casual Income  → 30% flat (NO basic exemption, NO deductions)
 *
 * Everything else → Normal Income (taxed through slabs).
 */
function aggregateIncome(incomeRecords: IncomeRecord[], profile: TaxpayerProfile, regime?: RegimeType): IncomeAggregation {
  const warnings: string[] = [];

  // Initialize breakdown accumulators
  let salary = ZERO;
  let grossSalaryTotal = ZERO;
  let standardDeductionAmount = ZERO;
  let houseProperty = ZERO;
  let business = ZERO;
  let capitalGains = ZERO;
  let otherSources = ZERO;
  let stcg111A = ZERO;
  let ltcg112A = ZERO;
  let ltcg112 = ZERO;
  let casualIncome = ZERO;
  let agriculturalIncome = ZERO;
  let deemedIncome115BBE = ZERO;
  let cryptoVda = ZERO;

  const ltcg112Details: { amount: Decimal; useIndexation: boolean }[] = [];

  for (const record of incomeRecords) {
    // Residential Status Filtering (Section 5)
    if (record.is_foreign_income) {
      if (profile.residential_status === 'NR') {
        warnings.push(`Excluded foreign income of ${record.net_amount} for NR (Section 5)`);
        continue; // Non-Resident: Foreign income is not taxable
      } else if (profile.residential_status === 'RNOR') {
        if (!record.is_business_controlled_in_india) {
          warnings.push(`Excluded foreign income of ${record.net_amount} for RNOR (Section 5)`);
          continue; // RNOR: Foreign income taxable ONLY if derived from business controlled / profession set up in India
        }
      }
    }

    const netAmt = D(record.net_amount);
    let resolvedType = record.income_type;

    const sec = (record.section_code || '').trim().toUpperCase();
    const desc = (record.description || '').trim().toLowerCase();
    const type = (record.income_type || '').trim().toUpperCase();

    if (sec === '112A' || sec === 'SEC_112A') {
      resolvedType = IncomeType.LTCG_112A;
    } else if (sec === '112' || sec === 'SEC_112') {
      resolvedType = IncomeType.LTCG_112;
    } else if (
      type === 'CRYPTO_VDA' ||
      type === 'CRYPTO' ||
      type === 'VDA' ||
      sec === '194S' ||
      sec === '115BBH' ||
      desc.includes('crypto') ||
      desc.includes('vda')
    ) {
      resolvedType = 'CRYPTO_VDA';
    }

    switch (resolvedType) {
      case IncomeType.SALARY:
        grossSalaryTotal = grossSalaryTotal.add(netAmt);
        break;
      case IncomeType.HOUSE_PROPERTY:
        houseProperty = houseProperty.add(netAmt);
        break;
      case IncomeType.BUSINESS:
        business = business.add(netAmt);
        break;
      case IncomeType.CAPITAL_GAINS:
        capitalGains = capitalGains.add(netAmt);
        break;
      case IncomeType.OTHER_SOURCES:
        otherSources = otherSources.add(netAmt);
        break;

      // ── Special Rate Incomes ─────────────────────────────
      case IncomeType.STCG_111A:
        stcg111A = stcg111A.add(netAmt);
        break;
      case IncomeType.LTCG_112A:
        ltcg112A = ltcg112A.add(netAmt);
        break;
      case IncomeType.LTCG_112:
        ltcg112 = ltcg112.add(netAmt);
        ltcg112Details.push({
          amount: netAmt,
          useIndexation: record.use_indexation === true,
        });
        break;
      case IncomeType.CASUAL_INCOME:
        casualIncome = casualIncome.add(netAmt);
        break;
      case IncomeType.AGRICULTURAL_INCOME:
        agriculturalIncome = agriculturalIncome.add(netAmt);
        break;
      case IncomeType.DEEMED_INCOME_115BBE:
        deemedIncome115BBE = deemedIncome115BBE.add(netAmt);
        break;
      case IncomeType.CRYPTO_VDA:
        cryptoVda = cryptoVda.add(netAmt);
        break;

      default:
        warnings.push(`Unknown income type "${record.income_type}" for record ${record.id}. Treated as Other Sources.`);
        otherSources = otherSources.add(netAmt);
    }
  }

  // Calculate Salary Standard Deduction dynamically
  if (grossSalaryTotal.gt(ZERO)) {
    let stdDedLimit = ZERO;
    if (regime === RegimeType.NEW) {
      stdDedLimit = D(75000);
    } else if (regime === RegimeType.OLD) {
      stdDedLimit = D(50000);
    }
    standardDeductionAmount = Decimal.min(grossSalaryTotal, stdDedLimit);
    salary = grossSalaryTotal.sub(standardDeductionAmount);
  }

  // House property loss can be negative — cap set-off against salary at ₹2L for self-occupied
  // (The loss amount should already be reflected in the net_amount as a negative value)
  if (houseProperty.isNegative()) {
    const maxHPLossSetOff = D(200000);
    if (houseProperty.abs().gt(maxHPLossSetOff)) {
      warnings.push(
        `House property loss ₹${houseProperty.abs().toINR()} exceeds ₹2L set-off limit. ` +
        `Only ₹2L can be set off against other income. Remaining carries forward.`
      );
      // For computation, we cap the loss at -2L
      houseProperty = maxHPLossSetOff.neg();
    }
  }

  // ── Calculate LTCG 112A exemption ──────────────────────────
  // Per Sec 112A: First ₹1,25,000 of LTCG is exempt
  const ltcg112AExemption = Decimal.min(
    D(SPECIAL_RATES.LTCG_112A_EXEMPTION),
    Decimal.max(ltcg112A, ZERO)
  );
  const ltcg112ANetTaxable = Decimal.max(ltcg112A.sub(ltcg112AExemption), ZERO);

  // ── Aggregate normal vs special ────────────────────────────
  const grossNormalIncome = salary.add(houseProperty).add(business).add(capitalGains).add(otherSources);

  // Total special income = STCG 111A + LTCG 112A (full, pre-exemption for GTI) + LTCG 112 + Casual + CryptoVda + Deemed115BBE
  // Note: For Gross Total Income, we include the full LTCG 112A.
  // The exemption is applied only for tax computation purposes.
  const totalSpecialIncome = stcg111A.add(ltcg112A).add(ltcg112).add(casualIncome).add(cryptoVda).add(deemedIncome115BBE);

  const grossTotalIncome = grossNormalIncome.add(totalSpecialIncome);

  return {
    incomeBreakdown: {
      salary, houseProperty, business, capitalGains, otherSources,
      stcg111A, ltcg112A, ltcg112, casualIncome, agriculturalIncome, deemedIncome115BBE, cryptoVda,
    },
    grossTotalIncome,
    grossNormalIncome,
    totalSpecialIncome,
    ltcg112AExemption,
    ltcg112ANetTaxable,
    ltcg112Details,
    warnings,
    standardDeductionAmount,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2: Chapter VI-A Deductions & Regime Validation
// ═══════════════════════════════════════════════════════════════════

interface DeductionResult {
  deductionBreakdown: DeductionBreakdownItem[];
  totalDeductions: Decimal;
  netTaxableNormalIncome: Decimal;
  warnings: string[];
}

/**
 * Step 2: Apply deductions based on regime rules.
 *
 * NEW REGIME (115BAC):
 *   - Only Standard Deduction (16ia) ₹75,000 and 80CCD(2) employer NPS allowed
 *   - ALL Chapter VI-A deductions (80C, 80D, etc.) are IGNORED
 *   - Section 24(b) self-occupied property interest is IGNORED
 *
 * OLD REGIME:
 *   - All valid Chapter VI-A deductions allowed up to statutory limits
 *   - Section 24(b) up to ₹2,00,000 allowed
 *
 * CRITICAL: Deductions are subtracted ONLY from Gross Normal Income.
 *           They CANNOT be claimed against special rate incomes (111A, 112A, casual).
 */
function applyDeductions(
  deductionRecords: DeductionRecord[],
  grossNormalIncome: Decimal,
  regime: RegimeType,
): DeductionResult {
  const warnings: string[] = [];
  const breakdown: DeductionBreakdownItem[] = [];

  // Track aggregate group totals for shared caps (e.g., 80C + 80CCC + 80CCD1)
  const aggregateGroupUsed: Record<string, Decimal> = {};

  let totalDeductions = ZERO;

  for (const record of deductionRecords) {
    const claimed = D(record.claimed_amount);
    const limitConfig = DEDUCTION_LIMITS.find(d => d.sectionCode === record.section_code);

    if (!limitConfig) {
      warnings.push(
        `Unknown deduction section "${record.section_code}" for record ${record.id}. Skipped.`
      );
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: ZERO,
        reason: 'Unknown section code — not in statutory database',
      });
      continue;
    }

    // ── Regime check ─────────────────────────────────────────
    if (regime === RegimeType.NEW && !limitConfig.allowedInNewRegime) {
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: D(limitConfig.maxLimit === Infinity ? 0 : limitConfig.maxLimit),
        reason: `Not allowed under New Regime (Section 115BAC)`,
      });
      continue;
    }

    // ── Apply statutory limit ────────────────────────────────
    let maxAllowed = limitConfig.maxLimit === Infinity ? claimed : Decimal.min(claimed, D(limitConfig.maxLimit));

    // ── Check aggregate group cap (e.g., 80C + 80CCC + 80CCD1 ≤ ₹1.5L) ─
    if (limitConfig.aggregateGroup) {
      const groupKey = limitConfig.aggregateGroup;
      const groupCap = D(AGGREGATE_CAPS[groupKey] || Infinity);
      const groupUsed = aggregateGroupUsed[groupKey] || ZERO;
      const groupRemaining = Decimal.max(groupCap.sub(groupUsed), ZERO);

      maxAllowed = Decimal.min(maxAllowed, groupRemaining);

      // Update group usage
      aggregateGroupUsed[groupKey] = groupUsed.add(maxAllowed);
    }

    // Ensure we don't claim more than what was actually claimed
    const allowed = Decimal.min(claimed, maxAllowed).clampMin(0);

    breakdown.push({
      sectionCode: record.section_code,
      claimed,
      allowed,
      statutoryLimit: D(limitConfig.maxLimit === Infinity ? 999999999 : limitConfig.maxLimit),
      reason: allowed.eq(claimed)
        ? 'Full claim allowed'
        : `Capped at statutory limit (${limitConfig.description})`,
    });

    totalDeductions = totalDeductions.add(allowed);
  }

  // ── Deductions apply ONLY to Gross Normal Income, floor at 0 ─
  const netTaxableNormalIncome = Decimal.max(grossNormalIncome.sub(totalDeductions), ZERO);

  return {
    deductionBreakdown: breakdown,
    totalDeductions,
    netTaxableNormalIncome,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 3: Tax Computation (Slabs + Special Rates)
// ═══════════════════════════════════════════════════════════════════

interface TaxComputationResult {
  slabDetails: SlabComputationDetail[];
  taxOnNormalIncome: Decimal;
  taxOnSTCG111A: Decimal;
  taxOnLTCG112A: Decimal;
  taxOnLTCG112: Decimal;
  taxOnCasualIncome: Decimal;
  taxOnDeemedIncome115BBE: Decimal;
  taxOnCryptoVda: Decimal;
  totalTaxOnSpecialIncome: Decimal;
  totalComputedTax: Decimal;
}

/**
 * Compute tax by applying the progressive slab rates to a given taxable amount.
 * Returns the total tax and the per-slab breakdown.
 */
function computeSlabTax(
  taxableIncome: Decimal,
  slabs: TaxBracketRule[]
): { tax: Decimal; details: SlabComputationDetail[] } {
  let tax = ZERO;
  const details: SlabComputationDetail[] = [];

  // Sort slabs by lower_limit ascending
  const sortedSlabs = [...slabs].sort((a, b) => a.lower_limit - b.lower_limit);

  for (const slab of sortedSlabs) {
    const lower = D(slab.lower_limit);
    const rate = D(slab.rate_percent);

    let amountInSlab = ZERO;
    if (taxableIncome.gt(lower)) {
      const slabStart = slab.lower_limit === 0 ? ZERO : D(slab.lower_limit - 1);
      const slabEnd = slab.upper_limit === Infinity ? taxableIncome : Decimal.min(D(slab.upper_limit), taxableIncome);
      amountInSlab = Decimal.max(slabEnd.sub(slabStart), ZERO);
    }

    const taxInSlab = amountInSlab.percent(rate);

    details.push({
      lowerLimit: D(slab.lower_limit),
      upperLimit: slab.upper_limit === Infinity ? D(999999999999) : D(slab.upper_limit),
      taxableInSlab: amountInSlab,
      rate,
      taxInSlab,
    });

    tax = tax.add(taxInSlab);
  }

  return { tax, details };
}

/**
 * Step 3: Calculate tax on both normal income (via slabs) and special income (flat rates).
 */
function computeTax(
  params: {
    normalTaxableIncome: Decimal;
    stcg111A: Decimal;
    ltcg112A: Decimal;
    ltcg112: Decimal;
    casualIncome: Decimal;
    cryptoVda: Decimal;
    agriculturalIncome: Decimal;
    deemedIncome115BBE: Decimal;
    regime: RegimeType;
    ageCategory: AgeCategory;
    slabRules: TaxBracketRule[];
  }
): TaxComputationResult {
  const { normalTaxableIncome, stcg111A, ltcg112A, ltcg112, casualIncome, cryptoVda, agriculturalIncome, deemedIncome115BBE, regime, ageCategory, slabRules } = params;

  // ── Tax on Normal Income (via slabs) ──────────────────────
  const applicableSlabs = slabRules.filter(
    s => s.regime_type === regime && s.age_category === ageCategory
  );

  let taxOnNormalIncome = ZERO;
  let slabDetails: SlabComputationDetail[] = [];
  
  const basicExemptionSlab = applicableSlabs.find(s => s.lower_limit === 0);
  const basicExemption = basicExemptionSlab ? D(basicExemptionSlab.upper_limit) : ZERO;

  // Partial Integration for Agricultural Income
  if (agriculturalIncome.gt(5000) && normalTaxableIncome.gt(basicExemption)) {
    // Step 1: Tax on (Normal Taxable + Agri)
    const step1 = computeSlabTax(normalTaxableIncome.add(agriculturalIncome), applicableSlabs);
    // Step 2: Tax on (Basic Exemption + Agri)
    const step2 = computeSlabTax(basicExemption.add(agriculturalIncome), applicableSlabs);
    
    taxOnNormalIncome = Decimal.max(step1.tax.sub(step2.tax), ZERO);
    // Keep slab details based on normalTaxableIncome for reporting purposes, or use step1 details
    slabDetails = computeSlabTax(normalTaxableIncome, applicableSlabs).details; 
  } else {
    const res = computeSlabTax(normalTaxableIncome, applicableSlabs);
    taxOnNormalIncome = res.tax;
    slabDetails = res.details;
  }

  // ── Tax on Special Incomes (flat rates) ───────────────────

  // STCG u/s 111A → 20%
  const taxOnSTCG111A = Decimal.max(stcg111A, ZERO).percent(20);

  // LTCG u/s 112A → 12.5% on amount exceeding exemption ₹1.25L (subtract ₹1.25L limit first)
  const exemptionLimit = D(125000);
  const taxableLtcg112A = Decimal.max(ltcg112A.sub(exemptionLimit), ZERO);
  const taxOnLTCG112A = taxableLtcg112A.percent(12.5);

  // LTCG u/s 112 → 12.5% flat
  const taxOnLTCG112 = Decimal.max(ltcg112, ZERO).percent(12.5);

  // Casual Income (Lottery) → 30% flat
  const taxOnCasualIncome = Decimal.max(casualIncome, ZERO).percent(30);

  // Crypto VDA → 30% flat
  const taxOnCryptoVda = Decimal.max(cryptoVda, ZERO).percent(30);
  
  // Deemed Income 115BBE → 60% base tax
  const taxOnDeemedIncome115BBE = Decimal.max(deemedIncome115BBE, ZERO).percent(60);

  const totalTaxOnSpecialIncome = taxOnSTCG111A.add(taxOnLTCG112A).add(taxOnLTCG112).add(taxOnCasualIncome).add(taxOnCryptoVda).add(taxOnDeemedIncome115BBE);
  const totalComputedTax = taxOnNormalIncome.add(totalTaxOnSpecialIncome);

  return {
    slabDetails,
    taxOnNormalIncome,
    taxOnSTCG111A,
    taxOnLTCG112A,
    taxOnLTCG112,
    taxOnCasualIncome,
    taxOnDeemedIncome115BBE,
    taxOnCryptoVda,
    totalTaxOnSpecialIncome,
    totalComputedTax,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4: Rebate u/s 87A
// ═══════════════════════════════════════════════════════════════════

interface RebateResult {
  totalNetTaxableIncome: Decimal;
  rebate87AEligible: boolean;
  rebate87AAmount: Decimal;
  marginalRelief87A: Decimal;
  taxAfterRebate: Decimal;
  warnings: string[];
}

/**
 * Step 4: Apply rebate u/s 87A.
 *
 * NEW REGIME (FY 2025-26):
 *   If total taxable income ≤ ₹12,00,000 → Rebate up to ₹60,000
 *   Marginal Relief: If income slightly exceeds ₹12L, the tax payable
 *   cannot exceed (income − ₹12,00,000).
 *
 * OLD REGIME:
 *   If total taxable income ≤ ₹5,00,000 → Rebate up to ₹12,500
 *
 * CRITICAL: Rebate 87A CANNOT be adjusted against tax on LTCG u/s 112A.
 *   The rebate is applied only to (totalComputedTax − taxOnLTCG112A),
 *   then taxOnLTCG112A is added back.
 */
function applyRebate87A(
  totalComputedTax: Decimal,
  taxOnLTCG112A: Decimal,
  netTaxableNormalIncome: Decimal,
  totalSpecialIncome: Decimal,
  regime: RegimeType,
): RebateResult {
  const warnings: string[] = [];

  // Total net taxable income = normal + special (for rebate eligibility)
  const totalNetTaxableIncome = netTaxableNormalIncome.add(totalSpecialIncome);

  const config = regime === RegimeType.NEW ? REBATE_87A_NEW : REBATE_87A_OLD;
  const threshold = D(config.incomeThreshold);
  const maxRebate = D(config.maxRebate);

  let rebate87AEligible = false;
  let rebate87AAmount = ZERO;
  let marginalRelief87A = ZERO;

  if (totalNetTaxableIncome.lte(threshold)) {
    rebate87AEligible = true;

    // ── 87A exclusion from LTCG 112A tax ──────────────────
    // Rebate cannot reduce tax on LTCG u/s 112A
    const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);
    rebate87AAmount = Decimal.min(taxExcluding112A, maxRebate);

    if (taxOnLTCG112A.isPositive()) {
      warnings.push(
        `Rebate u/s 87A of ${rebate87AAmount.toINR()} applied only to non-112A tax. ` +
        `Tax on LTCG u/s 112A (${taxOnLTCG112A.toINR()}) is excluded from rebate computation.`
      );
    }
  } else if (regime === RegimeType.NEW) {
    // ── Marginal Relief on 87A (New Regime only) ────────────
    // If income slightly exceeds ₹12L, check if applying no rebate
    // results in tax exceeding the excess income over threshold.
    const excessOverThreshold = totalNetTaxableIncome.sub(threshold);

    // Compute what the tax WOULD be at exactly the threshold
    // (which would be ₹0 after rebate, since ₹12L → full rebate)
    // So the marginal relief says: tax should not exceed excess income
    if (totalComputedTax.gt(excessOverThreshold)) {
      // Apply marginal relief: cap total tax at the excess over threshold
      const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);

      if (taxExcluding112A.gt(excessOverThreshold)) {
        rebate87AEligible = true;
        const uncappedRebate = taxExcluding112A.sub(excessOverThreshold);
        rebate87AAmount = Decimal.min(uncappedRebate, taxExcluding112A);
        marginalRelief87A = rebate87AAmount;

        warnings.push(
          `Marginal Relief on 87A applied: Income ${totalNetTaxableIncome.toINR()} ` +
          `exceeds ₹12L threshold by ${excessOverThreshold.toINR()}. ` +
          `Tax capped to not exceed the excess.`
        );
      }
    }
  }

  const taxAfterRebate = Decimal.max(totalComputedTax.sub(rebate87AAmount), ZERO);

  return {
    totalNetTaxableIncome,
    rebate87AEligible,
    rebate87AAmount,
    marginalRelief87A,
    taxAfterRebate,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 5: Surcharge & Marginal Relief
// ═══════════════════════════════════════════════════════════════════

interface SurchargeResult {
  applicableSurchargeRate: Decimal;
  surchargeOnNormalTax: Decimal;
  surchargeOnSpecialTax: Decimal;
  surchargeOnSpecialTaxCapped: Decimal;
  totalSurchargeBeforeMR: Decimal;
  marginalReliefOnSurcharge: Decimal;
  totalSurchargeAfterMR: Decimal;
  taxAfterSurcharge: Decimal;
  warnings: string[];
}

/**
 * Determine the applicable surcharge rate from the bracket table.
 */
function getSurchargeRate(totalIncome: Decimal, brackets: SurchargeBracket[]): Decimal {
  // Brackets are sorted highest threshold first
  for (const bracket of brackets) {
    if (totalIncome.gt(bracket.incomeThreshold)) {
      return D(bracket.rate);
    }
  }
  return ZERO;
}

/**
 * Get the lower surcharge rate (the rate at the previous bracket).
 * Used for marginal relief calculation.
 */
function getLowerSurchargeRate(currentRate: Decimal, brackets: SurchargeBracket[]): { rate: Decimal; threshold: Decimal } {
  // Find the current bracket
  const sortedByThreshold = [...brackets].sort((a, b) => a.incomeThreshold - b.incomeThreshold);

  for (let i = sortedByThreshold.length - 1; i >= 0; i--) {
    if (D(sortedByThreshold[i].rate).eq(currentRate)) {
      if (i > 0) {
        return {
          rate: D(sortedByThreshold[i - 1].rate),
          threshold: D(sortedByThreshold[i].incomeThreshold),
        };
      } else {
        return {
          rate: ZERO,
          threshold: D(sortedByThreshold[i].incomeThreshold),
        };
      }
    }
  }
  return { rate: ZERO, threshold: ZERO };
}

/**
 * Compute tax on a given income using slabs (for marginal relief calculation at threshold).
 */
function computeTaxAtIncome(
  income: Decimal,
  regime: RegimeType,
  ageCategory: AgeCategory,
  slabRules: TaxBracketRule[]
): Decimal {
  const applicableSlabs = slabRules.filter(
    s => s.regime_type === regime && s.age_category === ageCategory
  );
  const { tax } = computeSlabTax(income, applicableSlabs);
  return tax;
}

/**
 * Step 5: Apply surcharge with marginal relief and special income cap.
 *
 * Surcharge brackets (FY 2025-26):
 *   OLD: >50L→10%, >1Cr→15%, >2Cr→25%, >5Cr→37%
 *   NEW: >50L→10%, >1Cr→15%, >2Cr→25% (capped, no 37%)
 *
 * SURCHARGE CAP ON SPECIAL INCOMES:
 *   Surcharge on tax attributable to STCG 111A, LTCG 112A, and dividend
 *   income CANNOT exceed 15%, regardless of total income bracket.
 *
 * MARGINAL RELIEF:
 *   If crossing a surcharge threshold (e.g., ₹50L → ₹50,01,000):
 *     (Tax + Surcharge on actual income) − (Tax on threshold + income exceeding threshold)
 *   If additional tax > additional income, reduce surcharge by the difference.
 */
function applySurcharge(
  taxAfterRebate: Decimal,
  taxOnNormalIncome: Decimal,
  taxOnSpecialIncome: Decimal,
  totalNetTaxableIncome: Decimal,
  netTaxableNormalIncome: Decimal,
  regime: RegimeType,
  ageCategory: AgeCategory,
  slabRules: TaxBracketRule[],
  taxOnDeemedIncome115BBE: Decimal = ZERO
): SurchargeResult {
  const warnings: string[] = [];

  if (taxAfterRebate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: ZERO,
      warnings,
    };
  }

  const brackets = regime === RegimeType.OLD ? SURCHARGE_BRACKETS_OLD : SURCHARGE_BRACKETS_NEW;
  const applicableSurchargeRate = getSurchargeRate(totalNetTaxableIncome, brackets);

  if (applicableSurchargeRate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: taxAfterRebate,
      warnings,
    };
  }

  // ── Surcharge on Normal Tax ────────────────────────────────
  // The portion of taxAfterRebate attributable to normal income
  const normalTaxPortion = Decimal.min(taxOnNormalIncome, taxAfterRebate);
  const surchargeOnNormalTax = normalTaxPortion.percent(applicableSurchargeRate);

  // ── Surcharge on Special Tax ──────────────────────────────
  // Apply surcharge rate, but CAP at 15% for special incomes (111A, 112A, dividend)
  const specialTaxPortion = Decimal.max(taxAfterRebate.sub(normalTaxPortion).sub(taxOnDeemedIncome115BBE), ZERO);
  const uncappedSpecialSurcharge = specialTaxPortion.percent(applicableSurchargeRate);
  const cappedRate = Decimal.min(applicableSurchargeRate, D(SPECIAL_INCOME_SURCHARGE_CAP));
  const cappedSpecialSurcharge = specialTaxPortion.percent(cappedRate);

  if (applicableSurchargeRate.gt(SPECIAL_INCOME_SURCHARGE_CAP) && specialTaxPortion.isPositive()) {
    warnings.push(
      `Surcharge on special income tax (₹${specialTaxPortion.toFixed(0)}) capped at 15% ` +
      `(instead of ${applicableSurchargeRate.toFixed(0)}%) as per statutory provision.`
    );
  }

  // 115BBE surcharge is fixed at 25% without marginal relief.
  const surchargeOn115BBE = taxOnDeemedIncome115BBE.percent(25);

  const totalSurchargeBeforeMR = surchargeOnNormalTax.add(cappedSpecialSurcharge).add(surchargeOn115BBE);

  // ── Marginal Relief Calculation ────────────────────────────
  // Check if the taxpayer just barely crossed a surcharge threshold.
  // The additional tax (surcharge) should not exceed the additional income above the threshold.
  let marginalReliefOnSurcharge = ZERO;

  const { rate: lowerRate, threshold } = getLowerSurchargeRate(applicableSurchargeRate, brackets);

  if (threshold.isPositive()) {
    const excessIncome = totalNetTaxableIncome.sub(threshold);

    // Tax + Surcharge at actual income
    const taxPlusSurchargeActual = taxAfterRebate.add(totalSurchargeBeforeMR);

    // Tax at threshold income (recompute through slabs)
    const taxAtThreshold = computeTaxAtIncome(threshold, regime, ageCategory, slabRules);
    const surchargeAtThreshold = lowerRate.isZero()
      ? ZERO
      : taxAtThreshold.percent(lowerRate);
    const taxPlusSurchargeAtThreshold = taxAtThreshold.add(surchargeAtThreshold);

    // The difference in (tax + surcharge) should not exceed the excess income
    const additionalTaxBurden = taxPlusSurchargeActual.sub(taxPlusSurchargeAtThreshold);

    if (additionalTaxBurden.gt(excessIncome)) {
      marginalReliefOnSurcharge = additionalTaxBurden.sub(excessIncome);
      warnings.push(
        `Marginal Relief on Surcharge applied: Income exceeds ${threshold.toINR()} threshold ` +
        `by ${excessIncome.toINR()}. Additional tax burden of ${additionalTaxBurden.toINR()} ` +
        `reduced by ${marginalReliefOnSurcharge.toINR()} to cap at excess income.`
      );
    }
  }

  const totalSurchargeAfterMR = Decimal.max(totalSurchargeBeforeMR.sub(marginalReliefOnSurcharge), ZERO);
  const taxAfterSurcharge = taxAfterRebate.add(totalSurchargeAfterMR);

  return {
    applicableSurchargeRate,
    surchargeOnNormalTax,
    surchargeOnSpecialTax: uncappedSpecialSurcharge,
    surchargeOnSpecialTaxCapped: cappedSpecialSurcharge,
    totalSurchargeBeforeMR,
    marginalReliefOnSurcharge,
    totalSurchargeAfterMR,
    taxAfterSurcharge,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 6: Health & Education Cess
// ═══════════════════════════════════════════════════════════════════

/**
 * Step 6: Apply 4% Health & Education Cess on (Tax + Surcharge).
 */
function applyCess(taxAfterSurcharge: Decimal): { cessRate: Decimal; cessAmount: Decimal } {
  const cessRate = D(HEC_RATE);
  const cessAmount = taxAfterSurcharge.percent(cessRate);
  return { cessRate, cessAmount };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT: calculateTaxLiability
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate the complete tax liability for a taxpayer.
 *
 * This is the main entry point that orchestrates all 7 steps of the
 * statutory tax computation sequence.
 *
 * @param profile       - TaxpayerProfile with age, regime choice, FY etc.
 * @param incomeRecords - All IncomeRecord entries for this profile
 * @param deductionRecords - All DeductionRecord entries (claims)
 * @param slabRules     - Optional: custom slab rules. If not provided, defaults are used.
 * @returns TaxAssessment - Fully populated output with every intermediate value
 */
export function calculateNonIndividualTax(
  profile: TaxpayerProfile,
  incomeRecords: IncomeRecord[],
  deductionRecords: DeductionRecord[],
): TaxAssessment {
  const entityType = profile.entity_type;
  
  // Aggregate Income
  const step1 = aggregateIncome(incomeRecords, profile);
  
  // Disallow all deductions for Firm, LLP, Company
  const totalDeductions = ZERO;
  const netTaxableNormalIncome = step1.grossNormalIncome;
  const totalNetTaxableIncome = step1.grossTotalIncome; // gross normal + special
  
  // Base Tax Rate
  let baseRate = 30; // default for Partnership, LLP, Normal Company
  if (entityType === EntityType.DOMESTIC_COMPANY) {
    const prov = profile.corporate_tax_section || CorporateTaxSection.NORMAL;
    if (prov === CorporateTaxSection.SEC_115BAA) {
      baseRate = 22;
    } else if (prov === CorporateTaxSection.SEC_115BAB) {
      baseRate = 15;
    } else {
      // NORMAL
      baseRate = profile.company_turnover_under_400cr ? 25 : 30;
    }
  } else if (entityType === EntityType.FOREIGN_COMPANY) {
    baseRate = 35;
  }
  
  // Flat Tax on Normal Income
  const taxOnNormalIncome = netTaxableNormalIncome.percent(D(baseRate));
  
  // Special Rate Incomes (casual u/s 115BB 30%, STCG u/s 111A 20%, LTCG u/s 112A/112 12.5%, Crypto VDA 30%)
  const taxOnSTCG111A = step1.incomeBreakdown.stcg111A.percent(D(20));
  const taxOnLTCG112A = step1.ltcg112ANetTaxable.percent(D(12.5));
  const taxOnLTCG112 = step1.incomeBreakdown.ltcg112.percent(D(12.5));
  const taxOnCasualIncome = step1.incomeBreakdown.casualIncome.percent(D(30));
  const taxOnCryptoVda = (step1.incomeBreakdown.cryptoVda || ZERO).percent(D(30));
  const taxOnDeemedIncome115BBE = (step1.incomeBreakdown.deemedIncome115BBE || ZERO).percent(D(60));
  
  const totalTaxOnSpecialIncome = taxOnSTCG111A.add(taxOnLTCG112A).add(taxOnLTCG112).add(taxOnCasualIncome).add(taxOnCryptoVda).add(taxOnDeemedIncome115BBE);
  const totalComputedTax = taxOnNormalIncome.add(totalTaxOnSpecialIncome);
  
  // No Rebate u/s 87A
  const rebate87AAmount = ZERO;
  const taxAfterRebate = totalComputedTax;
  
  // Surcharge Calculation
  let applicableSurchargeRate = ZERO;
  let surchargeAmount = ZERO;
  let marginalReliefOnSurcharge = ZERO;
  
  const incomeVal = totalNetTaxableIncome.toNumber();
  
  if (entityType === EntityType.PARTNERSHIP_FIRM || entityType === EntityType.LLP) {
    if (incomeVal > 10000000) {
      applicableSurchargeRate = D(12);
      const grossSurcharge = taxAfterRebate.percent(D(12));
      
      // Marginal Relief at ₹1 Crore threshold
      const thresholdVal = 10000000;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    }
  } else if (entityType === EntityType.DOMESTIC_COMPANY) {
    const prov = profile.corporate_tax_section || CorporateTaxSection.NORMAL;
    if (prov === CorporateTaxSection.SEC_115BAA || prov === CorporateTaxSection.SEC_115BAB) {
      applicableSurchargeRate = D(10);
      surchargeAmount = taxAfterRebate.percent(D(10));
    } else {
      // NORMAL COMPANY
      if (incomeVal > 100000000) {
        applicableSurchargeRate = D(12);
        const grossSurcharge = taxAfterRebate.percent(D(12));
        
        // Marginal Relief at ₹10 Crore threshold
        const thresholdVal = 100000000;
        const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
        const surchargeAtThreshold = taxAtThreshold.percent(D(7));
        const limitVal = taxAtThreshold.add(surchargeAtThreshold).add(totalNetTaxableIncome.sub(D(thresholdVal)));
        const actualTotal = taxAfterRebate.add(grossSurcharge);
        
        if (actualTotal.gt(limitVal)) {
          marginalReliefOnSurcharge = actualTotal.sub(limitVal);
          surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
        } else {
          surchargeAmount = grossSurcharge;
        }
      } else if (incomeVal > 10000000) {
        applicableSurchargeRate = D(7);
        const grossSurcharge = taxAfterRebate.percent(D(7));
        
        // Marginal Relief at ₹1 Crore threshold
        const thresholdVal = 10000000;
        const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
        const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
        const actualTotal = taxAfterRebate.add(grossSurcharge);
        
        if (actualTotal.gt(limitVal)) {
          marginalReliefOnSurcharge = actualTotal.sub(limitVal);
          surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
        } else {
          surchargeAmount = grossSurcharge;
        }
      }
    }
  } else if (entityType === EntityType.FOREIGN_COMPANY) {
    if (incomeVal > 100000000) {
      applicableSurchargeRate = D(5);
      const grossSurcharge = taxAfterRebate.percent(D(5));
      const thresholdVal = 100000000;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const surchargeAtThreshold = taxAtThreshold.percent(D(2));
      const limitVal = taxAtThreshold.add(surchargeAtThreshold).add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    } else if (incomeVal > 10000000) {
      applicableSurchargeRate = D(2);
      const grossSurcharge = taxAfterRebate.percent(D(2));
      const thresholdVal = 10000000;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    }
  }

  // SEC 115BBE 25% fixed surcharge component logic
  if (step1.incomeBreakdown.deemedIncome115BBE && step1.incomeBreakdown.deemedIncome115BBE.gt(0)) {
    const taxOnDeemedIncome115BBE = step1.incomeBreakdown.deemedIncome115BBE.percent(D(60));
    const additional115BBESurcharge = taxOnDeemedIncome115BBE.percent(D(25));
    const previouslyAppliedSC = taxOnDeemedIncome115BBE.percent(applicableSurchargeRate);
    surchargeAmount = surchargeAmount.sub(previouslyAppliedSC).add(additional115BBESurcharge);
  }
  
  const taxAfterSurcharge = taxAfterRebate.add(surchargeAmount);
  
  // Cess (4%)
  const cessAmount = taxAfterSurcharge.percent(D(4));
  const totalTaxLiability = taxAfterSurcharge.add(cessAmount).roundToInt();
  
  const effectiveTaxRate = totalNetTaxableIncome.isZero()
    ? ZERO
    : totalTaxLiability.div(totalNetTaxableIncome).mul(100);
    
  const companyTypeStr = entityType === EntityType.DOMESTIC_COMPANY ? 'Domestic Corporate' : (entityType === EntityType.FOREIGN_COMPANY ? 'Foreign Corporate' : 'Partnership/LLP');
  const computationNotes: ComputationNote[] = [
    {
      section: entityType === EntityType.DOMESTIC_COMPANY ? `u/s 115BAA/115BAB/Normal` : (entityType === EntityType.FOREIGN_COMPANY ? 'Foreign Company Rate' : `FIRM/LLP Flat Rate`),
      rationale: `${companyTypeStr} tax computed at a flat rate of ${baseRate}% on net taxable income.`,
      lineItem: 'Flat Rate Taxation',
      applicableSection: (entityType === EntityType.DOMESTIC_COMPANY || entityType === EntityType.FOREIGN_COMPANY) ? 'Corporate Tax' : 'Flat Tax',
      regime: 'Both',
      rationaleString: `${companyTypeStr} tax computed at a flat rate of ${baseRate}% on net taxable income.`
    }
  ];
  
  if (surchargeAmount.gt(0)) {
    computationNotes.push({
      section: 'Surcharge',
      rationale: `Surcharge applied at ${applicableSurchargeRate}% as total income exceeds the threshold.`,
      lineItem: 'Surcharge',
      applicableSection: 'Surcharge',
      regime: 'Both',
      rationaleString: `Surcharge applied at ${applicableSurchargeRate}% as total income exceeds the threshold.`
    });
  }
  if (marginalReliefOnSurcharge.gt(0)) {
    computationNotes.push({
      section: 'Marginal Relief',
      rationale: `Marginal relief of ₹${new Intl.NumberFormat('en-IN').format(marginalReliefOnSurcharge.toNumber())} applied to restrict tax increase.`,
      lineItem: 'Marginal Relief',
      applicableSection: 'Marginal Relief',
      regime: 'Both',
      rationaleString: `Marginal relief of ₹${new Intl.NumberFormat('en-IN').format(marginalReliefOnSurcharge.toNumber())} applied to restrict tax increase.`
    });
  }
  
  // Audit Sheet
  const slabBreakdown: SlabStepAudit[] = [
    {
      slabRange: `Flat Rate Tax (${baseRate}%)`,
      ratePercentage: baseRate,
      taxableAmountInSlab: totalNetTaxableIncome.toNumber(),
      taxGenerated: taxOnNormalIncome.toNumber()
    }
  ];
  
  const surchargeDetails: SurchargeAudit = {
    baseTaxAmount: taxAfterRebate.toNumber(),
    appliedRate: applicableSurchargeRate.toNumber(),
    grossSurcharge: taxAfterRebate.percent(applicableSurchargeRate).toNumber(),
    marginalReliefSubtracted: marginalReliefOnSurcharge.toNumber(),
    netSurcharge: surchargeAmount.toNumber()
  };
  
  const cessDetails: CessAudit = {
    taxPlusSurcharge: taxAfterSurcharge.toNumber(),
    ratePercentage: 4,
    cessAmount: cessAmount.toNumber()
  };
  
  const calculationSheet: RegimeCalculationSheet = {
    slabBreakdown,
    surchargeDetails,
    cessDetails
  };
  
  return {
    profileId: profile.profile_id,
    financialYear: profile.financial_year,
    assessmentYear: profile.assessment_year,
    regimeType: RegimeType.NEW,
    ageCategory: AgeCategory.NORMAL,
    
    standardDeductionAmount: step1.standardDeductionAmount,
    incomeBreakdown: step1.incomeBreakdown,
    grossTotalIncome: step1.grossTotalIncome,
    grossNormalIncome: step1.grossNormalIncome,
    totalSpecialIncome: step1.totalSpecialIncome,
    ltcg112AExemption: step1.ltcg112AExemption,
    ltcg112ANetTaxable: step1.ltcg112ANetTaxable,
    
    deductionBreakdown: [],
    totalDeductions,
    netTaxableNormalIncome,
    
    slabComputationDetails: [],
    taxOnNormalIncome,
    taxOnSTCG111A,
    taxOnLTCG112A,
    taxOnLTCG112,
    taxOnCasualIncome,
    taxOnCryptoVda,
    totalTaxOnSpecialIncome,
    totalComputedTax,
    
    totalNetTaxableIncome,
    rebate87AEligible: false,
    rebate87AAmount,
    marginalRelief87A: ZERO,
    taxAfterRebate,
    
    applicableSurchargeRate,
    surchargeOnNormalTax: surchargeAmount,
    surchargeOnSpecialTax: ZERO,
    surchargeOnSpecialTaxCapped: ZERO,
    totalSurchargeBeforeMR: taxAfterRebate.percent(applicableSurchargeRate),
    marginalReliefOnSurcharge,
    totalSurchargeAfterMR: surchargeAmount,
    surchargeAmount,
    taxAfterSurcharge,
    
    cessRate: D(4),
    cessAmount,
    
    totalTaxLiability,
    effectiveTaxRate,
    
    computedAt: new Date().toISOString(),
    engineVersion: '1.0.0',
    warnings: step1.warnings,
    computationNotes,
    calculationSheet
  };
}

export function calculateTaxLiability(
  profile: TaxpayerProfile,
  incomeRecords: IncomeRecord[],
  deductionRecords: DeductionRecord[],
  slabRules?: TaxBracketRule[]
): TaxAssessment {
  const allWarnings: string[] = [];

  const entityType = profile.entity_type || EntityType.INDIVIDUAL;
  if (entityType !== EntityType.INDIVIDUAL && entityType !== EntityType.HUF && entityType !== EntityType.AOP_BOI) {
    return calculateNonIndividualTax(profile, incomeRecords, deductionRecords);
  }

  // Resolve configuration
  const regime = profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD;
  const ageForResolution = (entityType === EntityType.HUF || entityType === EntityType.AOP_BOI) ? 35 : profile.age;
  const ageCategory = resolveAgeCategory(ageForResolution);
  const rules = slabRules || getAllTaxBracketRules(profile.financial_year);

  // ═════════════════════════════════════════════════════════════
  // STEP 1: Income Aggregation & Segregation
  // ═════════════════════════════════════════════════════════════
  const step1 = aggregateIncome(incomeRecords, profile, regime);
  allWarnings.push(...step1.warnings);

  const filteredDeductions = deductionRecords.filter(d => d.section_code !== '16ia');

  // ═════════════════════════════════════════════════════════════
  // STEP 2: Chapter VI-A Deductions & Regime Validation
  // ═════════════════════════════════════════════════════════════
  const step2 = applyDeductions(filteredDeductions, step1.grossNormalIncome, regime);
  allWarnings.push(...step2.warnings);

  // ═════════════════════════════════════════════════════════════
  // STEP 3: Tax Computation (Slabs + Special Rates)
  // ═════════════════════════════════════════════════════════════
  // ═════════════════════════════════════════════════════════════
  // STEP 3: Tax Computation (Slabs + Special Rates)
  // ═════════════════════════════════════════════════════════════
  const incomes = incomeRecords;
  const netTaxableIncome = step2.netTaxableNormalIncome.toNumber() + 
    step1.incomeBreakdown.stcg111A.toNumber() + 
    step1.incomeBreakdown.ltcg112A.toNumber() + 
    step1.incomeBreakdown.ltcg112.toNumber() + 
    step1.incomeBreakdown.casualIncome.toNumber() + 
    (step1.incomeBreakdown.cryptoVda ? step1.incomeBreakdown.cryptoVda.toNumber() : 0);

  // 1. Initialize Special Income accumulators
  let specialIncomeTotal = 0;
  let taxOnSpecialIncome = 0;

  // 2. Extract specific special incomes (Ensure resolved type aggregation from step1 is used)
  const ltcg112_amount = step1.incomeBreakdown.ltcg112.toNumber();
  const stcg111a_amount = step1.incomeBreakdown.stcg111A.toNumber();
  const casual_income_amount = step1.incomeBreakdown.casualIncome.toNumber();
  const crypto_vda_amount = step1.incomeBreakdown.cryptoVda ? step1.incomeBreakdown.cryptoVda.toNumber() : 0;
  const agricultural_income_amount = step1.incomeBreakdown.agriculturalIncome ? step1.incomeBreakdown.agriculturalIncome.toNumber() : 0;
  const deemed_income_115bbe_amount = step1.incomeBreakdown.deemedIncome115BBE ? step1.incomeBreakdown.deemedIncome115BBE.toNumber() : 0;

  // 1. Calculate the gross amount first
  const ltcg112a_amount = incomes.filter(i => i.income_type === 'LTCG_112A').reduce((sum, i) => sum + (i.net_amount || 0), 0);

  // 2. Define the taxable amount with the ₹1.25L exemption applied
  const taxableLtcg112a = Math.max(0, ltcg112a_amount - 125000);

  // 3. Add ONLY the taxable portion to the tax total
  taxOnSpecialIncome += (taxableLtcg112a * 0.125);

  // b) LTCG 112 (Property/Unlisted): Flat 12.5%
  taxOnSpecialIncome += (ltcg112_amount * 0.125);
  // c) STCG 111A: Flat 20%
  taxOnSpecialIncome += (stcg111a_amount * 0.20);
  // d) Casual Income (Lottery/Crypto 115BB/115BBH): Flat 30%
  taxOnSpecialIncome += (casual_income_amount * 0.30);
  // e) Crypto VDA u/s 115BBH: Flat 30%
  taxOnSpecialIncome += (crypto_vda_amount * 0.30);
  // f) Deemed Income u/s 115BBE: Flat 60%
  taxOnSpecialIncome += (deemed_income_115bbe_amount * 0.60);

  // 4. Aggregate total special income to deduct from Gross Total Income
  specialIncomeTotal = ltcg112a_amount + ltcg112_amount + stcg111a_amount + casual_income_amount + crypto_vda_amount + deemed_income_115bbe_amount;

  // 5. Establish the Normal Income Base for progressive slabs
  const normalIncomeBase = Math.max(0, netTaxableIncome - specialIncomeTotal);

  // NOW, pass `normalIncomeBase` into the slab calculation loops...
  const applicableSlabs = rules.filter(
    s => s.regime_type === regime && s.age_category === ageCategory
  );
  
  let taxOnNormalIncomeDecimal = ZERO;
  let slabDetails: SlabComputationDetail[] = [];
  
  const basicExemptionSlab = applicableSlabs.find(s => s.lower_limit === 0);
  const basicExemption = basicExemptionSlab ? basicExemptionSlab.upper_limit : 0;

  if (agricultural_income_amount > 5000 && normalIncomeBase > basicExemption) {
    const step1Tax = computeSlabTax(D(normalIncomeBase + agricultural_income_amount), applicableSlabs).tax;
    const step2Tax = computeSlabTax(D(basicExemption + agricultural_income_amount), applicableSlabs).tax;
    taxOnNormalIncomeDecimal = Decimal.max(step1Tax.sub(step2Tax), ZERO);
    slabDetails = computeSlabTax(D(normalIncomeBase), applicableSlabs).details;
  } else {
    const res = computeSlabTax(D(normalIncomeBase), applicableSlabs);
    taxOnNormalIncomeDecimal = res.tax;
    slabDetails = res.details;
  }
  
  const taxOnNormalIncome = taxOnNormalIncomeDecimal.toNumber();

  const totalComputedTax = D(taxOnNormalIncome).add(D(taxOnSpecialIncome));

  const step3: TaxComputationResult = {
    slabDetails,
    taxOnNormalIncome: D(taxOnNormalIncome),
    taxOnSTCG111A: D(stcg111a_amount * 0.20),
    taxOnLTCG112A: D(taxableLtcg112a * 0.125),
    taxOnLTCG112: D(ltcg112_amount * 0.125),
    taxOnCasualIncome: D(casual_income_amount * 0.30),
    taxOnCryptoVda: D(crypto_vda_amount * 0.30),
    taxOnDeemedIncome115BBE: D(deemed_income_115bbe_amount * 0.60),
    totalTaxOnSpecialIncome: D(taxOnSpecialIncome),
    totalComputedTax,
  };

  // ═════════════════════════════════════════════════════════════
  // STEP 4: Rebate u/s 87A
  // ═════════════════════════════════════════════════════════════
  const step4 = applyRebate87A(
    step3.totalComputedTax,
    step3.taxOnLTCG112A,
    step2.netTaxableNormalIncome,
    step1.totalSpecialIncome,
    regime,
  );
  allWarnings.push(...step4.warnings);

  // ═════════════════════════════════════════════════════════════
  // STEP 5: Surcharge & Marginal Relief
  // ═════════════════════════════════════════════════════════════
  const step5 = applySurcharge(
    step4.taxAfterRebate,
    step3.taxOnNormalIncome,
    step3.totalTaxOnSpecialIncome,
    step4.totalNetTaxableIncome,
    step2.netTaxableNormalIncome,
    regime,
    ageCategory,
    rules,
    step3.taxOnDeemedIncome115BBE || D(0)
  );
  allWarnings.push(...step5.warnings);

  // ═════════════════════════════════════════════════════════════
  // STEP 6: Health & Education Cess (4%)
  // ═════════════════════════════════════════════════════════════
  const step6 = applyCess(step5.taxAfterSurcharge);

  // ═════════════════════════════════════════════════════════════
  // STEP 7: Assemble Final TaxAssessment
  // ═════════════════════════════════════════════════════════════
  const totalTaxLiability = step5.taxAfterSurcharge.add(step6.cessAmount).roundToInt();

  // Effective tax rate = (Total Tax / Gross Total Income) × 100
  const effectiveTaxRate = step1.grossTotalIncome.isZero()
    ? ZERO
    : totalTaxLiability.div(step1.grossTotalIncome).mul(100);

  // ─── GENERATE COMPUTATION NOTES ──────────────────────────────
  const computationNotes: ComputationNote[] = [];

  // 1. Standard Deduction: If Salary > 0
  const hasSalary = incomeRecords.some(r => r.income_type === IncomeType.SALARY && r.gross_amount > 0);
  if (hasSalary) {
    const amtStr = regime === RegimeType.NEW ? '₹75,000' : '₹50,000';
    computationNotes.push({
      section: "u/s 16(ia)",
      rationale: `Standard deduction of ${amtStr} applied against salary income under ${regime} regime.`,
      lineItem: 'Salary Standard Deduction',
      applicableSection: 'u/s 16(ia)',
      regime: regime === RegimeType.NEW ? 'New' : 'Old',
      rationaleString: `Standard deduction of ${amtStr} applied against salary income under ${regime} regime.`
    });
  }

  // 2. Chapter VI-A Restrictions (New Regime)
  const hasOldRegimeDeductions = deductionRecords.some(
    d => ['80C', '80D', '80CCD1B', '80TTA', '80TTB'].includes(d.section_code) && d.claimed_amount > 0
  );
  if (regime === RegimeType.NEW && hasOldRegimeDeductions) {
    computationNotes.push({
      section: "Chapter VI-A",
      rationale: "Deductions under 80C, 80D, etc., have been ignored as they are not allowable under the New Tax Regime (Section 115BAC).",
      lineItem: 'Chapter VI-A Deductions',
      applicableSection: 'Chapter VI-A',
      regime: 'New',
      rationaleString: 'Deductions under 80C, 80D, etc., have been ignored as they are not allowable under the New Tax Regime (Section 115BAC).'
    });
  }

  // 3. Section 80C (Old Regime capping)
  const record80C = deductionRecords.find(d => d.section_code === '80C');
  if (record80C && regime === RegimeType.OLD) {
    const allowed80C = step2.deductionBreakdown.find(b => b.sectionCode === '80C')?.allowed || ZERO;
    const claimed80C = D(record80C.claimed_amount);
    if (claimed80C.gt(150000)) {
      computationNotes.push({
        section: "u/s 80C",
        rationale: "Deduction claimed under Section 80C has been restricted to the maximum statutory threshold of ₹1,50,000 as per provisions of Section 80CCE.",
        lineItem: 'Section 80C Deduction',
        applicableSection: 'u/s 80C',
        regime: 'Old',
        rationaleString: 'Deduction claimed under Section 80C has been restricted to the maximum statutory threshold of ₹1,50,000 as per provisions of Section 80CCE.'
      });
    } else {
      const fmt80C = new Intl.NumberFormat('en-IN').format(allowed80C.toNumber());
      computationNotes.push({
        section: "u/s 80C",
        rationale: `Deduction u/s 80C of ₹${fmt80C} is fully allowed based on eligible tax-saving investments.`,
        lineItem: 'Section 80C Deduction',
        applicableSection: 'u/s 80C',
        regime: 'Old',
        rationaleString: `Deduction u/s 80C of ₹${fmt80C} is fully allowed based on eligible tax-saving investments.`
      });
    }
  }

  // 4. House Property Interest u/s 24(b)
  const hpInterestRecord = deductionRecords.find(d => d.section_code === '24b');
  if (hpInterestRecord) {
    if (regime === RegimeType.NEW) {
      computationNotes.push({
        section: 'u/s 24(b)',
        rationale: 'Interest on self-occupied property u/s 24(b) is set to zero as set-off of house property loss is disallowed under Section 115BAC.',
        lineItem: 'House Property Interest',
        applicableSection: 'u/s 24(b)',
        regime: 'New',
        rationaleString: 'Interest on self-occupied property u/s 24(b) is set to zero as set-off of house property loss is disallowed under Section 115BAC.'
      });
    } else {
      computationNotes.push({
        section: 'u/s 24(b)',
        rationale: 'Interest deduction of up to ₹2,00,000 is allowed on self-occupied property u/s 24(b) under the Old Tax Regime.',
        lineItem: 'House Property Interest',
        applicableSection: 'u/s 24(b)',
        regime: 'Old',
        rationaleString: 'Interest deduction of up to ₹2,00,000 is allowed on self-occupied property u/s 24(b) under the Old Tax Regime.'
      });
    }
  }

  // 5. Section 80D (Health Insurance, Old Regime)
  const record80D = deductionRecords.find(d => d.section_code === '80D');
  if (record80D && regime === RegimeType.OLD) {
    const allowed80D = step2.deductionBreakdown.find(b => b.sectionCode === '80D')?.allowed || ZERO;
    const fmt80D = new Intl.NumberFormat('en-IN').format(allowed80D.toNumber());
    computationNotes.push({
      section: 'u/s 80D',
      rationale: `Health insurance premium deduction of ₹${fmt80D} allowed under the Old Tax Regime.`,
      lineItem: 'Section 80D Health Insurance',
      applicableSection: 'u/s 80D',
      regime: 'Old',
      rationaleString: `Health insurance premium deduction of ₹${fmt80D} allowed under the Old Tax Regime.`
    });
  }

  // 6. Rebate 87A: If 87A > 0
  if (step4.rebate87AAmount.gt(0)) {
    const rebateAmount = new Intl.NumberFormat('en-IN').format(step4.rebate87AAmount.toNumber());
    computationNotes.push({
      section: "u/s 87A",
      rationale: `Tax rebate of ₹${rebateAmount} applied as total taxable income falls within the allowable limit.`,
      lineItem: 'Rebate u/s 87A',
      applicableSection: 'u/s 87A',
      regime: regime === RegimeType.NEW ? 'New' : 'Old',
      rationaleString: `Tax rebate of ₹${rebateAmount} applied as total taxable income falls within the allowable limit.`
    });
  }

  // 7. Surcharge Application: If Surcharge > 0
  if (step5.totalSurchargeAfterMR.gt(0)) {
    computationNotes.push({
      section: "Surcharge",
      rationale: "Surcharge applied at applicable rates because total income exceeds the statutory threshold.",
      lineItem: 'Surcharge Application',
      applicableSection: 'Surcharge',
      regime: regime === RegimeType.NEW ? 'New' : 'Old',
      rationaleString: "Surcharge applied at applicable rates because total income exceeds the statutory threshold."
    });
  }

  // 8. Marginal Relief: If Marginal Relief > 0
  if (step5.marginalReliefOnSurcharge.gt(0)) {
    const reliefAmount = new Intl.NumberFormat('en-IN').format(step5.marginalReliefOnSurcharge.toNumber());
    computationNotes.push({
      section: "Marginal Relief",
      rationale: `Marginal relief of ₹${reliefAmount} applied to restrict the tax increase to the incremental income above the threshold.`,
      lineItem: 'Surcharge Marginal Relief',
      applicableSection: 'Marginal Relief',
      regime: regime === RegimeType.NEW ? 'New' : 'Old',
      rationaleString: `Marginal relief of ₹${reliefAmount} applied to restrict the tax increase to the incremental income above the threshold.`
    });
  }

  // 9. Special Capital Gains
  if (step1.incomeBreakdown.stcg111A.gt(0)) {
    computationNotes.push({
      section: 'Sec 111A',
      rationale: 'STCG on listed equity shares is taxed at a flat rate of 20% u/s 111A, without any progressive slab benefits.',
      lineItem: 'Short-Term Capital Gains',
      applicableSection: 'Sec 111A',
      regime: 'Both',
      rationaleString: 'STCG on listed equity shares is taxed at a flat rate of 20% u/s 111A, without any progressive slab benefits.'
    });
  }
  if (step1.incomeBreakdown.ltcg112A.gt(0)) {
    computationNotes.push({
      section: 'Sec 112A',
      rationale: 'LTCG on listed equity shares is exempt up to ₹1.25 Lakhs, with the excess taxed at a flat rate of 12.5% u/s 112A.',
      lineItem: 'Long-Term Capital Gains',
      applicableSection: 'Sec 112A',
      regime: 'Both',
      rationaleString: 'LTCG on listed equity shares is exempt up to ₹1.25 Lakhs, with the excess taxed at a flat rate of 12.5% u/s 112A.'
    });
  }
  if (step1.incomeBreakdown.casualIncome.gt(0)) {
    computationNotes.push({
      section: 'Sec 115BB',
      rationale: 'Winnings from lottery/gambling/crypto are taxed at a flat 30% u/s 115BB/115BBH. No deductions or slab exemptions are allowed against this income.',
      lineItem: 'Casual Income',
      applicableSection: 'Sec 115BB',
      regime: 'Both',
      rationaleString: 'Winnings from lottery/gambling/crypto are taxed at a flat 30% u/s 115BB/115BBH. No deductions or slab exemptions are allowed against this income.'
    });
  }

  const slabBreakdown: SlabStepAudit[] = step3.slabDetails.map(detail => {
    const isInfinity = detail.upperLimit.gt(100000000000);
    const range = isInfinity
      ? `₹${new Intl.NumberFormat('en-IN').format(detail.lowerLimit.toNumber())}+`
      : `₹${new Intl.NumberFormat('en-IN').format(detail.lowerLimit.toNumber())} - ₹${new Intl.NumberFormat('en-IN').format(detail.upperLimit.toNumber())}`;
    return {
      slabRange: range,
      ratePercentage: detail.rate.toNumber(),
      taxableAmountInSlab: detail.taxableInSlab.toNumber(),
      taxGenerated: detail.taxInSlab.toNumber()
    };
  });

  if (step1.incomeBreakdown.stcg111A.gt(0)) {
    slabBreakdown.push({
      slabRange: 'STCG u/s 111A (Listed Shares)',
      ratePercentage: 20,
      taxableAmountInSlab: step1.incomeBreakdown.stcg111A.toNumber(),
      taxGenerated: step3.taxOnSTCG111A.toNumber()
    });
  }
  if (step1.incomeBreakdown.ltcg112A.gt(0)) {
    const exemption = 125000;
    const taxableAmt = Math.max(step1.incomeBreakdown.ltcg112A.toNumber() - exemption, 0);
    slabBreakdown.push({
      slabRange: 'LTCG u/s 112A (excl. ₹1.25L)',
      ratePercentage: 12.5,
      taxableAmountInSlab: taxableAmt,
      taxGenerated: step3.taxOnLTCG112A.toNumber()
    });
  }
  if (step1.incomeBreakdown.ltcg112.gt(0)) {
    slabBreakdown.push({
      slabRange: 'LTCG u/s 112 (Other Assets)',
      ratePercentage: 12.5,
      taxableAmountInSlab: step1.incomeBreakdown.ltcg112.toNumber(),
      taxGenerated: step3.taxOnLTCG112.toNumber()
    });
  }
  if (step1.incomeBreakdown.casualIncome.gt(0)) {
    slabBreakdown.push({
      slabRange: 'Casual Winnings u/s 115BB',
      ratePercentage: 30,
      taxableAmountInSlab: step1.incomeBreakdown.casualIncome.toNumber(),
      taxGenerated: step3.taxOnCasualIncome.toNumber()
    });
  }
  if (step1.incomeBreakdown.cryptoVda && step1.incomeBreakdown.cryptoVda.gt(0)) {
    slabBreakdown.push({
      slabRange: 'Crypto / VDA u/s 115BBH',
      ratePercentage: 30,
      taxableAmountInSlab: step1.incomeBreakdown.cryptoVda.toNumber(),
      taxGenerated: (step3.taxOnCryptoVda || ZERO).toNumber()
    });
  }

  const surchargeDetails: SurchargeAudit = {
    baseTaxAmount: step4.taxAfterRebate.toNumber(),
    appliedRate: step5.applicableSurchargeRate.toNumber(),
    grossSurcharge: step5.totalSurchargeBeforeMR.toNumber(),
    marginalReliefSubtracted: step5.marginalReliefOnSurcharge.toNumber(),
    netSurcharge: step5.totalSurchargeAfterMR.toNumber()
  };

  const cessDetails: CessAudit = {
    taxPlusSurcharge: step5.taxAfterSurcharge.toNumber(),
    ratePercentage: step6.cessRate.toNumber(),
    cessAmount: step6.cessAmount.toNumber()
  };

  const calculationSheet: RegimeCalculationSheet = {
    slabBreakdown,
    surchargeDetails,
    cessDetails
  };

  const assessment: TaxAssessment = {
    // Profile
    profileId: profile.profile_id,
    financialYear: profile.financial_year,
    assessmentYear: profile.assessment_year,
    regimeType: regime,
    ageCategory,

    // Step 1
    standardDeductionAmount: step1.standardDeductionAmount,
    incomeBreakdown: step1.incomeBreakdown,
    grossTotalIncome: step1.grossTotalIncome,
    grossNormalIncome: step1.grossNormalIncome,
    totalSpecialIncome: step1.totalSpecialIncome,
    ltcg112AExemption: step1.ltcg112AExemption,
    ltcg112ANetTaxable: step1.ltcg112ANetTaxable,

    // Step 2
    deductionBreakdown: step2.deductionBreakdown,
    totalDeductions: step2.totalDeductions,
    netTaxableNormalIncome: step2.netTaxableNormalIncome,

    // Step 3
    slabComputationDetails: step3.slabDetails,
    taxOnNormalIncome: step3.taxOnNormalIncome,
    taxOnSTCG111A: step3.taxOnSTCG111A,
    taxOnLTCG112A: step3.taxOnLTCG112A,
    taxOnLTCG112: step3.taxOnLTCG112,
    taxOnCasualIncome: step3.taxOnCasualIncome,
    taxOnCryptoVda: step3.taxOnCryptoVda,
    totalTaxOnSpecialIncome: step3.totalTaxOnSpecialIncome,
    totalComputedTax: step3.totalComputedTax,

    // Step 4
    totalNetTaxableIncome: step4.totalNetTaxableIncome,
    rebate87AEligible: step4.rebate87AEligible,
    rebate87AAmount: step4.rebate87AAmount,
    marginalRelief87A: step4.marginalRelief87A,
    taxAfterRebate: step4.taxAfterRebate,

    // Step 5
    applicableSurchargeRate: step5.applicableSurchargeRate,
    surchargeOnNormalTax: step5.surchargeOnNormalTax,
    surchargeOnSpecialTax: step5.surchargeOnSpecialTax,
    surchargeOnSpecialTaxCapped: step5.surchargeOnSpecialTaxCapped,
    totalSurchargeBeforeMR: step5.totalSurchargeBeforeMR,
    marginalReliefOnSurcharge: step5.marginalReliefOnSurcharge,
    totalSurchargeAfterMR: step5.totalSurchargeAfterMR,
    surchargeAmount: step5.totalSurchargeAfterMR,
    taxAfterSurcharge: step5.taxAfterSurcharge,

    // Step 6
    cessRate: step6.cessRate,
    cessAmount: step6.cessAmount,

    // Final
    totalTaxLiability,
    effectiveTaxRate,

    // Metadata
    computedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    warnings: allWarnings,
    computationNotes,
    calculationSheet
  };

  return assessment;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY: Compare Old vs New Regime
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute tax under both regimes and return a comparison.
 * Useful for advising the taxpayer on the optimal regime choice.
 */
export function compareRegimes(
  profile: TaxpayerProfile,
  incomeRecords: IncomeRecord[],
  deductionRecords: DeductionRecord[],
): {
  oldRegimeAssessment: TaxAssessment;
  newRegimeAssessment: TaxAssessment;
  recommendation: 'OLD' | 'NEW';
  savings: Decimal;
} {
  const entityType = profile.entity_type || EntityType.INDIVIDUAL;
  if (entityType !== EntityType.INDIVIDUAL && entityType !== EntityType.HUF && entityType !== EntityType.AOP_BOI) {
    const assessment = calculateNonIndividualTax(profile, incomeRecords, deductionRecords);
    return {
      oldRegimeAssessment: assessment,
      newRegimeAssessment: assessment,
      recommendation: 'NEW',
      savings: ZERO
    };
  }

  const oldProfile = { ...profile, opted_for_new_regime: false };
  const newProfile = { ...profile, opted_for_new_regime: true };

  const oldAssessment = calculateTaxLiability(oldProfile, incomeRecords, deductionRecords);
  const newAssessment = calculateTaxLiability(newProfile, incomeRecords, deductionRecords);

  const oldTax = oldAssessment.totalTaxLiability;
  const newTax = newAssessment.totalTaxLiability;

  const recommendation = newTax.lte(oldTax) ? 'NEW' as const : 'OLD' as const;
  const savings = oldTax.gt(newTax)
    ? oldTax.sub(newTax)
    : newTax.sub(oldTax);

  return {
    oldRegimeAssessment: oldAssessment,
    newRegimeAssessment: newAssessment,
    recommendation,
    savings,
  };
}

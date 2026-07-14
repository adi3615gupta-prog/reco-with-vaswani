/**
 * incomeTaxTypes.ts — All database model interfaces, enums, and type definitions
 * for the Indian Income Tax Liability Calculation Engine.
 *
 * These types map to the conceptual database models and serve as the
 * contract between the data layer (SQLite) and the computation engine.
 *
 * Target: FY 2025-26 (AY 2026-27) / FY 2026-27 (AY 2027-28)
 */

import { Decimal } from './decimal.ts';

// ═══════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════

export const IncomeType = {
  SALARY: 'SALARY',
  HOUSE_PROPERTY: 'HOUSE_PROPERTY',
  BUSINESS: 'BUSINESS',
  CAPITAL_GAINS: 'CAPITAL_GAINS',
  OTHER_SOURCES: 'OTHER_SOURCES',
  STCG_111A: 'STCG_111A',
  LTCG_112A: 'LTCG_112A',
  LTCG_112: 'LTCG_112',
  CASUAL_INCOME: 'CASUAL_INCOME',
  AGRICULTURAL_INCOME: 'AGRICULTURAL_INCOME',
  DEEMED_INCOME_115BBE: 'DEEMED_INCOME_115BBE',
  CRYPTO_VDA: 'CRYPTO_VDA',
} as const;
export type IncomeType = typeof IncomeType[keyof typeof IncomeType];

export const RegimeType = {
  OLD: 'OLD',
  NEW: 'NEW',
} as const;
export type RegimeType = typeof RegimeType[keyof typeof RegimeType];

export const AgeCategory = {
  NORMAL: 'NORMAL',
  SENIOR: 'SENIOR',
  SUPER_SENIOR: 'SUPER_SENIOR',
} as const;
export type AgeCategory = typeof AgeCategory[keyof typeof AgeCategory];

/** Supported financial years */
export type FinancialYear = 'FY2025-26' | 'FY2026-27';

// ═══════════════════════════════════════════════════════════════════
// DATABASE MODEL INTERFACES
// ═══════════════════════════════════════════════════════════════════

export enum EntityType {
  INDIVIDUAL = 'INDIVIDUAL',
  HUF = 'HUF',
  PARTNERSHIP_FIRM = 'PARTNERSHIP_FIRM',
  LLP = 'LLP',
  DOMESTIC_COMPANY = 'DOMESTIC_COMPANY',
  FOREIGN_COMPANY = 'FOREIGN_COMPANY',
  AOP_BOI = 'AOP_BOI'
}

export enum CorporateTaxSection {
  NORMAL = 'NORMAL',
  SEC_115BAA = 'SEC_115BAA',
  SEC_115BAB = 'SEC_115BAB'
}

/**
 * TaxpayerProfile — Core profile of the assessee.
 * Maps to `Taxpayer_Profiles` table.
 */
export interface TaxpayerProfile {
  profile_id: string;
  name: string;
  pan: string;
  /** Age of the taxpayer as on 31st March of the AY */
  age: number;
  /** True if taxpayer has opted for New Regime u/s 115BAC */
  opted_for_new_regime: boolean;
  /** Financial year for which this profile applies */
  financial_year: FinancialYear;
  /** Assessment year (derived from FY) */
  assessment_year: string;
  /** Residential status: 'ROR' | 'RNOR' | 'NR' */
  residential_status: 'ROR' | 'RNOR' | 'NR';
  entity_type: EntityType;
  company_turnover_under_400cr?: boolean;
  corporate_tax_section?: CorporateTaxSection;
}

/**
 * IncomeRecord — A single income entry for a taxpayer.
 * Maps to `Income_Records` table.
 */
export interface IncomeRecord {
  id: string;
  profile_id: string;
  income_type: IncomeType;
  /** Human-readable description (e.g., "Salary from ABC Corp") */
  description: string;
  /** Gross amount before any exempt portion */
  gross_amount: number;
  /** Exempt amount (e.g., HRA exemption, agricultural income for aggregation) */
  exempt_amount: number;
  /** Net amount after exemptions: gross_amount - exempt_amount */
  net_amount: number;
  /** Relevant section code for special incomes */
  section_code: string | null;
  /**
   * For LTCG u/s 112 only:
   * true  = use indexation benefit (20% rate, pre-23-Jul-2024 assets)
   * false = without indexation (12.5% rate, post-23-Jul-2024 assets)
   * null  = not applicable
   *
   * NOTE: Post Finance Act 2024, for assets acquired on/after 23-Jul-2024,
   * indexation is abolished. Rate is flat 12.5% for all LTCG u/s 112.
   * For FY 2025-26 onward, this field is effectively always false.
   */
  use_indexation: boolean | null;
  /** True if the income is accrued or arisen outside India */
  is_foreign_income?: boolean;
  /** True if foreign income is derived from a business controlled in or profession set up in India (relevant for RNOR status) */
  is_business_controlled_in_india?: boolean;
}

/**
 * DeductionRecord — A deduction claim under Chapter VI-A or other sections.
 * Maps to `Deduction_Records` table.
 */
export interface DeductionRecord {
  id: string;
  profile_id: string;
  /**
   * Section code identifying the deduction:
   * '80C', '80CCC', '80CCD1', '80CCD1B', '80CCD2',
   * '80D', '80DD', '80DDB', '80E', '80EE', '80EEA',
   * '80G', '80GG', '80GGA', '80GGC',
   * '80TTA', '80TTB', '80U',
   * '24b' (interest on housing loan — self-occupied),
   * '16ia' (standard deduction from salary)
   */
  section_code: string;
  /** Amount claimed by the taxpayer */
  claimed_amount: number;
  /**
   * Maximum eligible amount (after applying statutory limits).
   * Set by the engine during computation.
   */
  eligible_amount: number;
}

/**
 * TaxBracketRule — A single slab rule from the statutory slab tables.
 * Maps to `Tax_Bracket_Rules` table.
 */
export interface TaxBracketRule {
  id: string;
  /** Which regime this bracket belongs to */
  regime_type: RegimeType;
  /** Age category (only meaningful for Old Regime) */
  age_category: AgeCategory;
  /** Lower limit of the slab (inclusive), in ₹ */
  lower_limit: number;
  /** Upper limit of the slab (inclusive), in ₹. Infinity for last slab. */
  upper_limit: number;
  /** Tax rate as percentage (e.g., 5 means 5%) */
  rate_percent: number;
  /** Financial year this rule applies to */
  financial_year: FinancialYear;
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT INTERFACE — TaxAssessment
// ═══════════════════════════════════════════════════════════════════

/** Breakdown of a single deduction for audit trail */
export interface DeductionBreakdownItem {
  sectionCode: string;
  claimed: Decimal;
  allowed: Decimal;
  statutoryLimit: Decimal;
  reason: string;
}

/** Per-slab tax computation detail */
export interface SlabComputationDetail {
  lowerLimit: Decimal;
  upperLimit: Decimal;
  taxableInSlab: Decimal;
  rate: Decimal;
  taxInSlab: Decimal;
}

/**
 * TaxAssessment — The fully populated output of the tax computation engine.
 * Every intermediate value is exposed for frontend rendering and audit.
 */
export interface TaxAssessment {
  // ── Profile Context ────────────────────────────────────────
  profileId: string;
  financialYear: FinancialYear;
  assessmentYear: string;
  regimeType: RegimeType;
  ageCategory: AgeCategory;

  // ── Step 1: Income Aggregation & Segregation ───────────────
  standardDeductionAmount: Decimal;
  incomeBreakdown: {
    salary: Decimal;
    houseProperty: Decimal;
    business: Decimal;
    capitalGains: Decimal;
    otherSources: Decimal;
    stcg111A: Decimal;
    ltcg112A: Decimal;
    ltcg112: Decimal;
    casualIncome: Decimal;
    agriculturalIncome?: Decimal;
    deemedIncome115BBE?: Decimal;
    cryptoVda?: Decimal;
  };
  grossTotalIncome: Decimal;
  grossNormalIncome: Decimal;
  totalSpecialIncome: Decimal;
  /** ₹1,25,000 exemption applied to LTCG u/s 112A */
  ltcg112AExemption: Decimal;
  /** Net LTCG 112A after exemption (basis for 12.5% tax) */
  ltcg112ANetTaxable: Decimal;

  // ── Step 2: Deductions ─────────────────────────────────────
  deductionBreakdown: DeductionBreakdownItem[];
  totalDeductions: Decimal;
  /** Gross Normal Income minus allowed deductions (floored at 0) */
  netTaxableNormalIncome: Decimal;

  // ── Step 3: Tax Computation ────────────────────────────────
  slabComputationDetails: SlabComputationDetail[];
  taxOnNormalIncome: Decimal;
  taxOnSTCG111A: Decimal;
  taxOnLTCG112A: Decimal;
  taxOnLTCG112: Decimal;
  taxOnCasualIncome: Decimal;
  taxOnDeemedIncome115BBE?: Decimal;
  taxOnCryptoVda?: Decimal;
  totalTaxOnSpecialIncome: Decimal;
  totalComputedTax: Decimal;

  // ── Step 4: Rebate u/s 87A ─────────────────────────────────
  totalNetTaxableIncome: Decimal;
  rebate87AEligible: boolean;
  rebate87AAmount: Decimal;
  marginalRelief87A: Decimal;
  taxAfterRebate: Decimal;

  // ── Step 5: Surcharge & Marginal Relief ────────────────────
  applicableSurchargeRate: Decimal;
  surchargeOnNormalTax: Decimal;
  surchargeOnSpecialTax: Decimal;
  surchargeOnSpecialTaxCapped: Decimal;
  totalSurchargeBeforeMR: Decimal;
  marginalReliefOnSurcharge: Decimal;
  totalSurchargeAfterMR: Decimal;
  surchargeAmount: Decimal;
  taxAfterSurcharge: Decimal;

  // ── Step 6: Health & Education Cess ────────────────────────
  cessRate: Decimal;
  cessAmount: Decimal;

  // ── Final Output ───────────────────────────────────────────
  totalTaxLiability: Decimal;
  /** (Total Tax / Gross Total Income) × 100 */
  effectiveTaxRate: Decimal;

  // ── Metadata & Audit ───────────────────────────────────────
  computedAt: string;
  engineVersion: string;
  warnings: string[];
  computationNotes: ComputationNote[];
  calculationSheet: RegimeCalculationSheet;
}

export interface SlabStepAudit {
  slabRange: string;
  ratePercentage: number;
  taxableAmountInSlab: number;
  taxGenerated: number;
}

export interface SurchargeAudit {
  baseTaxAmount: number;
  appliedRate: number;
  grossSurcharge: number;
  marginalReliefSubtracted: number;
  netSurcharge: number;
}

export interface CessAudit {
  taxPlusSurcharge: number;
  ratePercentage: number;
  cessAmount: number;
}

export interface RegimeCalculationSheet {
  slabBreakdown: SlabStepAudit[];
  surchargeDetails: SurchargeAudit;
  cessDetails: CessAudit;
}

export interface ComputationNote {
  lineItem: string;
  applicableSection: string;
  regime: 'Old' | 'New' | 'Both';
  rationaleString: string;
  section: string;
  rationale: string;
}

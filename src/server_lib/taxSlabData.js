/**
 * taxSlabData.ts — Statutory tax slab tables, deduction limits, surcharge brackets,
 * and rebate thresholds for Indian Income Tax.
 *
 * Target: FY 2025-26 (AY 2026-27) per Finance Act 2025 (Budget 2025)
 *         FY 2026-27 (AY 2027-28) — same rates assumed until next Finance Act
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANT: All monetary values are in ₹ (Indian Rupees).          │
 * │ Rates are percentages (e.g., 5 = 5%).                             │
 * │ Infinity is used for the upper limit of the highest slab.         │
 * └─────────────────────────────────────────────────────────────────────┘
 */
import { RegimeType, AgeCategory, } from './incomeTaxTypes.ts';
// ═══════════════════════════════════════════════════════════════════
// TAX SLAB TABLES
// ═══════════════════════════════════════════════════════════════════
let ruleId = 0;
function makeRule(regime, age, lower, upper, rate, fy) {
    ruleId++;
    return {
        id: `SLAB_${ruleId}`,
        regime_type: regime,
        age_category: age,
        lower_limit: lower,
        upper_limit: upper,
        rate_percent: rate,
        financial_year: fy,
    };
}
/**
 * Generate all tax bracket rules for a given financial year.
 *
 * NEW REGIME (Section 115BAC) — FY 2025-26 per Finance Act 2025:
 *   ₹0 – ₹4,00,000          → 0%
 *   ₹4,00,001 – ₹8,00,000   → 5%
 *   ₹8,00,001 – ₹12,00,000  → 10%
 *   ₹12,00,001 – ₹16,00,000 → 15%
 *   ₹16,00,001 – ₹20,00,000 → 20%
 *   ₹20,00,001 – ₹24,00,000 → 25%
 *   ₹24,00,001+              → 30%
 *   (Age-independent; basic exemption ₹4L applies to all)
 *
 * OLD REGIME — Unchanged from FY 2023-24:
 *   Normal (< 60):
 *     ₹0 – ₹2,50,000         → 0%
 *     ₹2,50,001 – ₹5,00,000  → 5%
 *     ₹5,00,001 – ₹10,00,000 → 20%
 *     ₹10,00,001+             → 30%
 *
 *   Senior (60-79):
 *     ₹0 – ₹3,00,000         → 0%
 *     ₹3,00,001 – ₹5,00,000  → 5%
 *     ₹5,00,001 – ₹10,00,000 → 20%
 *     ₹10,00,001+             → 30%
 *
 *   Super Senior (80+):
 *     ₹0 – ₹5,00,000         → 0%
 *     ₹5,00,001 – ₹10,00,000 → 20%
 *     ₹10,00,001+             → 30%
 */
export function getAllTaxBracketRules(fy) {
    ruleId = 0; // Reset for idempotency
    const rules = [];
    // ── NEW REGIME (115BAC) — Age-independent ──────────────────
    // All age categories get the same slabs under new regime
    for (const age of [AgeCategory.NORMAL, AgeCategory.SENIOR, AgeCategory.SUPER_SENIOR]) {
        rules.push(makeRule(RegimeType.NEW, age, 0, 400000, 0, fy), makeRule(RegimeType.NEW, age, 400001, 800000, 5, fy), makeRule(RegimeType.NEW, age, 800001, 1200000, 10, fy), makeRule(RegimeType.NEW, age, 1200001, 1600000, 15, fy), makeRule(RegimeType.NEW, age, 1600001, 2000000, 20, fy), makeRule(RegimeType.NEW, age, 2000001, 2400000, 25, fy), makeRule(RegimeType.NEW, age, 2400001, Infinity, 30, fy));
    }
    // ── OLD REGIME — Normal (< 60) ────────────────────────────
    rules.push(makeRule(RegimeType.OLD, AgeCategory.NORMAL, 0, 250000, 0, fy), makeRule(RegimeType.OLD, AgeCategory.NORMAL, 250001, 500000, 5, fy), makeRule(RegimeType.OLD, AgeCategory.NORMAL, 500001, 1000000, 20, fy), makeRule(RegimeType.OLD, AgeCategory.NORMAL, 1000001, Infinity, 30, fy));
    // ── OLD REGIME — Senior (60-79) ───────────────────────────
    rules.push(makeRule(RegimeType.OLD, AgeCategory.SENIOR, 0, 300000, 0, fy), makeRule(RegimeType.OLD, AgeCategory.SENIOR, 300001, 500000, 5, fy), makeRule(RegimeType.OLD, AgeCategory.SENIOR, 500001, 1000000, 20, fy), makeRule(RegimeType.OLD, AgeCategory.SENIOR, 1000001, Infinity, 30, fy));
    // ── OLD REGIME — Super Senior (80+) ───────────────────────
    rules.push(makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 0, 500000, 0, fy), makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 500001, 1000000, 20, fy), makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 1000001, Infinity, 30, fy));
    return rules;
}
/**
 * All statutory deduction limits for FY 2025-26.
 *
 * Under NEW REGIME (115BAC):
 *   - Only Standard Deduction (16ia) ₹75,000 and 80CCD(2) employer NPS allowed
 *   - All others are disallowed
 *
 * Under OLD REGIME:
 *   - Full Chapter VI-A deductions apply
 */
export const DEDUCTION_LIMITS = [
    // ── Standard Deduction from Salary (Sec 16(ia)) ──────────
    {
        sectionCode: '16ia',
        maxLimit: 75000,
        description: 'Standard Deduction from Salary Income',
        allowedInNewRegime: true,
        aggregateGroup: null,
    },
    // ── Section 80C / 80CCC / 80CCD(1) — Aggregate cap ₹1.5L ─
    {
        sectionCode: '80C',
        maxLimit: 150000,
        description: 'Life Insurance, PPF, ELSS, Tuition Fees, etc.',
        allowedInNewRegime: false,
        aggregateGroup: '80C_AGGREGATE',
    },
    {
        sectionCode: '80CCC',
        maxLimit: 150000,
        description: 'Pension Fund Contribution',
        allowedInNewRegime: false,
        aggregateGroup: '80C_AGGREGATE',
    },
    {
        sectionCode: '80CCD1',
        maxLimit: 150000,
        description: 'Employee NPS Contribution (own, within 80C limit)',
        allowedInNewRegime: false,
        aggregateGroup: '80C_AGGREGATE',
    },
    // ── Section 80CCD(1B) — Additional NPS ₹50,000 ───────────
    {
        sectionCode: '80CCD1B',
        maxLimit: 50000,
        description: 'Additional NPS Contribution (over 80C limit)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80CCD(2) — Employer NPS (no cap, 14% of salary) ─
    {
        sectionCode: '80CCD2',
        maxLimit: Infinity,
        description: 'Employer NPS Contribution (up to 14% of salary)',
        allowedInNewRegime: true, // ✅ Allowed in New Regime
        aggregateGroup: null,
    },
    // ── Section 80D — Medical Insurance ───────────────────────
    {
        sectionCode: '80D',
        maxLimit: 100000,
        description: 'Medical Insurance Premium (self + family + parents)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80DD — Disabled Dependent ─────────────────────
    {
        sectionCode: '80DD',
        maxLimit: 125000,
        description: 'Maintenance of Disabled Dependent (₹75K/₹1.25L)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80DDB — Medical Treatment ─────────────────────
    {
        sectionCode: '80DDB',
        maxLimit: 100000,
        description: 'Medical Treatment of Specified Diseases',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80E — Education Loan Interest ─────────────────
    {
        sectionCode: '80E',
        maxLimit: Infinity,
        description: 'Interest on Education Loan (no cap, 8 AYs)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80EEA — Interest on Housing Loan (Affordable) ─
    {
        sectionCode: '80EEA',
        maxLimit: 150000,
        description: 'Interest on Housing Loan for Affordable Housing',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80G — Donations ───────────────────────────────
    {
        sectionCode: '80G',
        maxLimit: Infinity,
        description: 'Donations to Charitable Institutions (various limits)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80GG — Rent Paid (no HRA) ─────────────────────
    {
        sectionCode: '80GG',
        maxLimit: 60000,
        description: 'Rent Paid (when no HRA received) — ₹5,000/month',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80TTA — Savings Interest (non-senior) ─────────
    {
        sectionCode: '80TTA',
        maxLimit: 10000,
        description: 'Interest on Savings Account (non-senior citizens)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80TTB — Interest Income (senior citizens) ─────
    {
        sectionCode: '80TTB',
        maxLimit: 50000,
        description: 'Interest on Deposits (senior citizens only)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 80U — Person with Disability ──────────────────
    {
        sectionCode: '80U',
        maxLimit: 125000,
        description: 'Person with Disability (₹75K/₹1.25L)',
        allowedInNewRegime: false,
        aggregateGroup: null,
    },
    // ── Section 24(b) — Interest on Housing Loan (Self-Occupied) ─
    {
        sectionCode: '24b',
        maxLimit: 200000,
        description: 'Interest on Housing Loan for Self-Occupied Property',
        allowedInNewRegime: false, // ❌ NOT allowed in New Regime
        aggregateGroup: null,
    },
];
/**
 * Get the deduction limit config for a given section code.
 */
export function getDeductionLimit(sectionCode) {
    return DEDUCTION_LIMITS.find(d => d.sectionCode === sectionCode);
}
/**
 * Surcharge brackets for OLD REGIME (FY 2025-26):
 *   > ₹50L        → 10%
 *   > ₹1Cr        → 15%
 *   > ₹2Cr        → 25%
 *   > ₹5Cr        → 37%
 *
 * Note: For income > ₹5Cr, the effective surcharge is 37%.
 */
export const SURCHARGE_BRACKETS_OLD = [
    { incomeThreshold: 5_00_00_000, rate: 37 },
    { incomeThreshold: 2_00_00_000, rate: 25 },
    { incomeThreshold: 1_00_00_000, rate: 15 },
    { incomeThreshold: 50_00_000, rate: 10 },
];
/**
 * Surcharge brackets for NEW REGIME (FY 2025-26):
 *   > ₹50L   → 10%
 *   > ₹1Cr   → 15%
 *   > ₹2Cr   → 25%
 *
 * However, per Section 115BAC, surcharge is CAPPED at 25%.
 * In practice, the maximum effective surcharge rate is 25%.
 */
export const SURCHARGE_BRACKETS_NEW = [
    { incomeThreshold: 2_00_00_000, rate: 25 },
    { incomeThreshold: 1_00_00_000, rate: 15 },
    { incomeThreshold: 50_00_000, rate: 10 },
];
/**
 * Maximum surcharge rate on Special Rate Incomes (111A, 112A, Dividend).
 * Even if the taxpayer's total income places them in a higher bracket,
 * surcharge on these incomes cannot exceed 15%.
 */
export const SPECIAL_INCOME_SURCHARGE_CAP = 15;
/**
 * Rebate u/s 87A — FY 2025-26:
 *
 * NEW REGIME:
 *   If total taxable income ≤ ₹12,00,000 → Rebate up to ₹60,000
 *   (Effectively makes income up to ₹12L tax-free)
 *   Marginal relief applies: if income slightly exceeds ₹12L,
 *   tax cannot exceed (income − ₹12,00,000)
 *
 * OLD REGIME:
 *   If total taxable income ≤ ₹5,00,000 → Rebate up to ₹12,500
 *
 * CRITICAL: Rebate 87A CANNOT be adjusted against tax on LTCG u/s 112A.
 */
export const REBATE_87A_NEW = {
    incomeThreshold: 12_00_000,
    maxRebate: 60_000,
};
export const REBATE_87A_OLD = {
    incomeThreshold: 5_00_000,
    maxRebate: 12_500,
};
// ═══════════════════════════════════════════════════════════════════
// SPECIAL INCOME TAX RATES — FY 2025-26
// ═══════════════════════════════════════════════════════════════════
/**
 * Special income tax rates per Finance Act 2025:
 *
 * STCG u/s 111A:     20% (increased from 15% in Budget 2024, applicable from FY 2024-25)
 * LTCG u/s 112A:     12.5% on amount exceeding ₹1,25,000
 * LTCG u/s 112:      12.5% (indexation abolished for post-23-Jul-2024 assets)
 * Casual Income:     30% flat (no exemption, no deductions)
 */
export const SPECIAL_RATES = {
    /** STCG u/s 111A — 20% from FY 2024-25 onward (Budget 2024) */
    STCG_111A: 20,
    /** LTCG u/s 112A — 12.5% on amount exceeding exemption */
    LTCG_112A: 12.5,
    /** LTCG u/s 112A exemption threshold */
    LTCG_112A_EXEMPTION: 1_25_000,
    /** LTCG u/s 112 — 12.5% (without indexation, FY 2025-26 default) */
    LTCG_112_WITHOUT_INDEXATION: 12.5,
    /** LTCG u/s 112 — 20% (with indexation, only for pre-23-Jul-2024 assets) */
    LTCG_112_WITH_INDEXATION: 20,
    /** Casual Income (Lottery, Crypto u/s 115BBH, Game Shows) — 30% flat */
    CASUAL_INCOME: 30,
};
// ═══════════════════════════════════════════════════════════════════
// CESS RATE
// ═══════════════════════════════════════════════════════════════════
/** Health and Education Cess — 4% on (Tax + Surcharge) */
export const HEC_RATE = 4;
// ═══════════════════════════════════════════════════════════════════
// AGGREGATE DEDUCTION CAPS
// ═══════════════════════════════════════════════════════════════════
/**
 * Aggregate caps for grouped deductions.
 * 80C + 80CCC + 80CCD(1) together cannot exceed ₹1,50,000.
 */
export const AGGREGATE_CAPS = {
    '80C_AGGREGATE': 1_50_000,
};

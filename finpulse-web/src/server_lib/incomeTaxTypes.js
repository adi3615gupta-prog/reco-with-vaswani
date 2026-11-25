/**
 * incomeTaxTypes.ts — All database model interfaces, enums, and type definitions
 * for the Indian Income Tax Liability Calculation Engine.
 *
 * These types map to the conceptual database models and serve as the
 * contract between the data layer (SQLite) and the computation engine.
 *
 * Target: FY 2025-26 (AY 2026-27) / FY 2026-27 (AY 2027-28)
 */
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
};
export const RegimeType = {
    OLD: 'OLD',
    NEW: 'NEW',
};
export const AgeCategory = {
    NORMAL: 'NORMAL',
    SENIOR: 'SENIOR',
    SUPER_SENIOR: 'SUPER_SENIOR',
};

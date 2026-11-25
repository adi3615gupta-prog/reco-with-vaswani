import { describe, it, expect } from 'vitest';
import {
  normalizeFy,
  parseFyYears,
  createEmptyMonthData,
  createEmptyAnnualWorking,
  recalculateAnnualWorking,
  GSTR3B_MONTHS
} from '../lib/gstr3bEngine';

describe('GSTR-3B Financial Year and Month Selection Engine', () => {
  it('normalizes various FY string formats into YYYY-YY', () => {
    expect(normalizeFy('2024-25')).toBe('2024-25');
    expect(normalizeFy('2024-2025')).toBe('2024-25');
    expect(normalizeFy('2024 25')).toBe('2024-25');
    expect(normalizeFy('2025/26')).toBe('2025-26');
    expect(normalizeFy('2026-27')).toBe('2026-27');
  });

  it('correctly parses start and end calendar years for financial years', () => {
    const fy2425 = parseFyYears('2024-25');
    expect(fy2425.startYear).toBe('2024');
    expect(fy2425.endYear).toBe('2025');
    expect(fy2425.startYearShort).toBe('24');
    expect(fy2425.endYearShort).toBe('25');

    const fy2526 = parseFyYears('2025-26');
    expect(fy2526.startYear).toBe('2025');
    expect(fy2526.endYear).toBe('2026');

    // 4-digit input tolerance
    const fyLong = parseFyYears('2024-2025');
    expect(fyLong.startYear).toBe('2024');
    expect(fyLong.endYear).toBe('2025');
  });

  it('creates empty month data with correct calendar year and month index', () => {
    const apr24 = createEmptyMonthData('April', '2024-25');
    expect(apr24.month).toBe('April');
    expect(apr24.year).toBe('2024');
    expect(apr24.calendarMonthIndex).toBe(4);

    const dec24 = createEmptyMonthData('December', '2024-25');
    expect(dec24.month).toBe('December');
    expect(dec24.year).toBe('2024');
    expect(dec24.calendarMonthIndex).toBe(12);

    const jan25 = createEmptyMonthData('January', '2024-25');
    expect(jan25.month).toBe('January');
    expect(jan25.year).toBe('2025');
    expect(jan25.calendarMonthIndex).toBe(1);

    const mar25 = createEmptyMonthData('March', '2024-25');
    expect(mar25.month).toBe('March');
    expect(mar25.year).toBe('2025');
    expect(mar25.calendarMonthIndex).toBe(3);
  });

  it('creates empty annual working with synchronized calendar years across all 12 months', () => {
    const annual = createEmptyAnnualWorking({
      firmName: 'TEST CLIENT',
      gstin: '27AABCU9603R1ZM',
      financialYear: '2024-25'
    });

    expect(annual.profile.financialYear).toBe('2024-25');

    // April to December should be 2024
    ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].forEach(m => {
      expect(annual.months[m as any].year).toBe('2024');
      expect(annual.months[m as any].month).toBe(m);
    });

    // January to March should be 2025
    ['January', 'February', 'March'].forEach(m => {
      expect(annual.months[m as any].year).toBe('2025');
      expect(annual.months[m as any].month).toBe(m);
    });
  });

  it('recalculateAnnualWorking auto-syncs mismatched or stale month years to match the profile financialYear', () => {
    const staleData = createEmptyAnnualWorking({
      firmName: 'TEST CLIENT',
      gstin: '27AABCU9603R1ZM',
      financialYear: '2025-26'
    });

    // Artificially change the financial year to 2023-24 without touching months
    staleData.profile.financialYear = '2023-24';
    expect(staleData.months.April.year).toBe('2025'); // Stale

    // Recalculate
    const fixed = recalculateAnnualWorking(staleData);
    expect(fixed.profile.financialYear).toBe('2023-24');
    expect(fixed.months.April.year).toBe('2023');
    expect(fixed.months.December.year).toBe('2023');
    expect(fixed.months.January.year).toBe('2024');
    expect(fixed.months.March.year).toBe('2024');
  });

  it('correctly calculates Total ITC Available from Total 2B Inward (minus RCM) with Reversals, Debit Notes, and RCM adjustments', () => {
    const annual = createEmptyAnnualWorking({
      firmName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
      gstin: '27AAGCD4105L1ZO',
      financialYear: '2026-27'
    });

    const sep = annual.months.September;

    // Row 33: ITC as per GSTR 2B (Total 2B ITC minus RCM)
    // Reference: Taxable 63,56,996.75, CGST 4,24,030.14, SGST 4,24,030.14, IGST 1,13,124.55, Total 9,61,184.83
    sep.inward.itc2b = {
      taxable: 6356996.75,
      cgst: 424030.14,
      sgst: 424030.14,
      igst: 113124.55,
      total: 961184.83
    };

    // Row 35: (+) RCM Paid on Inward Supplies (kept strictly separate)
    sep.inward.rcmPaid = {
      taxable: 76310.00,
      cgst: 5183.76,
      sgst: 5183.76,
      igst: 0,
      total: 10367.52
    };

    // Row 38: (-) Debit Notes
    sep.inward.debitNotes = {
      taxable: 13800.00,
      cgst: 864.00,
      sgst: 864.00,
      igst: 0,
      total: 1728.00
    };

    // Row 39: (-) ITC Reversed on Ineligible credit Rule 38/42/43/17(5)
    sep.inward.itcReversed = {
      taxable: 20897.58,
      cgst: 1880.79,
      sgst: 1880.79,
      igst: 0,
      total: 3761.58
    };

    const recalculated = recalculateAnnualWorking(annual);
    const resultInw = recalculated.months.September.inward;

    // Total ITC Available for Set off = Total 2B + RCM - Debit Notes - Reversals
    // Taxable: 63,56,996.75 + 76,310.00 - 13,800.00 - 20,897.58 = 63,98,609.17
    expect(resultInw.totalItcAvailable.taxable).toBe(6398609.17);

    // CGST: 4,24,030.14 + 5,183.76 - 864.00 - 1,880.79 = 4,26,469.11
    expect(resultInw.totalItcAvailable.cgst).toBe(426469.11);

    // SGST: 4,24,030.14 + 5,183.76 - 864.00 - 1,880.79 = 4,26,469.11
    expect(resultInw.totalItcAvailable.sgst).toBe(426469.11);

    // IGST: 1,13,124.55
    expect(resultInw.totalItcAvailable.igst).toBe(113124.55);

    // Total Tax Available: 4,26,469.11 + 4,26,469.11 + 1,13,124.55 = 9,66,062.77
    expect(resultInw.totalItcAvailable.total).toBe(966062.77);
  });
});

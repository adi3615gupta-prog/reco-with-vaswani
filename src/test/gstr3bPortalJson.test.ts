import { describe, it, expect } from 'vitest';
import { generateGstr3bPortalJson, createEmptyMonthData, recalculateMonthData } from '../lib/gstr3bEngine';

describe('GSTR-3B Portal Upload JSON Schema Mapping', () => {
  it('maps ineligible ITC reversal to Table 4(B)(1) permanent reversal (ty: RUL)', () => {
    const monthData = createEmptyMonthData('September', '2026-27');
    monthData.inward.itcReversed = {
      taxable: 20897.58,
      cgst: 1880.79,
      sgst: 1880.79,
      igst: 0,
      total: 3761.58
    };

    const profile = {
      firmName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
      gstin: '27AAGCD4105L1ZO',
      address: 'Pune',
      contact: '9373911379',
      financialYear: '2026-27'
    };

    const jsonStr = generateGstr3bPortalJson(monthData, profile);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.itc_elg).toBeDefined();
    expect(parsed.itc_elg.itc_rev).toBeDefined();

    const rulReversal = parsed.itc_elg.itc_rev.find((x: any) => x.ty === 'RUL');
    const othReversal = parsed.itc_elg.itc_rev.find((x: any) => x.ty === 'OTH');

    expect(rulReversal).toBeDefined();
    expect(rulReversal.camt).toBe(1880.79);
    expect(rulReversal.samt).toBe(1880.79);
    expect(rulReversal.iamt).toBe(0);

    expect(othReversal).toBeDefined();
    expect(othReversal.camt).toBe(0);
    expect(othReversal.samt).toBe(0);
    expect(othReversal.iamt).toBe(0);
  });

  it('correctly maps both Table 4(B)(1) Permanent and Table 4(B)(2) Temporary Reversals', () => {
    const monthData = createEmptyMonthData('September', '2026-27');
    monthData.inward.itc2b = { taxable: 100000, cgst: 9000, sgst: 9000, igst: 0, total: 18000 };
    
    // Permanent Reversal 4(B)(1)
    monthData.inward.itcReversed = {
      taxable: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      total: 1800
    };

    // Temporary Reversal 4(B)(2) (Rule 37 / 180 Days)
    monthData.inward.itcReversedOther = {
      taxable: 5000,
      cgst: 450,
      sgst: 450,
      igst: 0,
      total: 900
    };

    const profile = {
      firmName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
      gstin: '27AAGCD4105L1ZO',
      address: 'Pune',
      contact: '9373911379',
      financialYear: '2026-27'
    };

    const recalculated = recalculateMonthData(monthData);
    // Net ITC should be: 9000 - 900 - 450 = 7650
    expect(recalculated.inward.totalItcAvailable.cgst).toBe(7650);
    expect(recalculated.inward.totalItcAvailable.sgst).toBe(7650);

    const jsonStr = generateGstr3bPortalJson(recalculated, profile);
    const parsed = JSON.parse(jsonStr);

    const rul = parsed.itc_elg.itc_rev.find((x: any) => x.ty === 'RUL');
    const oth = parsed.itc_elg.itc_rev.find((x: any) => x.ty === 'OTH');

    expect(rul.camt).toBe(900);
    expect(rul.samt).toBe(900);
    expect(oth.camt).toBe(450);
    expect(oth.samt).toBe(450);
  });
});

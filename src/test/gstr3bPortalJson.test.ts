import { describe, it, expect } from 'vitest';
import { generateGstr3bPortalJson, createEmptyMonthData } from '../lib/gstr3bEngine';

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
});

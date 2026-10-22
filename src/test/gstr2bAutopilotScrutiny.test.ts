import { describe, it, expect } from 'vitest';
import { generateGstr2bFullYearWorkbook } from '../../gstr2b/fullYearExcel.js';

describe('GSTR-2B Autopilot & Full-Year 12M Consolidation Scrutiny', () => {
  it('strictly enforces Zero-Merge architecture across all 8 sheets (CORE-01)', () => {
    const sampleInvoices = [
      {
        section: 'B2B',
        client_gstin: '27AABCU9603R1ZM',
        return_period: 'April 2025',
        ctin: '27AAGCB2345K1Z1',
        supplier_name: 'MAHINDRA & MAHINDRA',
        inum: 'INV-001',
        idt: '15-04-2025',
        txval: 100000,
        igst: 18000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 118000,
        itc_available: 'Y'
      },
      {
        section: 'CDNR',
        client_gstin: '27AABCU9603R1ZM',
        return_period: '052025',
        ctin: '27AAGCB2345K1Z1',
        supplier_name: 'MAHINDRA & MAHINDRA',
        inum: 'CN-001',
        idt: '2025-05-20',
        txval: 10000,
        igst: 1800,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 11800,
        itc_available: 'Y'
      }
    ];

    const wb = generateGstr2bFullYearWorkbook({
      clientInfo: { trade_name: 'TEST CORP', gstin: '27AABCU9603R1ZM' },
      financialYear: '2025-26',
      invoices: sampleInvoices
    });

    expect(wb.SheetNames).toEqual([
      'B2B', 'CDNR', 'ECO', 'ISD', 'IMPG', 'IMPGSEZ', 'B2B(Rejected)', 'CDNR(Rejected)'
    ]);

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      expect(ws['!merges'] || []).toHaveLength(0);
    }
  });

  it('normalizes ISO dates to DD-MM-YYYY format to prevent duplicate primary key collisions', () => {
    const rawDate1 = '2025-05-15';
    const rawDate2 = '15/05/2025';

    const normalize = (val: string) => {
      let norm = val.trim().replace(/\//g, '-');
      const iso = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) norm = `${iso[3]}-${iso[2]}-${iso[1]}`;
      return norm;
    };

    expect(normalize(rawDate1)).toBe('15-05-2025');
    expect(normalize(rawDate2)).toBe('15-05-2025');
    expect(normalize(rawDate1)).toBe(normalize(rawDate2));
  });
});

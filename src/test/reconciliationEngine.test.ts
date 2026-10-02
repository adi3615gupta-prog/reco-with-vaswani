import { describe, it, expect } from 'vitest';
import { reconcile, extractCoreInvoiceNumber, type InvoiceRecord } from '../lib/reconciliation';

describe('GST Purchase Reconciliation Engine - Advanced Matching', () => {
  it('should extract core invoice numbers correctly stripping prefixes, FY tokens, and leading zeros', () => {
    expect(extractCoreInvoiceNumber('BILL-2024-0012')).toBe('12');
    expect(extractCoreInvoiceNumber('INV/24-25/0099')).toBe('99');
    expect(extractCoreInvoiceNumber('GST-2024-05')).toBe('5');
    expect(extractCoreInvoiceNumber('0045')).toBe('45');
    expect(extractCoreInvoiceNumber('AB-1234')).toBe('1234');
  });

  it('should match invoices with prefix/FY differences using core invoice fuzzy matching', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'ABC ENTERPRISES',
        gstin: '27AAAAA0000A1Z5',
        invoiceNo: 'BILL-2024-0012',
        invoiceDate: '2024-05-10',
        igst: 0,
        cgst: 900,
        sgst: 900,
        source: 'PR'
      }
    ];

    const twoBRecords: InvoiceRecord[] = [
      {
        supplierName: 'ABC ENTERPRISES',
        gstin: '27AAAAA0000A1Z5',
        invoiceNo: '12',
        invoiceDate: '2024-05-10',
        igst: 0,
        cgst: 900,
        sgst: 900,
        source: '2B'
      }
    ];

    const results = reconcile(prRecords, twoBRecords, 'input');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Perfect Match');
    expect(results[0].prRecord?.invoiceNo).toBe('BILL-2024-0012');
    expect(results[0].twoBRecord?.invoiceNo).toBe('12');
  });

  it('should link candidate invoices from the same supplier under Value Mismatch when invoice numbers match or core match', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'XYZ PRIVATE LIMITED',
        gstin: '27BBBBB1111B1Z2',
        invoiceNo: 'PUR-101',
        invoiceDate: '2024-06-15',
        igst: 5000,
        cgst: 0,
        sgst: 0,
        source: 'PR'
      }
    ];

    const twoBRecords: InvoiceRecord[] = [
      {
        supplierName: 'XYZ PRIVATE LIMITED',
        gstin: '27BBBBB1111B1Z2',
        invoiceNo: 'XYZ/2024/101',
        invoiceDate: '2024-06-15',
        igst: 5200, // Value mismatch: 5000 vs 5200
        cgst: 0,
        sgst: 0,
        source: '2B'
      }
    ];

    const results = reconcile(prRecords, twoBRecords, 'input');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Value Mismatch');
    expect(results[0].igstDiff).toBe(-200);
    expect(results[0].prRecord).toBeDefined();
    expect(results[0].twoBRecord).toBeDefined();
  });

  it('should NOT pair completely different invoice numbers into Value Mismatch', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'JAGDAMBA SERVICES',
        gstin: '27CSCPD9345R1Z2',
        invoiceNo: '1381',
        invoiceDate: '2025-06-24',
        igst: 0,
        cgst: 1850,
        sgst: 1850,
        source: 'PR'
      }
    ];

    const twoBRecords: InvoiceRecord[] = [
      {
        supplierName: 'JAGDAMBA SERVICES',
        gstin: '27CSCPD9345R1Z2',
        invoiceNo: '2161',
        invoiceDate: '2025-06-23',
        igst: 0,
        cgst: 2160,
        sgst: 2160,
        source: '2B'
      }
    ];

    const results = reconcile(prRecords, twoBRecords, 'input');
    expect(results).toHaveLength(2);

    const notIn2B = results.find(r => r.status === 'Not in 2B');
    const notInBooks = results.find(r => r.status === 'Not in Books');

    expect(notIn2B).toBeDefined();
    expect(notIn2B?.prRecord?.invoiceNo).toBe('1381');

    expect(notInBooks).toBeDefined();
    expect(notInBooks?.twoBRecord?.invoiceNo).toBe('2161');
  });

  it('should NOT pair WINDAIR GAS SOLUTIONS or NANEKAR EARTHMOVERS differing invoice numbers', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'WINDAIR GAS SOLUTIONS LLP',
        gstin: '27ABEFP0941L1Z2',
        invoiceNo: '1553/2025-26',
        invoiceDate: '2025-07-09',
        igst: 0, cgst: 1000, sgst: 1000, source: 'PR'
      },
      {
        supplierName: 'NANEKAR EARTHMOVERS',
        gstin: '27AABFN1234A1Z1',
        invoiceNo: '17/2025/26',
        invoiceDate: '2025-09-08',
        igst: 0, cgst: 500, sgst: 500, source: 'PR'
      }
    ];

    const twoBRecords: InvoiceRecord[] = [
      {
        supplierName: 'WINDAIR GAS SOLUTIONS LLP',
        gstin: '27ABEFP0941L1Z2',
        invoiceNo: '45/2025-26',
        invoiceDate: '2025-04-03',
        igst: 0, cgst: 1000, sgst: 1000, source: '2B'
      },
      {
        supplierName: 'NANEKAR EARTHMOVERS',
        gstin: '27AABFN1234A1Z1',
        invoiceNo: '30/2025/26',
        invoiceDate: '2025-12-21',
        igst: 0, cgst: 500, sgst: 500, source: '2B'
      }
    ];

    const results = reconcile(prRecords, twoBRecords, 'input');
    expect(results).toHaveLength(4);
    const valueMismatch = results.filter(r => r.status === 'Value Mismatch' || r.status === 'Matched (Diff Date)');
    expect(valueMismatch).toHaveLength(0);

    const windairPR = results.find(r => r.prRecord?.invoiceNo === '1553/2025-26');
    const windair2B = results.find(r => r.twoBRecord?.invoiceNo === '45/2025-26');
    expect(windairPR?.remark).toContain('Note: Party Net Balance is Nil');
    expect(windair2B?.remark).toContain('Note: Party Net Balance is Nil');

    const nanekarPR = results.find(r => r.prRecord?.invoiceNo === '17/2025/26');
    const nanekar2B = results.find(r => r.twoBRecord?.invoiceNo === '30/2025/26');
    expect(nanekarPR?.remark).toContain('Note: Party Net Balance is Nil');
    expect(nanekar2B?.remark).toContain('Note: Party Net Balance is Nil');
  });
});

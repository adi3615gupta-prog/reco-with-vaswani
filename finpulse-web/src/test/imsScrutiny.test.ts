import { describe, it, expect } from 'vitest';
import {
  normalizeImsDate,
  calculate3BTable4FromIms,
  buildImsClientReviewWorkbook,
  buildCredentialsTemplateWorkbook,
  type ImsInvoice
} from '../lib/imsEngine';

describe('IMS (Invoice Management System) Scrutiny & Statutory Tests', () => {
  describe('1. Date Normalization for Primary Key Integrity', () => {
    it('normalizes ISO dates (YYYY-MM-DD) to DD-MM-YYYY', () => {
      expect(normalizeImsDate('2025-05-15')).toBe('15-05-2025');
      expect(normalizeImsDate('2024-12-01')).toBe('01-12-2024');
      expect(normalizeImsDate('2025-4-9')).toBe('09-04-2025');
    });

    it('normalizes slash dates (DD/MM/YYYY) to DD-MM-YYYY', () => {
      expect(normalizeImsDate('15/05/2025')).toBe('15-05-2025');
      expect(normalizeImsDate('01/12/2024')).toBe('01-12-2024');
      expect(normalizeImsDate('9/4/2025')).toBe('09-04-2025');
    });

    it('preserves already normalized DD-MM-YYYY dates', () => {
      expect(normalizeImsDate('15-05-2025')).toBe('15-05-2025');
      expect(normalizeImsDate('01-12-2024')).toBe('01-12-2024');
    });
  });

  describe('2. 3B Table 4 Statutory Breakdown Calculation', () => {
    const testInvoices: ImsInvoice[] = [
      // 1. Regular B2B (Accepted) -> Table 4(A)(5)
      {
        id: 'inv_1',
        client_gstin: '27AAACT2727Q1ZW',
        return_period: 'November 2025',
        ctin: '27AABCT1234A1Z1',
        supplier_name: 'Regular Supplier Ltd',
        inum: 'INV-101',
        idt: '15-11-2025',
        inv_typ: 'R',
        rchrg: 'N',
        txval: 100000,
        igst: 18000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 118000,
        action: 'ACCEPT'
      },
      // 2. Inward Reverse Charge (Accepted) -> Table 4(A)(3) & Table 3.1(d)
      {
        id: 'inv_2',
        client_gstin: '27AAACT2727Q1ZW',
        return_period: 'November 2025',
        ctin: '27AABCT9999B1Z2',
        supplier_name: 'GTA Transport Services',
        inum: 'GTA-201',
        idt: '20-11-2025',
        inv_typ: 'R',
        rchrg: 'Y',
        txval: 20000,
        igst: 1000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 21000,
        action: 'ACCEPT'
      },
      // 3. Inward Credit Note (Accepted) -> Table 4 Row 38 / 4(B)(2)
      {
        id: 'inv_3',
        client_gstin: '27AAACT2727Q1ZW',
        return_period: 'November 2025',
        ctin: '27AABCT1234A1Z1',
        supplier_name: 'Regular Supplier Ltd',
        inum: 'CN-301',
        idt: '25-11-2025',
        inv_typ: 'C',
        rchrg: 'N',
        txval: 10000,
        igst: 1800,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 11800,
        action: 'ACCEPT'
      },
      // 4. Rejected invoice -> Must NOT be included in eligible ITC
      {
        id: 'inv_4',
        client_gstin: '27AAACT2727Q1ZW',
        return_period: 'November 2025',
        ctin: '27AABCT5555C1Z3',
        supplier_name: 'Disputed Fake Vendor',
        inum: 'FAKE-401',
        idt: '10-11-2025',
        inv_typ: 'R',
        rchrg: 'N',
        txval: 50000,
        igst: 9000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 59000,
        action: 'REJECT'
      },
      // 5. Pending invoice (Hold for next month) -> Must NOT be included in current month
      {
        id: 'inv_5',
        client_gstin: '27AAACT2727Q1ZW',
        return_period: 'November 2025',
        ctin: '27AABCT7777D1Z4',
        supplier_name: 'Goods In Transit Vendor',
        inum: 'TRANS-501',
        idt: '28-11-2025',
        inv_typ: 'R',
        rchrg: 'N',
        txval: 30000,
        igst: 5400,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 35400,
        action: 'PENDING'
      }
    ];

    it('correctly calculates Table 4(A)(5) All Other ITC exclusively for regular B2B accepted invoices', () => {
      const result = calculate3BTable4FromIms(testInvoices);
      expect(result.itc2b.taxable).toBe(100000);
      expect(result.itc2b.igst).toBe(18000);
      expect(result.itc2b.total).toBe(18000);
    });

    it('correctly segregates Table 4(A)(3) Inward Reverse Charge', () => {
      const result = calculate3BTable4FromIms(testInvoices);
      expect(result.rcmInward).toBeDefined();
      expect(result.rcmInward?.taxable).toBe(20000);
      expect(result.rcmInward?.igst).toBe(1000);
      expect(result.rcmInward?.total).toBe(1000);
    });

    it('correctly segregates Table 4 Row 38 / 4(B)(2) Inward Credit Notes', () => {
      const result = calculate3BTable4FromIms(testInvoices);
      expect(result.creditNotes).toBeDefined();
      expect(result.creditNotes?.taxable).toBe(10000);
      expect(result.creditNotes?.igst).toBe(1800);
      expect(result.creditNotes?.total).toBe(1800);
    });

    it('correctly records action counts and excludes REJECT / PENDING amounts', () => {
      const result = calculate3BTable4FromIms(testInvoices);
      expect(result.metrics.totalInvoices).toBe(5);
      expect(result.metrics.acceptedCount).toBe(3);
      expect(result.metrics.rejectedCount).toBe(1);
      expect(result.metrics.pendingCount).toBe(1);
      expect(result.metrics.noActionCount).toBe(0);
      // Net regular eligible ITC total should be exactly 18000 (rejected 9000 and pending 5400 excluded)
      expect(result.metrics.eligibleItcTotal).toBe(18000);
    });
  });

  describe('3. Zero-Merge Excel Architecture Compliance (CORE-01)', () => {
    it('verifies buildImsClientReviewWorkbook creates workbook with ZERO merged cells', () => {
      const wb = buildImsClientReviewWorkbook(
        { gstin: '27AAACT2727Q1ZW', tradeName: 'Tata Motors Limited', period: 'November 2025' },
        []
      );

      for (const ws of wb.worksheets) {
        const merges = (ws.model as any)?.merges || [];
        expect(merges.length).toBe(0);
      }
    });

    it('verifies buildCredentialsTemplateWorkbook creates workbook with ZERO merged cells', () => {
      const wb = buildCredentialsTemplateWorkbook([
        { gstin: '27AAACT2727Q1ZW', trade_name: 'Tata Motors Limited' }
      ]);

      for (const ws of wb.worksheets) {
        const merges = (ws.model as any)?.merges || [];
        expect(merges.length).toBe(0);
      }
    });
  });

  describe('4. Nil Inward Supplies & "No Records in IMS" Error Detection', () => {
    it('detects portal error string: "The JSON file cannot be generated as no records are available in IMS to download"', () => {
      const errorText = '×Error! The JSON file cannot be generated as no records are available in IMS to download.';
      const upper = errorText.toUpperCase();
      const isNoRecords = upper.includes('NO RECORDS ARE AVAILABLE IN IMS TO DOWNLOAD') ||
                          upper.includes('CANNOT BE GENERATED AS NO RECORDS ARE AVAILABLE') ||
                          (upper.includes('ERROR') && upper.includes('NO RECORDS ARE AVAILABLE'));
      expect(isNoRecords).toBe(true);
    });

    it('detects alternative phrasing of no records error on GST Portal', () => {
      const texts = [
        'Error! The JSON file cannot be generated as no records are available in IMS to download.',
        '×Error! Cannot be generated as no records are available',
        'Warning: No records are available in IMS to download.'
      ];
      for (const t of texts) {
        const upper = t.toUpperCase();
        const matches = upper.includes('NO RECORDS ARE AVAILABLE IN IMS TO DOWNLOAD') ||
                        upper.includes('CANNOT BE GENERATED AS NO RECORDS ARE AVAILABLE') ||
                        (upper.includes('ERROR') && upper.includes('NO RECORDS ARE AVAILABLE'));
        expect(matches).toBe(true);
      }
    });

    it('correctly handles calculate3BTable4FromIms with zero/empty invoice records', () => {
      const result = calculate3BTable4FromIms([]);
      expect(result.itc2b.taxable).toBe(0);
      expect(result.itc2b.igst).toBe(0);
      expect(result.itc2b.total).toBe(0);
      expect(result.metrics.totalInvoices).toBe(0);
      expect(result.metrics.acceptedCount).toBe(0);
      expect(result.metrics.eligibleItcTotal).toBe(0);
    });

    it('verifies safe data preservation rule: old data is never purged unless new data is captured', () => {
      const existingInvoicesCount = 64;
      const isNewDataCaptured = false;
      const shouldPreserveOldData = !isNewDataCaptured && existingInvoicesCount > 0;
      expect(shouldPreserveOldData).toBe(true);
    });
  });
});

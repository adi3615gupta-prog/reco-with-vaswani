import { describe, it, expect } from 'vitest';
import {
  parseAccountingFloat,
  normalizeInvoiceNo,
  isGenericDn,
  isValidGstin,
  normalizeSupplierName,
  buildTwoBSupplierIndex,
  resolveEffectiveGstin,
  reconcileDebitNotes,
  findSubsetSumMatch,
} from '../lib/debitNoteEngine';

describe('debitNoteEngine - Normalization & Parsing Utilities', () => {
  describe('parseAccountingFloat', () => {
    it('converts parenthesized negative accounting strings correctly', () => {
      expect(parseAccountingFloat('(45,04,490.90)')).toBe(-4504490.90);
      expect(parseAccountingFloat('(1,234.50)')).toBe(-1234.50);
      expect(parseAccountingFloat('( 500 )')).toBe(-500);
      expect(parseAccountingFloat('₹ (1,500.00)')).toBe(-1500.00);
    });

    it('converts explicit negative prefix strings', () => {
      expect(parseAccountingFloat('-45,04,490.90')).toBe(-4504490.90);
      expect(parseAccountingFloat('-123.45')).toBe(-123.45);
    });

    it('converts positive numbers with Indian comma notation', () => {
      expect(parseAccountingFloat('45,04,490.90')).toBe(4504490.90);
      expect(parseAccountingFloat('1,23,456.78')).toBe(123456.78);
      expect(parseAccountingFloat('₹ 1,500.00')).toBe(1500.00);
    });

    it('converts numeric values as-is', () => {
      expect(parseAccountingFloat(4504490.90)).toBe(4504490.90);
      expect(parseAccountingFloat(-1234.5)).toBe(-1234.5);
    });

    it('converts zero, blank, dashes, and placeholder strings to 0.0', () => {
      expect(parseAccountingFloat(null)).toBe(0.0);
      expect(parseAccountingFloat(undefined)).toBe(0.0);
      expect(parseAccountingFloat(NaN)).toBe(0.0);
      expect(parseAccountingFloat('')).toBe(0.0);
      expect(parseAccountingFloat('   ')).toBe(0.0);
      expect(parseAccountingFloat('-')).toBe(0.0);
      expect(parseAccountingFloat('--')).toBe(0.0);
      expect(parseAccountingFloat('N/A')).toBe(0.0);
      expect(parseAccountingFloat('Nil')).toBe(0.0);
      expect(parseAccountingFloat('NIL')).toBe(0.0);
      expect(parseAccountingFloat('null')).toBe(0.0);
      expect(parseAccountingFloat('undefined')).toBe(0.0);
    });
  });

  describe('normalizeInvoiceNo', () => {
    it('removes whitespace and converts to uppercase', () => {
      expect(normalizeInvoiceNo(' inv 101 ')).toBe('INV101');
      expect(normalizeInvoiceNo('GCN 23 FY26 001')).toBe('GCN23FY26001');
    });

    it('normalizes internal hyphens to slashes', () => {
      expect(normalizeInvoiceNo('GCN-23-FY26-001')).toBe('GCN/23/FY26/001');
      expect(normalizeInvoiceNo('INV-2024-99')).toBe('INV/2024/99');
    });

    it('strips regional fiscal year prefixes', () => {
      expect(normalizeInvoiceNo('MH-2526/1234')).toBe('1234');
      expect(normalizeInvoiceNo('MH-CN-2526-0025')).toBe('0025');
      expect(normalizeInvoiceNo('MH/25-26/044')).toBe('044');
      expect(normalizeInvoiceNo('MH2526/999')).toBe('999');
      expect(normalizeInvoiceNo('MH/2526/888')).toBe('888');
      expect(normalizeInvoiceNo('MH/25/26/777')).toBe('777');
      expect(normalizeInvoiceNo('MH-2526/0123')).toBe('0123');
    });

    it('handles null or undefined input gracefully', () => {
      expect(normalizeInvoiceNo(null)).toBe('');
      expect(normalizeInvoiceNo(undefined)).toBe('');
    });
  });

  describe('isGenericDn', () => {
    it('accurately flags placeholder voucher tokens', () => {
      expect(isGenericDn('')).toBe(true);
      expect(isGenericDn('DN')).toBe(true);
      expect(isGenericDn('dn')).toBe(true);
      expect(isGenericDn('CN')).toBe(true);
      expect(isGenericDn('cn')).toBe(true);
      expect(isGenericDn('DEBITNOTE')).toBe(true);
      expect(isGenericDn('Debit Note')).toBe(true);
      expect(isGenericDn('CREDITNOTE')).toBe(true);
      expect(isGenericDn('Credit Note')).toBe(true);
      expect(isGenericDn('BLANK')).toBe(true);
      expect(isGenericDn('DN(BLANK)')).toBe(true);
    });

    it('returns false for actual specific invoice or note numbers', () => {
      expect(isGenericDn('INV001')).toBe(false);
      expect(isGenericDn('0025')).toBe(false);
      expect(isGenericDn('1466468745')).toBe(false);
      expect(isGenericDn('GCN/23/FY26/001')).toBe(false);
      expect(isGenericDn('9015006303')).toBe(false);
    });
  });

  describe('Supplier Name Normalization & GSTIN Resolution', () => {
    it('isValidGstin identifies valid 15-character Indian GSTINs', () => {
      expect(isValidGstin('27AABCM8797N1ZI')).toBe(true);
      expect(isValidGstin('24AACCB1830G1Z9')).toBe(true);
      expect(isValidGstin('01/07/2017')).toBe(false); // corrupted date string
      expect(isValidGstin('2023-04-01')).toBe(false);
      expect(isValidGstin('')).toBe(false);
      expect(isValidGstin('INVALID')).toBe(false);
    });

    it('normalizeSupplierName standardizes corporate entity suffixes and known spelling variants', () => {
      expect(normalizeSupplierName('ISHAWAR AGRI SCIENCE PVT LTD')).toBe('ISHWARAGRISCIENCE');
      expect(normalizeSupplierName('ISHWAR AGRISCIENCE PRIVATE LIMITED')).toBe('ISHWARAGRISCIENCE');
      expect(normalizeSupplierName('INDOFILL INDUSTRIES LIMITED')).toBe('INDOFIL');
      expect(normalizeSupplierName('ADAMA INDIA PRIVATE LIMITED (Cr)')).toBe('ADAMA');
    });

    it('buildTwoBSupplierIndex maps unique 2B supplier names to valid GSTINs', () => {
      const sample2B = [
        {
          gstin: '27AABCM8797N1ZI',
          supplierName: 'ISHWAR AGRISCIENCE PRIVATE LIMITED',
        },
        {
          gstin: '27AABCA2857C1ZX',
          supplierName: 'ADAMA INDIA PRIVATE LIMITED',
        },
      ];

      const index = buildTwoBSupplierIndex(sample2B);
      expect(index.get('ISHWARAGRISCIENCE')).toBe('27AABCM8797N1ZI');
      expect(index.get('ADAMA')).toBe('27AABCA2857C1ZX');
    });

    it('resolveEffectiveGstin falls back to 2B vendor GSTIN when PR GSTIN is missing or corrupted', () => {
      const sample2B = [
        {
          gstin: '27AABCM8797N1ZI',
          supplierName: 'ISHWAR AGRISCIENCE PRIVATE LIMITED',
        },
      ];
      const supplierIndex = buildTwoBSupplierIndex(sample2B);

      // Valid GSTIN returns as-is
      expect(resolveEffectiveGstin('27AABCM8797N1ZI', 'Some Name', supplierIndex)).toBe('27AABCM8797N1ZI');

      // Biostadt cross-state alias maps 24 -> 27
      expect(resolveEffectiveGstin('24AACCB1830G1Z9', 'Biostadt India', supplierIndex)).toBe('27AACCB1830G1Z3');

      // Corrupted GSTIN with date '01/07/2017' resolves via supplier name fallback
      const resolved = resolveEffectiveGstin('01/07/2017', 'ISHAWAR AGRI SCIENCE PVT LTD', supplierIndex);
      expect(resolved).toBe('27AABCM8797N1ZI');

      // Missing GSTIN resolves via supplier name fallback
      const resolvedMissing = resolveEffectiveGstin('', 'ISHAWAR AGRI SCIENCE PVT LTD', supplierIndex);
      expect(resolvedMissing).toBe('27AABCM8797N1ZI');
    });
  });

  describe('Multi-Pass Waterfall Reconciliation & Batch Solver', () => {
    it('Pass 1 Composite Invoice Guardrail: skips 1-to-1 match when PR represents multi-note lump sum', () => {
      // PR invoice '1466468745' value is 1,60,032.22, which matches 2B '1466468745' (1,41,055.12) + 2B '1466468746' (18,977.10)
      const prRecords = [
        {
          voucherNo: 'VCH-001',
          invoiceNo: '1466468745',
          invoiceDate: '11/10/2025',
          taxableValue: 160032.22,
          cgst: 14402.90,
          sgst: 14402.90,
          igst: 0,
          invoiceValue: 188838.02,
          supplierName: 'UPL LIMITED',
          gstin: '27AAACU1234F1Z1',
        },
      ];

      const twoBRecords = [
        {
          invoiceNo: '1466468745',
          invoiceDate: '11/10/2025',
          taxableValue: 141055.12,
          cgst: 12694.96,
          sgst: 12694.96,
          igst: 0,
          invoiceValue: 166445.04,
          supplierName: 'UPL LIMITED',
          gstin: '27AAACU1234F1Z1',
          noteType: 'Credit',
          period: 'October 2025',
        },
        {
          invoiceNo: '1466468746',
          invoiceDate: '11/10/2025',
          taxableValue: 18977.10,
          cgst: 1707.94,
          sgst: 1707.94,
          igst: 0,
          invoiceValue: 22392.98,
          supplierName: 'UPL LIMITED',
          gstin: '27AAACU1234F1Z1',
          noteType: 'Credit',
          period: 'October 2025',
        },
      ];

      const result = reconcileDebitNotes(prRecords, twoBRecords);

      // Verify Pass 1 was skipped and both were matched as Consolidated Batch in Pass 3
      expect(result.reconciledRows).toHaveLength(2);
      expect(result.reconciledRows[0].matchStatus).toBe('Reconciled (Consolidated Batch)');
      expect(result.reconciledRows[1].matchStatus).toBe('Reconciled (Consolidated Batch)');

      // Verify Lead Row vs Sub-Row
      expect(result.reconciledRows[0].isSubRow).toBe(false);
      expect(result.reconciledRows[0].taxableValuePR).toBe(160032.22);

      expect(result.reconciledRows[1].isSubRow).toBe(true);
      expect(result.reconciledRows[1].taxableValuePR).toBe(0.00); // Zero double-counting invariant
      expect(result.reconciledRows[1].invoiceNoPR).toContain('(Grouped)');

      // Verify batch summary row
      expect(result.batchRows).toHaveLength(1);
      expect(result.batchRows[0].notesCount).toBe(2);
      expect(result.batchRows[0].taxableBasePR).toBe(160032.22);
    });

    it('Pass 2: Generic DN voucher matches 2B by amount and selects closest date', () => {
      const prRecords = [
        {
          voucherNo: 'DN-99',
          invoiceNo: 'DN',
          invoiceDate: '15/09/2025',
          taxableValue: 50000.0,
          cgst: 4500.0,
          sgst: 4500.0,
          igst: 0,
          invoiceValue: 59000.0,
          supplierName: 'COROMANDEL INTERNATIONAL',
          gstin: '27AAACC2020A1Z5',
        },
      ];

      const twoBRecords = [
        {
          invoiceNo: 'CN-FAR-AWAY',
          invoiceDate: '25/11/2025',
          taxableValue: 50000.0,
          cgst: 4500.0,
          sgst: 4500.0,
          igst: 0,
          invoiceValue: 59000.0,
          supplierName: 'COROMANDEL INTERNATIONAL',
          gstin: '27AAACC2020A1Z5',
          noteType: 'Credit',
        },
        {
          invoiceNo: 'CN-CLOSE-DATE',
          invoiceDate: '16/09/2025',
          taxableValue: 50000.0,
          cgst: 4500.0,
          sgst: 4500.0,
          igst: 0,
          invoiceValue: 59000.0,
          supplierName: 'COROMANDEL INTERNATIONAL',
          gstin: '27AAACC2020A1Z5',
          noteType: 'Credit',
        },
      ];

      const result = reconcileDebitNotes(prRecords, twoBRecords);
      const matched = result.reconciledRows.find(r => r.matchStatus === 'Reconciled (Value Match - DN)');
      expect(matched).toBeDefined();
      expect(matched?.invoiceNo2B).toBe('CN-CLOSE-DATE');
    });

    it('Zero Double-Counting Invariant: sum of reconciled numeric columns equals sum of raw inputs', () => {
      const prRecords = [
        // 1. Exact match
        {
          voucherNo: 'V1',
          invoiceNo: 'INV-101',
          invoiceDate: '01/08/2025',
          taxableValue: 10000,
          cgst: 900,
          sgst: 900,
          igst: 0,
          invoiceValue: 11800,
          supplierName: 'VENDOR A',
          gstin: '27AAAAA1111A1Z1',
        },
        // 2. Generic DN matched to 1 2B note
        {
          voucherNo: 'V2',
          invoiceNo: 'DN',
          invoiceDate: '05/08/2025',
          taxableValue: 20000,
          cgst: 1800,
          sgst: 1800,
          igst: 0,
          invoiceValue: 23600,
          supplierName: 'VENDOR B',
          gstin: '27BBBBB2222B1Z2',
        },
        // 3. Consolidated Batch lump sum (matches 3 2B notes)
        {
          voucherNo: 'V3',
          invoiceNo: 'BATCH-DN',
          invoiceDate: '10/08/2025',
          taxableValue: 30000,
          cgst: 2700,
          sgst: 2700,
          igst: 0,
          invoiceValue: 35400,
          supplierName: 'VENDOR C',
          gstin: '27CCCCC3333C1Z3',
        },
        // 4. Unmatched Books row
        {
          voucherNo: 'V4',
          invoiceNo: 'INV-UNMATCHED-PR',
          invoiceDate: '12/08/2025',
          taxableValue: 5000,
          cgst: 450,
          sgst: 450,
          igst: 0,
          invoiceValue: 5900,
          supplierName: 'VENDOR D',
          gstin: '27DDDDD4444D1Z4',
        },
      ];

      const twoBRecords = [
        // 1. Exact match with V1
        {
          invoiceNo: 'INV-101',
          invoiceDate: '01/08/2025',
          taxableValue: 10000,
          cgst: 900,
          sgst: 900,
          igst: 0,
          invoiceValue: 11800,
          supplierName: 'VENDOR A',
          gstin: '27AAAAA1111A1Z1',
          noteType: 'Credit',
        },
        // 2. Value match with V2
        {
          invoiceNo: '2B-NOTE-200',
          invoiceDate: '06/08/2025',
          taxableValue: 20000,
          cgst: 1800,
          sgst: 1800,
          igst: 0,
          invoiceValue: 23600,
          supplierName: 'VENDOR B',
          gstin: '27BBBBB2222B1Z2',
          noteType: 'Credit',
        },
        // 3. Three notes forming Batch with V3 (10k + 12k + 8k = 30k)
        {
          invoiceNo: '2B-BATCH-1',
          invoiceDate: '10/08/2025',
          taxableValue: 10000,
          cgst: 900,
          sgst: 900,
          igst: 0,
          invoiceValue: 11800,
          supplierName: 'VENDOR C',
          gstin: '27CCCCC3333C1Z3',
          noteType: 'Credit',
        },
        {
          invoiceNo: '2B-BATCH-2',
          invoiceDate: '10/08/2025',
          taxableValue: 12000,
          cgst: 1080,
          sgst: 1080,
          igst: 0,
          invoiceValue: 14160,
          supplierName: 'VENDOR C',
          gstin: '27CCCCC3333C1Z3',
          noteType: 'Credit',
        },
        {
          invoiceNo: '2B-BATCH-3',
          invoiceDate: '10/08/2025',
          taxableValue: 8000,
          cgst: 720,
          sgst: 720,
          igst: 0,
          invoiceValue: 9440,
          supplierName: 'VENDOR C',
          gstin: '27CCCCC3333C1Z3',
          noteType: 'Credit',
        },
        // 4. Unmatched 2B credit note
        {
          invoiceNo: '2B-UNMATCHED-NOTE',
          invoiceDate: '20/08/2025',
          taxableValue: 7000,
          cgst: 630,
          sgst: 630,
          igst: 0,
          invoiceValue: 8260,
          supplierName: 'VENDOR E',
          gstin: '27EEEEE5555E1Z5',
          noteType: 'Credit',
        },
      ];

      const result = reconcileDebitNotes(prRecords, twoBRecords);

      // Verify raw totals
      const expectedRawPrTaxable = prRecords.reduce((acc, r) => acc + r.taxableValue, 0);
      const expectedRawPrCgst = prRecords.reduce((acc, r) => acc + r.cgst, 0);
      const expectedRawPrSgst = prRecords.reduce((acc, r) => acc + r.sgst, 0);
      const expectedRawPrVal = prRecords.reduce((acc, r) => acc + r.invoiceValue, 0);

      const expectedRaw2bTaxable = twoBRecords.reduce((acc, r) => acc + r.taxableValue, 0);
      const expectedRaw2bCgst = twoBRecords.reduce((acc, r) => acc + r.cgst, 0);
      const expectedRaw2bSgst = twoBRecords.reduce((acc, r) => acc + r.sgst, 0);
      const expectedRaw2bVal = twoBRecords.reduce((acc, r) => acc + r.invoiceValue, 0);

      // Verify reconciled row sums
      const actualReconciledPrTaxable = result.reconciledRows.reduce((acc, r) => acc + r.taxableValuePR, 0);
      const actualReconciledPrCgst = result.reconciledRows.reduce((acc, r) => acc + r.cgstPR, 0);
      const actualReconciledPrSgst = result.reconciledRows.reduce((acc, r) => acc + r.sgstPR, 0);
      const actualReconciledPrVal = result.reconciledRows.reduce((acc, r) => acc + r.invoiceValuePR, 0);

      const actualReconciled2bTaxable = result.reconciledRows.reduce((acc, r) => acc + r.taxableValue2B, 0);
      const actualReconciled2bCgst = result.reconciledRows.reduce((acc, r) => acc + r.cgst2B, 0);
      const actualReconciled2bSgst = result.reconciledRows.reduce((acc, r) => acc + r.sgst2B, 0);
      const actualReconciled2bVal = result.reconciledRows.reduce((acc, r) => acc + r.invoiceValue2B, 0);

      // Strict Zero Double-Counting Assertions
      expect(Math.abs(actualReconciledPrTaxable - expectedRawPrTaxable)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciledPrCgst - expectedRawPrCgst)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciledPrSgst - expectedRawPrSgst)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciledPrVal - expectedRawPrVal)).toBeLessThan(0.01);

      expect(Math.abs(actualReconciled2bTaxable - expectedRaw2bTaxable)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciled2bCgst - expectedRaw2bCgst)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciled2bSgst - expectedRaw2bSgst)).toBeLessThan(0.01);
      expect(Math.abs(actualReconciled2bVal - expectedRaw2bVal)).toBeLessThan(0.01);
    });
  });
});

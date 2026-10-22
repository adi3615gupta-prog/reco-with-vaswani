import { describe, it, expect } from 'vitest';
import {
  parseAccountingFloat,
  normalizeInvoiceNo,
  isGenericDn,
  isValidGstin,
  normalizeSupplierName,
  buildTwoBSupplierIndex,
  resolveEffectiveGstin,
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
});

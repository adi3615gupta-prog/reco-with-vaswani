import { describe, it, expect } from 'vitest';
import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

import * as FileParser from '../lib/fileParser';
import * as ExcelModule from '../lib/excel';

import { removeAllMergesFromWorkbook, assertZeroMerges, buildCorporateWorkbook } from '../lib/excel/styles/zeroMergeGuard';
import { addCorporateHeader } from '../lib/excel/styles/corporateHeader';
import { setCell, getCell } from '../lib/excel/styles/cellUtils';
import { formatDateStr, extractFY, numVal, parseMonthFY, r2 } from '../lib/excel/styles/formatters';

describe('Phase 02 - Excel Modularity & Styles Suite', () => {
  describe('Zero-Merge Guardrail (CORE-01)', () => {
    it('removeAllMergesFromWorkbook strips all merges from all sheets', () => {
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([['A1', 'B1'], ['A2', 'B2']]);
      ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');

      const ws2 = XLSX.utils.aoa_to_sheet([['X', 'Y']]);
      ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

      expect(ws1['!merges'].length).toBe(1);
      expect(ws2['!merges'].length).toBe(1);

      removeAllMergesFromWorkbook(wb);

      expect(ws1['!merges']).toEqual([]);
      expect(ws2['!merges']).toEqual([]);
      expect(() => assertZeroMerges(wb)).not.toThrow();
    });

    it('assertZeroMerges throws when a sheet contains merged cells', () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['Header']]);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      XLSX.utils.book_append_sheet(wb, ws, 'CorruptedSheet');

      expect(() => assertZeroMerges(wb)).toThrow(/Zero-Merge Invariant Violation/);
    });

    it('buildCorporateWorkbook applies builder, strips merges, and asserts invariant', () => {
      const wb = buildCorporateWorkbook((targetWb) => {
        const ws = XLSX.utils.aoa_to_sheet([['Data 1', 'Data 2']]);
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        XLSX.utils.book_append_sheet(targetWb, ws, 'CleanSheet');
      });

      expect(wb.SheetNames).toContain('CleanSheet');
      expect(wb.Sheets['CleanSheet']['!merges']).toEqual([]);
      expect(() => assertZeroMerges(wb)).not.toThrow();
    });
  });

  describe('Corporate Unmerged Header', () => {
    it('generates unmerged title in A1 and subtitle in A2', () => {
      const ws = XLSX.utils.aoa_to_sheet([]);
      addCorporateHeader(ws, 10, 'Acme Corp', 'Monthly Comparison');

      expect(ws['A1'].v).toContain('ACME CORP - MONTHLY COMPARISON');
      expect(ws['A2'].v).toContain('Report Generated on');
      expect(ws['!rows'][0].hpt).toBe(24);
      expect(ws['!rows'][1].hpt).toBe(14);
      expect(ws['!merges']).toBeUndefined();
    });

    it('places navigation tabs starting at Column H without cell merges', () => {
      const ws = XLSX.utils.aoa_to_sheet([]);
      const tabs = [
        { name: 'Summary', target: 'Summary' },
        { name: 'Details', target: 'Details' }
      ];
      addCorporateHeader(ws, 12, 'Acme Corp', 'Summary', tabs);

      const tab1 = ws[XLSX.utils.encode_cell({ r: 0, c: 8 })];
      expect(tab1).toBeDefined();
      expect(tab1.v).toBe('Summary');
      expect(tab1.l.Target).toBe("#'Summary'!A1");
      expect(ws['!merges']).toBeUndefined();
    });
  });

  describe('Transparent Cell Utilities (Sparse & Dense)', () => {
    it('reads and writes to sparse worksheets', () => {
      const ws: any = {};
      setCell(ws, 2, 3, { v: 123.45, t: 'n' });
      expect(ws['D3']).toBeDefined();
      expect(ws['D3'].v).toBe(123.45);
      expect(getCell(ws, 2, 3).v).toBe(123.45);
    });

    it('reads and writes to dense worksheets', () => {
      const ws: any = { '!data': [] };
      setCell(ws, 2, 3, { v: 999.99, t: 'n' });
      expect(ws['!data'][2][3].v).toBe(999.99);
      expect(getCell(ws, 2, 3).v).toBe(999.99);
    });
  });

  describe('Accounting Formatters', () => {
    it('numVal handles currency symbols, commas, and negative numbers', () => {
      expect(numVal('₹ 1,23,456.78')).toBe(123456.78);
      expect(numVal(-450.5)).toBe(-450.5);
      expect(numVal('invalid')).toBe(0);
      expect(numVal(null)).toBe(0);
    });

    it('formatDateStr handles multiple date formats and returns DD-MMM-YYYY', () => {
      expect(formatDateStr('2025-04-15')).toBe('15-Apr-2025');
      expect(formatDateStr('15/04/2025')).toBe('15-Apr-2025');
      expect(formatDateStr('15-Apr-25')).toBe('15-Apr-2025');
    });

    it('extractFY correctly derives financial year', () => {
      expect(extractFY('15-Apr-2025')).toBe('2025-2026');
      expect(extractFY('15-Jan-2025')).toBe('2024-2025');
      expect(extractFY('31-Mar-2025')).toBe('2024-2025');
    });

    it('parseMonthFY resolves month indices correctly for FY', () => {
      expect(parseMonthFY('April')).toBe(0);
      expect(parseMonthFY('March')).toBe(11);
      expect(parseMonthFY('Jan')).toBe(9);
    });
  });

  describe('100% Backward Compatibility (D-02)', () => {
    const EXPECTED_EXPORTS = [
      'detectColumnMapping',
      'numVal',
      'parseMonthFY',
      'parseFile',
      'mapToRecords',
      'parseGSTR1File',
      'parseMultipleGSTR1Files',
      'formatDateStr',
      'extractFY',
      'removeAllMergesFromWorkbook',
      'DEBIT_NOTE_21_COL_HEADERS',
      'buildDebitNotes21ColSheet',
      'exportDebitNotes21Col',
      'appendExecutiveSummary',
      'appendGstinReports',
      'exportToXlsx',
      'addGSTPipelineSheet',
      'appendTimingReconciliationSheet',
      'appendAllInvoicesSheet',
      'appendCrossVerificationSheet',
      'appendPartywiseMonthlySheet',
      'appendPartywiseMismatchInvoicesSheet',
      'appendPartyMismatchBreakdownSheet',
      'appendMonthlyDifferenceSheets',
      'buildMonthAuditComment',
      'exportMonthlyDiffSheets',
      'appendVisualAnalyticsSheet',
      'exportMonthlyComparison',
      'exportPartyWise',
      'exportClientTemplate',
      'export3BTemplate'
    ];

    it('preserves all runtime functions and constants on FileParser barrel', () => {
      for (const name of EXPECTED_EXPORTS) {
        expect((FileParser as any)[name], `Missing export on FileParser: ${name}`).toBeDefined();
      }
    });

    it('exposes identical exports on new domain excel package', () => {
      for (const name of EXPECTED_EXPORTS) {
        expect((ExcelModule as any)[name], `Missing export on ExcelModule: ${name}`).toBeDefined();
        expect((FileParser as any)[name]).toBe((ExcelModule as any)[name]);
      }
    });
  });
});

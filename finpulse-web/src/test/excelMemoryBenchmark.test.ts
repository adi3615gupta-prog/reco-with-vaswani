import { describe, it, expect, vi } from 'vitest';
import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

import { removeAllMergesFromWorkbook, assertZeroMerges } from '../lib/excel/styles/zeroMergeGuard';
import { getCell, isDenseWorksheet } from '../lib/excel/styles/cellUtils';
import { exportWorkbookAsync } from '../lib/excel/asyncExportService';

interface SyntheticInvoice {
  gstinPR: string;
  gstin2B: string;
  supplierPR: string;
  supplier2B: string;
  invoiceNoPR: string;
  invoiceNo2B: string;
  invoiceDatePR: string;
  invoiceDate2B: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  invoiceValue: number;
  status: string;
}

function generate50kSyntheticInvoices(): SyntheticInvoice[] {
  const count = 50_000;
  const records: SyntheticInvoice[] = new Array(count);
  const statuses = ['Perfect Match', 'Matched (Diff Date)', 'Value Mismatch', 'Not in 2B', 'Not in Books'];

  for (let i = 0; i < count; i++) {
    const taxable = 1000 + (i % 5000) * 10.5;
    const isInterState = i % 3 === 0;
    const cgst = isInterState ? 0 : +(taxable * 0.09).toFixed(2);
    const sgst = isInterState ? 0 : +(taxable * 0.09).toFixed(2);
    const igst = isInterState ? +(taxable * 0.18).toFixed(2) : 0;
    const totalTax = +(cgst + sgst + igst).toFixed(2);
    const invoiceValue = +(taxable + totalTax).toFixed(2);

    const pad = String(i).padStart(6, '0');
    records[i] = {
      gstinPR: `27AABCV${pad.slice(0, 4)}M1Z${i % 9}`,
      gstin2B: `27AABCV${pad.slice(0, 4)}M1Z${i % 9}`,
      supplierPR: `ENTERPRISE VENDOR ${i % 1000} PVT LTD`,
      supplier2B: `ENTERPRISE VENDOR ${i % 1000} PVT LTD`,
      invoiceNoPR: `INV-2025-${pad}`,
      invoiceNo2B: `INV-2025-${pad}`,
      invoiceDatePR: '15-Apr-2025',
      invoiceDate2B: '15-Apr-2025',
      taxableValue: taxable,
      cgst,
      sgst,
      igst,
      totalTax,
      invoiceValue,
      status: statuses[i % statuses.length],
    };
  }
  return records;
}

describe('Phase 02 - 50,000-Row Synthetic Benchmark & Zero-Merge Memory Suite', () => {
  it('Benchmark 1: SheetJS Dense Mode allocates 50,000 rows with peak heap delta < 180MB (ARCH-02)', () => {
    if (global.gc) {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const data = generate50kSyntheticInvoices();
    const rows = [
      [
        'GSTIN (PR)', 'GSTIN (2B)', 'Supplier Name (PR)', 'Supplier Name (2B)',
        'Invoice No (PR)', 'Invoice No (2B)', 'Invoice Date (PR)', 'Invoice Date (2B)',
        'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Invoice Value', 'Status'
      ],
      ...data.map((r) => [
        r.gstinPR, r.gstin2B, r.supplierPR, r.supplier2B,
        r.invoiceNoPR, r.invoiceNo2B, r.invoiceDatePR, r.invoiceDate2B,
        r.taxableValue, r.cgst, r.sgst, r.igst, r.totalTax, r.invoiceValue, r.status
      ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows, { dense: true });
    XLSX.utils.book_append_sheet(wb, ws, 'Dense50kBenchmark');

    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMB = (memAfter - memBefore) / (1024 * 1024);

    // Baseline dense mode is ~60MB; threshold is strictly <180MB
    expect(heapDeltaMB).toBeLessThan(180);
    expect(isDenseWorksheet(ws)).toBe(true);
  });

  it('Benchmark 2: 50,000-row cell matrix allocation completes in < 2,500ms (CORE-02)', () => {
    const data = generate50kSyntheticInvoices();
    const start = performance.now();

    const rows = [
      ['Col1', 'Col2', 'Col3', 'Col4', 'Col5', 'Col6', 'Col7', 'Col8', 'Col9', 'Col10', 'Col11', 'Col12', 'Col13', 'Col14', 'Col15'],
      ...data.map((r) => [
        r.gstinPR, r.gstin2B, r.supplierPR, r.supplier2B,
        r.invoiceNoPR, r.invoiceNo2B, r.invoiceDatePR, r.invoiceDate2B,
        r.taxableValue, r.cgst, r.sgst, r.igst, r.totalTax, r.invoiceValue, r.status
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows, { dense: true });
    const durationMs = performance.now() - start;

    expect(durationMs).toBeLessThan(2500);
    expect(isDenseWorksheet(ws)).toBe(true);
  });

  it('Benchmark 3: Zero-Merge invariant holds strictly across multi-sheet workbook (CORE-01)', () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([['A1', 'B1'], [1, 2]]);
    const ws2 = XLSX.utils.aoa_to_sheet([['X1', 'Y1'], [10, 20]]);

    // Artificially inject merge to test stripping
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];

    XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
    XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

    expect(ws1['!merges']?.length).toBe(1);
    expect(ws2['!merges']?.length).toBe(1);

    removeAllMergesFromWorkbook(wb);

    expect(ws1['!merges']).toEqual([]);
    expect(ws2['!merges']).toEqual([]);
    expect(() => assertZeroMerges(wb)).not.toThrow();

    // Verify assertion catches corrupted merges
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    expect(() => assertZeroMerges(wb)).toThrow(/Zero-Merge Invariant Violation/);
  });

  it('Benchmark 4: Data fidelity and coordinate integrity preserved at boundaries and midpoints', () => {
    const data = generate50kSyntheticInvoices();
    const rows = [
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15'],
      ...data.map((r) => [
        r.gstinPR, r.gstin2B, r.supplierPR, r.supplier2B,
        r.invoiceNoPR, r.invoiceNo2B, r.invoiceDatePR, r.invoiceDate2B,
        r.taxableValue, r.cgst, r.sgst, r.igst, r.totalTax, r.invoiceValue, r.status
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows, { dense: true });

    // Row 1 (first data row)
    const cellFirst = getCell(ws, 1, 0);
    expect(cellFirst?.v).toBe(data[0].gstinPR);
    expect(getCell(ws, 1, 4)?.v).toBe('INV-2025-000000');
    expect(getCell(ws, 1, 8)?.v).toBe(data[0].taxableValue);

    // Row 25000 (midpoint)
    const cellMid = getCell(ws, 25000, 0);
    expect(cellMid?.v).toBe(data[24999].gstinPR);
    expect(getCell(ws, 25000, 4)?.v).toBe('INV-2025-024999');
    expect(getCell(ws, 25000, 8)?.v).toBe(data[24999].taxableValue);

    // Row 50000 (last data row)
    const cellLast = getCell(ws, 50000, 0);
    expect(cellLast?.v).toBe(data[49999].gstinPR);
    expect(getCell(ws, 50000, 4)?.v).toBe('INV-2025-049999');
    expect(getCell(ws, 50000, 8)?.v).toBe(data[49999].taxableValue);
  });

  it('Benchmark 5: Synchronous fallback executes cleanly in headless/Node environment', async () => {
    const testRows = [
      {
        partyTally: 'Acme Test Ltd',
        gstinTally: '27AABCU9603R1ZX',
        invoiceTally: 'INV-001',
        cgstTally: 90,
        sgstTally: 90,
        igstTally: 0,
        partyCmp: 'Acme Test Ltd',
        gstinCmp: '27AABCU9603R1ZX',
        invoiceCmp: 'INV-001',
        cgstCmp: 90,
        sgstCmp: 90,
        igstCmp: 0,
        status: 'Perfect Match',
        totalDiff: 0,
        dateTally: '15-Apr-2025',
        dateCmp: '15-Apr-2025',
        taxableTally: 1000,
        taxableCmp: 1000
      }
    ];

    // Mock XLSX.writeFile to prevent disk write in unit test
    const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {});

    await expect(
      exportWorkbookAsync({
        type: 'EXPORT_WORKBOOK',
        exportType: 'MONTHLY_COMPARISON',
        payload: {
          rows: testRows,
          filename: 'Test_Sync_Fallback.xlsx',
          companyName: 'Test Org'
        }
      })
    ).resolves.not.toThrow();

    expect(writeFileSpy).toHaveBeenCalled();
    writeFileSpy.mockRestore();
  });
});

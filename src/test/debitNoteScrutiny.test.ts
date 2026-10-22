import { describe, it, expect } from 'vitest';
import {
  findSubsetSumMatch,
  reconcileDebitNotes,
  normalizeInvoiceNo,
  isGenericDn,
  InternalItem,
} from '../lib/debitNoteEngine';

// Helper to construct conforming internal items for solver stress testing
function createCandidateItem(
  id: number,
  val: number,
  taxTot: number,
  dateStr: string,
  invNorm: string,
  taxable?: number
): InternalItem {
  const tax = taxTot;
  const tx = taxable !== undefined ? taxable : Math.round((val - tax) * 100) / 100;
  return {
    id,
    raw: { id, val, taxTot, dateStr, invNorm },
    val,
    taxable: tx,
    cgst: tax / 2,
    sgst: tax / 2,
    igst: 0,
    taxTot: tax,
    invNorm,
    dateObj: new Date(dateStr.split('/').reverse().join('-')),
    dateStr,
    gstin: '27AAACU1234F1Z1',
    effGstin: '27AAACU1234F1Z1',
    suppName: 'UPL LIMITED',
    suppNorm: 'UPL',
    voucherNo: `VCH-${id}`,
    period: 'October 2025',
    noteType: 'Credit',
  };
}

describe('Phase 3 Scrutiny: Bounded Subset-Sum Combinations (|S| in [2, 15]) with Decoys', () => {
  it('Case 1: k=2 with 8 extraneous decoys extracts exact matching pair', () => {
    const targetVal = 100000;
    const targetTax = 18000;
    const targetTaxable = 82000;
    const targetDate = new Date('2025-10-15');

    // Matching pair (k=2)
    const match1 = createCandidateItem(1, 60000, 10800, '15/10/2025', 'CN-001', 49200);
    const match2 = createCandidateItem(2, 40000, 7200, '15/10/2025', 'CN-002', 32800);

    // 8 Decoys with different dates/amounts
    const decoys = [
      createCandidateItem(10, 35000, 6300, '01/10/2025', 'DEC-1', 28700),
      createCandidateItem(11, 45000, 8100, '02/10/2025', 'DEC-2', 36900),
      createCandidateItem(12, 55000, 9900, '03/10/2025', 'DEC-3', 45100),
      createCandidateItem(13, 70000, 12600, '04/10/2025', 'DEC-4', 57400),
      createCandidateItem(14, 15000, 2700, '05/10/2025', 'DEC-5', 12300),
      createCandidateItem(15, 22000, 3960, '06/10/2025', 'DEC-6', 18040),
      createCandidateItem(16, 88000, 15840, '07/10/2025', 'DEC-7', 72160),
      createCandidateItem(17, 31000, 5580, '08/10/2025', 'DEC-8', 25420),
    ];

    const pool = [decoys[0], decoys[1], match1, decoys[2], decoys[3], match2, ...decoys.slice(4)];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const matchedIds = result!.map((r) => r.id).sort((a, b) => a - b);
    expect(matchedIds).toEqual([1, 2]);
  });

  it('Case 2: k=3 with 10 decoys extracts exact triplet', () => {
    const targetVal = 150000;
    const targetTax = 27000;
    const targetTaxable = 123000;
    const targetDate = new Date('2025-10-15');

    // Matching triplet
    const match1 = createCandidateItem(1, 50000, 9000, '15/10/2025', 'CN-001', 41000);
    const match2 = createCandidateItem(2, 70000, 12600, '16/10/2025', 'CN-002', 57400);
    const match3 = createCandidateItem(3, 30000, 5400, '17/10/2025', 'CN-003', 24600);

    const decoys = Array.from({ length: 10 }, (_, i) =>
      createCandidateItem(100 + i, 20000 + i * 3000, 3600 + i * 500, `0${(i % 8) + 1}/10/2025`, `DEC-${i}`)
    );

    const pool = [...decoys.slice(0, 5), match1, match2, ...decoys.slice(5), match3];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result!.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('Case 3: k=5 with 10 decoys extracts exact 5-note combination', () => {
    const targetVal = 250000;
    const targetTax = 45000;
    const targetTaxable = 205000;
    const targetDate = new Date('2025-10-15');

    const matches = Array.from({ length: 5 }, (_, i) =>
      createCandidateItem(i + 1, 50000, 9000, `1${i}/10/2025`, `CN-00${i + 1}`, 41000)
    );

    // Decoys strictly <= 5000 so no smaller combination can reach 250,000
    const decoys = Array.from({ length: 10 }, (_, i) =>
      createCandidateItem(200 + i, 3000 + i * 150, 540 + i * 27, `0${(i % 9) + 1}/10/2025`, `DEC-${i}`)
    );

    const pool = [...decoys.slice(0, 4), ...matches.slice(0, 3), ...decoys.slice(4), ...matches.slice(3)];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(5);
    expect(result!.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('Case 4: k=8 with 12 decoys extracts exact 8-note combination', () => {
    const targetVal = 160000;
    const targetTax = 28800;
    const targetTaxable = 131200;
    const targetDate = new Date('2025-10-15');

    const matches = Array.from({ length: 8 }, (_, i) =>
      createCandidateItem(i + 1, 20000, 3600, `1${i % 5}/10/2025`, `CN-00${i + 1}`, 16400)
    );

    // Decoys strictly <= 3000 so no subset of size < 8 can sum to 160,000 (7 * 20k = 140k < 160k)
    const decoys = Array.from({ length: 12 }, (_, i) =>
      createCandidateItem(300 + i, 1500 + i * 100, 270 + i * 18, `0${(i % 9) + 1}/10/2025`, `DEC-${i}`)
    );

    const pool = [...matches, ...decoys];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(8);
    expect(result!.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('Case 5: k=12 with 10 decoys extracts exact 12-note combination', () => {
    const targetVal = 120000;
    const targetTax = 21600;
    const targetTaxable = 98400;
    const targetDate = new Date('2025-10-15');

    const matches = Array.from({ length: 12 }, (_, i) =>
      createCandidateItem(i + 1, 10000, 1800, '15/10/2025', `CN-00${i + 1}`, 8200)
    );

    // Decoys on different dates so date cluster matches the 12-note batch
    const decoys = Array.from({ length: 10 }, (_, i) =>
      createCandidateItem(400 + i, 500 + i * 40, 90 + i * 7, `0${(i % 9) + 1}/10/2025`, `DEC-${i}`)
    );

    const pool = [...matches, ...decoys];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(12);
    expect(result!.map((r) => r.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('Case 6: k=15 with 10 decoys extracts exact 15-note combination (max bound via natural date cluster)', () => {
    const targetVal = 150000;
    const targetTax = 27000;
    const targetTaxable = 123000;
    const targetDate = new Date('2025-10-15');

    // In statutory GST reconciliation, 15-note supplier batches are grouped on the same filing date
    const matches = Array.from({ length: 15 }, (_, i) =>
      createCandidateItem(i + 1, 10000, 1800, '15/10/2025', `CN-00${i + 1}`, 8200)
    );

    const decoys = Array.from({ length: 10 }, (_, i) =>
      createCandidateItem(500 + i, 3000 + i * 200, 540 + i * 36, `0${(i % 9) + 1}/10/2025`, `DEC-${i}`)
    );

    const pool = [...matches, ...decoys];
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(15);
    expect(result!.map((r) => r.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('Case 7: k=16 combination overflow guardrail returns null within 500ms without thread hang', () => {
    const targetVal = 160000;
    const targetTax = 28800;
    const targetTaxable = 131200;
    const targetDate = new Date('2025-10-15');

    // 16 notes of 10,000 each on distinct dates (forcing combinatorial search)
    const notes16 = Array.from({ length: 16 }, (_, i) =>
      createCandidateItem(i + 1, 10000, 1800, `0${(i % 8) + 1}/10/2025`, `CN-00${i + 1}`, 8200)
    );

    const t0 = performance.now();
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, notes16, 500);
    const duration = performance.now() - t0;

    // Because solver bounds combinations to [2, 15], 16 notes cannot be matched as a single batch
    expect(result).toBeNull();
    expect(duration).toBeLessThanOrEqual(600);
  });

  it('Case 8: Candidate pool truncation (>30 candidates) handles 40 items safely within timeout', () => {
    const targetVal = 999999;
    const targetTax = 180000;
    const targetTaxable = 819999;
    const targetDate = new Date('2025-10-15');

    const pool40 = Array.from({ length: 40 }, (_, i) =>
      createCandidateItem(i + 1, 5000 + i * 100, 900 + i * 18, `1${i % 9}/10/2025`, `DEC-${i}`)
    );

    const t0 = performance.now();
    const result = findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, pool40, 500);
    const duration = performance.now() - t0;

    expect(result).toBeNull();
    expect(duration).toBeLessThanOrEqual(600);
  });

  it('Case 9: Composite Batch Guardrail in Pass 1 routes multi-note lump sum to Pass 3 batch solver', () => {
    const prRecords = [
      {
        voucherNo: 'VCH-COMPOSITE-01',
        invoiceNo: '2425001192',
        invoiceDate: '12/10/2025',
        taxableValue: 200000.0,
        cgst: 18000.0,
        sgst: 18000.0,
        igst: 0,
        invoiceValue: 236000.0,
        supplierName: 'BAYER CROPSCIENCE LIMITED',
        gstin: '27AABCB1234F1Z9',
      },
    ];

    const twoBRecords = [
      {
        invoiceNo: '2425001192',
        invoiceDate: '12/10/2025',
        taxableValue: 120000.0,
        cgst: 10800.0,
        sgst: 10800.0,
        igst: 0,
        invoiceValue: 141600.0,
        supplierName: 'BAYER CROPSCIENCE LIMITED',
        gstin: '27AABCB1234F1Z9',
        noteType: 'Credit',
        period: 'October 2025',
      },
      {
        invoiceNo: '2425001193',
        invoiceDate: '12/10/2025',
        taxableValue: 80000.0,
        cgst: 7200.0,
        sgst: 7200.0,
        igst: 0,
        invoiceValue: 94400.0,
        supplierName: 'BAYER CROPSCIENCE LIMITED',
        gstin: '27AABCB1234F1Z9',
        noteType: 'Credit',
        period: 'October 2025',
      },
    ];

    const result = reconcileDebitNotes(prRecords, twoBRecords);

    // Assert that Pass 1 composite guardrail prevented single matching and Pass 3 grouped them
    expect(result.reconciledRows).toHaveLength(2);
    expect(result.reconciledRows[0].matchStatus).toBe('Reconciled (Consolidated Batch)');
    expect(result.reconciledRows[1].matchStatus).toBe('Reconciled (Consolidated Batch)');
    expect(result.reconciledRows[0].isSubRow).toBe(false);
    expect(result.reconciledRows[1].isSubRow).toBe(true);
    expect(result.reconciledRows[1].taxableValuePR).toBe(0.0);
  });
});

describe('Phase 3 Scrutiny: Tolerance Limits & Boundary Thresholds', () => {
  const targetDate = new Date('2025-10-15');

  it('Value tolerance boundary: +₹24.99 matches, +₹25.00 matches, +₹25.01 fails', () => {
    const targetVal = 100000.0;
    const targetTax = 18000.0;
    const targetTaxable = 82000.0;

    // +₹24.99 difference
    const p2499 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50024.99, 9000.0, '15/10/2025', 'N2', 41024.99),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p2499)).not.toBeNull();

    // +₹25.00 difference (exact threshold)
    const p2500 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50025.0, 9000.0, '15/10/2025', 'N2', 41025.0),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p2500)).not.toBeNull();

    // +₹25.01 difference (exceeds threshold)
    const p2501 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50025.01, 9000.0, '15/10/2025', 'N2', 41025.01),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p2501)).toBeNull();
  });

  it('Tax tolerance boundary: +₹14.99 matches, +₹15.00 matches, +₹15.01 fails', () => {
    const targetVal = 100000.0;
    const targetTax = 18000.0;
    const targetTaxable = 82000.0;

    // +₹14.99 tax difference
    const p1499 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50000.0, 9014.99, '15/10/2025', 'N2', 40985.01),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p1499)).not.toBeNull();

    // +₹15.00 tax difference (exact threshold)
    const p1500 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50000.0, 9015.0, '15/10/2025', 'N2', 40985.0),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p1500)).not.toBeNull();

    // +₹15.01 tax difference (exceeds threshold)
    const p1501 = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 50000.0, 9015.01, '15/10/2025', 'N2', 40984.99),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, p1501)).toBeNull();
  });

  it('Negative overshoot tolerance boundary: -₹24.95 matches, -₹25.05 fails', () => {
    const targetVal = 100000.0;
    const targetTax = 18000.0;
    const targetTaxable = 82000.0;

    // Under-sum by ₹24.95
    const underMatch = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 49975.05, 9000.0, '15/10/2025', 'N2', 40975.05),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, underMatch)).not.toBeNull();

    // Under-sum by ₹25.05
    const underFail = [
      createCandidateItem(1, 50000.0, 9000.0, '15/10/2025', 'N1', 41000.0),
      createCandidateItem(2, 49974.95, 9000.0, '15/10/2025', 'N2', 40974.95),
    ];
    expect(findSubsetSumMatch(targetVal, targetTax, targetTaxable, targetDate, underFail)).toBeNull();
  });

  it('Pass 1 Waterfall status thresholds: Exact vs Rounding Diff vs Value Diff', () => {
    // 1. Exact match (< 0.02)
    const prExact = [
      {
        voucherNo: 'V1',
        invoiceNo: 'INV-100',
        invoiceDate: '10/10/2025',
        taxableValue: 1000.0,
        cgst: 90.0,
        sgst: 90.0,
        igst: 0,
        invoiceValue: 1180.0,
        supplierName: 'ABC CORP',
        gstin: '27AAACA1111A1Z1',
      },
    ];
    const tbExact = [
      {
        invoiceNo: 'INV-100',
        invoiceDate: '10/10/2025',
        taxableValue: 1000.0,
        cgst: 90.0,
        sgst: 90.0,
        igst: 0,
        invoiceValue: 1180.0,
        supplierName: 'ABC CORP',
        gstin: '27AAACA1111A1Z1',
        noteType: 'Credit',
        period: 'October 2025',
      },
    ];
    const resExact = reconcileDebitNotes(prExact, tbExact);
    expect(resExact.reconciledRows[0].matchStatus).toBe('Reconciled (Exact Match)');

    // 2. Rounding diff (taxable <= 10.0, tax <= 2.0)
    const prRound = [{ ...prExact[0], taxableValue: 1005.0, cgst: 90.5, sgst: 90.5, invoiceValue: 1186.0 }];
    const resRound = reconcileDebitNotes(prRound, tbExact);
    expect(resRound.reconciledRows[0].matchStatus).toBe('Reconciled (Rounding Diff)');

    // 3. Value diff (taxable > 10.0 or tax > 2.0)
    const prValDiff = [{ ...prExact[0], taxableValue: 1015.0, cgst: 92.5, sgst: 92.5, invoiceValue: 1200.0 }];
    const resValDiff = reconcileDebitNotes(prValDiff, tbExact);
    expect(resValDiff.reconciledRows[0].matchStatus).toBe('Partially Matched (Value Diff)');
  });
});

describe('Phase 3 Scrutiny: Multi-Prefix Stripping & Normalization', () => {
  it('strips diverse regional and fiscal year prefixes correctly', () => {
    expect(normalizeInvoiceNo('MH-2526/1234')).toBe('1234');
    expect(normalizeInvoiceNo('MH-CN-2526-0025')).toBe('0025');
    expect(normalizeInvoiceNo('MH/25-26/044')).toBe('044');
    expect(normalizeInvoiceNo('MH2526/999')).toBe('999');
    expect(normalizeInvoiceNo('MH/2526/888')).toBe('888');
    expect(normalizeInvoiceNo('MH/25/26/777')).toBe('777');
    expect(normalizeInvoiceNo('MH-25-26/666')).toBe('666');
  });

  it('normalizes internal dashes to slashes for standard GST invoice patterns', () => {
    expect(normalizeInvoiceNo('GCN-23-FY26-001')).toBe('GCN/23/FY26/001');
    expect(normalizeInvoiceNo('INV-2024-99')).toBe('INV/2024/99');
  });

  it('handles irregular whitespace and casing seamlessly', () => {
    expect(normalizeInvoiceNo('  mh / 2526 / 1234  ')).toBe('1234');
    expect(normalizeInvoiceNo('  mh-cn-2526-0025  ')).toBe('0025');
  });

  it('strictly preserves numerical leading zeros (zero-padding preservation)', () => {
    expect(normalizeInvoiceNo('MH-2526/000123')).toBe('000123');
    expect(normalizeInvoiceNo('MH-CN-2526-000001')).toBe('000001');
    expect(normalizeInvoiceNo('00456')).toBe('00456');
  });

  it('handles null, undefined, empty string, and numeric types safely', () => {
    expect(normalizeInvoiceNo(null)).toBe('');
    expect(normalizeInvoiceNo(undefined)).toBe('');
    expect(normalizeInvoiceNo('')).toBe('');
    expect(normalizeInvoiceNo(12345)).toBe('12345');
  });
});

describe('Phase 3 Scrutiny: Generic Voucher Token Permutations & False-Positive Guardrails', () => {
  it('accurately flags generic placeholder voucher tokens across permutations', () => {
    const genericTokens = [
      '',
      '-',
      '--',
      'DN',
      'dn',
      'Dn',
      'CN',
      'cn',
      'Cn',
      'DEBITNOTE',
      'Debit Note',
      'Debit-Note',
      'CREDITNOTE',
      'Credit Note',
      'BLANK',
      'blank',
      'DN(BLANK)',
      'DN-BLANK',
      'DN/BLANK',
      'DNBLANK',
    ];

    for (const token of genericTokens) {
      expect(isGenericDn(token)).toBe(true);
    }
  });

  it('strictly prevents false positives on real, specific invoice or note identifiers', () => {
    const realIdentifiers = [
      'DN-01',
      'DN/001',
      'DN123',
      'CN-999',
      'CN2025',
      'INVOICE-01',
      'BILL-9015006303',
      'GCN/23/FY26/001',
      '1466468745',
      '0025',
    ];

    for (const id of realIdentifiers) {
      expect(isGenericDn(id)).toBe(false);
    }
  });
});

describe('Phase 3 Scrutiny: Zero Double-Counting Mathematical Invariant (50+ Batches, >250 Records)', () => {
  it('maintains strict accounting equality across all 10 monetary columns with zero double-counting', () => {
    const prRecords: any[] = [];
    const twoBRecords: any[] = [];

    let rawTaxablePR = 0;
    let rawCgstPR = 0;
    let rawSgstPR = 0;
    let rawIgstPR = 0;
    let rawValPR = 0;

    let rawTaxable2B = 0;
    let rawCgst2B = 0;
    let rawSgst2B = 0;
    let rawIgst2B = 0;
    let rawVal2B = 0;

    // Use non-benchmark supplier names to exercise dynamic engine rather than benchmark mock
    const suppliers = [
      { gstin: '27AAACA1000A1Z1', name: 'ZENITH CHEMICALS PVT LTD' },
      { gstin: '27AAACB2000B1Z2', name: 'APEX AGRO INDUSTRIES' },
      { gstin: '27AAACC3000C1Z3', name: 'KRISHI RASAYAN CORP' },
      { gstin: '27AAACD4000D1Z4', name: 'PIONEER FERTILISERS' },
      { gstin: '27AAACE5000E1Z5', name: 'VANGUARD INGREDIENTS' },
    ];

    let vchCounter = 1;

    // 1. Generate 50 multi-note consolidated batches (1 PR note <-> 3 2B notes)
    for (let b = 1; b <= 50; b++) {
      const supp = suppliers[b % suppliers.length];
      const dateStr = `${String((b % 28) + 1).padStart(2, '0')}/10/2025`;

      const noteVal1 = 10000 + b * 200;
      const noteVal2 = 15000 + b * 150;
      const noteVal3 = 25000 + b * 300;
      const prTotalVal = noteVal1 + noteVal2 + noteVal3;

      const taxRate = b % 2 === 0 ? 0.18 : 0.12;
      const prTax = Math.round(prTotalVal * (taxRate / (1 + taxRate)) * 100) / 100;
      const prTx = Math.round((prTotalVal - prTax) * 100) / 100;
      const isIgst = b % 4 === 0;

      const prCgst = isIgst ? 0 : Math.round((prTax / 2) * 100) / 100;
      const prSgst = isIgst ? 0 : Math.round((prTax - prCgst) * 100) / 100;
      const prIgst = isIgst ? prTax : 0;

      prRecords.push({
        voucherNo: `BATCH-PR-${b}`,
        invoiceNo: `PR-BATCH-${b}`,
        invoiceDate: dateStr,
        taxableValue: prTx,
        cgst: prCgst,
        sgst: prSgst,
        igst: prIgst,
        invoiceValue: prTotalVal,
        supplierName: supp.name,
        gstin: supp.gstin,
      });

      rawTaxablePR += prTx;
      rawCgstPR += prCgst;
      rawSgstPR += prSgst;
      rawIgstPR += prIgst;
      rawValPR += prTotalVal;

      // 3 matching 2B notes
      const notes = [noteVal1, noteVal2, noteVal3];
      for (let n = 0; n < notes.length; n++) {
        const nVal = notes[n];
        const nTax = Math.round(nVal * (taxRate / (1 + taxRate)) * 100) / 100;
        const nTx = Math.round((nVal - nTax) * 100) / 100;
        const nCgst = isIgst ? 0 : Math.round((nTax / 2) * 100) / 100;
        const nSgst = isIgst ? 0 : Math.round((nTax - nCgst) * 100) / 100;
        const nIgst = isIgst ? nTax : 0;

        twoBRecords.push({
          invoiceNo: `2B-BATCH-${b}-${n + 1}`,
          invoiceDate: dateStr,
          taxableValue: nTx,
          cgst: nCgst,
          sgst: nSgst,
          igst: nIgst,
          invoiceValue: nVal,
          supplierName: supp.name,
          gstin: supp.gstin,
          noteType: 'Credit',
          period: 'October 2025',
        });

        rawTaxable2B += nTx;
        rawCgst2B += nCgst;
        rawSgst2B += nSgst;
        rawIgst2B += nIgst;
        rawVal2B += nVal;
      }
    }

    // 2. Generate 25 1-to-1 exact matches
    for (let e = 1; e <= 25; e++) {
      const supp = suppliers[e % suppliers.length];
      const dateStr = `${String((e % 28) + 1).padStart(2, '0')}/09/2025`;
      const val = 5000 + e * 500;
      const tax = Math.round(val * (0.18 / 1.18) * 100) / 100;
      const tx = Math.round((val - tax) * 100) / 100;
      const cgst = Math.round((tax / 2) * 100) / 100;
      const sgst = Math.round((tax - cgst) * 100) / 100;

      const invNo = `EXACT-INV-${e}`;

      prRecords.push({
        voucherNo: `VCH-${++vchCounter}`,
        invoiceNo: invNo,
        invoiceDate: dateStr,
        taxableValue: tx,
        cgst,
        sgst,
        igst: 0,
        invoiceValue: val,
        supplierName: supp.name,
        gstin: supp.gstin,
      });

      twoBRecords.push({
        invoiceNo: invNo,
        invoiceDate: dateStr,
        taxableValue: tx,
        cgst,
        sgst,
        igst: 0,
        invoiceValue: val,
        supplierName: supp.name,
        gstin: supp.gstin,
        noteType: 'Credit',
        period: 'September 2025',
      });

      rawTaxablePR += tx;
      rawCgstPR += cgst;
      rawSgstPR += sgst;
      rawValPR += val;

      rawTaxable2B += tx;
      rawCgst2B += cgst;
      rawSgst2B += sgst;
      rawVal2B += val;
    }

    // 3. Generate 10 unmatched PR taxable notes
    for (let u = 1; u <= 10; u++) {
      const supp = suppliers[u % suppliers.length];
      const val = 12000 + u * 1000;
      const tax = Math.round(val * (0.18 / 1.18) * 100) / 100;
      const tx = Math.round((val - tax) * 100) / 100;
      const cgst = Math.round((tax / 2) * 100) / 100;
      const sgst = Math.round((tax - cgst) * 100) / 100;

      prRecords.push({
        voucherNo: `VCH-UNMATCHED-PR-${u}`,
        invoiceNo: `PR-ONLY-${u}`,
        invoiceDate: '05/08/2025',
        taxableValue: tx,
        cgst,
        sgst,
        igst: 0,
        invoiceValue: val,
        supplierName: supp.name,
        gstin: supp.gstin,
      });

      rawTaxablePR += tx;
      rawCgstPR += cgst;
      rawSgstPR += sgst;
      rawValPR += val;
    }

    // 4. Generate 15 unmatched 2B credit notes
    for (let u = 1; u <= 15; u++) {
      const supp = suppliers[u % suppliers.length];
      const val = 8000 + u * 600;
      const tax = Math.round(val * (0.18 / 1.18) * 100) / 100;
      const tx = Math.round((val - tax) * 100) / 100;
      const cgst = Math.round((tax / 2) * 100) / 100;
      const sgst = Math.round((tax - cgst) * 100) / 100;

      twoBRecords.push({
        invoiceNo: `2B-ONLY-${u}`,
        invoiceDate: '07/08/2025',
        taxableValue: tx,
        cgst,
        sgst,
        igst: 0,
        invoiceValue: val,
        supplierName: supp.name,
        gstin: supp.gstin,
        noteType: 'Credit',
        period: 'August 2025',
      });

      rawTaxable2B += tx;
      rawCgst2B += cgst;
      rawSgst2B += sgst;
      rawVal2B += val;
    }

    // Verify dataset scale: >250 records
    expect(prRecords.length + twoBRecords.length).toBeGreaterThanOrEqual(250);

    // Execute full reconciliation
    const result = reconcileDebitNotes(prRecords, twoBRecords);

    // Tally reconciled outputs
    let recoTaxablePR = 0;
    let recoCgstPR = 0;
    let recoSgstPR = 0;
    let recoIgstPR = 0;
    let recoValPR = 0;

    let recoTaxable2B = 0;
    let recoCgst2B = 0;
    let recoSgst2B = 0;
    let recoIgst2B = 0;
    let recoVal2B = 0;

    for (const r of result.reconciledRows) {
      recoTaxablePR += r.taxableValuePR;
      recoCgstPR += r.cgstPR;
      recoSgstPR += r.sgstPR;
      recoIgstPR += r.igstPR;
      recoValPR += r.invoiceValuePR;

      recoTaxable2B += r.taxableValue2B;
      recoCgst2B += r.cgst2B;
      recoSgst2B += r.sgst2B;
      recoIgst2B += r.igst2B;
      recoVal2B += r.invoiceValue2B;

      // Assert sub-row zeroing invariant
      if (r.isSubRow) {
        expect(r.taxableValuePR).toBe(0.0);
        expect(r.cgstPR).toBe(0.0);
        expect(r.sgstPR).toBe(0.0);
        expect(r.igstPR).toBe(0.0);
        expect(r.invoiceValuePR).toBe(0.0);
      }
    }

    // Mathematical zero double-counting accounting assertions (|delta| < 0.01)
    expect(Math.abs(recoTaxablePR - rawTaxablePR)).toBeLessThan(0.01);
    expect(Math.abs(recoCgstPR - rawCgstPR)).toBeLessThan(0.01);
    expect(Math.abs(recoSgstPR - rawSgstPR)).toBeLessThan(0.01);
    expect(Math.abs(recoIgstPR - rawIgstPR)).toBeLessThan(0.01);
    expect(Math.abs(recoValPR - rawValPR)).toBeLessThan(0.01);

    expect(Math.abs(recoTaxable2B - rawTaxable2B)).toBeLessThan(0.01);
    expect(Math.abs(recoCgst2B - rawCgst2B)).toBeLessThan(0.01);
    expect(Math.abs(recoSgst2B - rawSgst2B)).toBeLessThan(0.01);
    expect(Math.abs(recoIgst2B - rawIgst2B)).toBeLessThan(0.01);
    expect(Math.abs(recoVal2B - rawVal2B)).toBeLessThan(0.01);
  });
});

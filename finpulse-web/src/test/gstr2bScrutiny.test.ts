import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import {
  parseGstr2bJsonHelper,
  parseExcelDate,
  cleanStr,
  cleanNum
} from '../../gstr2b/parsers.js';
import {
  initGstr2bDatabase,
  recalculate2bBatchMetrics,
  markGstr2bMonthNilSynced,
  bulkSaveGstr2bInvoices
} from '../../gstr2b/db.js';
import {
  generateGstr2bFullYearWorkbook,
  removeAllMergesFromWorkbook
} from '../../gstr2b/fullYearExcel.js';
import {
  generateGstr2bFullYearWorkbook as generateFrontendFullYearWorkbook,
  removeAllMergesFromWorkbook as removeFrontendMerges
} from '../lib/gstr2bFullYearExport';
import * as xlsxModule from 'xlsx';
const XLSX = (xlsxModule as any).default || xlsxModule;

describe('GSTR-2B Comprehensive Scrutiny & Invariant Test Suite', () => {
  let db: sqlite3.Database;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      db = new sqlite3.Database(':memory:', (err) => {
        if (err) return reject(err);
        initGstr2bDatabase(db);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 1: GSTR-2B PARSER HARDENING (gstr2b/parsers.js)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Suite 1: GSTR-2B Parser Hardening', () => {
    it('T1.1: Multi-section JSON parsing with nested items extracts all sections correctly', () => {
      const mockPayload = {
        gstin: '27TEST1234F1Z5',
        fp: '042025',
        data: {
          docdata: {
            b2b: [
              {
                ctin: '27SUPP0001A1Z1',
                trdnm: 'SUPPLIER ONE',
                inv: [
                  {
                    inum: 'INV-B2B-1',
                    dt: '15-04-2025',
                    val: 118000,
                    pos: '27',
                    rev: 'N',
                    itcavl: 'Y',
                    items: [
                      { itm_det: { txval: 60000, iamt: 10800, camt: 0, samt: 0, csamt: 0 } },
                      { itm_det: { txval: 40000, iamt: 7200, camt: 0, samt: 0, csamt: 0 } }
                    ]
                  }
                ]
              }
            ],
            b2ba: [
              {
                ctin: '27SUPP0001A1Z1',
                trdnm: 'SUPPLIER ONE',
                inv: [
                  {
                    inum: 'INV-B2BA-1',
                    dt: '16-04-2025',
                    val: 59000,
                    pos: '27',
                    rev: 'N',
                    itcavl: 'Y',
                    items: [
                      { itm_det: { txval: 50000, iamt: 9000, camt: 0, samt: 0, csamt: 0 } }
                    ]
                  }
                ]
              }
            ],
            cdnr: [
              {
                ctin: '27SUPP0001A1Z1',
                trdnm: 'SUPPLIER ONE',
                nt: [
                  {
                    nt_num: 'CN-CDNR-1',
                    nt_dt: '20-04-2025',
                    val: 23600,
                    pos: '27',
                    rev: 'N',
                    itcavl: 'Y',
                    items: [
                      { itm_det: { txval: 20000, iamt: 3600, camt: 0, samt: 0, csamt: 0 } }
                    ]
                  }
                ]
              }
            ],
            cdnra: [
              {
                ctin: '27SUPP0001A1Z1',
                trdnm: 'SUPPLIER ONE',
                nt: [
                  {
                    nt_num: 'CN-CDNRA-1',
                    nt_dt: '21-04-2025',
                    val: 11800,
                    pos: '27',
                    rev: 'N',
                    itcavl: 'Y',
                    items: [
                      { itm_det: { txval: 10000, iamt: 1800, camt: 0, samt: 0, csamt: 0 } }
                    ]
                  }
                ]
              }
            ],
            isd: [
              {
                ctin: '27ISD00000A1Z9',
                trdnm: 'ISD HEADQUARTERS',
                doclist: [
                  {
                    docnum: 'ISD-DOC-1',
                    docdt: '22-04-2025',
                    val: 5000,
                    itcavl: 'Y',
                    items: [
                      { itm_det: { txval: 0, iamt: 5000, camt: 0, samt: 0, csamt: 0 } }
                    ]
                  }
                ]
              }
            ],
            impg: [
              {
                boenum: 'BOE-IMPG-1',
                boedt: '25-04-2025',
                portcode: 'INBOM4',
                txval: 80000,
                iamt: 14400,
                csamt: 0,
                val: 94400
              }
            ],
            impgsez: [
              {
                boenum: 'BOE-SEZ-1',
                boedt: '26-04-2025',
                portcode: 'INNSA1',
                txval: 30000,
                iamt: 5400,
                csamt: 0,
                val: 35400
              }
            ]
          }
        }
      };

      const result = parseGstr2bJsonHelper(mockPayload, '27TEST1234F1Z5', 'April 2025');
      expect(result).toBeDefined();
      expect(result.invoices).toHaveLength(7);

      const b2b = result.invoices.find((i: any) => i.inum === 'INV-B2B-1');
      expect(b2b).toBeDefined();
      expect(b2b.section).toBe('B2B');
      expect(b2b.txval).toBe(100000);
      expect(b2b.igst).toBe(18000);
      expect(b2b.total_val).toBe(118000);

      const b2ba = result.invoices.find((i: any) => i.inum === 'INV-B2BA-1');
      expect(b2ba).toBeDefined();
      expect(b2ba.section).toBe('B2BA');
      expect(b2ba.txval).toBe(50000);
      expect(b2ba.igst).toBe(9000);

      const cdnr = result.invoices.find((i: any) => i.inum === 'CN-CDNR-1');
      expect(cdnr).toBeDefined();
      expect(cdnr.section).toBe('CDNR');
      expect(cdnr.txval).toBe(20000);
      expect(cdnr.igst).toBe(3600);

      const isd = result.invoices.find((i: any) => i.inum === 'ISD-DOC-1');
      expect(isd).toBeDefined();
      expect(isd.section).toBe('ISD');
      expect(isd.igst).toBe(5000);

      const impg = result.invoices.find((i: any) => i.inum === 'BOE-IMPG-1');
      expect(impg).toBeDefined();
      expect(impg.section).toBe('IMPG');
      expect(impg.txval).toBe(80000);
      expect(impg.igst).toBe(14400);
    });

    it('T1.2: Flag handling: reverse charge and ineligible ITC flags map correctly', () => {
      const mockPayload = {
        gstin: '27TEST1234F1Z5',
        fp: '042025',
        data: {
          docdata: {
            b2b: [
              {
                ctin: '27SUPP0001A1Z1',
                trdnm: 'RCM SUPPLIER',
                inv: [
                  {
                    inum: 'INV-RCM-1',
                    dt: '10-04-2025',
                    val: 11800,
                    pos: '27',
                    rev: 'Y',
                    itcavl: 'Y',
                    items: [{ itm_det: { txval: 10000, iamt: 1800, camt: 0, samt: 0, csamt: 0 } }]
                  },
                  {
                    inum: 'INV-INELIG-1',
                    dt: '12-04-2025',
                    val: 11800,
                    pos: '27',
                    rev: 'N',
                    itcavl: 'N',
                    rsn: 'Blocked credit under 17(5)',
                    items: [{ itm_det: { txval: 10000, iamt: 1800, camt: 0, samt: 0, csamt: 0 } }]
                  }
                ]
              }
            ]
          }
        }
      };

      const result = parseGstr2bJsonHelper(mockPayload);
      const rcmInv = result.invoices.find((i: any) => i.inum === 'INV-RCM-1');
      expect(rcmInv.rchrg).toBe('Y');
      expect(rcmInv.itc_available).toBe('Y');

      const ineligInv = result.invoices.find((i: any) => i.inum === 'INV-INELIG-1');
      expect(ineligInv.rchrg).toBe('N');
      expect(ineligInv.itc_available).toBe('N');
      expect(ineligInv.itc_reason).toBe('Blocked credit under 17(5)');
    });

    it('T1.3: Date normalization: numeric Excel serials and string dates parse consistently', () => {
      // Excel serial 45762 corresponds to 15/04/2025
      const parsedSerial = parseExcelDate(45762);
      expect(parsedSerial).toBe('15/04/2025');

      const stringDate = parseExcelDate('15/04/2025');
      expect(stringDate).toBe('15/04/2025');

      // ISO normalization check
      const normalizeIso = (val: string) => {
        let norm = val.trim().replace(/\//g, '-');
        const iso = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) norm = `${iso[3]}-${iso[2]}-${iso[1]}`;
        return norm;
      };
      expect(normalizeIso('2025-04-15')).toBe('15-04-2025');
      expect(normalizeIso('15/04/2025')).toBe('15-04-2025');
    });

    it('T1.4: Period normalization: variations map to clean period tokens', () => {
      const normalizePeriod = (periodStr: string) => {
        return cleanStr(periodStr).replace(/,/g, '').trim();
      };

      expect(normalizePeriod('April, 2025')).toBe('April 2025');
      expect(normalizePeriod('  April 2025  ')).toBe('April 2025');
      expect(cleanNum('1,00,000.50')).toBe(100000.5);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 2: BATCH METRIC AGGREGATION SCRUTINY (recalculate2bBatchMetrics)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Suite 2: Batch Metric Aggregation Scrutiny', () => {
    it('T2.1 & T2.2: Statutory line-item fixtures strictly maintain Table 4 ITC mathematical separation', async () => {
      const gstin = '27TEST1234F1Z5';
      const period = 'April 2025';

      // 6 Statutory fixtures:
      // 1. Eligible B2B: Taxable 1,00,000, IGST 18,000
      // 2. Reverse Charge B2B (rchrg = 'Y'): Taxable 50,000, IGST 9,000
      // 3. Supplier Credit Note (CDNR): Taxable 20,000, IGST 3,600
      // 4. ISD Credit: Taxable 0, IGST 5,000
      // 5. Import of Goods (IMPG): Taxable 80,000, IGST 14,400
      // 6. Ineligible ITC (itc_available = 'N'): Taxable 10,000, IGST 1,800
      const testInvoices = [
        {
          section: 'B2B',
          ctin: '27SUPP0001A1Z1',
          supplier_name: 'REGULAR B2B SUPPLIER',
          inum: 'INV-ELIG-01',
          idt: '05-04-2025',
          inv_typ: 'Regular',
          pos: '27',
          rchrg: 'N',
          itc_available: 'Y',
          txval: 100000,
          igst: 18000,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 118000
        },
        {
          section: 'B2B',
          ctin: '27SUPP0002A1Z2',
          supplier_name: 'RCM TRANSPORTER',
          inum: 'INV-RCM-01',
          idt: '08-04-2025',
          inv_typ: 'Regular',
          pos: '27',
          rchrg: 'Y',
          itc_available: 'Y',
          txval: 50000,
          igst: 9000,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 59000
        },
        {
          section: 'CDNR',
          ctin: '27SUPP0001A1Z1',
          supplier_name: 'REGULAR B2B SUPPLIER',
          inum: 'CN-01',
          idt: '12-04-2025',
          inv_typ: 'Credit Note',
          pos: '27',
          rchrg: 'N',
          itc_available: 'Y',
          txval: 20000,
          igst: 3600,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 23600
        },
        {
          section: 'ISD',
          ctin: '27ISD00000A1Z9',
          supplier_name: 'ISD HO',
          inum: 'ISD-01',
          idt: '15-04-2025',
          inv_typ: 'ISD',
          pos: '27',
          rchrg: 'N',
          itc_available: 'Y',
          txval: 0,
          igst: 5000,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 5000
        },
        {
          section: 'IMPG',
          ctin: 'CUSTOMS',
          supplier_name: 'IMPORT OF GOODS',
          inum: 'BOE-01',
          idt: '20-04-2025',
          inv_typ: 'Import',
          pos: 'INBOM4',
          rchrg: 'N',
          itc_available: 'Y',
          txval: 80000,
          igst: 14400,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 94400
        },
        {
          section: 'B2B',
          ctin: '27SUPP0003A1Z3',
          supplier_name: 'INELIGIBLE VENDOR',
          inum: 'INV-INELIG-01',
          idt: '25-04-2025',
          inv_typ: 'Regular',
          pos: '27',
          rchrg: 'N',
          itc_available: 'N',
          itc_reason: 'Section 17(5) Motor Vehicles',
          txval: 10000,
          igst: 1800,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 11800
        }
      ];

      // Save invoices to in-memory database
      await bulkSaveGstr2bInvoices(db, gstin, period, testInvoices);

      // Recalculate metrics
      const metrics: any = await recalculate2bBatchMetrics(db, gstin, period);

      // 1. Total invoice count
      expect(metrics.total_invoices).toBe(6);

      // 2. Table 4(A)(5) Eligible ITC: strictly eligible B2B non-RCM, non-CDNR, non-ISD, non-IMPG, non-ineligible
      expect(metrics.eligible_itc_igst).toBe(18000);
      expect(metrics.eligible_itc_txval).toBe(100000);
      expect(metrics.eligible_itc_total).toBe(18000);

      // 3. Reverse Charge Table 3.1(d) / 4(A)(3)
      expect(metrics.rcm_igst).toBe(9000);
      expect(metrics.rcm_txval).toBe(50000);
      expect(metrics.rcm_total).toBe(9000);

      // 4. CDNR Supplier Credit Notes (Row 38)
      expect(metrics.cdnr_igst).toBe(3600);
      expect(metrics.cdnr_txval).toBe(20000);
      expect(metrics.cdnr_total).toBe(3600);

      // 5. ISD Table 4(A)(4)
      expect(metrics.isd_total).toBe(5000);

      // 6. IMPG Table 4(A)(1)
      expect(metrics.impg_igst).toBe(14400);

      // 7. Ineligible ITC Table 4(B)
      expect(metrics.ineligible_itc_total).toBe(1800);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 3: CONSOLIDATED 8-SHEET FULL-YEAR ZERO-MERGE SCRUTINY
  // ───────────────────────────────────────────────────────────────────────────
  describe('Suite 3: Consolidated 8-Sheet Full-Year Zero-Merge Scrutiny', () => {
    const months = [
      'April', 'May', 'June', 'July', 'August', 'September',
      'October', 'November', 'December', 'January', 'February', 'March'
    ];

    const synthetic12mInvoices: any[] = [];
    months.forEach((m, idx) => {
      // B2B Invoice
      synthetic12mInvoices.push({
        section: 'B2B',
        client_gstin: '27AABCU9603R1ZM',
        return_period: `${m} 2025`,
        ctin: '27AAGCB2345K1Z1',
        supplier_name: 'ALPHA TRADERS',
        inum: `INV-${idx + 1}`,
        idt: `10-04-2025`,
        txval: 10000 * (idx + 1),
        igst: 1800 * (idx + 1),
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 11800 * (idx + 1),
        itc_available: 'Y'
      });

      // CDNR Note
      synthetic12mInvoices.push({
        section: 'CDNR',
        client_gstin: '27AABCU9603R1ZM',
        return_period: `${m} 2025`,
        ctin: '27AAGCB2345K1Z1',
        supplier_name: 'ALPHA TRADERS',
        inum: `CN-${idx + 1}`,
        idt: `20-04-2025`,
        txval: 2000 * (idx + 1),
        igst: 360 * (idx + 1),
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 2360 * (idx + 1),
        itc_available: 'Y'
      });
    });

    it('T3.1: Backend & Frontend workbooks generate exactly 8 canonical sheets with ws["!merges"] = []', () => {
      const canonicalSheets = ['B2B', 'CDNR', 'ECO', 'ISD', 'IMPG', 'IMPGSEZ', 'B2B(Rejected)', 'CDNR(Rejected)'];

      // Backend Workbook
      const backendWb = generateGstr2bFullYearWorkbook({
        clientInfo: { trade_name: 'MAHINDRA & MAHINDRA', gstin: '27AABCU9603R1ZM' },
        financialYear: '2025-2026',
        invoices: synthetic12mInvoices
      });

      expect(backendWb.SheetNames).toEqual(canonicalSheets);
      for (const sheetName of backendWb.SheetNames) {
        const ws = backendWb.Sheets[sheetName];
        expect(ws['!merges'] || []).toHaveLength(0);
      }

      // Frontend Workbook
      const frontendWb = generateFrontendFullYearWorkbook({
        clientInfo: { trade_name: 'MAHINDRA & MAHINDRA', gstin: '27AABCU9603R1ZM' },
        financialYear: '2025-2026',
        invoices: synthetic12mInvoices
      });

      expect(frontendWb.SheetNames).toEqual(canonicalSheets);
      for (const sheetName of frontendWb.SheetNames) {
        const ws = frontendWb.Sheets[sheetName];
        expect(ws['!merges'] || []).toHaveLength(0);
      }
    });

    it('T3.2: removeAllMergesFromWorkbook clears artificially injected merges', () => {
      const testWb = XLSX.utils.book_new();
      const testWs = XLSX.utils.aoa_to_sheet([['A1', 'B1'], ['A2', 'B2']]);
      testWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      XLSX.utils.book_append_sheet(testWb, testWs, 'MergedSheet');

      expect(testWs['!merges']).toHaveLength(1);

      // Backend guardrail
      removeAllMergesFromWorkbook(testWb);
      expect(testWs['!merges'] || []).toHaveLength(0);

      // Frontend guardrail
      testWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      removeFrontendMerges(testWb);
      expect(testWs['!merges'] || []).toHaveLength(0);
    });

    it('T3.3: Mathematical identity holds in B2B sheet side-by-side matrices: Net = B2B - CDNR', () => {
      const wb = generateGstr2bFullYearWorkbook({
        clientInfo: { trade_name: 'TEST CORP', gstin: '27AABCU9603R1ZM' },
        financialYear: '2025-2026',
        invoices: synthetic12mInvoices
      });

      const b2bSheet = wb.Sheets['B2B'];
      const rows: any[][] = XLSX.utils.sheet_to_json(b2bSheet, { header: 1 });

      // Rows 8 is header (row 9 in 1-based Excel)
      // Rows 9 to 20 are the 12 month rows
      for (let r = 9; r < 9 + 12; r++) {
        const row = rows[r];
        if (!row || !row[32]) continue; // Month name in Col AG (index 32)

        const b2bTaxable = Number(row[33]) || 0; // Col AH
        const cdnrTaxable = Number(row[39]) || 0; // Col AN
        const netTaxable = Number(row[45]) || 0; // Col AT

        // Net = B2B - CDNR
        expect(netTaxable).toBeCloseTo(b2bTaxable - cdnrTaxable, 2);

        const b2bIgst = Number(row[36]) || 0; // Col AK
        const cdnrIgst = Number(row[42]) || 0; // Col AQ
        const netIgst = Number(row[48]) || 0; // Col AW

        expect(netIgst).toBeCloseTo(b2bIgst - cdnrIgst, 2);
      }

      // Check Party-wise summary in row 9:
      const firstDataRow = rows[9];
      const partyB2bTaxable = Number(firstDataRow[58]) || 0; // Col BG
      const partyCdnrTaxable = Number(firstDataRow[64]) || 0; // Col BM
      const partyNetTaxable = Number(firstDataRow[70]) || 0; // Col BS

      expect(partyNetTaxable).toBeCloseTo(partyB2bTaxable - partyCdnrTaxable, 2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 4: GOLDEN RULE NON-DESTRUCTIVE STORAGE SCRUTINY (gstr2b/db.js)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Suite 4: Golden Rule Non-Destructive Storage Scrutiny', () => {
    const goldenGstin = '27GOLDEN0001Z1';

    it('T4.1: Failed or timed-out download (empty array) strictly preserves existing DB records', async () => {
      const aprilInvoices = [
        {
          section: 'B2B',
          ctin: '27SUPP9999A1Z1',
          supplier_name: 'CRITICAL AUDIT VENDOR',
          inum: 'INV-AUDIT-99',
          idt: '10-04-2025',
          txval: 500000,
          igst: 90000,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total_val: 590000,
          itc_available: 'Y'
        }
      ];

      // 1. Initial successful sync
      await bulkSaveGstr2bInvoices(db, goldenGstin, 'April 2025', aprilInvoices);

      // Verify invoice exists
      const beforeInvs: any[] = await new Promise((res, rej) => {
        db.all('SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND return_period = ?', [goldenGstin, 'April 2025'], (err, rows) => {
          if (err) return rej(err);
          res(rows);
        });
      });
      expect(beforeInvs).toHaveLength(1);
      expect(beforeInvs[0].inum).toBe('INV-AUDIT-99');

      // 2. Simulated failed/timed-out download: empty array passed
      const emptyResult = await bulkSaveGstr2bInvoices(db, goldenGstin, 'April 2025', []);
      expect(emptyResult.count).toBe(0);

      // 3. Verify April records remain 100% intact
      const afterInvs: any[] = await new Promise((res, rej) => {
        db.all('SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND return_period = ?', [goldenGstin, 'April 2025'], (err, rows) => {
          if (err) return rej(err);
          res(rows);
        });
      });
      expect(afterInvs).toHaveLength(1);
      expect(afterInvs[0].inum).toBe('INV-AUDIT-99');
      expect(afterInvs[0].txval).toBe(500000);
    });

    it('T4.2: Confirmed Nil Return records NIL_SYNCED status without disturbing other periods', async () => {
      // Explicitly mark May 2025 as confirmed Nil
      const nilResult = await markGstr2bMonthNilSynced(db, goldenGstin, 'May 2025');
      expect(nilResult.success).toBe(true);
      expect(nilResult.status).toBe('NIL_SYNCED');

      // Verify May 2025 batch
      const mayBatch: any = await new Promise((res, rej) => {
        db.get('SELECT * FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?', [goldenGstin, 'May 2025'], (err, row) => {
          if (err) return rej(err);
          res(row);
        });
      });
      expect(mayBatch).toBeDefined();
      expect(mayBatch.status).toBe('NIL_SYNCED');
      expect(mayBatch.total_invoices).toBe(0);

      // Verify April 2025 batch is unaffected
      const aprilBatch: any = await new Promise((res, rej) => {
        db.get('SELECT * FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?', [goldenGstin, 'April 2025'], (err, row) => {
          if (err) return rej(err);
          res(row);
        });
      });
      expect(aprilBatch).toBeDefined();
      expect(aprilBatch.status).toBe('SYNCED');
      expect(aprilBatch.total_invoices).toBe(1);
    });

    it('T4.3: recalculate2bBatchMetrics on un-synced empty month defaults to PENDING, not SYNCED', async () => {
      // Period with 0 invoices and no prior sync
      const res: any = await recalculate2bBatchMetrics(db, goldenGstin, 'June 2025');
      expect(res.status).toBe('PENDING');
      expect(res.total_invoices).toBe(0);

      // Verify database batch table stores PENDING
      const juneBatch: any = await new Promise((res, rej) => {
        db.get('SELECT * FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?', [goldenGstin, 'June 2025'], (err, row) => {
          if (err) return rej(err);
          res(row);
        });
      });
      expect(juneBatch.status).toBe('PENDING');
    });
  });
});

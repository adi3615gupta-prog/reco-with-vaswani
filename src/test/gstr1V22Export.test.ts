import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  generateGstr1V22Workbook,
  generateGstr1SectionCsvs,
  exportCompareGstr3bWithGstr1Detailed,
  exportCompareGstr3bWithBooks,
  V22_SHEET_NAMES,
  removeAllMergesFromWorkbook
} from '../lib/gstr1V22Export';
import { Gstr1ReturnData } from '../lib/gstr1Engine';

describe('Official GSTR-1 V2.2 32-Sheet Exporter & TaxPower Audit Defense (Plan 25-02)', () => {
  const mockReturnData: Gstr1ReturnData = {
    gstin: '27AAGCD4105L1ZO',
    fp: '092026',
    b2b: [
      {
        ctin: '24AAGCD4105L1ZO',
        cfs: 'Y',
        inv: [
          {
            inum: 'INV-2026-001',
            idt: '15-09-2026',
            val: 118000,
            pos: '24',
            rchrg: 'N',
            inv_typ: 'R',
            buyerName: 'Gujarat Enterprise',
            itms: [
              {
                num: 1,
                itm_det: {
                  txval: 100000,
                  rt: 18,
                  iamt: 18000,
                  camt: 0,
                  samt: 0,
                  csamt: 0
                }
              }
            ]
          }
        ]
      }
    ],
    b2cl: [],
    b2cs: [
      {
        sply_ty: 'INTRA',
        pos: '27',
        typ: 'OE',
        txval: 50000,
        rt: 18,
        camt: 4500,
        samt: 4500,
        csamt: 0
      }
    ],
    cdnr: [],
    cdnur: [],
    exp: [],
    hsn: {
      hsn_b2b: [
        {
          num: 1,
          hsn_sc: '847130',
          desc: 'Computers',
          uqc: 'NOS-NUMBERS',
          qty: 5,
          val: 118000,
          txval: 100000,
          rt: 18,
          iamt: 18000,
          camt: 0,
          samt: 0,
          csamt: 0
        }
      ],
      hsn_b2c: [
        {
          num: 1,
          hsn_sc: '847130',
          desc: 'Computers',
          uqc: 'NOS-NUMBERS',
          qty: 2,
          val: 59000,
          txval: 50000,
          rt: 18,
          iamt: 0,
          camt: 4500,
          samt: 4500,
          csamt: 0
        }
      ]
    },
    doc_issue: {
      doc_det: [
        {
          doc_num: 1,
          doc_typ: 'Invoices for outward supply',
          docs: [
            {
              num: 1,
              from: 'INV-2026-001',
              to: 'INV-2026-001',
              totnum: 1,
              canc: 0,
              net_issue: 1
            }
          ]
        }
      ]
    }
  };

  it('generates the exact official 32 sheets in the V2.2 workbook', () => {
    const wb = generateGstr1V22Workbook(mockReturnData, { companyName: 'Vaswani Enterprises' });
    expect(wb.SheetNames).toHaveLength(32);
    for (const expectedSheet of V22_SHEET_NAMES) {
      expect(wb.SheetNames).toContain(expectedSheet);
    }
  });

  it('STRICT INVARIANT: guarantees zero merged cells across all 32 sheets', () => {
    const wb = generateGstr1V22Workbook(mockReturnData);
    for (const sName of wb.SheetNames) {
      const ws = wb.Sheets[sName];
      expect(ws['!merges'] || []).toHaveLength(0);
    }
  });

  it('populates b2b and bifurcated HSN sheets accurately', () => {
    const wb = generateGstr1V22Workbook(mockReturnData);
    const b2bRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['b2b,sez,de'], { header: 1 });
    expect(b2bRows.length).toBeGreaterThan(1);
    expect(b2bRows[1][0]).toBe('24AAGCD4105L1ZO'); // GSTIN
    expect(b2bRows[1][2]).toBe('INV-2026-001');     // Invoice Number

    const hsnB2bRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['hsn(b2b)'], { header: 1 });
    expect(hsnB2bRows[1][0]).toBe('847130');
    expect(hsnB2bRows[1][2]).toBe('NOS-NUMBERS');

    const hsnB2cRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['hsn(b2c)'], { header: 1 });
    expect(hsnB2cRows[1][0]).toBe('847130');
  });

  it('generates a valid zipped buffer of section-wise CSVs', async () => {
    const zipBuffer = await generateGstr1SectionCsvs(mockReturnData);
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(zip.files);
    expect(fileNames).toContain('b2b,sez,de.csv');
    expect(fileNames).toContain('b2cs.csv');
    expect(fileNames).toContain('hsn(b2b).csv');
    expect(fileNames).toContain('hsn(b2c).csv');
    expect(fileNames).toContain('docs.csv');

    const b2bCsv = await zip.files['b2b,sez,de.csv'].async('text');
    expect(b2bCsv).toContain('24AAGCD4105L1ZO');
    expect(b2bCsv).toContain('INV-2026-001');
  });

  it('generates DRC-01B detailed comparison workbook with zero merges and flags variances', () => {
    const rows = [
      {
        section: '3.1(a)',
        description: 'Outward taxable supplies',
        gstr3bTaxable: 100000,
        gstr3bIgst: 18000,
        gstr3bCgst: 0,
        gstr3bSgst: 0,
        gstr3bCess: 0,
        gstr1Taxable: 200000,
        gstr1Igst: 36000,
        gstr1Cgst: 0,
        gstr1Sgst: 0,
        gstr1Cess: 0
      }
    ];

    const wb = exportCompareGstr3bWithGstr1Detailed(rows, {
      name: 'Test Client',
      gstin: '27AAGCD4105L1ZO',
      fp: '092026'
    });

    expect(wb.SheetNames).toContain('DRC01B_3B_vs_R1');
    const ws = wb.Sheets['DRC01B_3B_vs_R1'];
    expect(ws['!merges'] || []).toHaveLength(0);

    const sheetRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    // Row 4 is header, row 5 is first data row
    const dataRow = sheetRows[4];
    expect(dataRow[0]).toBe('3.1(a)');
    expect(dataRow[15]).toBe(18000); // Diff total tax (36000 - 18000)
    expect(dataRow[16]).toBe('100%'); // 100% variance
  });

  it('generates DRC-01C Books vs 3B comparison workbook isolating excess vs short ITC with zero merges', () => {
    const rows = [
      {
        section: '4(A)(5)',
        description: 'All Other ITC',
        gstr3bItc: 50000,
        booksItc: 40000 // Excess claimed in 3B = 10,000 (DRC-01C notice risk)
      },
      {
        section: '4(A)(3)',
        description: 'Inward RCM',
        gstr3bItc: 5000,
        booksItc: 8000  // Short claimed in 3B = 3,000 (Unclaimed credit)
      }
    ];

    const wb = exportCompareGstr3bWithBooks(rows, {
      name: 'Test Client',
      gstin: '27AAGCD4105L1ZO',
      fp: '092026'
    });

    expect(wb.SheetNames).toContain('DRC01C_3B_vs_Books');
    const ws = wb.Sheets['DRC01C_3B_vs_Books'];
    expect(ws['!merges'] || []).toHaveLength(0);

    const sheetRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    const row1 = sheetRows[4];
    expect(row1[4]).toBe(10000); // Excess ITC
    expect(row1[6]).toContain('HIGH RISK');

    const row2 = sheetRows[5];
    expect(row2[5]).toBe(3000); // Short ITC
    expect(row2[6]).toContain('UNCLAIMED CREDIT');
  });
});

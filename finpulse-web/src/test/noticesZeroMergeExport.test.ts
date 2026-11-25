import { describe, it, expect } from 'vitest';
import { generateNoticeAnnexureExcel, removeAllMergesFromWorkbook } from '../../src/lib/noticeReconciliation';

describe('GST Notices Zero-Merge Spreadsheet Export (NOTICES-04, T-12-05)', () => {
    it('should generate workbook with STRICT ZERO-MERGES (ws["!merges"] is empty array)', () => {
        const dummyResult = {
            noticeId: 'N-101',
            referenceNo: 'ZA270324001',
            gstin: '27AABCS1429B1Z1',
            financialYear: '2023-24',
            totalDemanded: 25000,
            explainedAmount: 25000,
            unexplainedResidual: 0,
            explanations: [],
            invoiceLedger: [
                {
                    supplierGstin: '27AABCU9603R1ZM',
                    supplierName: 'ABC Steel Ltd',
                    invoiceNo: 'INV/2023/889',
                    invoiceDate: '2023-08-15',
                    taxableValue: 138888,
                    igst: 25000,
                    cgst: 0,
                    sgst: 0,
                    totalTax: 25000,
                    twoBPeriod: 'November 2023',
                    threeBPeriod: 'Q2',
                    classification: 'Timing Difference',
                    statutoryGround: 'Section 16(2)'
                }
            ]
        };

        const wb = generateNoticeAnnexureExcel(dummyResult, { companyName: 'Vaswani Industries' });
        expect(wb).toBeDefined();
        expect(wb.SheetNames.length).toBeGreaterThan(0);

        for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            expect(ws).toBeDefined();
            expect(ws['!merges'] || []).toHaveLength(0);
        }
    });

    it('removeAllMergesFromWorkbook should strip all existing merges cleanly', () => {
        const fakeWb: any = {
            Sheets: {
                Sheet1: { '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }] },
                Sheet2: { '!merges': [{ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }] }
            }
        };

        removeAllMergesFromWorkbook(fakeWb);
        expect(fakeWb.Sheets.Sheet1['!merges']).toHaveLength(0);
        expect(fakeWb.Sheets.Sheet2['!merges']).toHaveLength(0);
    });
});

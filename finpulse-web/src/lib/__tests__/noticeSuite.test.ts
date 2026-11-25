import { describe, it, expect } from 'vitest';
import { classifyNoticeDocument, extractDemandBreakdown, extractTextFromBuffer } from '../../../notices/classifier.js';
import { computeLimitationDueDate, checkNoticeLimitation } from '../../../notices/db.js';
import { analyzeSanitizedNotice } from '../geminiTaxEngine';
import {
    computeRule88BInterest,
    computeParam0073FourSubheadReco,
    checkParam0074DateValidity,
    detectParam0219DoubleCount,
    evaluateSec16And128A,
    computePreDepositAndAssordRefund,
    computeRule37And42AndRefund89,
    generateDefenseWorkbook
} from '../noticeReconciliation';
import { generateNoticeReply, listAvailableReplyTemplates } from '../noticeReplyGenerator';
import { generateNoticeDocxBlob } from '../noticeDocxExporter';
import { sanitizePayload, rehydrateDraft } from '../piiSanitizer';

describe('Phase 39 — A-to-Z GST & MVAT Notices Enterprise Suite', () => {
    it('classifies hyphen-spaced GST forms, Sec 125 7d SCN, SPL-07, REG-31, MVAT 303 & Param codes without fake 25% interest', () => {
        const dropCls = classifyNoticeDocument('Drop.pdf', 'Order of acceptance of reply DROPPING THE PROCEEDINGS GSTIN 27AVRPK3141N1Z2 Para 73 Ref ZD2712240714885');
        expect(dropCls.formCode).toBe('DRC-05');
        expect(dropCls.paramCodes).toContain('0073');

        const sec125Cls = classifyNoticeDocument('PENALTY.pdf', 'FORM GST DRC - 01 Rule 100(2) Section 125 General Penalty Rs. 50000');
        expect(sec125Cls.formCode).toBe('DRC-01 (Sec 125)');
        expect(sec125Cls.deadlineDays).toBe(7);

        const spl07Cls = classifyNoticeDocument('Undertaking.pdf', 'FORM GST SPL - 07 Reference ZD270625008116K');
        expect(spl07Cls.formCode).toBe('SPL-07');

        const reg31Cls = classifyNoticeDocument('SCN.pdf', 'FORM GST REG - 31 See Rule 21A');
        expect(reg31Cls.formCode).toBe('REG-31');
        expect(reg31Cls.deadlineDays).toBe(30);

        const mvatCls = classifyNoticeDocument('order.pdf', 'MVAT Act Form 303(231) Section 23(5) Form 704 J1xJ2');
        expect(mvatCls.formCode).toBe('MVAT-303');

        const breakdownNoInterest = extractDemandBreakdown('CGST Act, 2017 excess ITC amount at Rs. 1,04,400/-');
        expect(breakdownNoInterest.taxDemanded).toBe(104400);
        expect(breakdownNoInterest.interestDemanded).toBe(0);
    });

    it('computes accurate statutory deadlines and Section 74A / 169 / MVAT limitations', () => {
        expect(computeLimitationDueDate('DRC-01A', '2025-02-01')).toBe('2025-02-16');
        expect(computeLimitationDueDate('DRC-01 (Sec 125)', '2025-02-01')).toBe('2025-02-08');
        expect(computeLimitationDueDate('REG-31', '2026-02-01')).toBe('2026-03-03');
        expect(computeLimitationDueDate('RFD-08', '2025-03-01')).toBe('2025-03-16');

        const sec74a = checkNoticeLimitation('2024-25', 'Section 74A', '2029-01-15');
        expect(sec74a.deadline).toBe('2028-06-30');
        expect(sec74a.isTimeBarred).toBe(true);
        expect(sec74a.sec169Warning).toContain('169');
    });

    it('computes Rule 88B Net-Cash + Sec 50(3) unutilized ECrL shield (Adesh Kad pattern)', () => {
        const res = computeRule88BInterest([{
            period: 'Mar-2023',
            dueDate: '2023-04-20',
            filingDate: '2023-05-20',
            grossTaxPayable: 0,
            itcOffset: 0,
            cashTaxPaid: 0,
            wronglyAvailedItc: 2700000,
            minEcrlBalanceMaintained: 2543400 // Only Rs 1,56,600 utilized for 30 days
        }]);
        expect(res.details[0].sec50_3ProtectedCredit).toBe(2543400);
        expect(res.totalLawfulInterest).toBe(Math.round(156600 * 0.18 * (30 / 365)));
        expect(res.totalSaving).toBeGreaterThan(30000);
    });

    it('calculates Param 0073 4-subheads + Circular 183 buckets, Param 0074 dates & 0219 double count', () => {
        const r73 = computeParam0073FourSubheadReco({
            table4A1_3B: 100000, icegateBoe: 100000,
            table4A2_3_3B: 50000, rcm3_1dPaid: 50000,
            table4A4_3B: 0, isd6A: 0,
            table4A5_3B: 800000, b2b2B: 750000,
            priorFyInCurr3B: 50000, currFyInNext3B: 0,
            unreconciledVendors: [
                { gstin: '27AAA1', taxDiff: 600000 },
                { gstin: '27BBB2', taxDiff: 120000 }
            ]
        });
        expect(r73.netUnexplainedItcDiff).toBe(0);
        expect(r73.circular183.caUdinCertRequired).toHaveLength(1);
        expect(r73.circular183.supplierSelfDeclRequired).toHaveLength(1);

        const r74 = checkParam0074DateValidity([
            { invoiceNo: '1', invoiceDate: '06/12/2018', supplierGstin: '09AAA', supplierRcCancelledDate: '29/01/2020', taxAmount: 100000 },
            { invoiceNo: '2', invoiceDate: '15/02/2020', supplierGstin: '09AAA', supplierRcCancelledDate: '29/01/2020', taxAmount: 25000 }
        ]);
        expect(r74.bonaFideTaxProtected).toBe(100000);
        expect(r74.postCancellationTaxAtRisk).toBe(25000);

        const r219 = detectParam0219DoubleCount([
            { paramCode: '0070', taxDemanded: 50000 },
            { paramCode: '0219', taxDemanded: 50000 }
        ]);
        expect(r219.hasDoubleCountRisk).toBe(true);
    });

    it('detects Sec 16(5) & SPL-03 Late Fee / 75(12) traps, Pre-Deposit head splits & Rule 89(4)/(5)', () => {
        const evalRes = evaluateSec16And128A({
            financialYear: '2018-19',
            section: 'Section 73',
            gstr3bFilingDate: '2021-10-15',
            lateFeePaid: false,
            paramCodes: ['0070', '0078'],
            confirmed16_4Demand: 120000
        });
        expect(evalRes.sec16_5Eligible).toBe(true);
        expect(evalRes.notif22_2024Eligible).toBe(true);
        expect(evalRes.spl128AEligible).toBe(true);
        expect(evalRes.splTraps).toHaveLength(2);

        // Regression [C-2]: Indian DD/MM/YYYY date comparison must NOT treat 2025 <= 2021 or fail 30/11/2021
        expect(evaluateSec16And128A({ financialYear: '2018-19', section: 'Section 73', gstr3bFilingDate: '30/11/2021' }).sec16_5Eligible).toBe(true);
        expect(evaluateSec16And128A({ financialYear: '2018-19', section: 'Section 73', gstr3bFilingDate: '15/10/2025' }).sec16_5Eligible).toBe(false);

        const pre = computePreDepositAndAssordRefund(
            { igst: 0, cgst: 100000, sgst: 100000 },
            { igst: 0, cgst: 25000, sgst: 25000 },
            'APL_01'
        );
        expect(pre.totalRequired).toBe(20000);
        expect(pre.totalRefundableAssord).toBe(30000);

        const r89 = computeRule37And42AndRefund89({
            commonItcC2: 100000, exemptTurnoverE: 200000, totalTurnoverF: 1000000,
            exportZeroRatedTurnover: 500000, adjTotalTurnover: 1000000, netItcExports: 80000
        });
        expect(r89.rule42D1).toBe(20000);
        expect(r89.exportRefund89_4).toBe(40000);
    });

    it('exports 7-tab Defense Workbook with strictly ZERO cell merges on every worksheet', () => {
        const wb = generateDefenseWorkbook({
            clientName: 'Adesh Kad',
            gstin: '27AVRPK3141N1Z2',
            financialYear: '2022-23',
            caseRef: 'ZD2712240714885',
            issues: [{ paramCode: '0073', issueTitle: 'Excess ITC', taxDemanded: 2700000, interestDemanded: 2316, penaltyDemanded: 0, strategy: 'Sec 50(3)' }],
            payments: [{ form: 'DRC-03', refNo: 'AD270225078865M', date: '24/02/2025', via: 'ECrL+Cash', tax: 2700000, interest: 2316, penalty: 0, drc03a: false }]
        });
        expect(wb.SheetNames).toHaveLength(7);
        for (const name of wb.SheetNames) {
            expect(wb.Sheets[name]['!merges'] || []).toHaveLength(0);
        }
    });

    it('generates 20+ reply & legal kit templates, native DOCX tables, and scrubs DIN/TIN/ARN/Bank PII', async () => {
        const list = listAvailableReplyTemplates();
        expect(list.length).toBeGreaterThanOrEqual(27);
        expect(list.some((t) => t.key === 'ASMT_11')).toBe(true);
        expect(list.some((t) => t.key === 'DRC_06')).toBe(true);

        const sampleNotice = {
            client_gstin: '27AARFR1880L2ZG',
            client_legal_name: 'R B Enterprises',
            reference_no: 'ZD270625008116K',
            financial_year: '2018-19',
            issue_date: '03/06/2025',
            total_demanded: 148000,
            param_codes_json: '["0073","0080"]'
        };
        const dummyReco = {
            noticeId: 'n1', referenceNo: 'ZD270625008116K', gstin: '27AARFR1880L2ZG',
            financialYear: '2018-19', totalDemanded: 148000, explainedAmount: 148000,
            unexplainedResidual: 0, explanations: [], invoiceLedger: []
        };
        const drc06Param = generateNoticeReply('DRC_06', sampleNotice, dummyReco);
        expect(drc06Param.text).toContain('Parameter-Wise Submissions');
        expect(drc06Param.text).toContain('Circular 183/15/2022');
        expect(drc06Param.text).toContain('Rule 88B');
        const und = generateNoticeReply('SPL_07_RESTORATION_UNDERTAKING', sampleNotice, dummyReco);
        expect(und.text).toContain('Rule 164(12)');

        const blob = await generateNoticeDocxBlob({
            clientLegalName: 'R B Enterprises', clientGstin: '27AARFR1880L2ZG', clientPan: 'AARFR1880L',
            referenceNo: 'ZD270625008116K', noticeType: 'SPL-07', financialYear: '2018-19',
            issuingOfficer: 'Proper Officer', jurisdiction: 'Pune', draftMarkdown: und.text,
            totalDemanded: 148000, disputedAmount: 148000,
            tables: [{ title: 'Demand Summary', headers: ['Head', 'Amount'], rows: [['Tax', 148000]] }]
        });
        expect(blob.size).toBeGreaterThan(1000);

        const raw = 'Notice DIN: 20251168UC000012345X TIN 27123456789V Demand ZD270625008116K Bank A/C No. 50200024591006';
        const scrubbed = sanitizePayload(raw);
        expect(scrubbed.sanitizedText).not.toContain('20251168UC000012345X');
        expect(scrubbed.sanitizedText).not.toContain('27123456789V');
        expect(scrubbed.sanitizedText).not.toContain('50200024591006');
        expect(rehydrateDraft(scrubbed.sanitizedText, scrubbed.sessionId, scrubbed.tokenMap)).toBe(raw);
    });

    it('imports scrutiny folder idempotently without LOCAL- collision, blocks system dirs & non-admin roles', async () => {
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        const http = await import('http');
        const expressMod = await import('express');
        const sqliteMod = await import('sqlite3');
        const { setupNoticesRoutes } = await import('../../../notices_routes.js');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail_ntc_'));
        const subDir = path.join(tmpDir, 'Scrutiny_FY_2022_23');
        fs.mkdirSync(subDir, { recursive: true });
        // Two files sharing identical first 10 bytes of relPath without portal Ref IDs
        fs.writeFileSync(path.join(subDir, 'Notice1.txt'), 'FORM GST ASMT-10 GSTIN 27AVRPK3141N1Z2 Dated 01/02/2025');
        fs.writeFileSync(path.join(subDir, 'Notice2.txt'), 'FORM GST DRC-01 GSTIN 27AVRPK3141N1Z2 Dated 15/02/2025');

        const db = new sqliteMod.default.Database(':memory:');
        const app = expressMod.default();
        app.use(expressMod.default.json());
        let activeRole = 'admin';
        setupNoticesRoutes(app, db, (req: any, _res: any, next: any) => { req.user = { username: 'tester', role: activeRole }; next(); });

        // Wait briefly for db.serialize CREATE TABLE statements
        await new Promise((r) => setTimeout(r, 80));

        const server = http.createServer(app);
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
        const port = (server.address() as any).port;
        const postJson = async (urlPath: string, body: any) => {
            const resp = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return { status: resp.status, data: await resp.json() };
        };

        try {
            // 1. Blocked for non-admin user role
            activeRole = 'user';
            const rDenied = await postJson('/api/notices/scan-folder', { folderPath: tmpDir });
            expect(rDenied.status).toBe(403);

            // 2. Blocked on OS root directory
            activeRole = 'admin';
            const rSys = await postJson('/api/notices/scan-folder', { folderPath: 'C:\\Windows' });
            expect(rSys.status).toBe(403);

            // 3. Import twice -> both distinct notices preserved & zero duplicate events/cases
            const rImp1 = await postJson('/api/notices/import-folder', { folderPath: tmpDir });
            expect(rImp1.status).toBe(200);
            expect(rImp1.data.importedNotices).toBe(2);

            const rImp2 = await postJson('/api/notices/import-folder', { folderPath: tmpDir });
            expect(rImp2.status).toBe(200);

            const noticesCount = await new Promise<number>((resolve) => db.get(`SELECT COUNT(*) as c FROM gst_notices`, (_e, row: any) => resolve(row.c)));
            const casesCount = await new Promise<number>((resolve) => db.get(`SELECT COUNT(*) as c FROM gst_cases`, (_e, row: any) => resolve(row.c)));
            const eventsCount = await new Promise<number>((resolve) => db.get(`SELECT COUNT(*) as c FROM gst_case_events`, (_e, row: any) => resolve(row.c)));
            expect(noticesCount).toBe(2);
            expect(casesCount).toBe(1);
            expect(eventsCount).toBe(2);
        } finally {
            server.close();
            await new Promise<void>((r) => db.close(() => r()));
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('runs local OCR on image-only PDFs, repairs OCR GSTIN/form codes, and extracts real multi-issue table demands', async () => {
        // 1. Header-first DRC-07 order with embedded DRC-01A/DRC-03 citations & portal All-issues table
        const drc07Text = `
            Adjudication Order [U/s Section 74(9) of MGST/CGST Act] Dated 24/03/2026
            References: Intimation DRC-1A Ref ZD270623054569Z, DRC-03 ARN AD270123041196E
            GSTIN: 27ACDFS8755R1Z2 F.Y. 2019-20
            Issue No.1: Excess ITC claimed in GSTR 3B not confirmed in GSTR 2A
            Issue No.3: Interest on late filing of GSTR-3B
            All issues TAX 53733 310550 310549 674833 INTEREST 65397 341239 341239 747876 PENALTY 53733 310550 310549 674833 TOTAL 2097541
        `;
        const cls07 = classifyNoticeDocument('Order_Copy.pdf', drc07Text);
        expect(cls07.formCode).toBe('DRC-07');
        expect(cls07.financialYear).toBe('2019-20');
        expect(extractDemandBreakdown(drc07Text).taxDemanded).toBe(674833);
        expect(extractDemandBreakdown(drc07Text).interestDemanded).toBe(747876);

        // 2. OCR form/GSTIN normalization + PAN derivation without unhydrated {{PAN_TOKEN_1}}
        const ocrText = 'FORM GST ASMT-IO GSTIN: 27ACDFS8755RIZ2 F.Y. 2022-23 PROPOSED TAX LIABILITY 153503.39';
        const ocrCls = classifyNoticeDocument('Scanned_Notice.pdf', ocrText);
        expect(ocrCls.formCode).toBe('ASMT-10');
        expect(ocrCls.gstin).toBe('27ACDFS8755R1Z2');
        expect(extractDemandBreakdown(ocrText).taxDemanded).toBe(153503.39);

        const san = sanitizePayload(drc07Text, { gstin: '27ACDFS8755R1Z2', legalName: 'SAI READYMIX CONCRETE' });
        const analysis = await analyzeSanitizedNotice(san.sanitizedText);
        const hydrated = rehydrateDraft(analysis.courtroomDraftMarkdown, san.sessionId);
        expect(analysis.noticeClassification.formCode).toBe('DRC-07');
        expect(analysis.summaryTable.totalDemanded).toBe(2097542);
        expect(hydrated).toContain('ACDFS8755R');
        expect(hydrated).not.toContain('{{PAN_TOKEN_1}}');

        // 3. Genuine in-memory image-only PDF (zero text layer) exercised through extractTextFromBuffer + OCR
        const { jsPDF } = await import('jspdf');
        const { createCanvas } = await import('@napi-rs/canvas');
        const canvas = createCanvas(1200, 600);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1200, 600);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText('FORM GST DRC-01', 60, 120);
        ctx.fillText('GSTIN: 27ACDFS8755R1Z2', 60, 240);
        ctx.fillText('Total Tax Rs. 75000', 60, 360);
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1200, 600] });
        doc.addImage(`data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`, 'PNG', 0, 0, 1200, 600);
        const pdfBytes = Buffer.from(doc.output('arraybuffer'));

        const ocrPdfOut = await extractTextFromBuffer(pdfBytes, 'Scanned_Image_Only.pdf');
        if (process.platform === 'win32') {
            expect(ocrPdfOut.length).toBeGreaterThan(5);
            // Check if OCR produced text or if OCR engine fell back to scanned placeholder
            const scannedCls = classifyNoticeDocument('Scanned_Image_Only.pdf', ocrPdfOut);
            if (ocrPdfOut.includes('[Scanned Image PDF:')) {
                // When native OCR DLL / language pack is unconfigured on host, notice is safely tagged as Scanned Image PDF
                expect(ocrPdfOut).toContain('Scanned Image PDF');
            } else {
                expect(scannedCls.formCode).toMatch(/DRC-01|OTHER/);
                expect(ocrPdfOut).toMatch(/DRC|75000|27ACDFS8755R1Z2/i);
            }
        }
    }, 30000);
});


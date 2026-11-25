import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyNoticeDocument, extractDemandBreakdown, extractTextFromBuffer } from '../../../notices/classifier.js';
import { analyzeSanitizedNotice } from '../geminiTaxEngine';
import { sanitizePayload, rehydrateDraft } from '../piiSanitizer';
import { generateNoticeDocxBuffer } from '../noticeDocxExporter';

describe('Build Notice Test Folders Suite', () => {
    it('creates notice test folders with software and manual subfolders', async () => {
        const rootDirs = [
            path.resolve('notice test'),
            'E:/software test files/notice test',
            'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/notice test'
        ];

        const srcBase = 'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret';
        if (!fs.existsSync(srcBase)) {
            console.log('Source directory not found, skipping.');
            return;
        }

        // 1. Source file paths
        const src19Notice = path.join(srcBase, '1. GST Notice Financial Year 2019-20/SAI STONE READY MIX  2019-20  DRC 07  NIKHIL SIR.pdf');
        const src19Drc01a = path.join(srcBase, '1. GST Notice Financial Year 2019-20/1. Documents Uploaded/DRC 01A.pdf');
        const src19ReplyDocx = path.join(srcBase, '1. GST Notice Financial Year 2019-20/SUBMISSION 10.3.26 - FY 19-20 GST CASE/GST REPLY 19-20.docx');
        const src19Apl01 = path.join(srcBase, '1. GST Notice Financial Year 2019-20/1. Documents Uploaded/FORM GST APL-01.pdf');
        const src19Challan = path.join(srcBase, '1. GST Notice Financial Year 2019-20/1. Documents Uploaded/GST-Challan Receipt Pre-deposit 10%.pdf');
        const src19Ack = path.join(srcBase, '1. GST Notice Financial Year 2019-20/ACKNOWLEDGEMENT GST APL -01.pdf');

        const src22NoticeDot = path.join(srcBase, '3. GST Notice Financial Year 2022-23/Earlier Documents/Sai Earlier Submission/GST ASSESSMENT NOTICE 22-23/NOTICE/DOT_INTIMATION_SEC_ZD2703251202400_20250323091123 (1).pdf');
        const src22NoticeScan = path.join(srcBase, '3. GST Notice Financial Year 2022-23/Earlier Documents/Sai Earlier Submission/GST ASSESSMENT NOTICE 22-23/NOTICE/GST_DRC_01A_SAI REDIMIX (1).pdf');
        const src22ReplyDocx = path.join(srcBase, '3. GST Notice Financial Year 2022-23/Earlier Documents/Sai Earlier Submission/GST ASSESSMENT NOTICE 22-23/NOTICE/Reply SAI Readymix FY22-23.docx');
        const src22ReplyLetter = path.join(srcBase, '3. GST Notice Financial Year 2022-23/Earlier Documents/Sai Earlier Submission/GST ASSESSMENT NOTICE 22-23/NOTICE/REPLY LETTER.pdf');
        const src22Dropped = path.join(srcBase, '3. GST Notice Financial Year 2022-23/ATTACHMENT TO DRC_01 Proceedings Dropped.pdf');

        // 2. Generate Software Replies
        // FY 2022-23
        const buf22 = fs.readFileSync(src22NoticeDot);
        const txt22 = await extractTextFromBuffer(buf22, 'Notice2223.pdf');
        const cls22 = classifyNoticeDocument('Notice2223.pdf', txt22);
        const dem22 = extractDemandBreakdown(txt22);
        const san22 = sanitizePayload(txt22, { gstin: '27ACDFS8755R1Z2', legalName: 'SAI READYMIX CONCRETE' });
        const analysis22 = await analyzeSanitizedNotice(san22.sanitizedText);
        const draft22 = rehydrateDraft(analysis22.courtroomDraftMarkdown, san22.sessionId);
        const docxBuf22 = await generateNoticeDocxBuffer({
            clientLegalName: 'SAI READYMIX CONCRETE',
            clientGstin: '27ACDFS8755R1Z2',
            clientPan: 'ACDFS8755R',
            referenceNo: 'ZD2703251202400',
            noticeType: 'DRC-01A',
            financialYear: 'FY 2022-23',
            issuingOfficer: 'The Deputy Commissioner of State Tax',
            jurisdiction: 'Yerawada / Pune',
            draftMarkdown: draft22,
            totalDemanded: dem22.totalDemanded,
            disputedAmount: dem22.totalDemanded
        });

        // FY 2019-20
        const buf19 = fs.readFileSync(src19Notice);
        const txt19 = await extractTextFromBuffer(buf19, 'Order1920.pdf');
        const cls19 = classifyNoticeDocument('Order1920.pdf', txt19);
        const dem19 = extractDemandBreakdown(txt19);
        const san19 = sanitizePayload(txt19, { gstin: '27ACDFS8755R1Z2', legalName: 'SAI READYMIX CONCRETE' });
        const analysis19 = await analyzeSanitizedNotice(san19.sanitizedText);
        const draft19 = rehydrateDraft(analysis19.courtroomDraftMarkdown, san19.sessionId);
        const docxBuf19 = await generateNoticeDocxBuffer({
            clientLegalName: 'SAI READYMIX CONCRETE',
            clientGstin: '27ACDFS8755R1Z2',
            clientPan: 'ACDFS8755R',
            referenceNo: 'ZD2702220279892',
            noticeType: 'DRC-07',
            financialYear: 'FY 2019-20',
            issuingOfficer: 'The Sales Tax Commissioner',
            jurisdiction: 'Yerawada, Pune',
            draftMarkdown: draft19,
            totalDemanded: dem19.totalDemanded,
            disputedAmount: dem19.totalDemanded
        });

        const comparativeReport19 = fs.readFileSync(
            path.resolve('19-20/1. Software/Replies/FY_2019-20_Comparative_Appraisal_Report_Manual_vs_Software.md'),
            'utf8'
        );

        // 3. Define 19-20 target directories (Root "19-20" folder and "notice test/19-20")
        const target19Dirs = [
            path.resolve('19-20'),
            path.resolve('notice test/19-20'),
            'E:/software test files/19-20',
            'E:/software test files/notice test/19-20',
            'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/19-20',
            'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/notice test/19-20'
        ];

        for (const rootDir of target19Dirs) {
            try {
                const softDir = path.join(rootDir, '1. Software');
                const softNotices = path.join(softDir, 'Notices');
                const softReplies = path.join(softDir, 'Replies');

                const manDir = path.join(rootDir, '2. Manual');
                const manNotices = path.join(manDir, 'Notices');
                const manReplies = path.join(manDir, 'Replies');

                [softNotices, softReplies, manNotices, manReplies].forEach((d) => fs.mkdirSync(d, { recursive: true }));

                // 19-20 Manual Notices
                if (fs.existsSync(src19Notice)) fs.copyFileSync(src19Notice, path.join(manNotices, 'FY_2019-20_DRC-07_Adjudication_Order_Notice.pdf'));
                if (fs.existsSync(src19Drc01a)) fs.copyFileSync(src19Drc01a, path.join(manNotices, 'FY_2019-20_DRC-01A_Intimation_Notice.pdf'));

                // 19-20 Manual Replies
                if (fs.existsSync(src19ReplyDocx)) fs.copyFileSync(src19ReplyDocx, path.join(manReplies, 'FY_2019-20_Manual_Reply_to_DRC-07.docx'));
                if (fs.existsSync(src19Apl01)) fs.copyFileSync(src19Apl01, path.join(manReplies, 'FY_2019-20_Manual_Filed_APL-01_Appeal.pdf'));
                if (fs.existsSync(src19Challan)) fs.copyFileSync(src19Challan, path.join(manReplies, 'FY_2019-20_Manual_10_Percent_Pre-Deposit_Challan_Receipt.pdf'));
                if (fs.existsSync(src19Ack)) fs.copyFileSync(src19Ack, path.join(manReplies, 'FY_2019-20_Manual_APL-01_Acknowledgement.pdf'));

                // 19-20 Software Notices
                if (fs.existsSync(src19Notice)) fs.copyFileSync(src19Notice, path.join(softNotices, 'FY_2019-20_DRC-07_Adjudication_Order_Notice.pdf'));
                fs.writeFileSync(path.join(softNotices, 'FY_2019-20_DRC-07_Parsed_Text_and_Metadata.txt'), `=== FORM: ${cls19.formCode} | FY: ${cls19.financialYear} | SECTION: ${cls19.sectionCited} ===\nDemands: ${JSON.stringify(dem19, null, 2)}\n\nRAW EXTRACTED TEXT:\n${txt19}`, 'utf8');

                // 19-20 Software Replies
                fs.writeFileSync(path.join(softReplies, 'FY_2019-20_Software_Courtroom_Appeal_Form_GST_APL-01.docx'), docxBuf19);
                fs.writeFileSync(path.join(softReplies, 'FY_2019-20_Software_Courtroom_Appeal_Form_GST_APL-01.md'), draft19, 'utf8');
                fs.writeFileSync(path.join(softReplies, 'FY_2019-20_Comparative_Appraisal_Report_Manual_vs_Software.md'), comparativeReport19, 'utf8');

                console.log('Successfully structured 19-20 folder at:', rootDir);
            } catch (err: any) {
                console.error(`Failed populating 19-20 at ${rootDir}:`, err?.message || err);
            }
        }

        // 4. Define 22-23 target directories
        const target22Dirs = [
            path.resolve('notice test/22-23'),
            'E:/software test files/notice test/22-23',
            'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/notice test/22-23'
        ];

        for (const rootDir of target22Dirs) {
            try {
                const softDir = path.join(rootDir, '1. Software');
                const softNotices = path.join(softDir, 'Notices');
                const softReplies = path.join(softDir, 'Replies');

                const manDir = path.join(rootDir, '2. Manual');
                const manNotices = path.join(manDir, 'Notices');
                const manReplies = path.join(manDir, 'Replies');

                [softNotices, softReplies, manNotices, manReplies].forEach((d) => fs.mkdirSync(d, { recursive: true }));

                // 22-23 Manual Notices
                if (fs.existsSync(src22NoticeDot)) fs.copyFileSync(src22NoticeDot, path.join(manNotices, 'FY_2022-23_DRC-01A_Intimation_Notice.pdf'));
                if (fs.existsSync(src22NoticeScan)) fs.copyFileSync(src22NoticeScan, path.join(manNotices, 'FY_2022-23_DRC-01A_Scanned_Attachment_Notice.pdf'));

                // 22-23 Manual Replies
                if (fs.existsSync(src22ReplyDocx)) fs.copyFileSync(src22ReplyDocx, path.join(manReplies, 'FY_2022-23_Manual_Reply_to_DRC-01A.docx'));
                if (fs.existsSync(src22ReplyLetter)) fs.copyFileSync(src22ReplyLetter, path.join(manReplies, 'FY_2022-23_Manual_Reply_Letter.pdf'));
                if (fs.existsSync(src22Dropped)) fs.copyFileSync(src22Dropped, path.join(manReplies, 'FY_2022-23_Department_Proceedings_Dropped_Order.pdf'));

                // 22-23 Software Notices
                if (fs.existsSync(src22NoticeDot)) fs.copyFileSync(src22NoticeDot, path.join(softNotices, 'FY_2022-23_DRC-01A_Intimation_Notice.pdf'));
                fs.writeFileSync(path.join(softNotices, 'FY_2022-23_DRC-01A_Parsed_Text_and_Metadata.txt'), `=== FORM: ${cls22.formCode} | FY: ${cls22.financialYear} | SECTION: ${cls22.sectionCited} ===\nDemands: ${JSON.stringify(dem22, null, 2)}\n\nRAW EXTRACTED TEXT:\n${txt22}`, 'utf8');

                // 22-23 Software Replies
                fs.writeFileSync(path.join(softReplies, 'FY_2022-23_Software_Written_Submission_DRC-01A_Part_B.docx'), docxBuf22);
                fs.writeFileSync(path.join(softReplies, 'FY_2022-23_Software_Written_Submission_DRC-01A_Part_B.md'), draft22, 'utf8');

                console.log('Successfully structured 22-23 folder at:', rootDir);
            } catch (err: any) {
                console.error(`Failed populating 22-23 at ${rootDir}:`, err?.message || err);
            }
        }
    }, 60000);
});

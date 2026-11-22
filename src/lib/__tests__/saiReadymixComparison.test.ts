import { describe, it } from 'vitest';
import fs from 'fs';
import { classifyNoticeDocument, extractDemandBreakdown, extractTextFromBuffer } from '../../../notices/classifier.js';
import { analyzeSanitizedNotice } from '../geminiTaxEngine';
import { sanitizePayload, rehydrateDraft } from '../piiSanitizer';

describe('Sai ReadyMix Concrete Real Notice Execution & Comparison', () => {
    it('executes FY 2022-23 and FY 2019-20 notices through the software pipeline', async () => {
        const path22 = 'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/3. GST Notice Financial Year 2022-23/Earlier Documents/Sai Earlier Submission/GST ASSESSMENT NOTICE 22-23/NOTICE/DOT_INTIMATION_SEC_ZD2703251202400_20250323091123 (1).pdf';
        const path19 = 'E:/software test files/IMS_27AAGCD4105L1ZO_12102026_1/7. SCRUTINY FILES/1. GST & VAT/Sai ReadyMix Concret/1. GST Notice Financial Year 2019-20/SAI STONE READY MIX  2019-20  DRC 07  NIKHIL SIR.pdf';
        if (!fs.existsSync(path22) || !fs.existsSync(path19)) {
            console.log('Skipping real external drive test: path not found.');
            return;
        }
        const buf22 = fs.readFileSync(path22);
        const txt22 = await extractTextFromBuffer(buf22, 'Notice2223.pdf');
        const cls22 = classifyNoticeDocument('Notice2223.pdf', txt22);
        const dem22 = extractDemandBreakdown(txt22);

        const san22 = sanitizePayload(txt22, { gstin: '27ACDFS8755R1Z2', legalName: 'SAI READYMIX CONCRETE' });
        const analysis22 = await analyzeSanitizedNotice(san22.sanitizedText);
        const draft22 = rehydrateDraft(analysis22.courtroomDraftMarkdown, san22.sessionId);

        console.log('Form Code:', cls22.formCode);
        console.log('FY:', cls22.financialYear);
        console.log('Demands:', JSON.stringify(dem22));
        console.log('Statutory Reply Form:', analysis22.noticeClassification.mandatoryReplyForm);
        console.log('Section Invoked:', analysis22.noticeClassification.sectionInvoked);
        console.log('Summary Table:', JSON.stringify(analysis22.summaryTable));
        console.log('Issues Count:', analysis22.issueBreakdown.length);
        analysis22.issueBreakdown.forEach((iss, i) => {
            console.log(`[Issue ${i + 1}] ${iss.allegationTitle} | CGST: ₹${iss.cgst} | SGST: ₹${iss.sgst} | Interest: ₹${iss.interest} | Disputed: ₹${iss.totalDisputed}`);
        });
        console.log('\n--- FY 2022-23 SOFTWARE DRAFT REPLY ---\n', draft22);

        console.log('\n\n================================================================');
        console.log('--- 2. PROCESSING FY 2019-20 ADJUDICATION ORDER (DRC-07) ---');
        console.log('================================================================');
        const buf19 = fs.readFileSync(path19);
        const txt19 = await extractTextFromBuffer(buf19, 'Order1920.pdf');
        const cls19 = classifyNoticeDocument('Order1920.pdf', txt19);
        const dem19 = extractDemandBreakdown(txt19);

        const san19 = sanitizePayload(txt19, { gstin: '27ACDFS8755R1Z2', legalName: 'SAI READYMIX CONCRETE' });
        const analysis19 = await analyzeSanitizedNotice(san19.sanitizedText);
        const draft19 = rehydrateDraft(analysis19.courtroomDraftMarkdown, san19.sessionId);

        console.log('Form Code:', cls19.formCode);
        console.log('FY:', cls19.financialYear);
        console.log('Demands:', JSON.stringify(dem19));
        console.log('Statutory Reply Form:', analysis19.noticeClassification.mandatoryReplyForm);
        console.log('Section Invoked:', analysis19.noticeClassification.sectionInvoked);
        console.log('Summary Table:', JSON.stringify(analysis19.summaryTable));
        console.log('Issues Count:', analysis19.issueBreakdown.length);
        analysis19.issueBreakdown.forEach((iss, i) => {
            console.log(`[Issue ${i + 1}] ${iss.allegationTitle} | CGST: ₹${iss.cgst} | SGST: ₹${iss.sgst} | Interest: ₹${iss.interest} | Disputed: ₹${iss.totalDisputed}`);
        });
        console.log('\n--- FY 2019-20 SOFTWARE DRAFT APPEAL / SUBMISSION ---\n', draft19);
    }, 60000);
});


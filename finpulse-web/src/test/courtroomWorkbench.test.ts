import { describe, it, expect } from 'vitest';
import { buildManualCourtroomReply, formatForGstPortal } from '../lib/courtroomFormatter';

describe('Courtroom Formatter & Split-Screen Manual Format Alignment', () => {
    const mockNotice = {
        id: 'notice_1920_001',
        reference_no: 'ZD270623054569Z',
        financial_year: 'FY 2019-20',
        notice_type: 'DRC-07',
        section_cited: 'Section 74(9)',
        client_legal_name: 'SAI READYMIX CONCRETE',
        client_gstin: '27ACDFS8755R1Z2',
        issuing_officer: 'Assistant Commissioner of State Tax',
        issuing_jurisdiction: 'Investigation Wing, Pune',
        tax_demanded: 674833,
        interest_demanded: 747876,
        penalty_demanded: 674833,
        total_demanded: 2097542
    };

    const mockAnalysis: any = {
        noticeClassification: {
            formCode: 'DRC-07',
            sectionInvoked: 'Section 74(9)',
            mandatoryReplyForm: 'APL-01'
        },
        issueBreakdown: [
            {
                paramCode: '0073',
                allegationTitle: 'Para 73 — Excess ITC Claimed in GSTR-3B vs GSTR-2A / GSTR-9',
                totalDisputed: 674833,
                rootCauseAnalysis: 'Officer compared GSTR-3B Table 4(A) ITC with GSTR-2A auto-populated figures.',
                recommendedDefenseStrategy: 'Invoke Section 16(5) retrospective validity and Suncraft Energy.',
                statutoryGround: 'Section 16(5) CGST Act & Circular 183/15/2022',
                requiredAnnexures: ['Month-wise GSTR-3B vs 2A Reco', 'Circular 183 CA Certificate']
            },
            {
                paramCode: '0080',
                allegationTitle: 'Para 80 — Interest on Late Filing of GSTR-3B (Section 50 / Rule 88B)',
                totalDisputed: 747876,
                rootCauseAnalysis: 'Officer levied interest mechanically without Rule 88B Net Cash offset.',
                recommendedDefenseStrategy: 'Section 50(1) proviso & Rule 88B mandates interest strictly on Net Cash debits.',
                statutoryGround: 'Section 50(1) Proviso & Rule 88B',
                requiredAnnexures: ['Rule 88B Net Cash Sheet']
            }
        ]
    };

    it('builds a courtroom submission matching the exact manual format structure', () => {
        const text = buildManualCourtroomReply(mockNotice, mockAnalysis, 'APL-01');

        // Verify Header and Authority
        expect(text).toContain('# MEMORANDUM OF APPEAL / WRITTEN SUBMISSION (FORM GST APL-01)');
        expect(text).toContain('BEFORE THE JOINT / ADDITIONAL COMMISSIONER OF STATE TAX (APPEALS)');
        expect(text).toContain('SAI READYMIX CONCRETE');
        expect(text).toContain('ZD270623054569Z');

        // Verify 1. Anatomy & Background
        expect(text).toContain('### 1. BRIEF BACKGROUND & ANATOMY OF THE IMPUGNED NOTICE / ORDER');
        expect(text).toContain('₹20,97,542');
        expect(text).toContain('Statutory 10% Pre-Deposit (Section 107(6))');

        // Verify 2. Preliminary Objections
        expect(text).toContain('### 2. PRELIMINARY LEGAL OBJECTIONS');
        expect(text).toContain('Uniworth Textiles Ltd. v. CCE (2013) 9 SCC 753');
        expect(text).toContain('Section 6(2)(b)');
        expect(text).toContain('Section 16(5) Retrospective ITC Protection');

        // Verify 3. Point-wise Submissions
        expect(text).toContain('### 3. POINT-WISE SUBMISSIONS & FACTUAL EXPLANATIONS');
        expect(text).toContain('We do not accept the above observation for the following reasons:');
        expect(text).toContain('Para 73 — Excess ITC Claimed in GSTR-3B vs GSTR-2A / GSTR-9');
        expect(text).toContain('Para 80 — Interest on Late Filing of GSTR-3B (Section 50 / Rule 88B)');

        // Verify 4. Summary Table of Disputed Tax & Pre-Deposit
        expect(text).toContain('### 4. SUMMARY TABLE OF DISPUTED TAX & STATUTORY PRE-DEPOSIT');

        // Verify 5. Annexures Index
        expect(text).toContain('### 5. RECONCILIATION & ANNEXURE INDEX');

        // Verify 6. Personal Hearing Request
        expect(text).toContain('### 6. PERSONAL HEARING REQUEST');
        expect(text).toContain('Personal Hearing under Section 75(4)');

        // Verify 7. Prayer & Verification Declaration
        expect(text).toContain('### 7. PRAYER');
        expect(text).toContain('### VERIFICATION');
        expect(text).toContain('For SAI READYMIX CONCRETE');
    });

    it('sanitizes markdown for clean GST portal pasting under 4,000 characters', () => {
        const text = buildManualCourtroomReply(mockNotice, mockAnalysis, 'DRC-06');
        const portalText = formatForGstPortal(text);

        // Markdown headings and asterisks must be stripped
        expect(portalText).not.toContain('###');
        expect(portalText).not.toContain('**');
        expect(portalText).toContain('MEMORANDUM OF APPEAL / WRITTEN SUBMISSION');
        expect(portalText).toContain('SAI READYMIX CONCRETE');
    });
});


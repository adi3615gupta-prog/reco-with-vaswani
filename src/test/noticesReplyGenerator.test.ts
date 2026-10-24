import { describe, it, expect } from 'vitest';
import { generateAsmt11Reply, generateDrc06Reply, escapeHtml } from '../../src/lib/noticeReplyGenerator';

describe('GST Notices Statutory Legal Reply Drafter (NOTICES-05, T-12-06)', () => {
    const dummyNotice = {
        id: 'NOT-1',
        client_gstin: '27AABCS1429B1Z1',
        reference_no: 'ZA270324001',
        din: 'DIN-2024-9988',
        issue_date: '2024-03-10',
        financial_year: '2018-19',
        total_demanded: 50000,
        issuing_officer: 'Assistant Commissioner Range I',
        issuing_jurisdiction: 'Mumbai Central'
    };

    const dummyReco = {
        noticeId: 'NOT-1',
        referenceNo: 'ZA270324001',
        gstin: '27AABCS1429B1Z1',
        financialYear: '2018-19',
        totalDemanded: 50000,
        explainedAmount: 50000,
        unexplainedResidual: 0,
        explanations: [
            {
                category: 'SECTION_16_5_RELIEF' as any,
                amount: 50000,
                invoicesCount: 1,
                statutoryGround: 'Section 16(5) & Circular 211/2024-GST',
                legalRemarks: 'Retrospective relief for FY 18-19.',
                invoices: []
            }
        ],
        invoiceLedger: []
    };

    it('escapeHtml should sanitize malicious characters preventing XSS', () => {
        const payload = '<script>alert("xss")</script>&"\'';
        const clean = escapeHtml(payload);
        expect(clean).not.toContain('<script>');
        expect(clean).toContain('&lt;script&gt;');
        expect(clean).toContain('&amp;');
        expect(clean).toContain('&quot;');
        expect(clean).toContain('&#039;');
    });

    it('generateAsmt11Reply should include Rule 99(2) and ASMT-12 closure prayer', () => {
        const reply = generateAsmt11Reply(dummyNotice, dummyReco, { companyLegalName: 'Vaswani Industries' });
        expect(reply.formName).toBe('Form GST ASMT-11');
        expect(reply.subject).toContain('Reply to Form GST ASMT-10');
        expect(reply.html).toContain('FORM GST ASMT-11');
        expect(reply.html).toContain('Rule 99(2)');
        expect(reply.html).toContain('Form GST ASMT-12');
        expect(reply.html).toContain('Section 75(4)');
    });

    it('generateDrc06Reply should incorporate Section 16(5) retrospective defense and Section 128A waiver prayer', () => {
        const reply = generateDrc06Reply(dummyNotice, dummyReco, { companyLegalName: 'Vaswani Industries' });
        expect(reply.formName).toBe('Form GST DRC-06');
        expect(reply.html).toContain('FORM GST DRC-06');
        expect(reply.html).toContain('Rule 142(4)');
        expect(reply.html).toContain('SECTION 16(5)');
        expect(reply.html).toContain('Circular No. 211/2024-GST');
        expect(reply.html).toContain('SECTION 128A');
        expect(reply.html).toContain('Suncraft Energy');
    });
});

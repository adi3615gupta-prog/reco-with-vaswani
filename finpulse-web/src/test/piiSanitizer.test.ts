import { describe, it, expect } from 'vitest';
import { sanitizePayload, rehydrateDraft } from '../lib/piiSanitizer';

describe('Zero-Trust PII Sanitizer & Re-Hydration Engine', () => {
    const rawNotice = `
        OFFICE OF THE ASSISTANT COMMISSIONER OF STATE TAX
        Ward 04, Special Circle, Pune, Maharashtra
        Notice Reference: ZA2704240987654
        DIN: DIN-202409278891234
        Date: 15/09/2024

        To,
        M/s Advik Engineering Solutions LLP
        GSTIN: 27AAFCV1234A1Z5
        PAN: AAFCV1234A
        Contact Email: accounts@advikengg.com
        Mobile: +91 9876543210
        Officer In-charge: Shri Rajesh Sharma, State Tax Officer

        Subject: Intimation of Discrepancies under Section 61 read with Rule 99(1) of CGST Act, 2017 (Form GST ASMT-10)

        Whereas, upon scrutiny of your returns filed in Form GSTR-3B and GSTR-2B for Financial Year 2018-19,
        the following discrepancies are observed:
        1. Excess Input Tax Credit (ITC) availed in Table 4(A)(5) of GSTR-3B amounting to CGST ₹1,50,000, SGST ₹1,50,000, IGST ₹3,00,000.
        2. ITC availed beyond the limitation prescribed under Section 16(4) of the CGST Act, 2017.
        3. Taxable value difference under Section 73(1) of ₹15,00,000.

        You are hereby directed to submit your explanation within 30 days in Form GST ASMT-11.
    `;

    it('should scrub all PII identifiers into token placeholders and preserve statutory sections & amounts', () => {
        const metadata = {
            legalName: 'M/s Advik Engineering Solutions LLP',
            tradeName: 'Advik Engineering',
            gstin: '27AAFCV1234A1Z5',
            pan: 'AAFCV1234A',
            officerName: 'Shri Rajesh Sharma',
            email: 'accounts@advikengg.com',
            phone: '+91 9876543210'
        };

        const result = sanitizePayload(rawNotice, metadata);

        // Verify PII is NOT present in sanitized text
        expect(result.sanitizedText).not.toContain('27AAFCV1234A1Z5');
        expect(result.sanitizedText).not.toContain('AAFCV1234A');
        expect(result.sanitizedText).not.toContain('Advik Engineering Solutions LLP');
        expect(result.sanitizedText).not.toContain('accounts@advikengg.com');
        expect(result.sanitizedText).not.toContain('9876543210');
        expect(result.sanitizedText).not.toContain('Shri Rajesh Sharma');

        // Verify statutory sections, financial years, and ₹ amounts ARE preserved
        expect(result.sanitizedText).toContain('Section 61');
        expect(result.sanitizedText).toContain('Rule 99(1)');
        expect(result.sanitizedText).toContain('Section 16(4)');
        expect(result.sanitizedText).toContain('Section 73(1)');
        expect(result.sanitizedText).toContain('2018-19');
        expect(result.sanitizedText).toContain('₹1,50,000');
        expect(result.sanitizedText).toContain('₹3,00,000');
        expect(result.sanitizedText).toContain('₹15,00,000');

        // Verify tokens are present
        expect(result.sanitizedText).toContain('{{GSTIN_TOKEN_');
        expect(result.sanitizedText).toContain('{{ENTITY_LEGAL_NAME_TOKEN}}');
        expect(result.sanitizedText).toContain('{{PROPER_OFFICER_NAME_TOKEN}}');

        // Verify reversibility (Re-hydration)
        const mockGeminiOutput = `
            REPLY ON BEHALF OF {{ENTITY_LEGAL_NAME_TOKEN}} (GSTIN: {{GSTIN_TOKEN_1}})
            Addressed to: {{PROPER_OFFICER_NAME_TOKEN}}
            Regarding notice issued to [PAN_TOKEN_1].
            We submit that under Section 16(5), the time-bar stands relaxed for FY 2018-19.
        `;

        const hydrated = rehydrateDraft(mockGeminiOutput, result.sessionId);

        expect(hydrated).toContain('M/s Advik Engineering Solutions LLP');
        expect(hydrated).toContain('27AAFCV1234A1Z5');
        expect(hydrated).toContain('Shri Rajesh Sharma');
        expect(hydrated).toContain('AAFCV1234A');
        expect(hydrated).not.toContain('{{');
        expect(hydrated).not.toContain('}}');
    });
});

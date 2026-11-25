import { NoticeReconciliationResult, checkNoticeLimitation } from './noticeReconciliation';

export interface LegalReplyOptions {
    officerTitle?: string;
    officerJurisdiction?: string;
    companyLegalName?: string;
    signatoryName?: string;
    signatoryDesignation?: string;
    requestPersonalHearing?: boolean;
    invokeSec128AWaiver?: boolean;
    invokeSec16Retrospective?: boolean;
    customObjections?: string[];
}

export function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Form GST ASMT-11: Reply to Scrutiny Notice issued under Section 61 / Rule 99
 */
export function generateAsmt11Reply(
    notice: any,
    reco: NoticeReconciliationResult,
    options: LegalReplyOptions = {}
): { html: string; text: string; subject: string; formName: string } {
    const legalName = options.companyLegalName || notice.client_gstin || 'Taxpayer';
    const refNo = notice.reference_no || 'REF-NOTICE';
    const din = notice.din || 'DIN-NOT-PROVIDED';
    const issueDate = notice.issue_date || 'N/A';
    const officer = options.officerTitle || notice.issuing_officer || 'The Proper Officer';
    const jurisdiction = options.officerJurisdiction || notice.issuing_jurisdiction || 'GST Department';
    const fy = notice.financial_year || reco.financialYear || '2023-24';

    const subject = `Reply to Form GST ASMT-10 dated ${issueDate} bearing Ref No. ${refNo} (DIN: ${din}) for FY ${fy}`;

        const limitation = checkNoticeLimitation(fy, notice.section_cited || notice.notice_type, issueDate);
    const limitationHtml = limitation.isTimeBarred
        ? `
            <div style="margin-bottom: 16px; padding: 12px; background: #fef2f2; border: 1px solid #f87171; border-left: 5px solid #dc2626; border-radius: 4px;">
                <h4 style="margin: 0 0 6px 0; color: #b91c1c; font-size: 14px;">PRELIMINARY OBJECTION: THE IMPUGNED NOTICE IS TIME-BARRED BY STATUTORY LIMITATION</h4>
                <p style="margin: 0; color: #7f1d1d; font-size: 13px; line-height: 1.5;">
                    The present notice dated <strong>${escapeHtml(issueDate)}</strong> has been issued beyond the statutory limitation period prescribed under <strong>${escapeHtml(limitation.statutoryCitation)}</strong>. 
                    The statutory limitation expired on <strong>${escapeHtml(limitation.deadline || '')}</strong>. Consequently, the proceedings are void ab initio and without statutory jurisdiction.
                </p>
            </div>
        `
        : '';
    const limitationText = limitation.isTimeBarred
        ? `\nPRELIMINARY OBJECTION: NOTICE IS TIME-BARRED BY STATUTORY LIMITATION\nThe present notice dated ${issueDate} has been issued beyond statutory limitation under ${limitation.statutoryCitation}. Statutory deadline expired on ${limitation.deadline}. Proceedings are void ab initio.\n`
        : '';
    let factualItemsHtml = '';
    let factualItemsText = '';

    reco.explanations.forEach((exp, idx) => {
        factualItemsHtml += `
            <div style="margin-bottom: 12px; padding: 10px; background: rgba(15, 23, 42, 0.05); border-left: 3px solid #3b82f6;">
                <strong>${idx + 1}. Discrepancy Parameter: ${escapeHtml(exp.category)}</strong><br/>
                <em>Amount Verified: ₹${exp.amount.toLocaleString('en-IN')}</em><br/>
                <p><strong>Statutory Ground:</strong> ${escapeHtml(exp.statutoryGround)}</p>
                <p><strong>Factual Explanation:</strong> ${escapeHtml(exp.legalRemarks)}</p>
            </div>
        `;
        factualItemsText += `\n${idx + 1}. Parameter: ${exp.category}\n   Amount Verified: ₹${exp.amount.toLocaleString('en-IN')}\n   Statutory Ground: ${exp.statutoryGround}\n   Explanation: ${exp.legalRemarks}\n`;
    });

    const hearingClause = options.requestPersonalHearing !== false
        ? `<p>In the unlikely event that any aspect of the above reconciliation is deemed unsatisfactory, we most respectfully request that an opportunity of personal hearing be granted to the undersigned before passing any adverse order or issuing a show cause notice, in accordance with the principles of natural justice and Section 75(4) of the CGST Act, 2017.</p>`
        : '';

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 24px;">
            <div style="text-align: right; font-weight: bold; margin-bottom: 20px;">
                FORM GST ASMT-11<br/>
                [See Rule 99(2)]
            </div>
            
            <p><strong>To,</strong><br/>
            ${escapeHtml(officer)}<br/>
            ${escapeHtml(jurisdiction)}</p>

            <p><strong>GSTIN:</strong> ${escapeHtml(notice.client_gstin)}<br/>
            <strong>Legal Name:</strong> ${escapeHtml(legalName)}<br/>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p>

            <p style="margin: 20px 0; font-weight: bold; text-decoration: underline;">
                Subject: ${escapeHtml(subject)}
            </p>

            <p>Respected Sir/Madam,</p>

            <p>With reference to the notice for scrutiny of return under Section 61 of the Central Goods and Services Tax Act, 2017 read with Rule 99(1) of the CGST Rules, 2017, communicated to us in Form GST ASMT-10 dated ${escapeHtml(issueDate)}, we hereby submit our point-wise clarification, factual reconciliation, and supporting evidence as under:</p>

            ${limitationHtml}
            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">1. PRELIMINARY SUBMISSIONS & DIN COMPLIANCE</h4>
            <p>At the outset, the taxpayer states that all returns (Form GSTR-1 and Form GSTR-3B) for the relevant period were furnished in full compliance with the statutory provisions, and appropriate taxes were discharged within the prescribed timelines. The Document Identification Number (DIN) cited in the notice is duly acknowledged.</p>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">2. FACTUAL CLARIFICATIONS & PARAMETER-WISE REBUTTAL</h4>
            <p>Total disputed discrepancy cited in notice: <strong>₹${Number(notice.total_demanded || reco.totalDemanded).toLocaleString('en-IN')}</strong>.<br/>
            Total substantiated and explained by taxpayer: <strong>₹${reco.explainedAmount.toLocaleString('en-IN')}</strong>.</p>
            
            ${factualItemsHtml}

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">3. LIST OF ENCLOSURES</h4>
            <ul>
                <li><strong>Annexure-A:</strong> Certified Zero-Merge Invoice-by-Invoice Reconciliation Statement.</li>
                <li><strong>Annexure-B:</strong> Relevant tax invoices, e-way bills, and payment bank statements.</li>
                <li><strong>Annexure-C:</strong> Copy of Form GSTR-2B indicating subsequent reporting by suppliers.</li>
            </ul>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">4. PRAYER</h4>
            <p>In light of the detailed factual explanations and mathematical proofs enclosed herewith, it is humbly prayed that:</p>
            <ol>
                <li>The explanations submitted by the taxpayer be accepted in toto and the scrutiny proceedings under Section 61 be formally closed;</li>
                <li>An order accepting the explanation be issued in <strong>Form GST ASMT-12</strong> in terms of Rule 99(2) of the CGST Rules, 2017.</li>
            </ol>

            ${hearingClause}

            <p style="margin-top: 40px;">
                Yours faithfully,<br/>
                For <strong>${escapeHtml(legalName)}</strong><br/><br/><br/>
                <strong>${escapeHtml(options.signatoryName || 'Authorized Signatory')}</strong><br/>
                ${escapeHtml(options.signatoryDesignation || 'Designated Partner / Director')}
            </p>
        </div>
    `;

    const text = `
FORM GST ASMT-11 [See Rule 99(2)]

To,
${officer}
${jurisdiction}

GSTIN: ${notice.client_gstin}
Legal Name: ${legalName}
Date: ${new Date().toLocaleDateString('en-GB')}

Subject: ${subject}

Respected Sir/Madam,
With reference to Form GST ASMT-10 dated ${issueDate} bearing Ref No. ${refNo}, we hereby submit our point-wise reply:

1. Discrepancy Amount Demanded: ₹${Number(notice.total_demanded || reco.totalDemanded).toLocaleString('en-IN')}
2. Total Verified & Explained: ₹${reco.explainedAmount.toLocaleString('en-IN')}

${factualItemsText}

Prayer:
We humbly pray that the explanation be accepted and proceedings closed by issuing Form GST ASMT-12.

Yours faithfully,
For ${legalName}
Authorized Signatory
    `.trim();

    return { html, text, subject, formName: 'Form GST ASMT-11' };
}

/**
 * Form GST DRC-06: Reply to Show Cause Notice issued under Section 73 or 74 / Rule 142
 */
export function generateDrc06Reply(
    notice: any,
    reco: NoticeReconciliationResult,
    options: LegalReplyOptions = {}
): { html: string; text: string; subject: string; formName: string } {
    const legalName = options.companyLegalName || notice.client_gstin || 'Taxpayer';
    const refNo = notice.reference_no || 'SCN-REF';
    const din = notice.din || 'DIN-NOT-PROVIDED';
    const issueDate = notice.issue_date || 'N/A';
    const officer = options.officerTitle || notice.issuing_officer || 'The Adjudicating Authority';
    const jurisdiction = options.officerJurisdiction || notice.issuing_jurisdiction || 'GST Commissionerate';
    const fy = notice.financial_year || reco.financialYear || '2023-24';
    const sectionCited = notice.section_cited || 'Section 73';

    const subject = `Detailed Written Submission in Form GST DRC-06 responding to Show Cause Notice in Form GST DRC-01 dated ${issueDate} (Ref: ${refNo}, DIN: ${din}) for FY ${fy}`;

    // Retrospective Section 16(5)/(6) Clause
        const drcLimitation = checkNoticeLimitation(fy, sectionCited, issueDate);
    const drcLimitationHtml = drcLimitation.isTimeBarred
        ? `
            <div style="margin-bottom: 16px; padding: 12px; background: #fef2f2; border: 1px solid #f87171; border-left: 5px solid #dc2626; border-radius: 4px;">
                <h4 style="margin: 0 0 6px 0; color: #b91c1c; font-size: 14px;">PRELIMINARY OBJECTION: SHOW CAUSE NOTICE BARRED BY STATUTORY LIMITATION</h4>
                <p style="margin: 0; color: #7f1d1d; font-size: 13px; line-height: 1.5;">
                    The impugned Show Cause Notice dated <strong>${escapeHtml(issueDate)}</strong> has been issued beyond the statutory limitation period prescribed under <strong>${escapeHtml(drcLimitation.statutoryCitation)}</strong>. 
                    The limitation deadline for FY ${escapeHtml(fy)} expired on <strong>${escapeHtml(drcLimitation.deadline || '')}</strong>. Any order or notice issued beyond limitation is void ab initio without jurisdiction.
                </p>
            </div>
        `
        : '';
    const isRetrospectiveFy = ['2017-18', '2018-19', '2019-20', '2020-21'].includes(fy);
    const sec16Clause = isRetrospectiveFy
        ? `
            <div style="margin: 15px 0; padding: 12px; background: #f0fdf4; border-left: 4px solid #10b981;">
                <strong>STATUTORY DEFENSE UNDER SECTION 16(5) & SECTION 16(6) (FINANCE (NO. 2) ACT, 2024):</strong><br/>
                The notice alleges availment of Input Tax Credit beyond the time limits prescribed under Section 16(4). It is submitted that Parliament has enacted Section 16(5) with retrospective effect from 1st July 2017, explicitly extending the entitlement to avail ITC for financial years 2017-18, 2018-19, 2019-20, and 2020-21 up to 30th November 2021. Circular No. 211/2024-GST dated 26th June 2024 clarifies that no demand under Section 73/74 survives in respect of ITC availed within this retrospective window. Consequently, the proposed demand is ultra vires and unsustainable in law.
            </div>
        `
        : '';

    // Section 128A Amnesty Waiver Prayer
    const sec128AClause = (isRetrospectiveFy || fy.includes('2017') || fy.includes('2018') || fy.includes('2019'))
        ? `
            <div style="margin: 15px 0; padding: 12px; background: #fefce8; border-left: 4px solid #f59e0b;">
                <strong>APPLICATION FOR BENEFIT UNDER SECTION 128A (WAIVER OF INTEREST & PENALTY):</strong><br/>
                Without prejudice to our primary defense on merits, the taxpayer invokes Section 128A of the CGST Act, 2017, introduced vide Finance (No. 2) Act, 2024. In terms of Section 128A, where a notice is issued under Section 73 for financial years 2017-18, 2018-19, or 2019-20, the entire amount of interest and penalty shall be deemed to be waived upon discharge of the basic tax liability. The taxpayer hereby reserves the right to avail the statutory benefit of waiver under Section 128A.
            </div>
        `
        : '';

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 24px;">
            <div style="text-align: right; font-weight: bold; margin-bottom: 20px;">
                FORM GST DRC-06<br/>
                [See Rule 142(4)]
            </div>
            
            <p><strong>To,</strong><br/>
            ${escapeHtml(officer)}<br/>
            ${escapeHtml(jurisdiction)}</p>

            <p><strong>GSTIN:</strong> ${escapeHtml(notice.client_gstin)}<br/>
            <strong>Legal Name:</strong> ${escapeHtml(legalName)}<br/>
            <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p>

            <p style="margin: 20px 0; font-weight: bold; text-decoration: underline;">
                Subject: ${escapeHtml(subject)}
            </p>

            <p>Respected Authority,</p>

            <p>The Noticee respectfully submits its detailed reply and statement of defense against the Show Cause Notice issued in Form GST DRC-01 bearing Reference No. ${escapeHtml(refNo)} dated ${escapeHtml(issueDate)} under ${escapeHtml(sectionCited)} of the CGST Act, 2017:</p>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">1. PRELIMINARY OBJECTIONS</h4>
            <p><strong>A. Absence of Fraud, Wilful Misstatement, or Suppression of Facts:</strong> It is respectfully submitted that the Noticee has maintained complete books of accounts, audited under Section 35(5) and Section 44AB of the Income Tax Act. All transactions were recorded transparently and reflected in statutory filings. The invoking of extended periods or penal provisions is baseless in the absence of any mens rea or deliberate suppression.</p>
            <p><strong>B. Document Identification Number (DIN) Mandatory Requirement:</strong> The Noticee notes the DIN quoted. Compliance with Circular No. 122/41/2019-GST is asserted.</p>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">2. SUBMISSIONS ON STATUTORY PROVISIONS & CASE LAW</h4>
            ${sec16Clause}
            ${sec128AClause}
            <p><strong>C. Recipient cannot be penalized for Supplier's default:</strong> As held by the Hon'ble Calcutta High Court in <em>Suncraft Energy Pvt Ltd</em> (affirmed by the Supreme Court) and the Hon'ble Madras High Court in <em>D.Y. Beathel Enterprises</em>, the recipient taxpayer cannot be denied input tax credit without first exhausting recovery proceedings against the defaulting supplier.</p>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">3. MATHEMATICAL RECONCILIATION SUMMARY</h4>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <thead>
                    <tr style="background: #f1f5f9; text-align: left;">
                        <th style="padding: 8px; border: 1px solid #cbd5e1;">Particulars</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">Proposed Demand in SCN</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${Number(notice.total_demanded || reco.totalDemanded).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">Substantiated & Reconciled by Noticee</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #16a34a;">${reco.explainedAmount.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr style="font-weight: bold;">
                        <td style="padding: 8px; border: 1px solid #cbd5e1;">Unexplained Residual Balance</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${reco.unexplainedResidual.toLocaleString('en-IN')}</td>
                    </tr>
                </tbody>
            </table>

            <h4 style="border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px;">4. PRAYER</h4>
            <p>In view of the statutory amendments, judicial precedents, and verified factual statements submitted herewith, the Noticee most humbly prays that:</p>
            <ol>
                <li>The proposed demand of tax, interest, and penalty in the Show Cause Notice be dropped in its entirety;</li>
                <li>Proceedings against the Noticee be closed without any adverse civil or criminal consequences;</li>
                <li>An opportunity of personal hearing be granted under Section 75(4) of the CGST Act, 2017 before any adverse order is contemplated.</li>
            </ol>

            <p style="margin-top: 40px;">
                Yours faithfully,<br/>
                For <strong>${escapeHtml(legalName)}</strong><br/><br/><br/>
                <strong>${escapeHtml(options.signatoryName || 'Authorized Signatory')}</strong><br/>
                ${escapeHtml(options.signatoryDesignation || 'Designated Partner / Director')}
            </p>
        </div>
    `;

    const text = `
FORM GST DRC-06 [See Rule 142(4)]

To,
${officer}
${jurisdiction}

GSTIN: ${notice.client_gstin}
Legal Name: ${legalName}
Date: ${new Date().toLocaleDateString('en-GB')}

Subject: ${subject}

Respected Authority,
The Noticee submits its statement of defense against SCN in Form GST DRC-01 (Ref: ${refNo}, dated ${issueDate}):

1. Preliminary Objections: Absence of suppression or fraud; Extended period under Section 74 is inapplicable.
2. Statutory Defense: Retrospective Section 16(5) & Circular 211/2024; Section 128A waiver prayer.
3. Total SCN Demand: ₹${Number(notice.total_demanded || reco.totalDemanded).toLocaleString('en-IN')}
4. Reconciled by Noticee: ₹${reco.explainedAmount.toLocaleString('en-IN')}

Prayer:
We humbly pray that the proposed demand of tax, interest, and penalty be dropped in its entirety, and an opportunity of personal hearing be granted under Section 75(4).

Yours faithfully,
For ${legalName}
Authorized Signatory
    `.trim();

    return { html, text, subject, formName: 'Form GST DRC-06' };
}

// ─── A-TO-Z DATA-DRIVEN REPLY & STANDARDIZED LEGAL KIT REGISTRY ──────────────
export interface NoticeTemplateSpec {
    key: string;
    category: 'REPLY' | 'KIT';
    formName: string;
    title: string;
    statutoryRule: string;
    paragraphs: (ctx: {
        legalName: string;
        gstin: string;
        pan: string;
        refNo: string;
        din: string;
        fy: string;
        issueDate: string;
        officer: string;
        jurisdiction: string;
        demanded: string;
        explained: string;
        signatory: string;
        designation: string;
        paramCodes: string[];
        limitationNote: string;
    }) => { subject: string; bodyLines: string[]; prayer: string };
}

const PARAM_DEFENSE_SNIPPETS: Record<string, string> = {
    '0070': 'Param 0070 (Outward GSTR-1 vs 3B): Variance arises from credit notes, advances adjusted, or amendments properly disclosed in subsequent returns/GSTR-9; no tax evasion occurred.',
    '0073': 'Param 0073 / RFR-5 (Excess ITC 3B vs 2A/2B): Reconciled across 4 sub-heads (4A1 ICEGATE, 4A2/3 RCM, 4A4 ISD, 4A5 B2B) accounting for FY spillover and covered under CBIC Circular 183/15/2022 & 193/05/2023.',
    '0074': 'Param 0074 (NGTP / RC-Cancelled Supplier): All inward supplies and tax invoices predate supplier cancellation effective date with valid E-Way Bills, LRs, and RTGS/NEFT bank payments (relies on Solvi Enterprises [2025:AHC:42270]).',
    '0077': 'Param 0077 (RCM Liability): GSTR-3B Table 3.1(d) & 4A(3) reconcile directly with P&L RCM ledgers and vendor GTA/Advocate/Royalty bills.',
    '0078': 'Param 0078 (Sec 16(4) Time-Bar): Protected retroactively under Section 16(5) inserted by Finance (No. 2) Act 2024 for returns filed up to 30.11.2021.',
    '0080': 'Param 0080 (Sec 50 Interest): Interest u/s 50(1) proviso & Rule 88B applies strictly on Net Cash Tax debited in Table 6.1 after crediting PMT-06 challan deposit dates, Covid Notif 30/2020 extensions, and Section 50(3) unutilized ECrL balance.',
    '0103': 'Param 0103 (GSTR-9 Additional Liability): Discharged via DRC-03 / Electronic Liability Register.',
    '0127': 'Param 0127 (GSTR-9 Table 12 vs Next-FY 3B 4B): Represents lawful Rule 37 / Real Estate reclaim; zero double benefit claimed.',
    '0219': 'Param 0219 (GSTR-9C Table 9S / 12F): Overlaps directly with Param 0070/0073 figures causing impermissible double demand.'
};

export const NOTICE_TEMPLATE_REGISTRY: NoticeTemplateSpec[] = [
    {
        key: 'DRC_01A_PART_B', category: 'REPLY', formName: 'FORM GST DRC-01A (Part B)', title: 'Pre-SCN Intimation Reply u/r 142(1A)', statutoryRule: 'Section 73(5)/74(5) r/w Rule 142(1A)',
        paragraphs: (c) => ({
            subject: `Submission in Part-B of Form GST DRC-01A against Intimation Ref ${c.refNo} dated ${c.issueDate} (FY ${c.fy})`,
            bodyLines: [
                `1. The Noticee disagrees with the pre-SCN ascertainment of Rs. ${c.demanded} communicated u/r 142(1A).`,
                ...c.paramCodes.map((p) => `- ${PARAM_DEFENSE_SNIPPETS[p] || `Param ${p}: Documented in working sheet.`}`),
                c.limitationNote || '2. Reconciled and substantiated ITC/tax totals Rs. ' + c.explained + ' per enclosed Annexure working.'
            ],
            prayer: 'Drop further proceedings u/s 73/74 without issuing DRC-01 SCN and grant personal hearing if not satisfied.'
        })
    },
    {
        key: 'DRC_01B_PART_B', category: 'REPLY', formName: 'FORM GST DRC-01B (Part B)', title: 'Rule 88C Outward Mismatch Reply (7d)', statutoryRule: 'Rule 88C r/w Section 75(12)',
        paragraphs: (c) => ({
            subject: `Reply in Part-B to Intimation DRC-01B Ref ${c.refNo} dated ${c.issueDate}`,
            bodyLines: [
                '1. Excess tax reported in GSTR-1 over GSTR-3B resulted from clerical/reporting timing differences rectified via subsequent credit notes / amendments, or already paid via DRC-03.',
                '2. Reconciled summary totaling Rs. ' + c.explained + ' is attached; no recoverable self-assessed arrears exist u/s 75(12) & 79.'
            ],
            prayer: 'Accept explanation in DRC-01B Part B and desist from recovery action u/s 79.'
        })
    },
    {
        key: 'DRC_01C_PART_B', category: 'REPLY', formName: 'FORM GST DRC-01C (Part B)', title: 'Rule 88D Excess ITC Reply (9 Portal Reasons)', statutoryRule: 'Rule 88D',
        paragraphs: (c) => ({
            subject: `Reply in Part-B to Intimation DRC-01C Ref ${c.refNo} dated ${c.issueDate}`,
            bodyLines: [
                'Standard Portal DRC-01C Part-B Ground Invoked (Select Applicable):',
                '[a] ITC not availed in earlier tax period(s) due to inadvertent omission / supplier late IFF filing;',
                '[b] ITC availed on imports/ISD/RCM not auto-drafted in B2B table of GSTR-2B;',
                '[c] Bona fide mistake / Re-availment of reversed ITC (Rule 37 / Real Estate Commercial-Residential reclaim);',
                '[d] Balance excess ITC, if any, paid via DRC-03 with Rule 88B net-cash interest.'
            ],
            prayer: 'Accept DRC-01C Part B clarification and remove Rule 88D restriction / suspension risk.'
        })
    },
    {
        key: 'APL_01', category: 'REPLY', formName: 'FORM GST APL-01', title: 'First Appeal Statement of Facts & Grounds (90d)', statutoryRule: 'Section 107(1) r/w Rule 108(1)',
        paragraphs: (c) => ({
            subject: `Memorandum of Appeal against Order No. ${c.refNo} dated ${c.issueDate} for FY ${c.fy}`,
            bodyLines: [
                `STATEMENT OF FACTS: Impugned order demands Rs. ${c.demanded} without considering documentary workings / Section 75(4) mandatory hearing.`,
                'GROUNDS OF APPEAL:',
                'Ground 1 (Natural Justice & Non-Speaking Order): Violation of Sec 75(4) & 75(6).',
                'Ground 2 (Limitation & Improper Service u/s 169): Portal upload alone without email/physical service vitiates limitation bar.',
                'Ground 3 (Substantive Merits & Double Proceeding Bar): Concurrent proceedings on identical issues & Circular 183/193 / Sec 16(5) eligibility ignored; 10% (or 12.5% Notif 53) pre-deposit duly paid.'
            ],
            prayer: 'Set aside the impugned order in full, waive interest/penalty, grant personal hearing, and refund excess pre-deposit/recovery.'
        })
    },
    {
        key: 'APL_05', category: 'REPLY', formName: 'FORM GST APL-05 / APL-02A', title: 'GSTAT Second Appeal Package (20% Pre-Deposit)', statutoryRule: 'Section 112 r/w Rule 110 & Trade Circular 21T/2024',
        paragraphs: (c) => ({
            subject: `Second Appeal before Hon'ble GST Appellate Tribunal against APL-04 Order ${c.refNo}`,
            bodyLines: [
                '1. Appeal filed within prescribed GSTAT limitation alongside mandatory 20% cumulative pre-deposit (10% earlier APL-01 + 10% additional Finance Act 2024).',
                '2. Accompanied by Maharashtra Trade Circular 21T/2024 Annexure-I/II checklist, self-certified copies of DRC-01/DRC-07/APL-01/APL-04, and Vakalatnama / PCT-05.',
                '3. Jurisdiction check: Item 7 Principal Bench Delhi if Place-of-Supply involved, else State Bench.'
            ],
            prayer: 'Allow appeal, quash appellate & adjudication orders, and direct consequential refund with statutory interest.'
        })
    },
    {
        key: 'SPL_04', category: 'REPLY', formName: 'FORM GST SPL-04', title: 'Reply to SPL-03 Amnesty Rejection SCN (1m)', statutoryRule: 'Section 128A r/w Rule 164(9) & Circular 238/32/2024',
        paragraphs: (c) => ({
            subject: `Reply in Form GST SPL-04 to SCN in Form GST SPL-03 Ref ${c.refNo}`,
            bodyLines: [
                '1. Full principal tax amount for FY 2017-18/2018-19/2019-20 stands paid via DRC-03/DRC-03A on or before 31.03.2025.',
                '2. Late Fee / Residual Compliance Cure: Proof of GSTR-3B/GSTR-9 late fee payment and Sec 75(12) bifurcation (separating Para 0070/0080 from Sec 73 demand) enclosed.',
                '3. Withdrawal of pending appeal / writ duly verified.'
            ],
            prayer: 'Issue Approval Order in FORM GST SPL-05 granting 100% waiver of interest and penalty u/s 128A.'
        })
    },
    {
        key: 'SPL_07_RESTORATION_UNDERTAKING', category: 'REPLY', formName: 'SPL-07 Appeal Restoration Undertaking', title: 'Undertaking to Restore Withdrawn Appeal after SPL-07', statutoryRule: 'Section 128A / Rule 164(12)',
        paragraphs: (c) => ({
            subject: `Undertaking for Restoration of Withdrawn Appeal consequent to Form GST SPL-07 Order ${c.refNo}`,
            bodyLines: [
                `I, ${c.signatory}, ${c.designation} of ${c.legalName} (GSTIN: ${c.gstin}), do hereby solemnly undertake NOT to file any appeal against rejection order FORM GST SPL-07 Ref No. ${c.refNo} dated ${c.issueDate}.`,
                'Accordingly, in terms of Rule 164(12), I pray for immediate restoration of my original appeal under Section 107 which was conditionally withdrawn solely to avail Section 128A amnesty.'
            ],
            prayer: 'Restore original APL-01 appeal to active appellate docket with full effect.'
        })
    },
    {
        key: 'NOTIF_22_2024_ANNEXURE_A', category: 'REPLY', formName: 'Section 148 Notif 22/2024 Annexure-A', title: 'Special Rectification for Sec 16(5)/(6) ITC Orders', statutoryRule: 'Section 148 r/w Notification No. 22/2024-CT (08.10.2024)',
        paragraphs: (c) => ({
            subject: `Application & Annexure-A Proforma for Special Rectification of Order ${c.refNo} dated ${c.issueDate}`,
            bodyLines: [
                `1. Basic Details: GSTIN ${c.gstin} | Legal Name: ${c.legalName} | Order Ref: ${c.refNo} dated ${c.issueDate}.`,
                `2. Confirmed Demand (FY ${c.fy}): Rs. ${c.demanded}. Amount now retroactively eligible u/s 16(5)/(6): Rs. ${c.explained}.`,
                '3. Declaration: No appeal u/s 107 or 112 is pending against the impugned order.'
            ],
            prayer: 'Issue rectified order in FORM GST DRC-08 (or APL-04) within 3 months waiving tax/interest/penalty attributable to Sec 16(5)/(6).'
        })
    },
    {
        key: 'SEC_161_RECTIFICATION', category: 'REPLY', formName: 'Section 161 Rectification Application', title: 'Rectification of Mistake Apparent on Record (3m/6m)', statutoryRule: 'Section 161 & Rule 142(7)',
        paragraphs: (c) => ({
            subject: `Application u/s 161 for Rectification of Order ${c.refNo} dated ${c.issueDate}`,
            bodyLines: [
                '1. Clerical / arithmetical / double-counting error (e.g., Param 0070 vs 0219 overlap or already-paid DRC-03 credit omitted) is apparent on the face of record.',
                '2. Filed within prescribed statutory window u/s 161.'
            ],
            prayer: 'Rectify the order u/s 161 and issue revised DRC-08 summary.'
        })
    },
    {
        key: 'REG_21_REVOCATION', category: 'REPLY', formName: 'FORM GST REG-21 / REG-23 Reply', title: 'Application / Reply for Revocation of Cancelled GSTIN', statutoryRule: 'Section 30 & Rule 23 / Rule 21A',
        paragraphs: (c) => ({
            subject: `Revocation of Cancellation Order / Reply to REG-23 SCN Ref ${c.refNo} for GSTIN ${c.gstin}`,
            bodyLines: [
                '1. All pending returns (GSTR-1 & GSTR-3B) have now been filed on common portal along with tax, Sec 50 interest, and Sec 47 late fee.',
                '2. Principal place of business proof (Electricity Bill, Rent Agreement/NOC, Geo-tagged Photos, Bank Statement) enclosed to prove bona fide active business.'
            ],
            prayer: 'Revoke cancellation in FORM GST REG-22 / lift REG-31 suspension forthwith.'
        })
    },
    {
        key: 'GSTR_10_HEARING', category: 'REPLY', formName: 'GSTR-10 Final Return Hearing Reply (7d)', title: 'Response to Section 45 GSTR-10 Non-Filing Notice', statutoryRule: 'Section 45, Rule 81 & Section 47(1)',
        paragraphs: (c) => ({
            subject: `Submission & Personal Hearing Attendance against GSTR-10 Notice Ref ${c.refNo}`,
            bodyLines: [
                '1. Pending FORM GSTR-10 Final Return has been filed / is being filed herewith along with stock declaration and applicable capped late fee.',
                '2. No clandestine tax evasion exists; Sec 122(1)(iii) penalty & Sec 62 Best Judgment assessment are unwarranted.'
            ],
            prayer: 'Record GSTR-10 compliance and close non-filer penalty proceedings.'
        })
    },
    {
        key: 'EWB_NIL_FILER', category: 'REPLY', formName: 'E-Way Bill vs Nil Return Clarification (7d)', title: 'Reply to DG Audit / State Tax EWB Nil-Filer Alert', statutoryRule: 'Section 37 / Rule 59 / CMD-08',
        paragraphs: (c) => ({
            subject: `Clarification on E-Way Bills Generated vs Nil GSTR-1/3B Notice Ref ${c.refNo}`,
            bodyLines: [
                '1. E-Way Bills cited reflect cancelled/rejected movements, job-work challans u/s 143, or non-taxable stock transfers (not concealed sales), OR tax liability has been reconciled and discharged via GSTR-3B / DRC-03.'
            ],
            prayer: 'Reconcile EWB portal report with attached Credit Notes / Delivery Challans and drop proceedings.'
        })
    },
    {
        key: 'MOV_07_DETENTION', category: 'REPLY', formName: 'FORM GST MOV-07 Detention SCN Reply (7d)', title: 'Section 129 Detention Penalty Defense', statutoryRule: 'Section 129(3) & CBIC Circular 64/38/2018',
        paragraphs: (c) => ({
            subject: `Reply to FORM GST MOV-07 Notice Ref ${c.refNo} dated ${c.issueDate}`,
            bodyLines: [
                '1. Goods accompanied valid Tax Invoice and E-Way Bill; alleged discrepancy is minor/clerical (e.g., Part-B vehicle update or expired transit due to traffic/breakdown) with zero intent to evade tax.',
                '2. Covered by Hon\'ble Supreme Court ruling in ACST v. M/s Satyam Shivam Papers Pvt. Ltd. (12.01.2022) & Circular 64/38/2018 (max Sec 125 minor penalty).'
            ],
            prayer: 'Drop 200% tax / 50% value penalty under Sec 129(1) and release vehicle/goods forthwith.'
        })
    },
    {
        key: 'RFD_09_REPLY', category: 'REPLY', formName: 'FORM GST RFD-09 Refund SCN Reply (15d)', title: 'Reply to Refund Rejection SCN RFD-08', statutoryRule: 'Section 54 r/w Rule 92(3)',
        paragraphs: (c) => ({
            subject: `Reply in FORM GST RFD-09 against RFD-08 SCN Ref ${c.refNo}`,
            bodyLines: [
                '1. Export/Inverted Duty Turnover & Net ITC exactly match Rule 89(4)/89(5) formula in Statement-1A/Statement-3 and Annexure-B.',
                '2. Shipping Bills, EGM, BRC/FIRC, ITR/26AS, and Non-Prosecution / CA Certificate enclosed.'
            ],
            prayer: 'Sanction full refund claim in RFD-06 (alternatively issue PMT-03 recredit only after appeal rights).'
        })
    },
    {
        key: 'PMT_03_UNDERTAKING', category: 'REPLY', formName: 'PMT-03 Re-Credit Undertaking', title: 'Undertaking for Re-Credit of Rejected/Deficient Refund', statutoryRule: 'Rule 86(4) & Rule 87(11) / Rule 93',
        paragraphs: (c) => ({
            subject: `Undertaking for Re-Credit via FORM GST PMT-03 against ARN/Order ${c.refNo}`,
            bodyLines: [
                `We, ${c.legalName} (GSTIN: ${c.gstin}), hereby undertake that we shall not file an appeal against RFD-06 rejection / RFD-03 deficiency amount of Rs. ${c.demanded}.`
            ],
            prayer: 'Re-credit the debited amount to our Electronic Credit / Cash Ledger via FORM GST PMT-03 immediately.'
        })
    },
    {
        key: 'ADT_RULE_101_4', category: 'REPLY', formName: 'Audit Discrepancy Reply (u/r 101(4))', title: 'Reply to GST Audit ADT-01 & Rule 101(4) Objections', statutoryRule: 'Section 65(4) & Rule 101(4)',
        paragraphs: (c) => ({
            subject: `Point-Wise Reply to Audit Discrepancy Notice u/r 101(4) Ref ${c.refNo} (FY ${c.fy})`,
            bodyLines: [
                '1. Point-by-point reconciliation across 6 standard audit heads (2A vs 3B, RC-cancelled dates, RCM P&L tie-out, Rule 88B net-cash interest, Sec 17(5) verification, GSTR-9 penalty).'
            ],
            prayer: 'Drop all explained objections before finalizing Form GST ADT-02 Final Audit Report.'
        })
    },
    {
        key: 'RULE_86A_UNBLOCK', category: 'REPLY', formName: 'Rule 86A ECrL Unblocking Representation', title: 'Request to Lift Blocking of Electronic Credit Ledger', statutoryRule: 'Rule 86A(1)-(3) & Bombay HC WP 4988/2025',
        paragraphs: (c) => ({
            subject: `Application for Immediate Unblocking of Electronic Credit Ledger u/r 86A Ref ${c.refNo}`,
            bodyLines: [
                '1. Blocking of ECrL requires independent "reasons to believe" recorded in writing; mechanical blocking via EIU/third-party RC cancellation without hearing violates Rule 86A.',
                '2. Per Rule 86A(3), restriction ceases automatically after 1 year; where taxpayer registration stands restored, ECrL block cannot survive (JYM Global Trading Co. v. CGST, 2026:BHC-OS:9751-DB).'
            ],
            prayer: 'Unblock Electronic Credit Ledger forthwith.'
        })
    },
    {
        key: 'SEC_125_PENALTY', category: 'REPLY', formName: 'Section 125 General Penalty Reply (7d)', title: 'Defense Against DRC-01 (Sec 125) 7-Day Penalty SCN', statutoryRule: 'Section 125 & Rule 100(2)',
        paragraphs: (c) => ({
            subject: `Reply to 7-Day Penalty SCN (Sec 125) Ref ${c.refNo}`,
            bodyLines: [
                '1. Specific late-filing fee u/s 47 already discharged; general penalty u/s 125 cannot be invoked where specific late-fee/penalty provision exists or where no willful default occurred.'
            ],
            prayer: 'Drop proposed Rs. 50,000 penalty u/s 125.'
        })
    },
    {
        key: 'MVAT_APPEAL_SETTLEMENT', category: 'REPLY', formName: 'MVAT Sec 26 Appeal / Settlement FORM I', title: 'MVAT Form 303(231) Defense & 2022 Settlement Submission', statutoryRule: 'MVAT Sec 23/26 & Mah Settlement Act 2022 Sec 8/12',
        paragraphs: (c) => ({
            subject: `Submission against MVAT Assessment Form 303(231) / Form 704 Order ${c.refNo}`,
            bodyLines: [
                '1. Form 704 J1xJ2 vendor confirmations, purchase invoices, and bank proofs enclosed to restore disallowed MVAT set-off.',
                '2. Without prejudice: Computation under Maharashtra Settlement Act 2022 Lump-Sum Option (80% waiver below Rs. 10 Lakh arrears via FORM I/III).'
            ],
            prayer: 'Allow MVAT set-off / finalize FORM III Settlement Order.'
        })
    },
    // Standardized Legal Kit (9 docs)
    { key: 'LOA', category: 'KIT', formName: 'Letter of Authority (LOA)', title: 'Standard Authorization Letter for Assessment/Appeal', statutoryRule: 'Section 116 CGST Act', paragraphs: (c) => ({ subject: `Letter of Authority — ${c.legalName} (${c.gstin})`, bodyLines: [`We hereby authorize M/s Finpulse Consulting / CA Representative (${c.signatory}) to appear, represent, inspect records, submit replies, and attend Personal Hearings before ${c.officer} (${c.jurisdiction}) in respect of Ref ${c.refNo} (FY ${c.fy}).`], prayer: 'Take this Authorization on record.' }) },
    { key: 'CA_ACCEPTANCE', category: 'KIT', formName: 'CA Engagement Acceptance Letter', title: 'Chartered Accountant Consent & Acceptance', statutoryRule: 'ICAI / Section 116', paragraphs: (c) => ({ subject: `Acceptance of Authorization — ${c.legalName}`, bodyLines: [`I/We hereby accept appointment as Authorized Representative for ${c.legalName} (GSTIN: ${c.gstin}) for proceedings ${c.refNo} (FY ${c.fy}).`], prayer: 'Submitted for kind record.' }) },
    { key: 'PCT_05', category: 'KIT', formName: 'FORM GST PCT-05 (Part A & B)', title: 'GST Practitioner Portal Authorization Format', statutoryRule: 'Rule 83', paragraphs: (c) => ({ subject: `FORM GST PCT-05 Authorisation for ${c.legalName} (${c.gstin})`, bodyLines: ['Part A: Taxpayer hereby authorizes enrolled GST Practitioner/CA to prepare/file replies, refund applications, and appear before GST Authorities.', 'Part B: Practitioner Acceptance & Enrolment Declaration.'], prayer: 'Verified and signed.' }) },
    { key: 'VAKALATNAMA', category: 'KIT', formName: 'Vakalatnama (GSTAT / High Court)', title: 'Advocate/Counsel Appointment Instrument', statutoryRule: 'GSTAT Procedure / CPC', paragraphs: (c) => ({ subject: `VAKALATNAMA — ${c.legalName} v. State/CGST Authority (${c.refNo})`, bodyLines: [`Know all men by these presents that ${c.legalName} (GSTIN: ${c.gstin}) hereby appoints Counsel to act, plead, file APL-05/Writ, withdraw/compromise, and receive refunds/costs.`], prayer: 'Accepted.' }) },
    { key: 'CIRCULAR_21T_ANNEXURE', category: 'KIT', formName: 'Trade Circular 21T/2024 Annexure-I & II', title: 'Maharashtra GSTAT Physical Filing Checklist & Declaration', statutoryRule: 'Mah Trade Circular 21T/2024', paragraphs: (c) => ({ subject: `Annexure-I & II Compliance Declaration for GSTAT Appeal (${c.refNo})`, bodyLines: ['1. Self-certified copies of DRC-01, DRC-07, APL-01, APL-04, and 20% Pre-deposit Challan attached.', '2. Declaration that physical/email particulars match online APL-05.' ], prayer: 'Take GSTAT filing on record.' }) },
    { key: 'CA_CERT_183', category: 'KIT', formName: 'CA Certificate u/c 183/15/2022 (UDIN)', title: 'Chartered Accountant Certificate (>₹5L Supplier Diff)', statutoryRule: 'CBIC Circular 183/15/2022 & 193/05/2023', paragraphs: (c) => ({ subject: `TO WHOMSOEVER IT MAY CONCERN — CA CERTIFICATE UNDER CIRCULAR 183/15/2022 (UDIN: [INSERT_18_DIGIT_UDIN])`, bodyLines: [`Verified books of accounts, GSTR-3B, Bank Payments, and Tax Invoices of ${c.legalName} (${c.gstin}) for FY ${c.fy}: supplier-wise tax totaling Rs. ${c.explained} has been duly charged and remitted by the supplier to the Government.`], prayer: 'Issued on request for GST scrutiny verification.' }) },
    { key: 'SUPPLIER_SEC16_DECL', category: 'KIT', formName: 'Supplier Sec 16 Declaration (<=₹5L)', title: 'Supplier Confirmation Affidavit u/c 183/15/2022', statutoryRule: 'Circular 183/15/2022 (<= ₹5 Lakh)', paragraphs: (c) => ({ subject: `SUPPLIER DECLARATION OF TAX PAYMENT UNDER SECTION 16(2)(c) (FY ${c.fy})`, bodyLines: [`We hereby confirm that tax invoices raised on ${c.legalName} (${c.gstin}) during FY ${c.fy} have been accounted in our outward GSTR-1/3B and tax paid to Government Treasury.`], prayer: 'Declared true and correct.' }) },
    { key: 'ADJOURNMENT_PH', category: 'KIT', formName: 'Adjournment / Personal Hearing Request u/s 75(5)', title: 'Application Seeking Time & Hearing Opportunity', statutoryRule: 'Section 75(4) & 75(5)', paragraphs: (c) => ({ subject: `Request for 15-Day Adjournment u/s 75(5) & Personal Hearing Notice ${c.refNo}`, bodyLines: [`Due to compilation of multi-vendor Circular 183 confirmations and ledger reconciliations for FY ${c.fy}, kindly grant a 15-day adjournment and intimate next Physical Hearing date.`], prayer: 'Grant adjournment in interest of natural justice.' }) },
    { key: 'AFFIDAVIT_REFUND', category: 'KIT', formName: 'Non-Prosecution & No-Unjust-Enrichment Affidavit', title: 'Refund Supporting Declarations (RFD-01)', statutoryRule: 'Section 54(4) & Rule 89(2)', paragraphs: (c) => ({ subject: `DECLARATION / AFFIDAVIT FOR REFUND CLAIM (${c.refNo})`, bodyLines: ['1. The Applicant has not been prosecuted for any offence under CGST/IGST Act for tax evasion > Rs. 2.50 Cr.', '2. Incidence of tax/interest claimed has NOT been passed on to any other person (or Sec 54(8) LUT/Inverted exception applies).'], prayer: 'Solemnly affirmed.' }) }
];

export function listAvailableReplyTemplates() {
    return [
        { key: 'ASMT_11', category: 'REPLY' as const, formName: 'FORM GST ASMT-11', title: 'Reply to Section 61 Scrutiny Notice ASMT-10', statutoryRule: 'Section 61(2) r/w Rule 99(2)' },
        { key: 'DRC_06', category: 'REPLY' as const, formName: 'FORM GST DRC-06', title: 'Formal Reply to Show Cause Notice DRC-01', statutoryRule: 'Section 73/74/74A r/w Rule 142(4)' },
        ...NOTICE_TEMPLATE_REGISTRY.map(({ key, category, formName, title, statutoryRule }) => ({ key, category, formName, title, statutoryRule }))
    ];
}

export function generateNoticeReply(
    templateKey: string,
    notice: any,
    reco: NoticeReconciliationResult,
    options: LegalReplyOptions = {}
): { html: string; text: string; subject: string; formName: string } {
    let paramCodes: string[] = [];
    try { paramCodes = JSON.parse(notice?.param_codes_json || '[]'); } catch { paramCodes = []; }

    if (templateKey === 'ASMT_11' || templateKey === 'DRC_06') {
        const base = templateKey === 'ASMT_11'
            ? generateAsmt11Reply(notice, reco, options)
            : generateDrc06Reply(notice, reco, options);
        if (paramCodes.length === 0) return base;
        const paramHtml = `<div style="margin-top:12px;"><strong>Parameter-Wise Submissions:</strong><ul>${paramCodes.map((p) => `<li>${escapeHtml(PARAM_DEFENSE_SNIPPETS[p] || `Param ${p}: Supporting reconciliation attached.`)}</li>`).join('')}</ul></div>`;
        const paramText = `\nParameter-Wise Submissions:\n${paramCodes.map((p) => `- ${PARAM_DEFENSE_SNIPPETS[p] || `Param ${p}: Supporting reconciliation attached.`}`).join('\n')}\n`;
        return { ...base, html: `${base.html}\n${paramHtml}`, text: `${base.text}\n${paramText}` };
    }

    const spec = NOTICE_TEMPLATE_REGISTRY.find((t) => t.key === templateKey);
    if (!spec) return generateDrc06Reply(notice, reco, options);

    const legalName = options.companyLegalName || notice.client_legal_name || notice.client_gstin || 'Taxpayer';
    const gstin = notice.client_gstin || reco.gstin || '';
    const refNo = notice.reference_no || reco.referenceNo || 'REF-NO';
    const din = notice.din || 'N/A';
    const fy = notice.financial_year || reco.financialYear || '2023-24';
    const issueDate = notice.issue_date || 'N/A';
    const officer = options.officerTitle || notice.issuing_officer || 'The Proper Officer';
    const jurisdiction = options.officerJurisdiction || notice.issuing_jurisdiction || 'GST Department';
    const lim = checkNoticeLimitation(fy, notice.section_cited || notice.notice_type, issueDate);

    const content = spec.paragraphs({
        legalName,
        gstin,
        pan: gstin.length >= 12 ? gstin.slice(2, 12) : '',
        refNo,
        din,
        fy,
        issueDate,
        officer,
        jurisdiction,
        demanded: Number(notice.total_demanded || reco.totalDemanded || 0).toLocaleString('en-IN'),
        explained: Number(reco.explainedAmount || 0).toLocaleString('en-IN'),
        signatory: options.signatoryName || 'Authorized Signatory',
        designation: options.signatoryDesignation || 'Partner / Director / CA',
        paramCodes,
        limitationNote: lim.isTimeBarred ? `TIME-BARRED OBJECTION: Expired ${lim.deadline} (${lim.statutoryCitation}).` : ''
    });

    const html = `
        <div style="font-family: 'Times New Roman', serif; padding: 24px; color: #1e293b; line-height: 1.6; max-width: 820px; margin: 0 auto;">
            <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px;">
                <h2 style="margin: 0; font-size: 18px; letter-spacing: 0.4px;">${escapeHtml(spec.formName)}</h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #475569;">[${escapeHtml(spec.statutoryRule)}]</p>
            </div>
            <p><strong>To,</strong><br/>${escapeHtml(officer)}<br/>${escapeHtml(jurisdiction)}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">
                <tr><td style="padding: 5px; border: 1px solid #cbd5e1;"><strong>GSTIN / Entity:</strong> ${escapeHtml(gstin)} — ${escapeHtml(legalName)}</td><td style="padding: 5px; border: 1px solid #cbd5e1;"><strong>Ref / FY:</strong> ${escapeHtml(refNo)} (FY ${escapeHtml(fy)})</td></tr>
            </table>
            <p><strong>Subject:</strong> ${escapeHtml(content.subject)}</p>
            ${content.bodyLines.map((l) => `<p style="margin: 8px 0;">${escapeHtml(l)}</p>`).join('')}
            <p style="margin-top: 16px;"><strong>PRAYER:</strong> ${escapeHtml(content.prayer)}</p>
            <p style="margin-top: 32px;">For <strong>${escapeHtml(legalName)}</strong><br/><br/><strong>${escapeHtml(options.signatoryName || 'Authorized Signatory')}</strong></p>
        </div>
    `.trim();

    const text = [
        `${spec.formName} [${spec.statutoryRule}]`,
        `To: ${officer}, ${jurisdiction}`,
        `GSTIN: ${gstin} | Legal Name: ${legalName} | Ref: ${refNo} | FY: ${fy}`,
        `Subject: ${content.subject}`,
        '',
        ...content.bodyLines,
        '',
        `PRAYER: ${content.prayer}`,
        '',
        `For ${legalName}`,
        `${options.signatoryName || 'Authorized Signatory'}`
    ].join('\n');

    return { html, text, subject: content.subject, formName: spec.formName };
}

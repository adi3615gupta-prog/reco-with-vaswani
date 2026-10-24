import { NoticeReconciliationResult } from './noticeReconciliation';

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

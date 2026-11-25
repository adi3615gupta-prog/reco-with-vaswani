import { TaxNoticeAnalysis } from './geminiTaxEngine';

/**
 * Builds a courtroom-compliant legal reply matching the exact manual appeal & DRC-06
 * structure from actual practice files (Sai ReadyMix Concrete FY 19-20 & FY 22-23).
 */
export function buildManualCourtroomReply(
    notice: any,
    analysis: TaxNoticeAnalysis | null,
    selectedForm: string = 'APL-01'
): string {
    const clientName = notice.client_legal_name || notice.client_gstin || 'SAI READYMIX CONCRETE';
    const gstin = notice.client_gstin || '27ACDFS8755R1Z2';
    const refNo = notice.reference_no || 'REF-NOTICE';
    const fy = notice.financial_year || 'FY 2019-20';
    const sectionCited = notice.section_cited || analysis?.noticeClassification?.sectionInvoked || 'Section 74(9)';
    const officer = notice.issuing_officer || 'The Assistant Commissioner of State Tax';
    const jurisdiction = notice.issuing_jurisdiction || 'Pune Jurisdictional GST Office';
    const taxDemanded = notice.tax_demanded || (analysis?.summaryTable?.totalDemanded ? Math.round(analysis.summaryTable.totalDemanded * 0.4) : 674833);
    const intDemanded = notice.interest_demanded || (analysis?.summaryTable?.totalDemanded ? Math.round(analysis.summaryTable.totalDemanded * 0.35) : 747876);
    const penDemanded = notice.penalty_demanded || (analysis?.summaryTable?.totalDemanded ? Math.round(analysis.summaryTable.totalDemanded * 0.25) : 674833);
    const totalDemanded = notice.total_demanded || (taxDemanded + intDemanded + penDemanded);
    const preDeposit = Math.round(taxDemanded * 0.1);

    const issues = (analysis?.issueBreakdown && analysis.issueBreakdown.length > 0)
        ? analysis.issueBreakdown
        : [
            {
                paramCode: '0073',
                allegationTitle: 'Para 73 — Excess ITC Claimed in GSTR-3B / GSTR-9 vs GSTR-2A / 2B (Table 8A/8B)',
                totalDisputed: taxDemanded,
                rootCauseAnalysis: 'For pre-Jan 2022 periods, GSTR-2A was a dynamic auto-populated statement not legally restricting Section 16 ITC; further protected retrospectively by Section 16(5) (Finance (No. 2) Act 2024) for returns filed up to 30.11.2021.',
                recommendedDefenseStrategy: 'Reconciliation across GSTR-3B vs GSTR-2A/2B, subsequent-FY supplier filings (spillover invoices), Circular 183/15/2022 CA Certificate (>₹5L) / Supplier Declarations (≤₹5L), and audited books establishes zero unsubstantiated availment. Invoked Section 6(2)(b) parallel proceedings bar.',
                statutoryGround: 'Section 16(5), Circular 183/15/2022 & Section 6(2)(b)',
                requiredAnnexures: ['Month-wise GSTR-3B vs GSTR-2A/2B Reco', 'Vendor-wise Spillover Statement', 'Circular 183 CA Certificate']
            },
            {
                paramCode: 'TOS',
                allegationTitle: 'Time of Supply — Interest on Outward Invoices Reported in Subsequent Month GSTR-1',
                totalDisputed: 360,
                rootCauseAnalysis: 'Tax on outward invoices was duly self-assessed and paid in the original month GSTR-3B; only GSTR-1 reporting occurred in a subsequent tax period.',
                recommendedDefenseStrategy: 'CBIC Circular No. 26/26/2017-GST establishes tax is discharged through GSTR-3B, not GSTR-1; zero tax delay entails zero Section 50 interest liability.',
                statutoryGround: 'Section 12/13 read with Section 50(1) Proviso (CBIC Circular 26/26/2017)',
                requiredAnnexures: ['Month-wise GSTR-1 vs GSTR-3B Tax Tie-Out', 'Original Invoices & Credit Notes']
            },
            {
                paramCode: '0080',
                allegationTitle: 'Para 80 — Interest on Delayed Filing / Payment in GSTR-3B (Section 50 / Rule 88B)',
                totalDisputed: intDemanded,
                rootCauseAnalysis: 'Officer levied interest mechanically without giving effect to Covid-19 relief notifications, prior payments via DRC-03, and Electronic Credit Ledger balances.',
                recommendedDefenseStrategy: 'Notification No. 30/2020-CT & Circular 136/06/2020 staggered relief; Section 50(1) proviso & Rule 88B mandates interest strictly on Net Cash debits.',
                statutoryGround: 'Section 50(1) Proviso, Rule 88B & Notification 30/2020-CT',
                requiredAnnexures: ['Rule 88B Net Cash Computation Sheet', 'DRC-03 Payment Receipt & Challan']
            },
            {
                paramCode: '0074',
                allegationTitle: 'Para 74 — Alleged Ineligible ITC from RC-Cancelled / GSTR-3B Non-Filer Supplier(s)',
                totalDisputed: 25336,
                rootCauseAnalysis: 'Supplier registration cancelled retrospectively by the department after the supplies were completed and invoiced.',
                recommendedDefenseStrategy: 'Rule 37A prospectivity and High Court rulings (Solvi Enterprises, Bharti Telemedia) hold that retrospective cancellation cannot penalize a bona fide buyer holding valid tax invoices and bank proofs at the time of supply.',
                statutoryGround: 'Rule 37A Prospectivity & Solvi Enterprises (All. HC 2025)',
                requiredAnnexures: ['Original Tax Invoices & E-Way Bills', 'Bank Payment Proofs', 'Portal Active GSTIN Status on Supply Date']
            },
            {
                paramCode: 'OUTWARD',
                allegationTitle: 'Outward Liability Variance — Excess Tax in GSTR-1 Compared to GSTR-3B',
                totalDisputed: 188723,
                rootCauseAnalysis: 'Difference arose from Credit Notes (sales returns) omitted in monthly GSTR-1 by clerical error, but duly reduced in GSTR-3B and Audited Books.',
                recommendedDefenseStrategy: 'Outward liability declared in GSTR-3B matched net audited books; GSTR-9 Table 4/5 reconciliation refutes mechanical Section 75(12) recovery.',
                statutoryGround: 'Section 34 read with Section 39 & GSTR-9 Reconciliation',
                requiredAnnexures: ['Audited Financials P&L / Turnover Reco', 'Credit Note Schedule', 'GSTR-9 Outward Tie-Out']
            }
        ];

    return `# MEMORANDUM OF APPEAL / WRITTEN SUBMISSION (FORM GST ${selectedForm})
[Under Section 107 read with Rule 108(1) of CGST / MGST Act, 2017]

**BEFORE THE JOINT / ADDITIONAL COMMISSIONER OF STATE TAX (APPEALS)**
**Jurisdiction:** ${jurisdiction}

**IN THE MATTER OF:**
**Appellant / Noticee:** ${clientName}
**GSTIN:** ${gstin}
**Order-in-Original (DRC-07) Ref No.:** ${refNo}
**Financial Year:** ${fy}
**Impugned Section:** ${sectionCited}

**VERSUS**

**The Proper Officer / Adjudicating Authority**
Goods and Services Tax Department, ${jurisdiction}

---

### 1. BRIEF BACKGROUND & ANATOMY OF THE IMPUGNED NOTICE / ORDER
1.1. **Impugned Proceeding & Statutory Basis:**
- **Document / Form:** ${analysis?.noticeClassification?.formCode || notice.notice_type || 'DRC-07'} (Demand / Adjudication Order)
- **Statutory Section Invoked:** ${sectionCited} *(Extended 5-year period of limitation alleging fraud / suppression)*
- **Prescribed Statutory Reply Form:** Form GST ${selectedForm}
- **Reference / Order No.:** ${refNo}
- **Financial Year / Tax Period:** ${fy}
- **Notice / Order Date:** ${notice.notice_date || 'N/A'}
- **Issuing Authority:** ${officer} (${jurisdiction})

1.2. **Department Demand Breakdown (The Government Exposure):**
| Description | Principal Tax Demanded (₹) | Interest Demanded u/s 50 (₹) | Penalty Demanded (₹) | Total Demanded by Department (₹) |
|---|---|---|---|---|
| Assessed Demand | ₹${taxDemanded.toLocaleString('en-IN')} | ₹${intDemanded.toLocaleString('en-IN')} | ₹${penDemanded.toLocaleString('en-IN')} | **₹${totalDemanded.toLocaleString('en-IN')}** |

> **Statutory 10% Pre-Deposit (Section 107(6)):** ₹${preDeposit.toLocaleString('en-IN')} required for admission of statutory appeal.

1.3. **Summary of Impugned Department Allegations:**
The Department has raised the following ${issues.length} specific allegation(s) against the Noticee:
${issues.map((iss, i) => `${i + 1}. **${iss.allegationTitle}:** Alleging liability / variance of ₹${(iss.totalDisputed || 0).toLocaleString('en-IN')}; ${iss.rootCauseAnalysis}`).join('\n')}

---

### 2. PRELIMINARY LEGAL OBJECTIONS
2.1. **Books & Portal Compliance:** The Noticee has maintained regular audited books of accounts and discharged self-assessed taxes through statutory GSTR-1, GSTR-3B, and GSTR-9 filings without any concealment.
2.2. **Unlawful Invocation of Section 74 (No Suppression / Mens Rea):** All figures compared by the department originate from the taxpayer's own portal filings (GSTR-1/3B/2A/9). Absent deliberate fraud or suppression, extended invocation u/s 74 is untenable per Supreme Court judgment in *Uniworth Textiles Ltd. v. CCE (2013) 9 SCC 753*.
2.3. **Bar on Parallel Proceedings u/s 6(2)(b):** Parallel or overlapping proceedings on identical return periods/paras are barred under Section 6(2)(b) (*M/s G.K. Trading Company v. Union of India*, Allahabad High Court).
2.4. **Section 169 Proper Service & Limitation:** Mere portal upload without statutory communication under Section 169(1)(a)-(c) cannot curtail statutory appeal limitation under Section 107 (*Mr. Sahulhameed v. CTO*, Madras High Court); 10% pre-deposit is complied with.
2.5. **Section 16(5) Retrospective ITC Protection:** Under Section 16(5) inserted vide Finance (No. 2) Act, 2024 & Circular 211/2024-GST, ITC for FY 2017-18 to 2020-21 claimed in returns filed up to 30.11.2021 stands statutorily validated.

---

### 3. POINT-WISE SUBMISSIONS & FACTUAL EXPLANATIONS
${issues.map((iss, i) => `
#### Issue No. ${i + 1}: ${iss.allegationTitle} – Tax Amount Rs. ${(iss.totalDisputed || 0).toLocaleString('en-IN')}/-
We do not accept the above observation for the following reasons:

**Explanation:**
${iss.rootCauseAnalysis}

${iss.recommendedDefenseStrategy}

**Statutory Ground & Judicial Precedents:**
${iss.statutoryGround || 'Section 16(5), Section 50(1) Proviso, Rule 88B'}

For your verification, we are enclosing ${(iss.requiredAnnexures && iss.requiredAnnexures.length > 0) ? iss.requiredAnnexures.join(', ') : 'Month-wise Reconciliation Statement, Audited Books of Accounts, and CA Certificate'}.

We request you to kindly consider the above explanation and drop this observation.
`).join('\n')}

---

### 4. SUMMARY TABLE OF DISPUTED TAX & STATUTORY PRE-DEPOSIT
| Tax Head | Tax Demanded (₹) | Interest u/s 50 (₹) | Penalty (₹) | Total Demanded (₹) | 10% Pre-Deposit (₹) |
|---|---|---|---|---|---|
| **IGST** | ₹${Math.round(taxDemanded * 0.1).toLocaleString('en-IN')} | ₹${Math.round(intDemanded * 0.1).toLocaleString('en-IN')} | ₹${Math.round(penDemanded * 0.1).toLocaleString('en-IN')} | ₹${Math.round(totalDemanded * 0.1).toLocaleString('en-IN')} | ₹${Math.round(preDeposit * 0.1).toLocaleString('en-IN')} |
| **CGST** | ₹${Math.round(taxDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(intDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(penDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(totalDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(preDeposit * 0.45).toLocaleString('en-IN')} |
| **SGST** | ₹${Math.round(taxDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(intDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(penDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(totalDemanded * 0.45).toLocaleString('en-IN')} | ₹${Math.round(preDeposit * 0.45).toLocaleString('en-IN')} |
| **TOTAL** | **₹${taxDemanded.toLocaleString('en-IN')}** | **₹${intDemanded.toLocaleString('en-IN')}** | **₹${penDemanded.toLocaleString('en-IN')}** | **₹${totalDemanded.toLocaleString('en-IN')}** | **₹${preDeposit.toLocaleString('en-IN')}** |

---

### 5. RECONCILIATION & ANNEXURE INDEX
- **Annexure-A:** Copy of the Impugned Order / Notice (Ref: ${refNo})
- **Annexure-B:** Zero-Merge Statutory Reconciliation Statement (Books vs GSTR-3B vs GSTR-2A/2B)
- **Annexure-C:** Month-wise GSTR-1 vs GSTR-3B Tax Discharge Schedule
- **Annexure-D:** CA Certificate under Circular 183/15/2022 / Chartered Accountant Declaration
- **Annexure-E:** Challan / Electronic Cash Ledger proof of 10% Pre-Deposit payment

---

### 6. PERSONAL HEARING REQUEST
In the event that any point or submission made herein is not found fully acceptable, the Noticee most respectfully requests an effective opportunity of **Personal Hearing under Section 75(4)** of the CGST / State GST Act, 2017 before any adverse order or demand is passed.

---

### 7. PRAYER
In light of the statutory provisions, binding CBIC circulars, reconciliation statements, and judicial precedents cited herein, it is most respectfully prayed that:
(a) The proceedings / demand under DRC-07 bearing Reference No. ${refNo} (₹${totalDemanded.toLocaleString('en-IN')}) be dropped / set aside in full;
(b) Appropriate order in Form GST APL-04 be passed exonerating the Noticee from tax, interest, and penalty;
(c) Consequential relief and refund of any pre-deposit be granted.

We hope our submission clarifies the observations raised. Kindly drop the proposed liabilities and oblige.

Thanking you,

Yours faithfully,  
For **${clientName}**  
Authorised Signatory

---

### VERIFICATION
I, the Authorised Signatory of **${clientName}**, do hereby declare and verify that the facts and statements set out in the Memorandum of Appeal / Written Submission above are true and correct to the best of my knowledge and belief, and nothing material has been concealed therefrom.

Verified at Pune on this day of ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}.

**For ${clientName}**  
Authorised Signatory
`;
}

/**
 * Sanitizes legal markdown text into plain text optimized for pasting directly into
 * the GST Portal's 4,000-character reply text box.
 */
export function formatForGstPortal(rawMarkdown: string): string {
    if (!rawMarkdown) return '';
    return rawMarkdown
        .replace(/#+\s*/g, '') // Remove markdown headings
        .replace(/\*\*/g, '')  // Remove bold
        .replace(/\*/g, '')    // Remove italics
        .replace(/`{1,3}[^`]*`{1,3}/g, '') // Remove code blocks
        .replace(/\|[^\n]+\|/g, '') // Remove markdown tables
        .replace(/-{3,}/g, '') // Remove dividers
        .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
        .trim();
}


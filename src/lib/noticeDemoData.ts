/**
 * NOTICE-SHIELD AI: Pre-Loaded Realistic Demo Notices
 * 
 * Provides immediate offline testing and evaluation for CAs & Practitioners
 * without requiring live portal credentials or sensitive production files.
 */

export interface DemoNoticeItem {
    id: string;
    formCode: 'ASMT-10' | 'DRC-01' | 'DRC-01B';
    title: string;
    badgeLabel: string;
    badgeColor: string;
    statutorySection: string;
    clientGstin: string;
    clientLegalName: string;
    clientTradeName: string;
    clientPan: string;
    referenceNo: string;
    din: string;
    financialYear: string;
    taxPeriod: string;
    issueDate: string;
    dueDate: string;
    daysRemaining: number;
    issuingOfficer: string;
    jurisdiction: string;
    taxDemanded: number;
    interestDemanded: number;
    penaltyDemanded: number;
    totalDemanded: number;
    rawText: string;
    coreDefenseTag: string;
}

export const PRELOADED_DEMO_NOTICES: DemoNoticeItem[] = [
    {
        id: 'DEMO-ASMT-10-01',
        formCode: 'ASMT-10',
        title: 'Form GST ASMT-10: Scrutiny of Returns (ITC 2B vs 3B Variance)',
        badgeLabel: 'Scrutiny Notice',
        badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
        statutorySection: 'Section 61 read with Rule 99(1)',
        clientGstin: '27AAFCV1234A1Z5',
        clientLegalName: 'M/s Advik Engineering Solutions LLP',
        clientTradeName: 'Advik Engineering',
        clientPan: 'AAFCV1234A',
        referenceNo: 'ZA2704240987654',
        din: 'DIN-202409278891234',
        financialYear: '2018-19',
        taxPeriod: 'Annual (FY 2018-19)',
        issueDate: '2024-09-15',
        dueDate: '2024-10-15',
        daysRemaining: 18,
        issuingOfficer: 'Shri Rajesh Sharma, State Tax Officer',
        jurisdiction: 'Ward 04, Special Circle, Pune, Maharashtra',
        taxDemanded: 600000,
        interestDemanded: 432000,
        penaltyDemanded: 0,
        totalDemanded: 1032000,
        coreDefenseTag: 'Sec 16(5) Retrospective Relief + Circular 183 CA Certification',
        rawText: `OFFICE OF THE ASSISTANT COMMISSIONER OF STATE TAX
Ward 04, Special Circle, Pune, Maharashtra
Reference No: ZA2704240987654
DIN: DIN-202409278891234
Date: 15-09-2024

To,
M/s Advik Engineering Solutions LLP
GSTIN: 27AAFCV1234A1Z5
PAN: AAFCV1234A
Address: Plot No. 44, MIDC Bhosari, Pune - 411026
Email: accounts@advikengg.com
Mobile: +91 9822012345

Subject: Notice for Intimating Discrepancies in the Return after Scrutiny (Form GST ASMT-10)

Sir/Madam,
1. Scrutiny of your returns in Form GSTR-3B and auto-drafted Form GSTR-2A/2B for the Financial Year 2018-19 has been conducted under Section 61 of the CGST Act, 2017 read with Rule 99 of the CGST Rules, 2017.
2. The following discrepancies have been noticed on verification:
   Discrepancy 1: Excess Input Tax Credit (ITC) availed in Form GSTR-3B Table 4(A)(5) compared to auto-drafted ITC available in Form GSTR-2A.
   - ITC Availed in GSTR-3B: CGST ₹3,00,000, SGST ₹3,00,000 (Total ₹6,00,000)
   - ITC Reflected in GSTR-2A: CGST Nil, SGST Nil
   - Difference: ₹6,00,000
   Discrepancy 2: Belated availment of ITC after statutory due date prescribed under Section 16(4) of the CGST Act, 2017.
3. You are hereby called upon to furnish an explanation for the aforesaid discrepancies in Form GST ASMT-11 within a period of thirty (30) days from the receipt of this notice, failing which action under Section 73 or Section 74 shall be initiated.

Yours faithfully,
Shri Rajesh Sharma, State Tax Officer
Ward 04, Special Circle, Pune, Maharashtra`
    },
    {
        id: 'DEMO-DRC-01-02',
        formCode: 'DRC-01',
        title: 'Form GST DRC-01: Show Cause Notice under Section 74 (Turnover Difference)',
        badgeLabel: 'Demand SCN',
        badgeColor: 'border-red-500/40 text-red-400 bg-red-500/10',
        statutorySection: 'Section 74(1) read with Rule 142(1)',
        clientGstin: '24AAACT1020M1Z8',
        clientLegalName: 'M/s Apex Precision Logistics India Pvt Ltd',
        clientTradeName: 'Apex Precision Logistics',
        clientPan: 'AAACT1020M',
        referenceNo: 'SCN-DRC01-2024-8842',
        din: 'DIN-202408249911022',
        financialYear: '2019-20',
        taxPeriod: 'Annual (FY 2019-20)',
        issueDate: '2024-08-20',
        dueDate: '2024-09-19',
        daysRemaining: 4,
        issuingOfficer: 'Smt. Priya Nair, Assistant Commissioner of Central Tax',
        jurisdiction: 'Division II, Ahmedabad North, Gujarat',
        taxDemanded: 1080000,
        interestDemanded: 777600,
        penaltyDemanded: 1080000,
        totalDemanded: 2937600,
        coreDefenseTag: 'Invalid Section 74 Suppression + Rule 88B Net Cash Interest',
        rawText: `BEFORE THE ASSISTANT COMMISSIONER OF CENTRAL GST
Division II, Ahmedabad North Commissionerate, Gujarat
Show Cause Notice under Section 74(1) of the CGST Act, 2017 (Form GST DRC-01)
Reference No: SCN-DRC01-2024-8842
DIN: DIN-202408249911022
Date: 20-08-2024

To,
M/s Apex Precision Logistics India Pvt Ltd
GSTIN: 24AAACT1020M1Z8
PAN: AAACT1020M
Email: legal@apexlogistics.in
Phone: +91 9426098765

1. Whereas, upon comparison of outward taxable supplies declared in Form GSTR-1 with Form GSTR-3B for Financial Year 2019-20, a turnover discrepancy of ₹60,00,000 is observed.
   - Turnover declared in GSTR-1: ₹4,80,00,000
   - Turnover declared in GSTR-3B: ₹4,20,00,000
   - Tax short paid (IGST @ 18%): ₹10,80,000
2. The taxpayer has willfully suppressed the said outward turnover with intent to evade payment of tax. Therefore, extended period of limitation under Section 74(1) is hereby invoked.
3. Taxpayer is called upon to show cause within 30 days in Form GST DRC-06 as to why:
   (a) Tax amounting to ₹10,80,000 should not be demanded under Section 74(1).
   (b) Interest should not be recovered under Section 50.
   (c) Equivalent penalty of 100% (₹10,80,000) should not be levied under Section 74.

Smt. Priya Nair, Assistant Commissioner of Central Tax
Division II, Ahmedabad North, Gujarat`
    },
    {
        id: 'DEMO-DRC-01B-03',
        formCode: 'DRC-01B',
        title: 'Form GST DRC-01B: Rule 88C Automated Outward Liability Intimation',
        badgeLabel: 'Rule 88C Intimation',
        badgeColor: 'border-purple-500/40 text-purple-400 bg-purple-500/10',
        statutorySection: 'Rule 88C read with Section 75(12)',
        clientGstin: '27AAACG9988H1ZV',
        clientLegalName: 'M/s Global Pharma Impex Private Limited',
        clientTradeName: 'Global Pharma Impex',
        clientPan: 'AAACG9988H',
        referenceNo: 'DRC01B-RULE88C-2024-551',
        din: 'DIN-AUTOSYS-2024-771',
        financialYear: '2024-25',
        taxPeriod: 'May 2024',
        issueDate: '2024-06-25',
        dueDate: '2024-07-02',
        daysRemaining: 2,
        issuingOfficer: 'GST Portal Automated System',
        jurisdiction: 'Maharashtra State Goods and Services Tax Department',
        taxDemanded: 450000,
        interestDemanded: 0,
        penaltyDemanded: 0,
        totalDemanded: 450000,
        coreDefenseTag: 'Timing Variance / Table 9A Amendment Rectification',
        rawText: `GST PORTAL SYSTEM-GENERATED INTIMATION (FORM GST DRC-01B Part A)
Reference No: DRC01B-RULE88C-2024-551
Intimation of difference in liability reported in statement of outward supplies (GSTR-1) and that reported in return (GSTR-3B)
Date: 25-06-2024

To,
GSTIN: 27AAACG9988H1ZV
Legal Name: M/s Global Pharma Impex Private Limited
Trade Name: Global Pharma Impex
Tax Period: May 2024

1. It is observed that the tax liability declared by you in Form GSTR-1 exceeds the liability paid in Form GSTR-3B by ₹4,50,000 (IGST: ₹4,50,000), which exceeds the statutory threshold prescribed under Rule 88C.
2. In accordance with Rule 88C(1), you are hereby directed to:
   (a) Pay the differential tax liability along with applicable interest under Section 50 through Form GST DRC-03; OR
   (b) Furnish reasons for the said difference in Part B of Form GST DRC-01B within a period of seven (7) days.
3. Please note that failure to comply shall result in blocking of Form GSTR-1 for subsequent periods under Rule 59(6) and recovery proceedings under Section 79.`
    }
];

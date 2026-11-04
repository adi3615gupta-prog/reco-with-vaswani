/**
 * Suite 08: Monthly Audit Working Paper Excel Exporter
 * Standardized 8-Sheet Analytical Workbook with Strict Zero-Merge Architecture
 * Guaranteeing 100% Sortable, Filterable & XLOOKUP-compatible Spreadsheets
 */

import * as XLSX from 'xlsx-js-style';
import type {
    MonthlyAuditHeader,
    VouchingScopeRegister,
    StandardChecklistItem,
    AuditObservationItem,
    AuditPendingPointItem,
    FullAuditVerificationSnapshot,
    ProfitabilityStatement,
    MonthSales3WayRow,
    MonthPurchase3WayRow,
    BankFacilityItem,
    RocLoanChargeItem
} from './monthlyAuditEngine';
import {
    DEFAULT_PROFITABILITY_STATEMENT,
    createInitialSales3WayMatrix,
    createInitialPurchase3WayMatrix,
    createInitialBankFacilities,
    createInitialRocLoanCharges
} from './monthlyAuditEngine';

// ─── 1. Zero-Merge Architecture & Corporate Styling Helpers ─────────────────

/**
 * Strips all merged cell declarations from every worksheet in the workbook.
 * This guarantees zero '<mergeCell>' records in the generated XLSX, permanently
 * preventing Excel "all merged cells need to be the same size" AutoFilter errors.
 */
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
    if (!wb || !wb.Sheets) return wb;
    for (const name of Object.keys(wb.Sheets)) {
        const ws = wb.Sheets[name];
        if (ws) {
            ws['!merges'] = [];
        }
    }
    return wb;
}

const STYLES = {
    NAVY_HEADER: {
        fill: { fgColor: { rgb: "1E293B" } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
            top: { style: "thin", color: { rgb: "334155" } },
            bottom: { style: "thin", color: { rgb: "334155" } },
            left: { style: "thin", color: { rgb: "334155" } },
            right: { style: "thin", color: { rgb: "334155" } }
        }
    },
    SECTION_HEADER: {
        fill: { fgColor: { rgb: "334155" } },
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center" }
    },
    META_LABEL: {
        fill: { fgColor: { rgb: "F1F5F9" } },
        font: { bold: true, color: { rgb: "334155" }, sz: 9, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "CBD5E1" } },
            bottom: { style: "thin", color: { rgb: "CBD5E1" } },
            left: { style: "thin", color: { rgb: "CBD5E1" } },
            right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
    },
    META_VALUE: {
        fill: { fgColor: { rgb: "FFFFFF" } },
        font: { color: { rgb: "0F172A" }, sz: 9, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "CBD5E1" } },
            bottom: { style: "thin", color: { rgb: "CBD5E1" } },
            left: { style: "thin", color: { rgb: "CBD5E1" } },
            right: { style: "thin", color: { rgb: "CBD5E1" } }
        }
    },
    DATA_ROW: {
        font: { color: { rgb: "0F172A" }, sz: 9, name: "Calibri" },
        alignment: { vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
    },
    DATA_ROW_ZEBRA: {
        fill: { fgColor: { rgb: "F8FAFC" } },
        font: { color: { rgb: "0F172A" }, sz: 9, name: "Calibri" },
        alignment: { vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
        }
    },
    TOTAL_ROW: {
        fill: { fgColor: { rgb: "E2E8F0" } },
        font: { bold: true, color: { rgb: "0F172A" }, sz: 9, name: "Calibri" },
        border: {
            top: { style: "thin", color: { rgb: "94A3B8" } },
            bottom: { style: "double", color: { rgb: "0F172A" } }
        }
    },
    SEVERITY: {
        Critical: { fill: { fgColor: { rgb: "FEE2E2" } }, font: { bold: true, color: { rgb: "991B1B" }, sz: 9 } },
        High: { fill: { fgColor: { rgb: "FFEDD5" } }, font: { bold: true, color: { rgb: "9A3412" }, sz: 9 } },
        Medium: { fill: { fgColor: { rgb: "FEF3C7" } }, font: { bold: true, color: { rgb: "92400E" }, sz: 9 } },
        Low: { fill: { fgColor: { rgb: "DCFCE7" } }, font: { bold: true, color: { rgb: "166534" }, sz: 9 } },
        Info: { fill: { fgColor: { rgb: "F1F5F9" } }, font: { color: { rgb: "475569" }, sz: 9 } }
    }
};

function formatNumber(num: number | undefined): string {
    if (num === undefined || isNaN(num)) return '₹0.00';
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── 2. Sheet Builders ──────────────────────────────────────────────────────

/**
 * Sheet 1: Audit_Cover_&_Scope
 */
function buildCoverAndScopeSheet(
    header: MonthlyAuditHeader,
    registers: VouchingScopeRegister[]
): XLSX.WorkSheet {
    const rows: any[][] = [];

    // Title Block (Single unmerged cells)
    rows.push(['SUITE 08: MONTHLY AUDIT WORKING PAPER & STATUTORY COMPLIANCE']);
    const periodLabel = header.periodMode === 'multiple'
        ? `MULTIPLE MONTHS (${header.selectedMonths?.join(', ') || header.month})`
        : `SINGLE MONTH (${header.month})`;
    rows.push([`${header.clientName.toUpperCase()} | GSTIN: ${header.clientGstin} | FY: ${header.fy} | AUDIT SCOPE: ${periodLabel}`]);
    rows.push([]);

    // Engagement Profile
    rows.push(['ENGAGEMENT PARAMETERS', 'DETAILS', '', 'STATUTORY TURNOVER SNAPSHOT', 'AMOUNT (₹)']);
    rows.push(['Client Legal Name', header.clientName, '', 'Gross Turnover (inc. GST)', header.turnoverIncGst]);
    rows.push(['GSTIN', header.clientGstin, '', 'Turnover as per Books', header.turnoverBooks]);
    rows.push(['Financial Year', header.fy, '', 'Turnover as per GST Returns', header.turnoverGst]);
    rows.push(['Audit Period Scope', periodLabel, '', 'Turnover Variance', header.turnoverVariance]);
    rows.push(['Months Covered', header.selectedMonths?.join(', ') || header.month, '', 'Audit Start Date', header.auditStartDate || 'N/A']);
    rows.push(['Type of Audit', header.auditType, '', 'Audit End Date', header.auditEndDate || 'N/A']);
    rows.push(['Auditor / Engagement Partner', header.auditorName || 'Not Assigned', '', 'Engagement Ref / UDIN', header.engagementRef || 'N/A']);
    rows.push(['Audit Firm Name', header.firmName || 'Audit & Assurance Practice', '', 'Firm Reg. No. (FRN)', header.firmRegistrationNo || 'N/A']);
    rows.push(['Partner Membership No.', header.membershipNo || 'N/A', '', 'General Summary', header.generalSummary || 'Routine Verification']);
    rows.push([]);

    // Audit Team Composition Section
    rows.push(['AUDIT ENGAGEMENT TEAM', 'ROLE / DESIGNATION', 'ASSIGNED AREAS / SECTION', '', 'STATUS']);
    if (Array.isArray(header.teamMembers) && header.teamMembers.length > 0) {
        header.teamMembers.forEach((member: any) => {
            if (typeof member === 'object' && member !== null) {
                rows.push([member.name || 'Team Member', member.role || 'Audit Assistant', member.assignedAreas || 'General Vouching', '', 'Assigned']);
            } else {
                rows.push([String(member), 'Audit Assistant', 'General Verification', '', 'Assigned']);
            }
        });
    } else {
        rows.push(['CA Senior Partner', 'Engagement Partner', 'Overall Sign-Off', '', 'Assigned']);
        rows.push(['Article Assistant', 'Lead Article Assistant', 'Vouching & Reconciliation', '', 'Assigned']);
    }
    rows.push([]);

    // Maker-Checker Sign-Off Section
    rows.push(['MAKER-CHECKER WORKFLOW SIGN-OFF', 'DETAILS', '', 'AUDIT STAMP & AUTHORIZATION', 'STATUS']);
    rows.push(['Prepared By (Junior/Article)', header.preparedBy || 'Junior Auditor', '', 'Audit Workflow Stage', header.auditStatus || 'DRAFT']);
    rows.push(['Preparation Date', header.preparedAt ? new Date(header.preparedAt).toLocaleDateString('en-IN') : 'In Progress', '', 'Overall Completion Status', header.status || 'Draft']);
    rows.push(['Reviewed & Approved By (Senior)', header.reviewedBy || 'Pending Review', '', 'Senior Review Notes', header.seniorReviewNotes || 'No queries raised']);
    rows.push(['Senior Approval Date', header.reviewedAt ? new Date(header.reviewedAt).toLocaleDateString('en-IN') : 'Pending', '', 'Released to Client Date', header.releasedAt ? new Date(header.releasedAt).toLocaleDateString('en-IN') : 'Not Released']);
    rows.push(['Release Channel', header.releaseChannel || 'N/A', '', 'Released By', header.releasedBy || 'N/A']);
    rows.push([]);

    // 5 Core Registers Vouching Scope & Sampling Technique Used (SA 530)
    rows.push(['SR. NO.', 'CORE REGISTER / AREA', 'SAMPLING TECHNIQUE USED', 'SAMPLE % CHECKED', 'TOTAL VOUCHERS', 'AUDITED VALUE (₹)', 'AUDIT OBSERVATIONS & NOTES']);
    registers.forEach((r, idx) => {
        rows.push([
            idx + 1,
            r.registerName,
            r.samplingTechnique || r.vouched || 'Stratified Sampling',
            r.sampleChecked,
            r.totalVouchers,
            r.auditedAmount,
            r.remarks
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 8 }, { wch: 32 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 45 }
    ];
    return ws;
}

/**
 * Sheet 2: Verification_Checklist
 */
function buildVerificationChecklistSheet(checklists: StandardChecklistItem[]): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['STANDARDIZED MONTHLY AUDIT VERIFICATION CHECKLIST (FIRM FORMAT)']);
    rows.push(['Detailed item-by-item verification against standardized audit manual']);
    rows.push([]);
    rows.push(['SR. NO.', 'SECTION KEY', 'ITEM CODE', 'AUDIT REQUIREMENT / WORKING', 'VERIFICATION STATUS', 'SAMPLE % CHECKED', 'REMARKS / AUDIT NOTES', 'AMOUNT INVOLVED (₹)']);

    checklists.forEach((item, idx) => {
        rows.push([
            idx + 1,
            item.sectionKey.toUpperCase(),
            item.itemKey,
            item.itemTitle,
            item.status,
            item.sampleChecked,
            item.remarks,
            item.amountInvolved
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 48 }, { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 20 }
    ];
    return ws;
}

/**
 * Sheet 3: Sales_&_GST_Reco
 */
function buildSalesGstRecoSheet(sales: FullAuditVerificationSnapshot['sales']): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['SALES REGISTER VS GST RETURNS RECONCILIATION (GSTR-1 & GSTR-3B 12-MONTH MATRIX)']);
    rows.push(['12-Month Outward Supplies & Tax Liability Verification Matrix (April to March) with Strict Zero Merges']);
    rows.push([]);

    // Executive Metrics Block
    rows.push(['RECONCILIATION SUMMARY / STATUTORY METRIC', 'BOOKS VALUE (₹)', 'GSTR-1 VALUE (₹)', 'GSTR-3B VALUE (₹)', 'VARIANCE (BOOKS VS R1)', 'VARIANCE (R1 VS 3B)', 'DRC-01B SCRUTINY ALERT']);
    rows.push([
        'Taxable Sales Turnover',
        sales.booksTurnover,
        sales.r1Turnover,
        sales.gstr3bTurnover,
        sales.turnoverDifference,
        Math.abs(sales.r1Turnover - sales.gstr3bTurnover),
        'N/A'
    ]);
    rows.push([
        'Total Tax Liability (CGST + SGST + IGST)',
        sales.taxBooks,
        sales.taxR1,
        sales.tax3b,
        Math.abs(sales.taxBooks - sales.taxR1),
        sales.taxDifference,
        sales.isDrc01bTriggered ? 'CRITICAL RISK (>25k or >20%)' : 'NORMAL'
    ]);
    rows.push([]);

    // 12-Month 5-Block Matrix
    // Header Row 1: Block Labels (Placed in first col of each block, ZERO merges)
    rows.push([
        'MONTH',
        '1. AS PER BOOKS (SALES REGISTER)', '', '', '', '', '',
        '2. AS PER GSTR-1 (PORTAL OUTWARD)', '', '', '', '', '',
        '3. BOOKS VS GSTR-1 (DIFFERENCE)', '', '', '', '', '',
        '4. AS PER GSTR-3B (SUMMARY RETURN)', '', '', '', '', '',
        '5. BOOKS VS GSTR-3B (DIFFERENCE)', '', '', '', '', ''
    ]);

    // Header Row 2: Sub-column Labels
    rows.push([
        'Month',
        // Block 1: Books
        'Books Taxable', 'Books CGST', 'Books SGST', 'Books IGST', 'Books Nil/Exempt', 'Books Export',
        // Block 2: GSTR-1
        'R1 Taxable', 'R1 CGST', 'R1 SGST', 'R1 IGST', 'R1 Nil/Exempt', 'R1 Export',
        // Block 3: Books vs R1
        'Diff Taxable', 'Diff CGST', 'Diff SGST', 'Diff IGST', 'Diff Nil/Exempt', 'Diff Export',
        // Block 4: GSTR-3B
        '3B Taxable', '3B CGST', '3B SGST', '3B IGST', '3B Nil/Exempt', '3B Export',
        // Block 5: Books vs 3B
        'Diff Taxable', 'Diff CGST', 'Diff SGST', 'Diff IGST', 'Diff Nil/Exempt', 'Diff Export'
    ]);

    const matrix: MonthSales3WayRow[] = sales.monthlyMatrix && sales.monthlyMatrix.length === 12
        ? sales.monthlyMatrix
        : createInitialSales3WayMatrix();

    // Running totals for 30 numeric columns
    const totals: number[] = Array(30).fill(0);

    matrix.forEach(r => {
        const rowVals: (string | number)[] = [
            r.month,
            // Books
            r.books?.taxable || 0, r.books?.cgst || 0, r.books?.sgst || 0, r.books?.igst || 0, r.books?.nilRated || 0, r.books?.export || 0,
            // GSTR-1
            r.gstr1?.taxable || 0, r.gstr1?.cgst || 0, r.gstr1?.sgst || 0, r.gstr1?.igst || 0, r.gstr1?.nilRated || 0, r.gstr1?.export || 0,
            // Books vs R1 Diff
            (r.books?.taxable || 0) - (r.gstr1?.taxable || 0),
            (r.books?.cgst || 0) - (r.gstr1?.cgst || 0),
            (r.books?.sgst || 0) - (r.gstr1?.sgst || 0),
            (r.books?.igst || 0) - (r.gstr1?.igst || 0),
            (r.books?.nilRated || 0) - (r.gstr1?.nilRated || 0),
            (r.books?.export || 0) - (r.gstr1?.export || 0),
            // GSTR-3B
            r.gstr3b?.taxable || 0, r.gstr3b?.cgst || 0, r.gstr3b?.sgst || 0, r.gstr3b?.igst || 0, r.gstr3b?.nilRated || 0, r.gstr3b?.export || 0,
            // Books vs 3B Diff
            (r.books?.taxable || 0) - (r.gstr3b?.taxable || 0),
            (r.books?.cgst || 0) - (r.gstr3b?.cgst || 0),
            (r.books?.sgst || 0) - (r.gstr3b?.sgst || 0),
            (r.books?.igst || 0) - (r.gstr3b?.igst || 0),
            (r.books?.nilRated || 0) - (r.gstr3b?.nilRated || 0),
            (r.books?.export || 0) - (r.gstr3b?.export || 0)
        ];

        for (let i = 0; i < 30; i++) {
            totals[i] += rowVals[i + 1] as number;
        }

        rows.push(rowVals);
    });

    // 13th row: Full FY Total
    rows.push(['FULL FY TOTAL (APR - MAR)', ...totals]);
    rows.push([]);

    // Statutory Compliance Checks
    rows.push(['STATUTORY COMPLIANCE CHECK', 'STATUS / THRESHOLD', 'AUDITOR REMARKS']);
    rows.push(['E-Invoicing Applicability (> ₹5 Cr)', sales.eInvoicingApplicable ? 'APPLICABLE (Mandatory IRN)' : 'EXEMPT', 'Verified against aggregate turnover']);
    rows.push(['Tax Audit Sec 44AB (> ₹10 Cr)', sales.taxAuditApplicable ? 'APPLICABLE' : 'BELOW THRESHOLD', 'Check digital transactions ratio (>95%)']);
    rows.push(['General Audit Observation', sales.remarks || 'Sales register reconciled with GSTR-1 and GSTR-3B.', '']);
    if (sales.excelAttachment?.fileName) {
        rows.push(['Working Paper Attachment', sales.excelAttachment.fileName, sales.excelAttachment.filePath || `${(sales.excelAttachment.fileSize ? (sales.excelAttachment.fileSize / 1024).toFixed(1) + ' KB' : 'Attached')}`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 18 },
        // Books (6 cols)
        { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // R1 (6 cols)
        { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // Diff R1 (6 cols)
        { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // 3B (6 cols)
        { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // Diff 3B (6 cols)
        { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
    ];
    return ws;
}

/**
 * Sheet 4: Purchase_&_2B_Reco
 */
function buildPurchase2BRecoSheet(purchase: FullAuditVerificationSnapshot['purchase']): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['PURCHASE REGISTER VS GSTR-2B INWARD RECONCILIATION (12-MONTH MATRIX)']);
    rows.push(['12-Month Inward Supplies ITC Verification Matrix (April to March) with Strict Zero Merges']);
    rows.push([]);

    // Executive Metrics Block
    rows.push(['RECONCILIATION SUMMARY / STATUTORY METRIC', 'BOOKS VALUE (₹)', 'GSTR-2B VALUE (₹)', 'GSTR-3B VALUE (₹)', 'VARIANCE (BOOKS VS 2B)', 'VARIANCE (2B VS 3B)', 'DRC-01C SCRUTINY ALERT']);
    rows.push([
        'Total ITC Tax Liability',
        purchase.booksTax,
        purchase.twoBTax,
        purchase.tax3b ?? purchase.twoBTax,
        Math.abs(purchase.booksTax - purchase.twoBTax),
        purchase.taxDifference ?? Math.abs((purchase.tax3b ?? purchase.twoBTax) - purchase.twoBTax),
        purchase.isDrc01cTriggered ? 'CRITICAL RISK (>25k or >20%)' : 'NORMAL'
    ]);
    rows.push([
        'Eligible Claimable ITC',
        purchase.eligibleItcClaimable,
        purchase.eligibleItcClaimable,
        purchase.eligibleItcClaimable,
        'N/A',
        'N/A',
        'Net After Sec 17(5)'
    ]);
    rows.push([]);

    // 12-Month 5-Block Matrix (No Taxable Column)
    // Header Row 1: Block Labels (Placed in first col of each block, ZERO merges)
    rows.push([
        'MONTH',
        '1. AS PER BOOKS (PURCHASE REGISTER)', '', '', '', '', '',
        '2. AS PER GSTR-2B (PORTAL INWARD SUPPLIES)', '', '', '', '', '',
        '3. BOOKS VS GSTR-2B (DIFFERENCE)', '', '', '', '', '',
        '4. AS PER GSTR-3B (ITC CLAIMED)', '', '', '', '', '',
        '5. BOOKS VS GSTR-3B (DIFFERENCE)', '', '', '', '', ''
    ]);

    // Header Row 2: Sub-column Labels
    rows.push([
        'Month',
        // Block 1: Books
        'Books CGST', 'Books SGST', 'Books IGST', 'Books Cess', 'Books Nil/Exempt', 'Books Total ITC',
        // Block 2: GSTR-2B
        '2B CGST', '2B SGST', '2B IGST', '2B Cess', '2B Nil/Exempt', '2B Total ITC',
        // Block 3: Books vs 2B
        'Diff CGST', 'Diff SGST', 'Diff IGST', 'Diff Cess', 'Diff Nil/Exempt', 'Diff Total ITC',
        // Block 4: GSTR-3B
        '3B CGST', '3B SGST', '3B IGST', '3B Cess', '3B Nil/Exempt', '3B Total ITC',
        // Block 5: Books vs 3B
        'Diff CGST', 'Diff SGST', 'Diff IGST', 'Diff Cess', 'Diff Nil/Exempt', 'Diff Total ITC'
    ]);

    const matrix: MonthPurchase3WayRow[] = purchase.monthlyMatrix && purchase.monthlyMatrix.length === 12
        ? purchase.monthlyMatrix
        : createInitialPurchase3WayMatrix();

    // Running totals for 30 numeric columns
    const totals: number[] = Array(30).fill(0);

    matrix.forEach(r => {
        const booksTotal = (r.books?.cgst || 0) + (r.books?.sgst || 0) + (r.books?.igst || 0) + (r.books?.cess || 0);
        const twoBTotal = (r.gstr2b?.cgst || 0) + (r.gstr2b?.sgst || 0) + (r.gstr2b?.igst || 0) + (r.gstr2b?.cess || 0);
        const threeBTotal = (r.gstr3b?.cgst || 0) + (r.gstr3b?.sgst || 0) + (r.gstr3b?.igst || 0) + (r.gstr3b?.cess || 0);

        const rowVals: (string | number)[] = [
            r.month,
            // Books
            r.books?.cgst || 0, r.books?.sgst || 0, r.books?.igst || 0, r.books?.cess || 0, r.books?.nilRated || 0, booksTotal,
            // GSTR-2B
            r.gstr2b?.cgst || 0, r.gstr2b?.sgst || 0, r.gstr2b?.igst || 0, r.gstr2b?.cess || 0, r.gstr2b?.nilRated || 0, twoBTotal,
            // Books vs 2B Diff
            (r.books?.cgst || 0) - (r.gstr2b?.cgst || 0),
            (r.books?.sgst || 0) - (r.gstr2b?.sgst || 0),
            (r.books?.igst || 0) - (r.gstr2b?.igst || 0),
            (r.books?.cess || 0) - (r.gstr2b?.cess || 0),
            (r.books?.nilRated || 0) - (r.gstr2b?.nilRated || 0),
            booksTotal - twoBTotal,
            // GSTR-3B
            r.gstr3b?.cgst || 0, r.gstr3b?.sgst || 0, r.gstr3b?.igst || 0, r.gstr3b?.cess || 0, r.gstr3b?.nilRated || 0, threeBTotal,
            // Books vs 3B Diff
            (r.books?.cgst || 0) - (r.gstr3b?.cgst || 0),
            (r.books?.sgst || 0) - (r.gstr3b?.sgst || 0),
            (r.books?.igst || 0) - (r.gstr3b?.igst || 0),
            (r.books?.cess || 0) - (r.gstr3b?.cess || 0),
            (r.books?.nilRated || 0) - (r.gstr3b?.nilRated || 0),
            booksTotal - threeBTotal
        ];

        for (let i = 0; i < 30; i++) {
            totals[i] += rowVals[i + 1] as number;
        }

        rows.push(rowVals);
    });

    // 13th row: Full FY Total
    rows.push(['FULL FY TOTAL (APR - MAR)', ...totals]);
    rows.push([]);

    // Statutory Compliance Checks
    rows.push(['STATUTORY COMPLIANCE CHECK', 'STATUS / THRESHOLD', 'AUDITOR REMARKS']);
    rows.push(['Section 16(4) Prior FY Time-Barred Check', `${purchase.sec16_4_RiskCount} Invoices at Risk`, 'Reverse if not filed before 30th November']);
    rows.push(['Section 17(5) Blocked / Ineligible ITC', formatNumber(purchase.sec17_5_BlockedItcAmount), 'Motor vehicles, works contracts, club memberships']);
    rows.push(['Rule 88D / Form DRC-01C Excess Claim Risk', purchase.isDrc01cTriggered ? 'TRIGGERED - NOTICE RISK' : 'NORMAL (<25k / <20%)', purchase.drc01cReason || 'Compliant']);
    rows.push(['General Audit Observation', purchase.remarks || 'Purchase register reconciled with GSTR-2B and GSTR-3B.', '']);
    if (purchase.excelAttachment?.fileName) {
        rows.push(['Working Paper Attachment', purchase.excelAttachment.fileName, purchase.excelAttachment.filePath || `${(purchase.excelAttachment.fileSize ? (purchase.excelAttachment.fileSize / 1024).toFixed(1) + ' KB' : 'Attached')}`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 18 },
        // Books (6 cols)
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // 2B (6 cols)
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // Diff 2B (6 cols)
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // 3B (6 cols)
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
        // Diff 3B (6 cols)
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
    ];
    return ws;
}

/**
 * Sheet 5: Cash_&_Statutory_Check
 */
function buildCashAndStatutorySheet(
    cash: FullAuditVerificationSnapshot['cashCompliance'],
    labor: FullAuditVerificationSnapshot['labor']
): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['CASH COMPLIANCE (SEC 40A(3)) & LABOR STATUTORY COMPLIANCES']);
    rows.push(['Single-day cash payments > ₹10,000, daily cash balance check, and Section 36(1)(va) deposit scrutiny']);
    rows.push([]);

    // Cash Section
    rows.push(['1. CASH DAYBOOK & PROVISIONS SCRUTINY', 'VALUE / COUNT', 'STATUTORY STATUS / REMARKS']);
    rows.push(['Total Cash Outflows Audited', cash.cashDaybookTotal, 'Vouched 100% against daybook']);
    rows.push(['Payments > ₹10,000 u/s 40A(3) (Count)', cash.singleDayPaymentsOver10kCount, cash.singleDayPaymentsOver10kCount > 0 ? 'VIOLATION DETECTED' : 'CLEAN']);
    rows.push(['Payments > ₹10,000 Total Disallowed Amount', cash.singleDayPaymentsOver10kAmount, 'Disallowed under Section 40A(3)']);
    rows.push(['Negative Cash Balance Days', cash.negativeCashDaysCount, cash.negativeCashDaysCount > 0 ? 'CRITICAL DEFICIENCY' : 'CLEAN']);
    rows.push(['Closing Provisions Created', cash.closingProvisionsDone ? 'Yes' : 'No', `Amount: ₹${cash.closingProvisionsAmount}`]);
    rows.push(['Opening Provisions Reversed', cash.openingProvisionsReversed ? 'Yes' : 'No', 'Reversed in current month']);
    rows.push([]);

    // Labor Section
    rows.push(['2. LABOR COMPLIANCES (PF, ESIC, PT)', 'AMOUNT (₹)', 'DEPOSIT DATE', 'DUE DATE (15TH)', 'SEC 36(1)(va) TAX STATUS']);
    rows.push(['Gross Salary & Wages', labor.grossWages, 'N/A', 'N/A', 'Cross-checked with salary sheet']);
    rows.push(['Employee PF Deduction (12%)', labor.pfEmployeesDeduction, labor.pfDepositDate || 'Pending', '15th of next month', labor.isPfDelayedSec36_1_va ? 'PERMANENTLY DISALLOWED' : 'DEDUCTIBLE']);
    rows.push(['Employer PF Contribution (12%)', labor.pfEmployersContribution, labor.pfDepositDate || 'Pending', '15th of next month', 'Allowed u/s 43B on payment']);
    rows.push(['Employee ESIC (0.75%)', labor.esicEmployeesDeduction, labor.esicDepositDate || 'Pending', '15th of next month', labor.isEsicDelayedSec36_1_va ? 'PERMANENTLY DISALLOWED' : 'DEDUCTIBLE']);
    rows.push(['Employer ESIC (3.25%)', labor.esicEmployersContribution, labor.esicDepositDate || 'Pending', '15th of next month', 'Allowed u/s 43B on payment']);
    rows.push(['Professional Tax (PT)', labor.ptDeduction, labor.ptDepositDate || 'Pending', 'Last day of month', 'Verified with state PT return']);
    rows.push(['Permanent Disallowance Exposure', labor.permanentDisallowanceExposure, '', '', 'Supreme Court Checkmate Precedent']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 38 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 32 }
    ];
    return ws;
}

/**
 * Sheet 6: Current_Year_Observations
 */
function buildObservationsSheet(observations: AuditObservationItem[]): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['CURRENT YEAR AUDIT OBSERVATIONS & MANAGEMENT RESPONSES']);
    rows.push(['Risk-categorized audit findings, financial exposures, and internal control improvements']);
    rows.push([]);
    rows.push(['OBSERVATION ID', 'AREA / SECTION', 'SEVERITY', 'RISK CATEGORY', 'TITLE & AUDIT FINDING', 'FINANCIAL EXPOSURE (₹)', 'VOUCHER REF', 'AUDITOR RECOMMENDATION', 'MANAGEMENT RESPONSE', 'STATUS']);

    observations.forEach(o => {
        const anyO = o as any;
        const section = (anyO.sectionKey || anyO.section_key || anyO.section || 'General').toString().toUpperCase();
        const severity = anyO.severity || anyO.riskSeverity || 'Medium';
        const category = anyO.riskCategory || anyO.risk_category || 'General';
        const title = anyO.title || anyO.pointTitle || 'Observation';
        const desc = anyO.description || anyO.pointDescription || '';
        const exposure = anyO.financialExposure ?? anyO.financial_exposure ?? anyO.amountInvolved ?? 0;
        const voucherRef = anyO.voucherRef || anyO.voucher_ref || 'N/A';
        const rec = anyO.auditorRecommendation || anyO.auditor_recommendation || anyO.suggestedAction || 'N/A';
        const resp = anyO.managementResponse || anyO.management_response || 'Pending Client Input';
        const status = anyO.status || 'Open';

        rows.push([
            o.id,
            section,
            severity,
            category,
            desc ? `${title}: ${desc}` : title,
            exposure,
            voucherRef,
            rec,
            resp,
            status
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 45 }, { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 30 }, { wch: 14 }
    ];
    return ws;
}

/**
 * Sheet 7: Previous_Pending_Points
 */
function buildPendingPointsSheet(points: AuditPendingPointItem[]): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['PREVIOUS AUDIT PENDING POINTS TRACKER (FIRM WORK PENDING LIST MODELED)']);
    rows.push(['Cross-month action item continuity, assignment, resolution remarks, and auditor verification']);
    rows.push([]);
    rows.push(['POINT ID', 'ORIGIN MONTH/FY', 'POINT TITLE', 'DESCRIPTION', 'CATEGORY', 'SEVERITY', 'ASSIGNED TO', 'TARGET DATE', 'STATUS', 'RESOLUTION REMARKS', 'RESOLVED IN MONTH', 'VERIFIED BY']);

    points.forEach(p => {
        const anyP = p as any;
        const originMonth = anyP.originMonth || anyP.origin_month || '';
        const originFy = anyP.originFy || anyP.origin_fy || '';
        const title = anyP.pointTitle || anyP.point_title || anyP.title || 'Pending Point';
        const desc = anyP.pointDescription || anyP.point_description || anyP.description || '';
        const category = anyP.category || 'General';
        const severity = anyP.severity || 'Medium';
        const assignedTo = anyP.assignedTo || anyP.assigned_to || 'Unassigned';
        const targetDate = anyP.targetDate || anyP.target_date || 'Immediate';
        const status = anyP.status || 'Pending';
        const remarks = anyP.resolutionRemarks || anyP.resolution_remarks || anyP.actionRequired || 'Open';
        const resolvedIn = anyP.resolvedInMonth || anyP.resolved_in_month || 'N/A';
        const verifiedBy = anyP.verifiedBy || anyP.verified_by || 'N/A';

        rows.push([
            p.id,
            `${originMonth} ${originFy}`.trim() || 'Prior Audit',
            title,
            desc,
            category,
            severity,
            assignedTo,
            targetDate,
            status,
            remarks,
            resolvedIn,
            verifiedBy
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 35 }, { wch: 18 }, { wch: 18 }
    ];
    return ws;
}

/**
 * Sheet 8: Fixed_Assets_&_ROC
 */
function buildFixedAssetsRocSheet(
    roc: FullAuditVerificationSnapshot['rocLoans'],
    bank: FullAuditVerificationSnapshot['bankLoans']
): XLSX.WorkSheet {
    const rows: any[][] = [];
    rows.push(['FIXED ASSETS ITC INELIGIBILITY & ROC COMPLIANCE (FORMS CHG-1 & CHG-4)']);
    rows.push(['Section 17(5)(c)/(d) capital goods review, MCA charges tracking, and borrowing verification']);
    rows.push([]);

    rows.push(['1. ROC CHARGES & BORROWINGS MAPPING (SECTION 3.5)']);
    rows.push(['LENDER / FACILITY NAME', 'LOAN CATEGORY', 'SANCTIONED AMOUNT (₹)', 'CHARGE STATUS (CHG-1 / CHG-4)', 'MCA SRN / REF NO.', 'SEC 269SS MODE', 'AUDITOR REMARKS']);

    const loans = roc.loans && roc.loans.length > 0
        ? roc.loans
        : createInitialRocLoanCharges();

    loans.forEach(l => {
        rows.push([
            l.lenderName || '-',
            l.category,
            Number(l.sanctionedAmount || 0),
            l.chargeStatus,
            l.mcaSrnOrChgNumber || 'N/A',
            l.isCashReceipt ? 'VIOLATION (Cash >= ₹20k)' : 'Banking Channel',
            l.remarks || 'Verified'
        ]);
    });

    rows.push([
        'TOTAL BORROWINGS MONITORED',
        `${loans.length} Loans/Facilities`,
        loans.reduce((acc, l) => acc + Number(l.sanctionedAmount || 0), 0),
        `${loans.filter(l => l.chargeStatus.includes('Created')).length} Charges Created`,
        `${loans.filter(l => l.chargeStatus.includes('Pending') || l.chargeStatus.includes('Overdue')).length} Pending/Overdue`,
        loans.some(l => l.isCashReceipt) ? 'SEC 269SS RISK DETECTED' : 'ALL BANKING COMPLIANT',
        roc.remarks || 'ROC compliance verified.'
    ]);
    rows.push([]);

    rows.push(['2. ROC STATUTORY CHARGE METRICS', 'COUNT / STATUS', 'AUDITOR FINDING / STATUTORY RISK']);
    rows.push(['New Borrowings Taken During Month', roc.newLoansCount, `Total Borrowed: ₹${roc.newLoansTotalAmount}`]);
    rows.push(['Cash Loans >= ₹20,000 u/s 269SS', roc.cashLoansSec269SS_Count, roc.cashLoansSec269SS_Count > 0 ? 'CRITICAL VIOLATION (100% Penalty)' : 'COMPLIANT']);
    rows.push(['ROC Form CHG-1 Creation Pending > 30 Days', roc.formCHG1_PendingCount, roc.formCHG1_PendingCount > 0 ? 'OVERDUE WITH MCA' : 'COMPLIANT']);
    rows.push(['ROC Form CHG-4 Satisfaction Pending > 30 Days', roc.formCHG4_PendingCount, roc.formCHG4_PendingCount > 0 ? 'OVERDUE WITH MCA' : 'COMPLIANT']);
    rows.push([]);

    rows.push(['3. BANKING, BORROWINGS & INVESTMENTS RECONCILIATION (SECTION 3.4)']);
    rows.push(['TYPE', 'ACCOUNT / FACILITY NAME', 'BALANCE (₹)', 'STATUS & AUDITOR COMMENT']);

    const facilities = bank.facilities && bank.facilities.length > 0
        ? bank.facilities
        : createInitialBankFacilities();

    let totalBankBalance = 0;
    facilities.forEach(f => {
        totalBankBalance += Number(f.balance || 0);
        const commentPart = f.comment ? ` | ${f.comment}` : '';
        rows.push([
            f.facilityType,
            f.name || '-',
            Number(f.balance || 0),
            `${f.status}${commentPart}`
        ]);
    });

    rows.push([
        'TOTAL FACILITY BALANCE',
        `${facilities.length} Accounts/Facilities`,
        totalBankBalance,
        facilities.every(f => f.status === 'Match') ? 'ALL MATCHED' : 'REQUIRES ATTENTION'
    ]);
    rows.push([]);

    rows.push(['3. STATUTORY BANKING SCRUTINY & 26AS/AIS CHECKS', 'STATUS / AMOUNT', 'REMARKS']);
    rows.push(['Bank Accounts Monitored', bank.bankAccountsCount, 'Statements and BRS verified']);
    rows.push(['Stale Cheques > 3 Months', bank.staleChequesCount, bank.staleChequesCount > 0 ? 'Needs re-issue or reversal' : 'None']);
    rows.push(['Interest Servicing Status', bank.interestServicingCheck, 'Check loan covenants and overdue interest']);
    rows.push(['Form 26AS TDS Credit Variance', bank.form26AS_MismatchAmount, bank.form26AS_MismatchAmount > 0 ? 'Mismatch with 26AS portal' : 'Matched']);
    rows.push(['High Value SFT AIS Transactions', bank.aisSftHighValueMismatches, 'Reconciled with books']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 32 }, { wch: 38 }, { wch: 24 }, { wch: 45 }
    ];
    return ws;
}

/**
 * Sheet: Profitability_Statement (Schedule III Statement of Profit and Loss)
 * Strictly zero merged cells for full sort/filter capability
 */
function buildProfitabilitySheet(stmt?: ProfitabilityStatement, fallbackClientName?: string): XLSX.WorkSheet {
    const s = stmt || DEFAULT_PROFITABILITY_STATEMENT;
    const rows: any[][] = [];

    const companyTitle = s.companyName || fallbackClientName || '';
    rows.push([companyTitle.toUpperCase()]);
    rows.push([`(CIN: ${s.cin})`]);
    rows.push([`(Address: ${s.registeredAddress})`]);
    rows.push([`Statement of Profit and loss for the year ended ${s.periodEndedDate}`]);
    rows.push([]);

    rows.push(['PARTICULARS', 'NOTE NO.', 'AMOUNT (₹)', '% OF REVENUE', 'AUDIT SCRUTINY REMARKS']);

    // Income
    rows.push(['I. Revenue from Operations', 18, s.revenueFromOperations, '100.00%', 'Vouched with Sales Register & GSTR-1 Table 4/5']);
    rows.push(['II. Other Income', 19, s.otherIncome, `${((s.otherIncome / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Interest income, scrap sales verified with Form 26AS/AIS']);
    rows.push(['III. Total Income (I + II)', '', s.totalIncome, `${((s.totalIncome / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Gross receipts cross-verified with Books & GST turnover']);
    rows.push([]);

    // Expenses
    rows.push(['IV. Expenses:', '', '', '', '']);
    rows.push(['  (a) Cost of Material Consumed', 20, s.costOfMaterialsConsumed, `${((s.costOfMaterialsConsumed / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Purchase Register substantive vouching & store physical stock reco']);
    rows.push(['  (b) Change in Inventories of WIP and Finished Goods', 21, s.changeInInventories, `${((s.changeInInventories / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Accretion / De-accretion of WIP and finished inventories']);
    rows.push(['  (c) Employee Benefit Expenses', 22, s.employeeBenefitExpenses, `${((s.employeeBenefitExpenses / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Salary sheet, PF/ESIC contribution & Form 24Q TDS verified']);
    rows.push(['  (d) Finance Costs', 23, s.financeCosts, `${((s.financeCosts / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Bank loan interest, processing fees verified against bank statements']);
    rows.push(['  (e) Depreciation and Amortization Expenses', 24, s.depreciationAmortization, `${((s.depreciationAmortization / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Fixed asset register depreciation working (Companies Act vs IT Act)']);
    rows.push(['  (f) Other Expenses', 25, s.otherExpenses, `${((s.otherExpenses / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Administrative, operating expenses & Sec 40A(3) cash check']);
    rows.push(['  Total Expenses', '', s.totalExpenses, `${((s.totalExpenses / (s.revenueFromOperations || 1)) * 100).toFixed(2)}%`, 'Total operational & overhead expenditure']);
    rows.push([]);

    // Profit
    rows.push(['V. Profit / (Loss) Before Tax (III - IV)', '', s.profitBeforeTax, `${s.pbtMarginPct.toFixed(2)}%`, 'Statutory Profit Before Tax before tax provisions']);
    rows.push([]);

    // Key Ratios
    rows.push(['KEY FINANCIAL RATIOS & MARGINS', '', 'METRIC VALUE', 'BENCHMARK / AUDIT NOTE', 'STATUS']);
    rows.push(['EBITDA (Operating Profit)', '', s.ebitda, `Operating Margin: ${s.ebitdaMarginPct.toFixed(2)}%`, 'Healthy']);
    rows.push(['PBT Margin %', '', `${s.pbtMarginPct.toFixed(2)}%`, 'Profit before tax margin on Revenue', 'Normal']);
    rows.push(['Material Consumption %', '', `${s.materialConsumptionPct.toFixed(2)}%`, 'Direct project execution material cost ratio', 'Verified']);
    rows.push(['Employee Benefit Cost %', '', `${s.employeeCostPct.toFixed(2)}%`, 'Human resource & labor cost ratio', 'Verified']);
    rows.push(['Finance Cost %', '', `${s.financeCostPct.toFixed(2)}%`, 'Debt servicing burden ratio', 'Monitored']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws['A1'] = { t: 's', v: companyTitle.toUpperCase(), s: STYLES.SECTION_HEADER };
    ws['A2'] = { t: 's', v: `(CIN: ${s.cin})`, s: STYLES.META_LABEL };
    ws['A3'] = { t: 's', v: `(Address: ${s.registeredAddress})`, s: STYLES.META_VALUE };
    ws['A4'] = { t: 's', v: `Statement of Profit and loss for the year ended ${s.periodEndedDate}`, s: STYLES.SECTION_HEADER };

    ['A6', 'B6', 'C6', 'D6', 'E6'].forEach(cell => {
        if (ws[cell]) ws[cell].s = STYLES.NAVY_HEADER;
    });

    ['A23', 'B23', 'C23', 'D23', 'E23'].forEach(cell => {
        if (ws[cell]) ws[cell].s = STYLES.NAVY_HEADER;
    });

    ws['!cols'] = [
        { wch: 50 },
        { wch: 12 },
        { wch: 22 },
        { wch: 16 },
        { wch: 45 }
    ];

    ws['!merges'] = [];
    return ws;
}

// ─── 3. Master Exporter & Base64 Serializer ─────────────────────────────────

export interface MonthlyAuditExportBundle {
    header: MonthlyAuditHeader;
    registers?: VouchingScopeRegister[];
    checklists: StandardChecklistItem[];
    verification: FullAuditVerificationSnapshot;
    observations: AuditObservationItem[];
    pendingPoints: AuditPendingPointItem[];
    profitability?: ProfitabilityStatement;
}

/**
 * Generates the complete 9-sheet Workbook with Strict Zero-Merge Guarantee
 */
export function generateMonthlyAuditWorkbook(bundle: MonthlyAuditExportBundle): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const reg = bundle.registers || [
        { key: 'sales', registerName: 'Sales Register', vouched: 'Partial', sampleChecked: '25%', totalVouchers: 0, auditedAmount: bundle.header.turnoverBooks, remarks: 'Verified with GST' },
        { key: 'purchase', registerName: 'Purchase Register', vouched: 'Partial', sampleChecked: '30%', totalVouchers: 0, auditedAmount: 0, remarks: 'Reconciled with 2B' },
        { key: 'journal', registerName: 'Journal Register', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Checked provisions' },
        { key: 'debit_credit_notes', registerName: 'Debit & Credit Notes', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Matched with CDNR' },
        { key: 'bank_loans', registerName: 'Bank & Loan Statements', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Interest verified' }
    ];

    // 1. Audit_Cover_&_Scope
    XLSX.utils.book_append_sheet(wb, buildCoverAndScopeSheet(bundle.header, reg), 'Audit_Cover_&_Scope');

    // 2. Profitability_Statement (Matching Ribbon Tab 2)
    XLSX.utils.book_append_sheet(wb, buildProfitabilitySheet(bundle.profitability, bundle.header.clientName), 'Profitability_Statement');

    // 3. Verification_Checklist
    XLSX.utils.book_append_sheet(wb, buildVerificationChecklistSheet(bundle.checklists), 'Verification_Checklist');

    // 4. Sales_&_GST_Reco
    XLSX.utils.book_append_sheet(wb, buildSalesGstRecoSheet(bundle.verification.sales), 'Sales_&_GST_Reco');

    // 5. Purchase_&_2B_Reco
    XLSX.utils.book_append_sheet(wb, buildPurchase2BRecoSheet(bundle.verification.purchase), 'Purchase_&_2B_Reco');

    // 6. Cash_&_Statutory_Check
    XLSX.utils.book_append_sheet(wb, buildCashAndStatutorySheet(bundle.verification.cashCompliance, bundle.verification.labor), 'Cash_&_Statutory_Check');

    // 7. Current_Year_Observations
    XLSX.utils.book_append_sheet(wb, buildObservationsSheet(bundle.observations), 'Current_Year_Observations');

    // 8. Previous_Pending_Points
    XLSX.utils.book_append_sheet(wb, buildPendingPointsSheet(bundle.pendingPoints), 'Previous_Pending_Points');

    // 9. Fixed_Assets_&_ROC
    XLSX.utils.book_append_sheet(wb, buildFixedAssetsRocSheet(bundle.verification.rocLoans, bundle.verification.bankLoans), 'Fixed_Assets_&_ROC');

    // Defense-in-depth: Strict Zero-Merge Guarantee
    removeAllMergesFromWorkbook(wb);

    return wb;
}

/**
 * Client-Side Triggered Excel Download
 */
export function exportMonthlyAuditToExcel(bundle: MonthlyAuditExportBundle, customFilename?: string): void {
    const wb = generateMonthlyAuditWorkbook(bundle);
    const safeClient = bundle.header.clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeMonth = bundle.header.month.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = customFilename || `Monthly_Audit_Working_Paper_${safeClient}_${safeMonth}_${bundle.header.fy}.xlsx`;

    XLSX.writeFile(wb, filename);
}

/**
 * Base64 Serializer for Direct Client Directory Auto-Save
 */
export function generateMonthlyAuditBase64(bundle: MonthlyAuditExportBundle): {
    workbookBase64: string;
    filename: string;
    clientName: string;
    gstin: string;
    fy: string;
    month: string;
} {
    const wb = generateMonthlyAuditWorkbook(bundle);
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

    const safeClient = bundle.header.clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeMonth = bundle.header.month.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Monthly_Audit_Working_Paper_${safeClient}_${safeMonth}_${bundle.header.fy}.xlsx`;

    return {
        workbookBase64: wbOut,
        filename,
        clientName: bundle.header.clientName,
        gstin: bundle.header.clientGstin,
        fy: bundle.header.fy,
        month: bundle.header.month
    };
}

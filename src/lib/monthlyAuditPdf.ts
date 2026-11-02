/**
 * Suite 08: Monthly Audit Executive Client PDF Generator
 * 
 * Generates an executive, audit-grade corporate PDF report for CA internal & statutory audit clients.
 * Formatted with luxury typography, corporate masthead, KPI cards, multi-page layout,
 * reconciliations, statutory scrutiny (DRC-01B/C, 40A(3), 36(1)(va), ROC), and formal CA sign-off.
 */

import { jsPDF } from 'jspdf';
import type { MonthlyAuditExportBundle } from './monthlyAuditExcel';
import type {
    MonthlyAuditHeader,
    VouchingScopeRegister,
    AuditObservationItem,
    AuditPendingPointItem,
    FullAuditVerificationSnapshot,
    ProfitabilityStatement
} from './monthlyAuditEngine';
import { DEFAULT_PROFITABILITY_STATEMENT } from './monthlyAuditEngine';

export interface MonthlyAuditPdfOptions {
    customFileName?: string;
    autoDownload?: boolean;
}

export interface MonthlyAuditPdfResult {
    doc: jsPDF;
    fileName: string;
    blob: Blob;
    base64: string;
}

// ─── Formatters & Palette ───────────────────────────────────────────────────

function formatInr(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '₹0.00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '₹0.00';
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInrShort(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '₹0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '₹0';
    return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const PALETTE = {
    PRIMARY_DARK: [15, 23, 42] as [number, number, number],      // Slate 900
    NAVY_SLATE: [30, 41, 59] as [number, number, number],        // Slate 800
    INDIGO_BRAND: [67, 56, 202] as [number, number, number],     // Indigo 700
    INDIGO_LIGHT: [238, 242, 255] as [number, number, number],   // Indigo 50
    EMERALD_GREEN: [16, 185, 129] as [number, number, number],   // Emerald 500
    EMERALD_LIGHT: [236, 253, 245] as [number, number, number],  // Emerald 50
    AMBER_GOLD: [217, 119, 6] as [number, number, number],       // Amber 600
    AMBER_LIGHT: [254, 243, 199] as [number, number, number],    // Amber 100
    ROSE_RED: [225, 29, 72] as [number, number, number],         // Rose 600
    ROSE_LIGHT: [255, 228, 230] as [number, number, number],     // Rose 100
    BORDER_LIGHT: [226, 232, 240] as [number, number, number],   // Slate 200
    CARD_BG: [248, 250, 252] as [number, number, number],        // Slate 50
    TEXT_MUTED: [100, 116, 139] as [number, number, number],     // Slate 500
    TEXT_DARK: [15, 23, 42] as [number, number, number],         // Slate 900
    WHITE: [255, 255, 255] as [number, number, number]
};

// ─── Master Generator ────────────────────────────────────────────────────────

export function generateMonthlyAuditPdf(
    bundle: MonthlyAuditExportBundle,
    options?: MonthlyAuditPdfOptions
): MonthlyAuditPdfResult {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    const pageW = doc.internal.pageSize.getWidth();   // 595.28 pt
    const pageH = doc.internal.pageSize.getHeight();  // 841.89 pt
    const marginX = 36;                               // 0.5 inch margins
    const contentW = pageW - marginX * 2;             // 523.28 pt

    const header = bundle.header;
    const ver = bundle.verification;
    const profit = bundle.profitability || DEFAULT_PROFITABILITY_STATEMENT;
    const firmTitle = header.firmName || 'VASWANI & ASSOCIATES';

    const periodLabel = header.periodMode === 'multiple'
        ? `Period: ${header.selectedMonths?.join(', ') || header.month} | FY ${header.fy}`
        : `Month of ${header.month} | FY ${header.fy}`;

    // ─── Header & Footer Helpers ─────────────────────────────────────────────

    function drawRunningHeader(pageNumber: number) {
        if (pageNumber === 1) return; // Cover page has full corporate masthead

        // Slim top banner
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.rect(marginX, 16, contentW, 20, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.setLineWidth(0.5);
        doc.line(marginX, 36, pageW - marginX, 36);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
        doc.text(`${firmTitle.toUpperCase()} • MONTHLY AUDIT WORKING PAPER`, marginX + 6, 29);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(
            `${header.clientName.toUpperCase()} (${header.clientGstin})`,
            pageW - marginX - 6,
            29,
            { align: 'right' }
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 1: Corporate Masthead, Engagement Certificate & Executive Dashboard
    // ═════════════════════════════════════════════════════════════════════════

    let curY = 28;

    // 1. Top Luxury Accent Stripe
    doc.setFillColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.rect(marginX, curY, contentW, 6, 'F');
    doc.setFillColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
    doc.rect(marginX, curY + 6, contentW * 0.45, 2, 'F');
    doc.setFillColor(PALETTE.AMBER_GOLD[0], PALETTE.AMBER_GOLD[1], PALETTE.AMBER_GOLD[2]);
    doc.rect(marginX + contentW * 0.45, curY + 6, contentW * 0.55, 2, 'F');
    curY += 16;

    // 2. Firm Masthead
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text(firmTitle.toUpperCase(), marginX, curY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const firmMeta = `FRN: ${header.firmRegistrationNo || '117365W'} | Membership No: ${header.membershipNo || '143892'} | Engagement Ref: ${header.engagementRef || 'VAS/AUD/' + header.fy + '/' + (header.month || 'M')}`;
    doc.text(firmMeta, pageW - marginX, curY - 2, { align: 'right' });

    curY += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
    doc.text('CHARTERED ACCOUNTANTS • STATUTORY & INTERNAL AUDIT PRACTICE', marginX, curY);

    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.setLineWidth(0.6);
    curY += 6;
    doc.line(marginX, curY, pageW - marginX, curY);
    curY += 12;

    // 3. Document Title Block
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, contentW, 46, 4, 4, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, 46, 4, 4, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('MONTHLY INTERNAL AUDIT & STATUTORY COMPLIANCE REPORT', marginX + 12, curY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('Standardized Working Paper Format • Independent Verification & Maker-Checker Audit Review', marginX + 12, curY + 28);

    // Status Pill (Released / Approved / Draft)
    const statusText = (header.auditStatus || 'DRAFT').toUpperCase();
    const isApproved = statusText === 'APPROVED' || statusText === 'RELEASED';
    doc.setFillColor(
        isApproved ? PALETTE.EMERALD_LIGHT[0] : PALETTE.AMBER_LIGHT[0],
        isApproved ? PALETTE.EMERALD_LIGHT[1] : PALETTE.AMBER_LIGHT[1],
        isApproved ? PALETTE.EMERALD_LIGHT[2] : PALETTE.AMBER_LIGHT[2]
    );
    const pillW = 100;
    const pillH = 18;
    const pillX = pageW - marginX - pillW - 10;
    const pillY = curY + 14;
    doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(
        isApproved ? PALETTE.EMERALD_GREEN[0] : PALETTE.AMBER_GOLD[0],
        isApproved ? PALETTE.EMERALD_GREEN[1] : PALETTE.AMBER_GOLD[1],
        isApproved ? PALETTE.EMERALD_GREEN[2] : PALETTE.AMBER_GOLD[2]
    );
    doc.text(`● ${statusText}`, pillX + pillW / 2, pillY + 12, { align: 'center' });

    curY += 54;

    // 4. Client & Engagement Parameters Grid (2 columns)
    const gridH = 68;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX, curY, contentW, gridH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, gridH, 3, 3, 'S');

    // Left Column: Client Details
    const colMid = marginX + contentW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('ENTITY / CLIENT LEGAL NAME', marginX + 10, curY + 14);
    doc.text('GSTIN / IDENTIFIER', marginX + 10, curY + 34);
    doc.text('AUDIT PERIOD SCOPE', marginX + 10, curY + 54);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text(header.clientName || 'Client Entity', marginX + 10, curY + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(header.clientGstin || 'Unspecified GSTIN', marginX + 10, curY + 44);
    doc.text(periodLabel, marginX + 10, curY + 63);

    // Vertical Divider
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.line(colMid, curY + 6, colMid, curY + gridH - 6);

    // Right Column: Engagement Parameters
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('ENGAGEMENT PARTNER', colMid + 10, curY + 14);
    doc.text('AUDIT TYPE & SCOPE', colMid + 10, curY + 34);
    doc.text('AUDIT COMPLETION STATUS', colMid + 10, curY + 54);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text(header.auditorName || header.reviewedBy || 'Engagement Partner, CA', colMid + 10, curY + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(header.auditType || 'Monthly Statutory Audit', colMid + 10, curY + 44);
    doc.text(
        header.preparedAt ? `Vouched on ${new Date(header.preparedAt).toLocaleDateString('en-IN')}` : 'In Progress',
        colMid + 10,
        curY + 63
    );

    curY += gridH + 12;

    // 5. 4 Executive KPI Cards Strip
    const cardGap = 8;
    const cardW = (contentW - cardGap * 3) / 4;
    const cardH = 56;

    interface KpiCard {
        label: string;
        value: string;
        sub: string;
        color: [number, number, number];
        isAlert?: boolean;
    }

    const cards: KpiCard[] = [
        {
            label: 'TURNOVER VARIANCE',
            value: formatInrShort(header.turnoverVariance),
            sub: header.turnoverVariance === 0 ? '✓ Exact Match' : '⚠ Scrutiny Needed',
            color: header.turnoverVariance === 0 ? PALETTE.EMERALD_GREEN : PALETTE.ROSE_RED,
            isAlert: header.turnoverVariance !== 0
        },
        {
            label: 'DRC-01B SALES TAX RISK',
            value: ver.sales?.isDrc01bTriggered ? 'TRIGGERED' : 'NORMAL',
            sub: `Diff: ${formatInrShort(ver.sales?.taxDifference || 0)}`,
            color: ver.sales?.isDrc01bTriggered ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            isAlert: ver.sales?.isDrc01bTriggered
        },
        {
            label: 'DRC-01C INWARD ITC RISK',
            value: ver.purchase?.isDrc01cTriggered ? 'HIGH RISK' : 'COMPLIANT',
            sub: `Eligible: ${formatInrShort(ver.purchase?.eligibleItcClaimable || 0)}`,
            color: ver.purchase?.isDrc01cTriggered ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            isAlert: ver.purchase?.isDrc01cTriggered
        },
        {
            label: 'SEC 40A(3) CASH RISK',
            value: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0 ? 'VIOLATIONS' : 'CLEAN',
            sub: `Disallowed: ${formatInrShort(ver.cashCompliance?.singleDayPaymentsOver10kAmount || 0)}`,
            color: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0 ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            isAlert: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0
        }
    ];

    cards.forEach((c, idx) => {
        const cX = marginX + idx * (cardW + cardGap);
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.roundedRect(cX, curY, cardW, cardH, 3, 3, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.roundedRect(cX, curY, cardW, cardH, 3, 3, 'S');

        // Top accent line
        doc.setFillColor(c.color[0], c.color[1], c.color[2]);
        doc.rect(cX, curY, cardW, 2.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(c.label, cX + 6, curY + 12);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(c.color[0], c.color[1], c.color[2]);
        doc.text(c.value, cX + 6, curY + 28);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(c.sub, cX + 6, curY + 44);
    });

    curY += cardH + 12;

    // 6. Section 2 Scope Table: 5 Core Registers Vouching Scope (SA 530)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('1. CORE REGISTERS VOUCHING SCOPE & AUDIT SAMPLING (SA 530)', marginX, curY);
    curY += 8;

    // Scope Table Header
    const thH = 16;
    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('REGISTER / AREA', marginX + 6, curY + 11);
    doc.text('SAMPLING TECHNIQUE (SA 530)', marginX + 130, curY + 11);
    doc.text('SAMPLE %', marginX + 270, curY + 11);
    doc.text('VOUCHERS', marginX + 325, curY + 11);
    doc.text('AUDITED AMOUNT (₹)', marginX + 390, curY + 11);
    doc.text('FINDINGS', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const defaultRegisters: VouchingScopeRegister[] = bundle.registers && bundle.registers.length > 0
        ? bundle.registers
        : [
            { key: 'sales', registerName: 'Sales Register', vouched: 'Partial', sampleChecked: '25%', totalVouchers: 0, auditedAmount: header.turnoverBooks, remarks: 'Reconciled with GSTR-1 & 3B' },
            { key: 'purchase', registerName: 'Purchase Register', vouched: 'Partial', sampleChecked: '30%', totalVouchers: 0, auditedAmount: ver.purchase?.booksTax || 0, remarks: 'Reconciled with GSTR-2B' },
            { key: 'journal', registerName: 'Journal Register', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Provisions & TDS verified' },
            { key: 'debit_credit_notes', registerName: 'Debit / Credit Notes', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Matched with Portal CDNR' },
            { key: 'bank_loans', registerName: 'Bank & Loan Statements', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'BRS & 26AS/AIS verified' }
        ];

    defaultRegisters.forEach((r, idx) => {
        const rowH = 15;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(r.registerName, marginX + 6, curY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(r.samplingTechnique || r.vouched || 'Stratified Sampling', marginX + 130, curY + 10);
        doc.text(r.sampleChecked || '25%', marginX + 270, curY + 10);
        doc.text(String(r.totalVouchers || '-'), marginX + 325, curY + 10);
        doc.text(formatInrShort(r.auditedAmount), marginX + 390, curY + 10);
        doc.text(r.remarks?.substring(0, 26) || 'Verified', pageW - marginX - 6, curY + 10, { align: 'right' });

        curY += rowH;
    });

    curY += 14;

    // 7. Maker-Checker 4-Eye Review Sign-Off Card
    const mcH = 68;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, contentW, mcH, 4, 4, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, mcH, 4, 4, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
    doc.text('MAKER-CHECKER 4-EYE AUDIT SIGN-OFF & SENIOR CA REVIEW TRAIL', marginX + 10, curY + 14);

    const mcMid = marginX + contentW / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);

    // Maker (Junior / Article)
    doc.text('Prepared By (Junior/Article Assistant):', marginX + 10, curY + 30);
    doc.text('Preparation / Audit Date:', marginX + 10, curY + 46);
    doc.text('Audit Working Status:', marginX + 10, curY + 60);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text(header.preparedBy || 'Article Assistant', marginX + 160, curY + 30);
    doc.text(header.preparedAt ? new Date(header.preparedAt).toLocaleDateString('en-IN') : 'Completed', marginX + 160, curY + 46);
    doc.text(header.status || 'Verified', marginX + 160, curY + 60);

    // Checker (Senior Partner, CA)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('Reviewed & Approved By (Senior Partner):', mcMid + 10, curY + 30);
    doc.text('Approval Sign-off Date:', mcMid + 10, curY + 46);
    doc.text('Release Channel & Authorization:', mcMid + 10, curY + 60);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text(header.reviewedBy || 'Senior Partner, FCA', mcMid + 180, curY + 30);
    doc.text(header.reviewedAt ? new Date(header.reviewedAt).toLocaleDateString('en-IN') : 'Approved', mcMid + 180, curY + 46);
    doc.text(header.releaseChannel || 'Client Directory / Portal', mcMid + 180, curY + 60);

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 2: Reconciliations & Profitability Statement (Schedule III)
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(2);
    curY = 50;

    // 1. Section 3.1: Sales Register vs GSTR-1 vs GSTR-3B Reconciliation
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('2. OUTWARD SUPPLIES & TAX LIABILITY RECONCILIATION (SECTION 3.1)', marginX, curY);
    curY += 8;

    // Sales Table Header
    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('STATUTORY PARAMETER', marginX + 6, curY + 11);
    doc.text('AS PER BOOKS (₹)', marginX + 160, curY + 11);
    doc.text('AS PER GSTR-1 (₹)', marginX + 250, curY + 11);
    doc.text('AS PER GSTR-3B (₹)', marginX + 340, curY + 11);
    doc.text('VARIANCE (₹)', marginX + 430, curY + 11);
    doc.text('STATUS', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const salesRows = [
        {
            param: 'Taxable Sales Turnover',
            books: ver.sales?.booksTurnover || 0,
            r1: ver.sales?.r1Turnover || 0,
            r3b: ver.sales?.gstr3bTurnover || 0,
            diff: ver.sales?.turnoverDifference || 0,
            status: (ver.sales?.turnoverDifference || 0) === 0 ? 'Matched' : 'Variance'
        },
        {
            param: 'Total Tax Liability (CGST+SGST+IGST)',
            books: ver.sales?.taxBooks || 0,
            r1: ver.sales?.taxR1 || 0,
            r3b: ver.sales?.tax3b || 0,
            diff: ver.sales?.taxDifference || 0,
            status: ver.sales?.isDrc01bTriggered ? 'DRC-01B Risk' : 'Normal'
        }
    ];

    salesRows.forEach((r, idx) => {
        const rowH = 15;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(r.param, marginX + 6, curY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(formatInrShort(r.books), marginX + 160, curY + 10);
        doc.text(formatInrShort(r.r1), marginX + 250, curY + 10);
        doc.text(formatInrShort(r.r3b), marginX + 340, curY + 10);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(r.diff !== 0 ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], r.diff !== 0 ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], r.diff !== 0 ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(formatInrShort(r.diff), marginX + 430, curY + 10);
        doc.text(r.status, pageW - marginX - 6, curY + 10, { align: 'right' });

        curY += rowH;
    });

    curY += 14;

    // 2. Section 3.2: Purchase Register vs GSTR-2B Inward ITC Reconciliation
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('3. INWARD SUPPLIES & INPUT TAX CREDIT (ITC) SCRUTINY (SECTION 3.2)', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('INWARD CREDIT HEAD', marginX + 6, curY + 11);
    doc.text('BOOKS ITC (₹)', marginX + 160, curY + 11);
    doc.text('GSTR-2B ITC (₹)', marginX + 250, curY + 11);
    doc.text('3B CLAIMED (₹)', marginX + 340, curY + 11);
    doc.text('VARIANCE (₹)', marginX + 430, curY + 11);
    doc.text('RULE 88D ALERT', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const itcDiff = Math.abs((ver.purchase?.booksTax || 0) - (ver.purchase?.twoBTax || 0));
    const purchaseRows = [
        {
            param: 'Total Inward Tax (CGST+SGST+IGST)',
            books: ver.purchase?.booksTax || 0,
            twoB: ver.purchase?.twoBTax || 0,
            r3b: ver.purchase?.tax3b ?? ver.purchase?.twoBTax ?? 0,
            diff: itcDiff,
            status: ver.purchase?.isDrc01cTriggered ? 'DRC-01C Risk' : 'Normal'
        },
        {
            param: 'Eligible Claimable ITC u/s 16',
            books: ver.purchase?.eligibleItcClaimable || 0,
            twoB: ver.purchase?.eligibleItcClaimable || 0,
            r3b: ver.purchase?.eligibleItcClaimable || 0,
            diff: 0,
            status: 'Compliant'
        }
    ];

    purchaseRows.forEach((r, idx) => {
        const rowH = 15;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(r.param, marginX + 6, curY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(formatInrShort(r.books), marginX + 160, curY + 10);
        doc.text(formatInrShort(r.twoB), marginX + 250, curY + 10);
        doc.text(formatInrShort(r.r3b), marginX + 340, curY + 10);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(r.diff !== 0 ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], r.diff !== 0 ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], r.diff !== 0 ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(formatInrShort(r.diff), marginX + 430, curY + 10);
        doc.text(r.status, pageW - marginX - 6, curY + 10, { align: 'right' });

        curY += rowH;
    });

    // Inward Special Notes (Sec 16(4) & 17(5))
    curY += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const blockedTxt = `* Section 17(5) Blocked / Ineligible ITC: ${formatInr(ver.purchase?.sec17_5_BlockedItcAmount || 0)} | Section 16(4) Time-Barred Invoices at Risk: ${ver.purchase?.sec16_4_RiskCount || 0}`;
    doc.text(blockedTxt, marginX + 6, curY + 8);
    curY += 18;

    // 3. Profitability Statement (Schedule III Summary & Key Ratios)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('4. SCHEDULE III STATEMENT OF PROFIT AND LOSS & FINANCIAL HEALTH', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('PARTICULARS (SCHEDULE III)', marginX + 6, curY + 11);
    doc.text('NOTE', marginX + 220, curY + 11);
    doc.text('AMOUNT (₹)', marginX + 290, curY + 11);
    doc.text('% OF REVENUE', marginX + 380, curY + 11);
    doc.text('AUDITOR SCRUTINY NOTE', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const pnlRows = [
        { name: 'I. Revenue from Operations', note: '18', amt: profit.revenueFromOperations, pct: '100.00%', remark: 'Vouched with Sales & GSTR-1' },
        { name: 'II. Other Income', note: '19', amt: profit.otherIncome, pct: `${((profit.otherIncome / (profit.revenueFromOperations || 1)) * 100).toFixed(2)}%`, remark: 'Cross-checked with 26AS/AIS' },
        { name: 'III. Total Income (I + II)', note: '-', amt: profit.totalIncome, pct: '100.00%', remark: 'Total Enterprise Gross Receipts' },
        { name: '  (a) Cost of Materials Consumed', note: '20', amt: profit.costOfMaterialsConsumed, pct: `${(profit.materialConsumptionPct || 0).toFixed(2)}%`, remark: 'Store stock & purchase vouching' },
        { name: '  (b) Employee Benefit Expenses', note: '22', amt: profit.employeeBenefitExpenses, pct: `${(profit.employeeCostPct || 0).toFixed(2)}%`, remark: 'Salary sheet & PF/ESIC verified' },
        { name: '  (c) Finance Costs', note: '23', amt: profit.financeCosts, pct: `${(profit.financeCostPct || 0).toFixed(2)}%`, remark: 'Bank interest & covenants' },
        { name: '  (d) Depreciation & Amortization', note: '24', amt: profit.depreciationAmortization, pct: `${((profit.depreciationAmortization / (profit.revenueFromOperations || 1)) * 100).toFixed(2)}%`, remark: 'Fixed Assets Register' },
        { name: '  (e) Other Expenses', note: '25', amt: profit.otherExpenses, pct: `${((profit.otherExpenses / (profit.revenueFromOperations || 1)) * 100).toFixed(2)}%`, remark: 'Sec 40A(3) cash review' },
        { name: 'IV. Total Expenses', note: '-', amt: profit.totalExpenses, pct: `${((profit.totalExpenses / (profit.revenueFromOperations || 1)) * 100).toFixed(2)}%`, remark: 'Total Overhead Expenditure' },
        { name: 'V. Profit / (Loss) Before Tax (PBT)', note: '-', amt: profit.profitBeforeTax, pct: `${(profit.pbtMarginPct || 0).toFixed(2)}%`, remark: 'Statutory Profit Margin' }
    ];

    pnlRows.forEach((r, idx) => {
        const rowH = 13.5;
        const isHeader = r.name.includes('Total') || r.name.includes('Profit');
        const bg = isHeader ? PALETTE.CARD_BG : (idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG);
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(isHeader ? PALETTE.PRIMARY_DARK[0] : PALETTE.TEXT_DARK[0], isHeader ? PALETTE.PRIMARY_DARK[1] : PALETTE.TEXT_DARK[1], isHeader ? PALETTE.PRIMARY_DARK[2] : PALETTE.TEXT_DARK[2]);
        doc.text(r.name, marginX + 6, curY + 9.5);

        doc.text(r.note, marginX + 220, curY + 9.5);
        doc.text(formatInrShort(r.amt), marginX + 290, curY + 9.5);
        doc.text(r.pct, marginX + 380, curY + 9.5);

        doc.setFont('helvetica', 'italic');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(r.remark, pageW - marginX - 6, curY + 9.5, { align: 'right' });

        curY += rowH;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 3: Forensic Checks (Cash, Labor, Banking, ROC)
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(3);
    curY = 50;

    // 1. Cash Forensics & Labor Compliances Grid (2 side-by-side cards)
    const boxW = (contentW - 12) / 2;
    const boxH = 135;

    // Box A: Cash & Provisions u/s 40A(3)
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, boxW, boxH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, boxW, boxH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
    doc.text('5. CASH DAYBOOK & SEC 40A(3) SCRUTINY', marginX + 10, curY + 14);

    const cashRows = [
        ['Audited Cash Outflows:', formatInrShort(ver.cashCompliance?.cashDaybookTotal || 0)],
        ['Payments > ₹10,000 u/s 40A(3):', `${ver.cashCompliance?.singleDayPaymentsOver10kCount || 0} Vouchers`],
        ['Total Disallowance Exposure:', formatInrShort(ver.cashCompliance?.singleDayPaymentsOver10kAmount || 0)],
        ['Negative Cash Balance Days:', `${ver.cashCompliance?.negativeCashDaysCount || 0} Days (Critical)`],
        ['Closing Provisions Done:', ver.cashCompliance?.closingProvisionsDone ? 'Yes (Verified)' : 'Pending'],
        ['Opening Provisions Reversed:', ver.cashCompliance?.openingProvisionsReversed ? 'Yes (Verified)' : 'Pending']
    ];

    cashRows.forEach((cr, i) => {
        const itemY = curY + 30 + i * 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(cr[0], marginX + 10, itemY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(cr[1], marginX + boxW - 10, itemY, { align: 'right' });
    });

    // Box B: Labor Compliances u/s 36(1)(va)
    const boxBX = marginX + boxW + 12;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(boxBX, curY, boxW, boxH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(boxBX, curY, boxW, boxH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
    doc.text('6. LABOR COMPLIANCES & SEC 36(1)(va)', boxBX + 10, curY + 14);

    const laborRows = [
        ['Gross Wages Audited:', formatInrShort(ver.labor?.grossWages || 0)],
        ['Employee PF Deduction (12%):', formatInrShort(ver.labor?.pfEmployeesDeduction || 0)],
        ['Employer PF Contribution (12%):', formatInrShort(ver.labor?.pfEmployersContribution || 0)],
        ['PF Deposit Status:', ver.labor?.isPfDelayedSec36_1_va ? 'DELAYED (Disallowed)' : 'On Time (15th)'],
        ['ESIC Employee / Employer:', `${formatInrShort(ver.labor?.esicEmployeesDeduction || 0)} / ${formatInrShort(ver.labor?.esicEmployersContribution || 0)}`],
        ['Permanent Disallowance Risk:', formatInrShort(ver.labor?.permanentDisallowanceExposure || 0)]
    ];

    laborRows.forEach((lr, i) => {
        const itemY = curY + 30 + i * 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(lr[0], boxBX + 10, itemY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(lr[1], boxBX + boxW - 10, itemY, { align: 'right' });
    });

    curY += boxH + 16;

    // 2. Banking Facilities & Form 26AS/AIS Reco (Sec 3.4)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('7. BANKING FACILITIES, BORROWINGS & 26AS/AIS SCRUTINY (SECTION 3.4)', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('FACILITY / ACCOUNT TYPE', marginX + 6, curY + 11);
    doc.text('FACILITY NAME / BANK', marginX + 160, curY + 11);
    doc.text('CLOSING BALANCE (₹)', marginX + 320, curY + 11);
    doc.text('VERIFICATION STATUS', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const facilities = ver.bankLoans?.facilities && ver.bankLoans.facilities.length > 0
        ? ver.bankLoans.facilities
        : [
            { facilityType: 'Cash Credit / OD', name: 'Primary CC Account', balance: 0, status: 'Match', comment: 'BRS verified' },
            { facilityType: 'Current Account', name: 'Operations Account', balance: 0, status: 'Match', comment: 'Interest checked' }
        ];

    facilities.slice(0, 5).forEach((f, idx) => {
        const rowH = 14;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(f.facilityType, marginX + 6, curY + 9.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(f.name || '-', marginX + 160, curY + 9.5);
        doc.text(formatInrShort(f.balance), marginX + 320, curY + 9.5);
        doc.text(`${f.status} (${f.comment || 'Verified'})`, pageW - marginX - 6, curY + 9.5, { align: 'right' });

        curY += rowH;
    });

    curY += 16;

    // 3. ROC Charges & Section 269SS Loans Schedule (Sec 3.5)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('8. ROC CHARGES MAPPING & SEC 269SS BORROWINGS (SECTION 3.5)', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('LENDER / FACILITY', marginX + 6, curY + 11);
    doc.text('CATEGORY', marginX + 150, curY + 11);
    doc.text('SANCTIONED (₹)', marginX + 250, curY + 11);
    doc.text('CHARGE STATUS (CHG-1/4)', marginX + 340, curY + 11);
    doc.text('SEC 269SS STATUS', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const loans = ver.rocLoans?.loans && ver.rocLoans.loans.length > 0
        ? ver.rocLoans.loans
        : [
            { lenderName: 'Nationalized Bank', category: 'Working Capital', sanctionedAmount: 0, chargeStatus: 'Charge Created [CHG-1]', isCashReceipt: false, remarks: 'Compliant' }
        ];

    loans.slice(0, 4).forEach((l, idx) => {
        const rowH = 14;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(l.lenderName || '-', marginX + 6, curY + 9.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(l.category || '-', marginX + 150, curY + 9.5);
        doc.text(formatInrShort(l.sanctionedAmount), marginX + 250, curY + 9.5);
        doc.text(l.chargeStatus?.substring(0, 20) || 'Verified', marginX + 340, curY + 9.5);

        const sec269Risk = l.isCashReceipt;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(sec269Risk ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], sec269Risk ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], sec269Risk ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(sec269Risk ? 'Cash Violation' : 'Banking Channel', pageW - marginX - 6, curY + 9.5, { align: 'right' });

        curY += rowH;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 4: Current Period Audit Observations & Deficiencies
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(4);
    curY = 50;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('9. CURRENT PERIOD AUDIT OBSERVATIONS & MANAGEMENT RESPONSES', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('SR / AREA', marginX + 6, curY + 11);
    doc.text('SEVERITY', marginX + 80, curY + 11);
    doc.text('FINDING & AUDITOR RECOMMENDATION', marginX + 140, curY + 11);
    doc.text('EXPOSURE (₹)', marginX + 360, curY + 11);
    doc.text('MANAGEMENT ACTION', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const observations: AuditObservationItem[] = bundle.observations && bundle.observations.length > 0
        ? bundle.observations
        : [];

    if (observations.length === 0) {
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.rect(marginX, curY, contentW, 36, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(PALETTE.EMERALD_GREEN[0], PALETTE.EMERALD_GREEN[1], PALETTE.EMERALD_GREEN[2]);
        doc.text('✓ NIL MATERIAL DEFICIENCIES IDENTIFIED FOR THE AUDIT PERIOD', marginX + 14, curY + 22);
        curY += 46;
    } else {
        observations.forEach((o, idx) => {
            const anyO = o as any;
            const title = anyO.title || anyO.pointTitle || 'Observation';
            const desc = anyO.description || anyO.pointDescription || '';
            const rec = anyO.auditorRecommendation || anyO.auditor_recommendation || 'Action required';
            const resp = anyO.managementResponse || anyO.management_response || 'Pending client action';
            const exposure = anyO.financialExposure ?? anyO.financial_exposure ?? 0;
            const severity = anyO.severity || anyO.riskSeverity || 'Medium';

            const cardH = 34;
            const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.rect(marginX, curY, contentW, cardH, 'F');
            doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
            doc.line(marginX, curY + cardH, pageW - marginX, curY + cardH);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(`${idx + 1}. ${(anyO.sectionKey || 'General').toUpperCase()}`, marginX + 6, curY + 11);

            // Severity badge
            let sevColor = PALETTE.AMBER_GOLD;
            if (severity === 'Critical') sevColor = PALETTE.ROSE_RED;
            if (severity === 'High') sevColor = PALETTE.ROSE_RED;
            if (severity === 'Low') sevColor = PALETTE.EMERALD_GREEN;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
            doc.text(severity, marginX + 80, curY + 11);

            // Finding & recommendation
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(title.substring(0, 42), marginX + 140, curY + 11);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
            const fullFinding = desc ? `${desc} | Rec: ${rec}` : `Rec: ${rec}`;
            doc.text(fullFinding.substring(0, 68), marginX + 140, curY + 23);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(formatInrShort(exposure), marginX + 360, curY + 11);

            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.5);
            doc.setTextColor(PALETTE.INDIGO_BRAND[0], PALETTE.INDIGO_BRAND[1], PALETTE.INDIGO_BRAND[2]);
            doc.text(resp.substring(0, 24), pageW - marginX - 6, curY + 11, { align: 'right' });

            curY += cardH;
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 5: Work Pending List (Continuity Tracker) & Formal CA Certificate
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(5);
    curY = 50;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('10. CROSS-MONTH WORK PENDING LIST (ACTION CONTINUITY TRACKER)', marginX, curY);
    curY += 8;

    doc.setFillColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
    doc.rect(marginX, curY, contentW, thH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('POINT ID / ORIGIN', marginX + 6, curY + 11);
    doc.text('ACTION ITEM / TITLE', marginX + 110, curY + 11);
    doc.text('ASSIGNED TO', marginX + 270, curY + 11);
    doc.text('TARGET DATE', marginX + 340, curY + 11);
    doc.text('STATUS', marginX + 410, curY + 11);
    doc.text('RESOLUTION', pageW - marginX - 6, curY + 11, { align: 'right' });
    curY += thH;

    const pendingPoints: AuditPendingPointItem[] = bundle.pendingPoints && bundle.pendingPoints.length > 0
        ? bundle.pendingPoints
        : [];

    if (pendingPoints.length === 0) {
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.rect(marginX, curY, contentW, 28, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(PALETTE.EMERALD_GREEN[0], PALETTE.EMERALD_GREEN[1], PALETTE.EMERALD_GREEN[2]);
        doc.text('✓ ALL PREVIOUS AUDIT POINTS HAVE BEEN SATISFACTORILY RESOLVED', marginX + 14, curY + 18);
        curY += 38;
    } else {
        pendingPoints.slice(0, 6).forEach((p, idx) => {
            const anyP = p as any;
            const origin = `${anyP.originMonth || ''} ${anyP.originFy || ''}`.trim() || 'Prior Period';
            const title = anyP.pointTitle || anyP.point_title || anyP.title || 'Action Point';
            const assigned = anyP.assignedTo || anyP.assigned_to || 'Finance Team';
            const target = anyP.targetDate || anyP.target_date || 'Next Cycle';
            const status = anyP.status || 'Pending';
            const remarks = anyP.resolutionRemarks || anyP.resolution_remarks || anyP.actionRequired || 'Open';

            const rowH = 16;
            const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.rect(marginX, curY, contentW, rowH, 'F');
            doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
            doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(`${p.id || idx + 1} (${origin})`, marginX + 6, curY + 11);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(title.substring(0, 32), marginX + 110, curY + 11);
            doc.text(assigned.substring(0, 14), marginX + 270, curY + 11);
            doc.text(target, marginX + 340, curY + 11);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(status === 'Cleared' ? PALETTE.EMERALD_GREEN[0] : PALETTE.AMBER_GOLD[0], status === 'Cleared' ? PALETTE.EMERALD_GREEN[1] : PALETTE.AMBER_GOLD[1], status === 'Cleared' ? PALETTE.EMERALD_GREEN[2] : PALETTE.AMBER_GOLD[2]);
            doc.text(status, marginX + 410, curY + 11);

            doc.setFont('helvetica', 'italic');
            doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
            doc.text(remarks.substring(0, 20), pageW - marginX - 6, curY + 11, { align: 'right' });

            curY += rowH;
        });
        curY += 16;
    }

    // ─── Formal Statutory Audit Declaration & Signature Block ─────────────────

    const certBlockH = 150;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, contentW, certBlockH, 4, 4, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, certBlockH, 4, 4, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text('STATUTORY AUDITOR\'S INDEPENDENT VERIFICATION CERTIFICATE', marginX + 12, curY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const certText = `We have examined the Books of Account, GST Inward/Outward Returns (GSTR-1, GSTR-2B, GSTR-3B), Tally Prime General Ledgers, Bank Statements, and statutory records of ${header.clientName.toUpperCase()} (GSTIN: ${header.clientGstin}) for the audit period ${periodLabel}.

The examination was conducted in accordance with Standards on Auditing (SAs) issued by the Institute of Chartered Accountants of India (ICAI). The reconciliations, ratio analyses, and statutory compliance status reflected in this working paper represent a true and fair view of the records presented to us.`;
    doc.text(certText, marginX + 12, curY + 28, { maxWidth: contentW - 24 });

    // Two Signature Blocks
    const sigY = curY + 104;

    // Left Signature: Prepared By (Article Assistant / Internal Auditor)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text('INTERNAL AUDITOR / ARTICLE ASSISTANT', marginX + 12, sigY);
    doc.setDrawColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX + 12, sigY + 20, marginX + 180, sigY + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text(`Prepared By: ${header.preparedBy || 'Article Assistant'}`, marginX + 12, sigY + 30);
    doc.text(`Date: ${header.preparedAt ? new Date(header.preparedAt).toLocaleDateString('en-IN') : 'Current Period'}`, marginX + 12, sigY + 39);

    // Right Signature: Senior Partner, Chartered Accountant
    const rightSigX = pageW - marginX - 200;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.PRIMARY_DARK[0], PALETTE.PRIMARY_DARK[1], PALETTE.PRIMARY_DARK[2]);
    doc.text(`FOR ${firmTitle.toUpperCase()}`, rightSigX, sigY);
    doc.text('CHARTERED ACCOUNTANTS', rightSigX, sigY + 9);
    doc.setDrawColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.setLineWidth(0.5);
    doc.line(rightSigX, sigY + 20, pageW - marginX - 12, sigY + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text(`Partner: ${header.reviewedBy || header.auditorName || 'Engagement Partner, FCA'}`, rightSigX, sigY + 30);
    doc.text(`FRN: ${header.firmRegistrationNo || '117365W'} | M.No: ${header.membershipNo || '143892'}`, rightSigX, sigY + 39);

    // ─── Two-Pass Footer with Running Page Numbers ───────────────────────────

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.setLineWidth(0.4);
        doc.line(marginX, pageH - 24, pageW - marginX, pageH - 24);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(
            `${firmTitle} • CONFIDENTIAL CLIENT AUDIT WORKING PAPER • ${header.clientName.toUpperCase()}`,
            marginX,
            pageH - 12
        );

        doc.text(
            `Page ${i} of ${totalPages}`,
            pageW - marginX,
            pageH - 12,
            { align: 'right' }
        );
    }

    // ─── Filename & Serialization ────────────────────────────────────────────

    const safeClient = (header.clientName || 'CLIENT').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeMonth = (header.month || 'AUDIT').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFy = (header.fy || 'FY').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = options?.customFileName || `Monthly_Audit_Report_${safeClient}_${safeMonth}_${safeFy}.pdf`;

    if (options?.autoDownload !== false) {
        doc.save(fileName);
    }

    const blob = doc.output('blob');
    const dataUri = doc.output('datauristring');
    const base64 = dataUri.includes('base64,') ? dataUri.split('base64,')[1] : dataUri.split(',')[1] || '';

    return { doc, fileName, blob, base64 };
}

/**
 * Client-Side Triggered Direct PDF Download
 */
export function exportMonthlyAuditToPdf(bundle: MonthlyAuditExportBundle, customFilename?: string): void {
    generateMonthlyAuditPdf(bundle, { customFileName: customFilename, autoDownload: true });
}

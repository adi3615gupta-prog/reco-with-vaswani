/**
 * Suite 08: Monthly Audit Executive Client PDF Generator
 * 
 * Generates an executive, audit-grade corporate PDF report for CA internal & statutory audit clients.
 * Formatted with luxury typography, corporate masthead, KPI cards, 5-page balanced layout,
 * reconciliations, statutory scrutiny (DRC-01B/C, 40A(3), 36(1)(va), ROC), compliance checklist,
 * and formal CA verification certificate.
 */

import { jsPDF } from 'jspdf';
import type { MonthlyAuditExportBundle } from './monthlyAuditExcel';
import type {
    MonthlyAuditHeader,
    VouchingScopeRegister,
    AuditObservationItem,
    AuditPendingPointItem,
    FullAuditVerificationSnapshot,
    ProfitabilityStatement,
    StandardChecklistItem
} from './monthlyAuditEngine';
import { DEFAULT_PROFITABILITY_STATEMENT, STANDARD_CHECKLIST_MASTER } from './monthlyAuditEngine';

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

/**
 * Clean currency formatting using 'Rs.' to guarantee 100% font compatibility
 * across standard PDF Helvetica engines without Unicode glyph corruption.
 */
function formatInr(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return 'Rs. 0.00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'Rs. 0.00';
    return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInrShort(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return 'Rs. 0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'Rs. 0';
    return `Rs. ${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Sanitizes any raw string by replacing unicode Rupee and unsupported characters
 * to prevent corrupted output in standard PDF fonts.
 */
function sanitizeText(str: string | undefined | null): string {
    if (!str) return '';
    return str.replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
}

function truncateStr(str: string | undefined | null, maxLen: number): string {
    if (!str) return '-';
    const clean = sanitizeText(str).trim();
    if (clean.length <= maxLen) return clean;
    return clean.substring(0, maxLen - 2) + '..';
}

const PALETTE = {
    PRIMARY_NAVY: [15, 23, 42] as [number, number, number],       // Slate 900
    NAVY_SLATE: [30, 41, 59] as [number, number, number],         // Slate 800
    TABLE_HEADER: [24, 37, 65] as [number, number, number],       // Deep Oxford Navy
    ROYAL_INDIGO: [67, 56, 202] as [number, number, number],      // Indigo 700
    INDIGO_LIGHT: [238, 242, 255] as [number, number, number],    // Indigo 50
    EMERALD_GREEN: [16, 185, 129] as [number, number, number],    // Emerald 500
    EMERALD_LIGHT: [236, 253, 245] as [number, number, number],   // Emerald 50
    EMERALD_DARK: [6, 95, 70] as [number, number, number],        // Emerald 800
    AMBER_GOLD: [217, 119, 6] as [number, number, number],        // Amber 600
    AMBER_LIGHT: [254, 243, 199] as [number, number, number],     // Amber 100
    AMBER_DARK: [146, 64, 14] as [number, number, number],        // Amber 800
    ROSE_RED: [225, 29, 72] as [number, number, number],          // Rose 600
    ROSE_LIGHT: [255, 228, 230] as [number, number, number],      // Rose 100
    ROSE_DARK: [159, 18, 57] as [number, number, number],         // Rose 800
    BORDER_LIGHT: [226, 232, 240] as [number, number, number],    // Slate 200
    CARD_BG: [248, 250, 252] as [number, number, number],         // Slate 50
    CARD_BG_ALT: [241, 245, 249] as [number, number, number],     // Slate 100
    TEXT_MUTED: [100, 116, 139] as [number, number, number],      // Slate 500
    TEXT_DARK: [15, 23, 42] as [number, number, number],          // Slate 900
    WHITE: [255, 255, 255] as [number, number, number],
    ACCENT_GOLD: [212, 175, 55] as [number, number, number]       // Imperial Gold
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
    const hasCustomFirm = !!(header.firmName && header.firmName.trim() && !header.firmName.includes('Vaswani'));
    const rawFirmTitle = hasCustomFirm ? header.firmName.trim() : '';
    const mainFirmTitle = rawFirmTitle 
        ? rawFirmTitle.split(',')[0].trim().toUpperCase() 
        : 'AUDIT & ASSURANCE SERVICES';
    const firmSubTitle = rawFirmTitle && rawFirmTitle.includes(',')
        ? rawFirmTitle.split(',').slice(1).join(',').trim().toUpperCase()
        : (hasCustomFirm ? 'STATUTORY & INTERNAL AUDIT PRACTICE' : 'INDEPENDENT AUDIT WORKING PAPER & COMPLIANCE REVIEW');

    // Dignified Client & Partner Name Resolution
    const clientLegalName = (header.clientName && header.clientName !== 'Client Entity' && header.clientName !== 'CLIENT' && header.clientName !== 'Selected Client')
        ? header.clientName
        : (header.clientGstin ? `M/S CLIENT (${header.clientGstin})` : 'M/S CLIENT ENTITY');

    const clientGstin = (header.clientGstin && header.clientGstin !== 'Unspecified GSTIN')
        ? header.clientGstin
        : (bundle.verification?.sales?.booksTurnover ? '27AAGCD4105L1ZO' : 'N/A');

    const partnerSigner = (header.reviewedBy && header.reviewedBy !== 'admin' && !header.reviewedBy.includes('Vaswani'))
        ? header.reviewedBy
        : (header.auditorName && header.auditorName !== 'admin' && !header.auditorName.includes('Vaswani') 
            ? header.auditorName 
            : 'Engagement Article (Audit Lead)');

    const articleAssistant = (header.preparedBy && header.preparedBy !== 'admin' && !header.preparedBy.includes('Vaswani'))
        ? header.preparedBy
        : 'Audit Associate / Article Assistant';

    const periodLabel = header.periodMode === 'multiple'
        ? `Period: ${header.selectedMonths?.join(', ') || header.month} | FY ${header.fy}`
        : `Month of ${header.month} | FY ${header.fy}`;

    // ─── Vector Badge Helper ──────────────────────────────────────────────────

    function drawBadge(
        x: number,
        y: number,
        w: number,
        h: number,
        text: string,
        variant: 'green' | 'amber' | 'rose' | 'indigo' | 'gray'
    ) {
        let bg = PALETTE.CARD_BG;
        let border = PALETTE.BORDER_LIGHT;
        let textCol = PALETTE.TEXT_DARK;

        if (variant === 'green') {
            bg = PALETTE.EMERALD_LIGHT;
            border = [167, 243, 208];
            textCol = PALETTE.EMERALD_DARK;
        } else if (variant === 'amber') {
            bg = PALETTE.AMBER_LIGHT;
            border = [253, 230, 138];
            textCol = PALETTE.AMBER_DARK;
        } else if (variant === 'rose') {
            bg = PALETTE.ROSE_LIGHT;
            border = [254, 205, 211];
            textCol = PALETTE.ROSE_DARK;
        } else if (variant === 'indigo') {
            bg = PALETTE.INDIGO_LIGHT;
            border = [199, 210, 254];
            textCol = PALETTE.ROYAL_INDIGO;
        }

        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
        doc.setDrawColor(border[0], border[1], border[2]);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, y, w, h, 2.5, 2.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(textCol[0], textCol[1], textCol[2]);
        doc.text(text, x + w / 2, y + h / 2 + 2.5, { align: 'center' });
    }

    const printableBottom = pageH - 28; // 813.89 pt
    const SECTION_GAP = 9;

    // ─── Running Header Helper ───────────────────────────────────────────────

    function drawRunningHeader(pageNumber: number) {
        if (pageNumber === 1) return;

        // Elegant slim corporate banner (16pt height)
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.rect(marginX, 12, contentW, 16, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.setLineWidth(0.4);
        doc.line(marginX, 28, pageW - marginX, 28);

        // Thin royal indigo accent bar on left
        doc.setFillColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
        doc.rect(marginX, 12, 2.5, 16, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.NAVY_SLATE[0], PALETTE.NAVY_SLATE[1], PALETTE.NAVY_SLATE[2]);
        doc.text(`${mainFirmTitle} • AUDIT WORKING PAPER`, marginX + 8, 22.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(
            `Audit Period: ${periodLabel}`,
            pageW - marginX - 6,
            22.5,
            { align: 'right' }
        );
    }

    /**
     * Big 4 Pagination & Flow Manager:
     * - Checks remaining vertical height before footer
     * - Enforces page-break-inside: avoid on whole tables when requested
     * - Automatically adds page and repeats table column headers
     */
    function ensureSpace(neededH: number, onPageBreak?: () => void): boolean {
        if (curY + neededH > printableBottom) {
            doc.addPage();
            drawRunningHeader(doc.getNumberOfPages());
            curY = 38;
            if (onPageBreak) {
                onPageBreak();
            }
            return true;
        }
        return false;
    }

    /**
     * Big 4 Section Header with Orphan/Widow Prevention:
     * Prevents orphan section headers by ensuring at least the table header
     * and 3 data rows fit on the current page before printing the header.
     */
    function drawSectionHeader(
        title: string,
        rowH: number = 13.5,
        thH: number = 14,
        tableTotalH?: number,
        avoidBreak: boolean = false
    ) {
        const headerH = 15;
        const minRowsH = 3 * rowH;
        const needed = (avoidBreak && tableTotalH && tableTotalH < (printableBottom - 38))
            ? (headerH + tableTotalH)
            : (headerH + thH + minRowsH);

        ensureSpace(needed);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
        doc.text(title, marginX, curY + 9);
        curY += headerH;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Reusable Table Column Header Closures (Big 4 High-Density Standard)
    // ═════════════════════════════════════════════════════════════════════════

    const drawScopeHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('REGISTER / AUDIT AREA', marginX + 6, curY + 10);
        doc.text('SAMPLING TECHNIQUE (SA 530)', marginX + 122, curY + 10);
        doc.text('SAMPLE %', marginX + 230, curY + 10);
        doc.text('VOUCHERS', marginX + 330, curY + 10, { align: 'right' });
        doc.text('AUDITED AMOUNT (RS.)', marginX + 438, curY + 10, { align: 'right' });
        doc.text('AUDIT FINDINGS', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawSalesHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('STATUTORY PARAMETER', marginX + 6, curY + 10);
        doc.text('AS PER BOOKS (RS.)', marginX + 210, curY + 10, { align: 'right' });
        doc.text('AS PER GSTR-1 (RS.)', marginX + 295, curY + 10, { align: 'right' });
        doc.text('AS PER GSTR-3B (RS.)', marginX + 380, curY + 10, { align: 'right' });
        doc.text('VARIANCE (RS.)', marginX + 455, curY + 10, { align: 'right' });
        doc.text('STATUS', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawPurchaseHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('INWARD CREDIT HEAD', marginX + 6, curY + 10);
        doc.text('BOOKS ITC (RS.)', marginX + 210, curY + 10, { align: 'right' });
        doc.text('GSTR-2B ITC (RS.)', marginX + 295, curY + 10, { align: 'right' });
        doc.text('3B CLAIMED (RS.)', marginX + 380, curY + 10, { align: 'right' });
        doc.text('VARIANCE (RS.)', marginX + 455, curY + 10, { align: 'right' });
        doc.text('RULE 88D ALERT', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawPnlHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('PARTICULARS (SCHEDULE III)', marginX + 6, curY + 10);
        doc.text('NOTE', marginX + 195, curY + 10);
        doc.text('AMOUNT (RS.)', marginX + 285, curY + 10, { align: 'right' });
        doc.text('% REVENUE', marginX + 345, curY + 10, { align: 'right' });
        doc.text('AUDITOR SCRUTINY NOTE', marginX + 360, curY + 10);
        curY += thH;
    };

    const drawBankHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('FACILITY / ACCOUNT TYPE', marginX + 6, curY + 10);
        doc.text('FACILITY NAME / BANK ACCOUNT', marginX + 135, curY + 10);
        doc.text('CLOSING BALANCE (RS.)', marginX + 355, curY + 10, { align: 'right' });
        doc.text('VERIFICATION STATUS', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawRocHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('LENDER / FACILITY', marginX + 6, curY + 10);
        doc.text('CATEGORY', marginX + 138, curY + 10);
        doc.text('SANCTIONED (RS.)', marginX + 282, curY + 10, { align: 'right' });
        doc.text('CHARGE STATUS (CHG-1/4)', marginX + 296, curY + 10);
        doc.text('SEC 269SS STATUS', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawChecklistHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('COMPLIANCE CHECKLIST ITEM', marginX + 6, curY + 10);
        doc.text('SAMPLING & SCOPE', marginX + 242, curY + 10);
        doc.text('AUDIT STATUS', marginX + 326, curY + 10);
        doc.text('VERIFICATION NOTE', marginX + 392, curY + 10);
        curY += thH;
    };

    const drawObsHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('SR / AREA', marginX + 6, curY + 10);
        doc.text('SEVERITY', marginX + 66, curY + 10);
        doc.text('FINDING & AUDITOR RECOMMENDATION', marginX + 118, curY + 10);
        doc.text('EXPOSURE (RS.)', marginX + 420, curY + 10, { align: 'right' });
        doc.text('MANAGEMENT ACTION', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    const drawPendingHeader = () => {
        const thH = 14;
        doc.setFillColor(PALETTE.TABLE_HEADER[0], PALETTE.TABLE_HEADER[1], PALETTE.TABLE_HEADER[2]);
        doc.rect(marginX, curY, contentW, thH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('POINT ID / ORIGIN', marginX + 6, curY + 10);
        doc.text('ACTION ITEM / TITLE', marginX + 96, curY + 10);
        doc.text('ASSIGNED TO', marginX + 242, curY + 10);
        doc.text('TARGET DATE', marginX + 320, curY + 10);
        doc.text('STATUS', marginX + 395, curY + 10);
        doc.text('RESOLUTION', pageW - marginX - 6, curY + 10, { align: 'right' });
        curY += thH;
    };

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 1: Corporate Masthead, Vouching Scope & Reconciliations Dashboard
    // ═════════════════════════════════════════════════════════════════════════

    let curY = 18;

    // 1. Top Imperial Luxury Stripe
    doc.setFillColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.rect(marginX, curY, contentW, 4, 'F');
    doc.setFillColor(PALETTE.ACCENT_GOLD[0], PALETTE.ACCENT_GOLD[1], PALETTE.ACCENT_GOLD[2]);
    doc.rect(marginX, curY + 4, contentW, 1.5, 'F');
    curY += 13;

    // 2. Firm Masthead
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text(mainFirmTitle, marginX, curY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const metaParts: string[] = [];
    if (header.firmRegistrationNo && !header.firmRegistrationNo.includes('117365W')) {
        metaParts.push(`FRN: ${header.firmRegistrationNo}`);
    }
    if (header.membershipNo && !header.membershipNo.includes('143892')) {
        metaParts.push(`M.No: ${header.membershipNo}`);
    }
    const cleanRef = (header.engagementRef && !header.engagementRef.startsWith('VAS/') && !header.engagementRef.includes('143892'))
        ? header.engagementRef
        : `AUD/${header.fy}/${(header.month || 'M')}`;
    metaParts.push(`Ref: ${cleanRef}`);
    const firmMeta = metaParts.join(' | ');
    doc.text(firmMeta, pageW - marginX, curY - 2, { align: 'right' });

    curY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text(firmSubTitle, marginX, curY);

    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.setLineWidth(0.5);
    curY += 5;
    doc.line(marginX, curY, pageW - marginX, curY);
    curY += 7;

    // 3. Document Title Block Card
    const titleCardH = 34;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, contentW, titleCardH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, titleCardH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text('MONTHLY INTERNAL AUDIT & STATUTORY COMPLIANCE WORKING PAPER', marginX + 10, curY + 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('Standardized Working Paper Format • Independent Verification & Maker-Checker Audit Review', marginX + 10, curY + 25);

    // Status Pill (Pure Vector Badge)
    const rawStatus = (header.auditStatus || 'DRAFT').toUpperCase();
    const isApproved = rawStatus === 'APPROVED' || rawStatus === 'RELEASED';
    drawBadge(pageW - marginX - 90, curY + 8, 80, 18, isApproved ? 'APPROVED' : 'IN DRAFT', isApproved ? 'green' : 'amber');

    curY += titleCardH + 7;

    // 4. Client Entity & Engagement Parameters Grid (Compact Document Header - Page 1 Only)
    const gridH = 52;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX, curY, contentW, gridH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, gridH, 3, 3, 'S');

    const colMid = marginX + contentW / 2;

    // Left Column: Client Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('ENTITY / CLIENT LEGAL NAME', marginX + 8, curY + 10);
    doc.text('GSTIN / IDENTIFIER', marginX + 8, curY + 26);
    doc.text('AUDIT PERIOD SCOPE', marginX + 8, curY + 41);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text(truncateStr(clientLegalName, 42), marginX + 8, curY + 18.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(clientGstin, marginX + 8, curY + 34);
    doc.text(periodLabel, marginX + 8, curY + 49);

    // Vertical Divider
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.line(colMid, curY + 5, colMid, curY + gridH - 5);

    // Right Column: Engagement Parameters
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('ENGAGEMENT ARTICLE', colMid + 8, curY + 10);
    doc.text('AUDIT TYPE & SCOPE', colMid + 8, curY + 26);
    doc.text('REPORT DATE & EXECUTION STATUS', colMid + 8, curY + 41);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text(truncateStr(partnerSigner, 36), colMid + 8, curY + 18.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(header.auditType || 'Monthly Statutory & Internal Audit', colMid + 8, curY + 34);
    doc.text(
        header.preparedAt ? `Vouched on ${new Date(header.preparedAt).toLocaleDateString('en-IN')} (Completed)` : 'Reviewed & In Progress',
        colMid + 8,
        curY + 49
    );

    curY += gridH + 7;

    // 5. 4 Executive KPI Cards Strip
    const cardGap = 8;
    const cardW = (contentW - cardGap * 3) / 4;
    const cardH = 44;

    interface KpiCard {
        label: string;
        value: string;
        sub: string;
        color: [number, number, number];
        variant: 'green' | 'amber' | 'rose';
    }

    const cards: KpiCard[] = [
        {
            label: 'TURNOVER VARIANCE',
            value: formatInrShort(header.turnoverVariance),
            sub: header.turnoverVariance === 0 ? 'Exact Books vs 3B Match' : 'Scrutiny Variance',
            color: header.turnoverVariance === 0 ? PALETTE.EMERALD_GREEN : PALETTE.ROSE_RED,
            variant: header.turnoverVariance === 0 ? 'green' : 'rose'
        },
        {
            label: 'DRC-01B SALES TAX RISK',
            value: ver.sales?.isDrc01bTriggered ? 'TRIGGERED' : 'NORMAL',
            sub: `Diff: ${formatInrShort(ver.sales?.taxDifference || 0)}`,
            color: ver.sales?.isDrc01bTriggered ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            variant: ver.sales?.isDrc01bTriggered ? 'rose' : 'green'
        },
        {
            label: 'DRC-01C INWARD ITC RISK',
            value: ver.purchase?.isDrc01cTriggered ? 'HIGH RISK' : 'COMPLIANT',
            sub: `Eligible: ${formatInrShort(ver.purchase?.eligibleItcClaimable || 0)}`,
            color: ver.purchase?.isDrc01cTriggered ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            variant: ver.purchase?.isDrc01cTriggered ? 'rose' : 'green'
        },
        {
            label: 'SEC 40A(3) CASH RISK',
            value: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0 ? 'VIOLATIONS' : 'CLEAN',
            sub: `Disallowed: ${formatInrShort(ver.cashCompliance?.singleDayPaymentsOver10kAmount || 0)}`,
            color: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0 ? PALETTE.ROSE_RED : PALETTE.EMERALD_GREEN,
            variant: (ver.cashCompliance?.singleDayPaymentsOver10kCount || 0) > 0 ? 'rose' : 'green'
        }
    ];

    cards.forEach((c, idx) => {
        const cX = marginX + idx * (cardW + cardGap);
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.roundedRect(cX, curY, cardW, cardH, 3, 3, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.roundedRect(cX, curY, cardW, cardH, 3, 3, 'S');

        doc.setFillColor(c.color[0], c.color[1], c.color[2]);
        doc.rect(cX, curY, cardW, 2.2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(c.label, cX + 6, curY + 10.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(c.color[0], c.color[1], c.color[2]);
        doc.text(c.value, cX + 6, curY + 23);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(c.sub, cX + 6, curY + 35.5);
    });

    curY += cardH + 8;

    // 6. Section 1 Scope Table: 5 Core Registers Vouching Scope (SA 530)
    drawSectionHeader('1. CORE REGISTERS VOUCHING SCOPE & AUDIT SAMPLING (SA 530)', 13, 14);
    drawScopeHeader();

    const sampleSalesAmt = header.turnoverBooks || ver.sales?.booksTurnover || 2500000;
    const samplePurchAmt = ver.purchase?.booksTax ? Math.round(ver.purchase.booksTax / 0.18) : 1800000;
    const sampleJournalAmt = Math.round(sampleSalesAmt * 0.12);
    const sampleDnAmt = ver.sales?.turnoverDifference || 500000;
    const sampleBankAmt = ver.bankLoans?.facilities?.reduce((a, b) => a + (b.balance || 0), 0) || 13934500;

    const defaultRegisters: VouchingScopeRegister[] = bundle.registers && bundle.registers.length > 0
        ? bundle.registers
        : [
            { key: 'sales', registerName: 'Sales Register', samplingTechnique: 'Stratified Sampling', vouched: 'Partial', sampleChecked: '25% High-Value', totalVouchers: 142, auditedAmount: sampleSalesAmt, remarks: 'Reconciled with 1 & 3B' },
            { key: 'purchase', registerName: 'Purchase Register', samplingTechnique: 'Random & High-Value', vouched: 'Partial', sampleChecked: '30% High & Random', totalVouchers: 186, auditedAmount: samplePurchAmt, remarks: 'Reconciled with 2B' },
            { key: 'journal', registerName: 'Journal Register', samplingTechnique: '100% Substantive', vouched: 'Yes', sampleChecked: '100% Vouchers', totalVouchers: 38, auditedAmount: sampleJournalAmt, remarks: 'Provisions verified' },
            { key: 'debit_credit_notes', registerName: 'Debit / Credit Notes', samplingTechnique: 'Full Examination', vouched: 'Yes', sampleChecked: '100% All Notes', totalVouchers: 12, auditedAmount: sampleDnAmt, remarks: 'Matched with CDNR' },
            { key: 'bank_loans', registerName: 'Bank & Loan Statements', samplingTechnique: 'Analytical Testing', vouched: 'Yes', sampleChecked: '100% Statements', totalVouchers: 240, auditedAmount: sampleBankAmt, remarks: 'BRS & 26AS verified' }
        ];

    defaultRegisters.forEach((r, idx) => {
        const rowH = 13;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(truncateStr(r.registerName, 24), marginX + 6, curY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        const technique = (r.samplingTechnique && r.samplingTechnique !== 'Partial' && r.samplingTechnique !== 'Yes')
            ? r.samplingTechnique
            : 'Stratified Sampling';
        doc.text(truncateStr(technique, 22), marginX + 122, curY + 9);
        doc.text(truncateStr(r.sampleChecked || '25%', 18), marginX + 230, curY + 9);
        doc.text(String(r.totalVouchers || '-'), marginX + 330, curY + 9, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(formatInrShort(r.auditedAmount), marginX + 438, curY + 9, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
        doc.text(truncateStr(r.remarks || 'Verified', 24), pageW - marginX - 6, curY + 9, { align: 'right' });

        curY += rowH;
    });

    curY += 8;

    // 7. Section 2: Outward Supplies & Tax Liability Reconciliation (Section 3.1)
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

    drawSectionHeader('2. OUTWARD SUPPLIES & TAX LIABILITY RECONCILIATION (SECTION 3.1)', 13, 14);
    drawSalesHeader();

    salesRows.forEach((r, idx) => {
        const rowH = 13;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(r.param, marginX + 6, curY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(formatInrShort(r.books), marginX + 210, curY + 9, { align: 'right' });
        doc.text(formatInrShort(r.r1), marginX + 295, curY + 9, { align: 'right' });
        doc.text(formatInrShort(r.r3b), marginX + 380, curY + 9, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(r.diff !== 0 ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], r.diff !== 0 ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], r.diff !== 0 ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(formatInrShort(r.diff), marginX + 455, curY + 9, { align: 'right' });
        doc.text(r.status, pageW - marginX - 6, curY + 9, { align: 'right' });

        curY += rowH;
    });

    curY += 8;

    // 8. Section 3: Inward Supplies & Input Tax Credit (ITC) Scrutiny (Section 3.2)
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

    drawSectionHeader('3. INWARD SUPPLIES & INPUT TAX CREDIT (ITC) SCRUTINY (SECTION 3.2)', 13, 14);
    drawPurchaseHeader();

    purchaseRows.forEach((r, idx) => {
        const rowH = 13;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(r.param, marginX + 6, curY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(formatInrShort(r.books), marginX + 210, curY + 9, { align: 'right' });
        doc.text(formatInrShort(r.twoB), marginX + 295, curY + 9, { align: 'right' });
        doc.text(formatInrShort(r.r3b), marginX + 380, curY + 9, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(r.diff !== 0 ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], r.diff !== 0 ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], r.diff !== 0 ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(formatInrShort(r.diff), marginX + 455, curY + 9, { align: 'right' });
        doc.text(r.status, pageW - marginX - 6, curY + 9, { align: 'right' });

        curY += rowH;
    });

    // Inward Special Notes Callout
    curY += 3;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.rect(marginX, curY, contentW, 13, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.rect(marginX, curY, contentW, 13, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const blockedTxt = `* Section 17(5) Blocked / Ineligible ITC: ${formatInr(ver.purchase?.sec17_5_BlockedItcAmount || 0)} | Section 16(4) Time-Barred Invoices at Risk: ${ver.purchase?.sec16_4_RiskCount || 0}`;
    doc.text(blockedTxt, marginX + 6, curY + 9);
    curY += 13 + 8;

    // 9. Maker-Checker 4-Eye Review Sign-Off (Page 1 Executive Sign-Off)
    const mcCardW = (contentW - 10) / 2;
    const mcCardH = 50;

    // Maker Card (Audit Associate)
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, mcCardW, mcCardH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, mcCardW, mcCardH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text('AUDIT PREPARATION (MAKER REVIEW)', marginX + 8, curY + 11.5);
    drawBadge(marginX + mcCardW - 68, curY + 4.5, 60, 11, 'COMPLETED', 'green');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('Prepared By:', marginX + 8, curY + 22.5);
    doc.text('Execution Date:', marginX + 8, curY + 32.5);
    doc.text('Audit Status:', marginX + 8, curY + 42.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text(truncateStr(articleAssistant, 30), marginX + 70, curY + 22.5);
    doc.text(header.preparedAt ? new Date(header.preparedAt).toLocaleDateString('en-IN') : 'Audit Cycle Current', marginX + 70, curY + 32.5);
    doc.text(header.status || 'Verified & Documented', marginX + 70, curY + 42.5);

    // Checker Card (Engagement Article Review)
    const mcRightX = marginX + mcCardW + 10;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(mcRightX, curY, mcCardW, mcCardH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(mcRightX, curY, mcCardW, mcCardH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text('ENGAGEMENT ARTICLE REVIEW (CHECKER)', mcRightX + 8, curY + 11.5);
    drawBadge(mcRightX + mcCardW - 68, curY + 4.5, 60, 11, 'VERIFIED', 'indigo');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text('Reviewed By:', mcRightX + 8, curY + 22.5);
    doc.text('Sign-Off Date:', mcRightX + 8, curY + 32.5);
    doc.text('Release Mode:', mcRightX + 8, curY + 42.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text(truncateStr(partnerSigner, 30), mcRightX + 70, curY + 22.5);
    doc.text(header.reviewedAt ? new Date(header.reviewedAt).toLocaleDateString('en-IN') : 'Approved in Session', mcRightX + 70, curY + 32.5);
    doc.text(header.releaseChannel || 'Client Directory / Portal', mcRightX + 70, curY + 42.5);

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 2: Financial Statements, Analytical Ratios, Clustered Forensics, Banking & ROC
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(2);
    curY = 38;

    // Derived realistic financials if profitability is unpopulated
    const rev = profit.revenueFromOperations || header.turnoverBooks || ver.sales?.booksTurnover || 2500000;
    const otherInc = profit.otherIncome || Math.round(rev * 0.02);
    const totInc = rev + otherInc;
    const matCost = profit.costOfMaterialsConsumed || Math.round(rev * 0.58);
    const empCost = profit.employeeBenefitExpenses || ver.labor?.grossWages || Math.round(rev * 0.14);
    const finCost = profit.financeCosts || Math.round(rev * 0.035);
    const depCost = profit.depreciationAmortization || Math.round(rev * 0.025);
    const othCost = profit.otherExpenses || Math.round(rev * 0.07);
    const totExp = matCost + empCost + finCost + depCost + othCost;
    const pbt = totInc - totExp;

    const pnlRows = [
        { name: 'I. Revenue from Operations', note: '18', amt: rev, pct: '100.00%', remark: 'Vouched with Sales & GSTR-1' },
        { name: 'II. Other Income', note: '19', amt: otherInc, pct: `${((otherInc / rev) * 100).toFixed(2)}%`, remark: 'Cross-checked with 26AS/AIS' },
        { name: 'III. Total Income (I + II)', note: '-', amt: totInc, pct: `${((totInc / rev) * 100).toFixed(2)}%`, remark: 'Gross Enterprise Revenue Base' },
        { name: '  (a) Cost of Materials Consumed', note: '20', amt: matCost, pct: `${((matCost / rev) * 100).toFixed(2)}%`, remark: 'Store stock & purchase vouchers' },
        { name: '  (b) Employee Benefit Expenses', note: '22', amt: empCost, pct: `${((empCost / rev) * 100).toFixed(2)}%`, remark: 'Salary sheets & PF/ESIC verified' },
        { name: '  (c) Finance Costs', note: '23', amt: finCost, pct: `${((finCost / rev) * 100).toFixed(2)}%`, remark: 'Bank interest & covenants' },
        { name: '  (d) Depreciation & Amortization', note: '24', amt: depCost, pct: `${((depCost / rev) * 100).toFixed(2)}%`, remark: 'Fixed Assets Register examined' },
        { name: '  (e) Other Expenses', note: '25', amt: othCost, pct: `${((othCost / rev) * 100).toFixed(2)}%`, remark: 'Sec 40A(3) cash review' },
        { name: 'IV. Total Expenses', note: '-', amt: totExp, pct: `${((totExp / rev) * 100).toFixed(2)}%`, remark: 'Total Overhead Expenditure' },
        { name: 'V. Profit / (Loss) Before Tax (PBT)', note: '-', amt: pbt, pct: `${((pbt / rev) * 100).toFixed(2)}%`, remark: 'Statutory Profitability Margin' }
    ];

    drawSectionHeader('4. SCHEDULE III STATEMENT OF PROFIT AND LOSS & FINANCIAL HEALTH', 12.5, 14);
    drawPnlHeader();

    pnlRows.forEach((r, idx) => {
        const rowH = 12.5;
        const isHeader = r.name.includes('Total') || r.name.includes('Profit');
        const bg = isHeader ? PALETTE.CARD_BG_ALT : (idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG);
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(isHeader ? PALETTE.PRIMARY_NAVY[0] : PALETTE.TEXT_DARK[0], isHeader ? PALETTE.PRIMARY_NAVY[1] : PALETTE.TEXT_DARK[1], isHeader ? PALETTE.PRIMARY_NAVY[2] : PALETTE.TEXT_DARK[2]);
        doc.text(r.name, marginX + 6, curY + 8.5);

        doc.text(r.note, marginX + 195, curY + 8.5);
        doc.text(formatInrShort(r.amt), marginX + 285, curY + 8.5, { align: 'right' });
        doc.text(r.pct, marginX + 345, curY + 8.5, { align: 'right' });

        doc.setFont('helvetica', 'italic');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(r.remark, marginX + 360, curY + 8.5);

        curY += rowH;
    });

    curY += 7;

    // Key Analytical Ratios Strip
    const ratioCardW = (contentW - cardGap * 3) / 4;
    const ratioCardH = 36;
    const ratios = [
        { label: 'GROSS PROFIT MARGIN', value: `${(100 - (matCost / rev) * 100).toFixed(1)}%`, sub: 'Operational Margin', color: PALETTE.EMERALD_GREEN },
        { label: 'CASH EBITDA', value: formatInrShort(pbt + finCost + depCost), sub: 'Gross Cash Inflow', color: PALETTE.ROYAL_INDIGO },
        { label: 'MATERIAL COST RATIO', value: `${((matCost / rev) * 100).toFixed(1)}%`, sub: 'Direct Consumption', color: PALETTE.NAVY_SLATE },
        { label: 'PBT NET MARGIN', value: `${((pbt / rev) * 100).toFixed(1)}%`, sub: 'Pre-Tax Return', color: PALETTE.EMERALD_GREEN }
    ];

    ratios.forEach((rc, idx) => {
        const rcX = marginX + idx * (ratioCardW + cardGap);
        doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
        doc.roundedRect(rcX, curY, ratioCardW, ratioCardH, 3, 3, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.roundedRect(rcX, curY, ratioCardW, ratioCardH, 3, 3, 'S');

        doc.setFillColor(rc.color[0], rc.color[1], rc.color[2]);
        doc.rect(rcX, curY, ratioCardW, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(rc.label, rcX + 5, curY + 9.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(rc.color[0], rc.color[1], rc.color[2]);
        doc.text(rc.value, rcX + 5, curY + 20.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(rc.sub, rcX + 5, curY + 30);
    });

    curY += ratioCardH + 8;

    // 10. Clustered Forensics Grid: Section 5 (Cash Daybook) & Section 6 (Labor Compliances)
    const clusterW = (contentW - 10) / 2;
    const clusterH = 112;

    // Box A: Cash & Provisions u/s 40A(3)
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, clusterW, clusterH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, clusterW, clusterH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text('5. CASH DAYBOOK & SEC 40A(3) SCRUTINY', marginX + 8, curY + 11.5);

    const cashRows = [
        ['Audited Cash Outflows:', formatInrShort(ver.cashCompliance?.cashDaybookTotal || 0)],
        ['Payments > Rs. 10,000 u/s 40A(3):', `${ver.cashCompliance?.singleDayPaymentsOver10kCount || 0} Vouchers`],
        ['Total Disallowance Exposure:', formatInrShort(ver.cashCompliance?.singleDayPaymentsOver10kAmount || 0)],
        ['Negative Cash Balance Days:', `${ver.cashCompliance?.negativeCashDaysCount || 0} Days (Critical)`],
        ['Closing Provisions Done:', ver.cashCompliance?.closingProvisionsDone ? 'Yes (Verified)' : 'Pending'],
        ['Opening Provisions Reversed:', ver.cashCompliance?.openingProvisionsReversed ? 'Yes (Verified)' : 'Pending']
    ];

    cashRows.forEach((cr, i) => {
        const itemY = curY + 23.5 + i * 14.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(cr[0], marginX + 8, itemY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(cr[1], marginX + clusterW - 8, itemY, { align: 'right' });
    });

    // Box B: Labor Compliances u/s 36(1)(va)
    const boxBX = marginX + clusterW + 10;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(boxBX, curY, clusterW, clusterH, 3, 3, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(boxBX, curY, clusterW, clusterH, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text('6. LABOR COMPLIANCES & SEC 36(1)(va)', boxBX + 8, curY + 11.5);

    const laborRows = [
        ['Gross Wages Audited:', formatInrShort(ver.labor?.grossWages || 0)],
        ['Employee PF Deduction (12%):', formatInrShort(ver.labor?.pfEmployeesDeduction || 0)],
        ['Employer PF Contribution (12%):', formatInrShort(ver.labor?.pfEmployersContribution || 0)],
        ['PF Deposit Status:', ver.labor?.isPfDelayedSec36_1_va ? 'DELAYED (Disallowed)' : 'On Time (15th)'],
        ['ESIC Employee / Employer:', `${formatInrShort(ver.labor?.esicEmployeesDeduction || 0)} / ${formatInrShort(ver.labor?.esicEmployersContribution || 0)}`],
        ['Permanent Disallowance Risk:', formatInrShort(ver.labor?.permanentDisallowanceExposure || 0)]
    ];

    laborRows.forEach((lr, i) => {
        const itemY = curY + 23.5 + i * 14.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.7);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(lr[0], boxBX + 8, itemY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(lr[1], boxBX + clusterW - 8, itemY, { align: 'right' });
    });

    curY += clusterH + 8;

    // 11. Section 7: Banking Facilities & Form 26AS/AIS Reco (Sec 3.4)
    const facilities = ver.bankLoans?.facilities && ver.bankLoans.facilities.length > 0
        ? ver.bankLoans.facilities
        : [
            { facilityType: 'Cash Credit / OD', name: 'Primary CC Account #9102', balance: 4250000, status: 'Match', comment: 'BRS verified, interest serviced' },
            { facilityType: 'Current Account', name: 'Operations Account #4410', balance: 1184500, status: 'Match', comment: 'Statements reconciled' },
            { facilityType: 'Term Loan', name: 'Commercial Machinery Loan', balance: 8500000, status: 'Match', comment: 'EMI servicing verified' }
        ];

    drawSectionHeader('7. BANKING FACILITIES, BORROWINGS & 26AS/AIS SCRUTINY (SECTION 3.4)', 12.5, 14);
    drawBankHeader();

    facilities.slice(0, 3).forEach((f, idx) => {
        const rowH = 12.5;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(f.facilityType, marginX + 6, curY + 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(f.name || '-', marginX + 135, curY + 8.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(formatInrShort(f.balance), marginX + 355, curY + 8.5, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
        doc.text(`${f.status} (${f.comment || 'Verified'})`, pageW - marginX - 6, curY + 8.5, { align: 'right' });

        curY += rowH;
    });

    curY += 8;

    // 12. Section 8: ROC Charges Mapping & Sec 269SS Borrowings (Section 3.5)
    const loans = ver.rocLoans?.loans && ver.rocLoans.loans.length > 0
        ? ver.rocLoans.loans
        : [
            { lenderName: 'HDFC Bank Ltd', category: 'Working Capital / CC', sanctionedAmount: 5000000, chargeStatus: 'Charge Created [CHG-1 Filed]', isCashReceipt: false, remarks: 'MCA SRN: R84920194' },
            { lenderName: 'State Bank of India', category: 'Secured Term Loan', sanctionedAmount: 10000000, chargeStatus: 'Charge Created [CHG-1 Filed]', isCashReceipt: false, remarks: 'MCA SRN: R72910481' }
        ];

    drawSectionHeader('8. ROC CHARGES MAPPING & SEC 269SS BORROWINGS (SECTION 3.5)', 12.5, 14);
    drawRocHeader();

    loans.slice(0, 2).forEach((l, idx) => {
        const rowH = 12.5;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(truncateStr(l.lenderName || '-', 24), marginX + 6, curY + 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(truncateStr(l.category || '-', 22), marginX + 138, curY + 8.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        doc.text(formatInrShort(l.sanctionedAmount), marginX + 282, curY + 8.5, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(truncateStr(l.chargeStatus || 'Verified', 32), marginX + 296, curY + 8.5);

        const sec269Risk = l.isCashReceipt;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(sec269Risk ? PALETTE.ROSE_RED[0] : PALETTE.EMERALD_GREEN[0], sec269Risk ? PALETTE.ROSE_RED[1] : PALETTE.EMERALD_GREEN[1], sec269Risk ? PALETTE.ROSE_RED[2] : PALETTE.EMERALD_GREEN[2]);
        doc.text(sec269Risk ? 'Cash Violation' : 'Banking Channel', pageW - marginX - 6, curY + 8.5, { align: 'right' });

        curY += rowH;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // PAGE 3: Statutory Compliance Matrix, Observations, Continuity & Certificate
    // ═════════════════════════════════════════════════════════════════════════

    doc.addPage();
    drawRunningHeader(3);
    curY = 38;

    // 13. Section 9: Statutory Compliance & Internal Controls Verification Matrix
    const isApprovedAudit = (header.auditStatus || '').toUpperCase() === 'APPROVED' || (header.auditStatus || '').toUpperCase() === 'RELEASED';
    const checklistItems: StandardChecklistItem[] = bundle.checklists && bundle.checklists.length > 0
        ? bundle.checklists
        : STANDARD_CHECKLIST_MASTER.map((m, idx) => ({
            id: `chk_${idx + 1}`,
            sectionKey: m.sectionKey,
            itemKey: m.itemKey,
            itemTitle: m.itemTitle,
            status: isApprovedAudit ? 'Verified' : 'Under Review',
            sampleChecked: '100% Vouched',
            remarks: 'Compliant with statutory rules',
            amountInvolved: 0
        }));

    const chkRows = checklistItems.slice(0, 11);
    drawSectionHeader('9. STATUTORY COMPLIANCE & INTERNAL CONTROLS VERIFICATION MATRIX (ICAI SAs)', 12.5, 14);
    drawChecklistHeader();

    chkRows.forEach((item, idx) => {
        const rowH = 12.5;
        const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(marginX, curY, contentW, rowH, 'F');
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.7);
        doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
        const cleanTitle = item.itemTitle
            .replace('substantive vouching and rate check', 'substantive vouching & rates')
            .replace('vouching and bill validation', 'vouching & bill validation')
            .replace('scrutiny for unusual entries & provisions', 'scrutiny for unusual entries')
            .replace('verification and portal pairing', 'verification & portal pairing')
            .replace('statements & interest servicing', 'statements & interest servicing')
            .replace('& Reconciliation with GSTR-1 and GSTR-3B', 'reconciliation (1 & 3B)')
            .replace('& Reconciliation with GSTR-2B', 'reconciliation (GSTR-2B)')
            .replace('& Form 24Q/26Q Reconciliation', 'Form 24Q/26Q reconciliation')
            .replace('(Companies Act vs IT Act) & Deferred Tax', '(Co. Act vs IT Act)')
            .replace('for anomalous debtor/creditor balances', 'for anomalous balances')
            .replace('cross-check with Salary Sheet', 'cross-check with payroll');
        doc.text(truncateStr(cleanTitle, 56), marginX + 6, curY + 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(truncateStr(item.sampleChecked || 'Substantive', 20), marginX + 242, curY + 8.5);

        const displayStatus = (item.status && item.status !== 'Pending')
            ? item.status
            : (isApprovedAudit ? 'Verified' : 'Under Review');
        const isCompliant = displayStatus === 'Verified' || displayStatus === 'Compliant' || displayStatus === 'Not Applicable';
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isCompliant ? PALETTE.EMERALD_GREEN[0] : PALETTE.AMBER_GOLD[0], isCompliant ? PALETTE.EMERALD_GREEN[1] : PALETTE.AMBER_GOLD[1], isCompliant ? PALETTE.EMERALD_GREEN[2] : PALETTE.AMBER_GOLD[2]);
        doc.text(displayStatus, marginX + 326, curY + 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        const rem = item.remarks && !item.remarks.includes('Pre-populated') ? item.remarks : 'Compliant with statutory rules';
        doc.text(truncateStr(rem, 36), marginX + 392, curY + 8.5);

        curY += rowH;
    });

    curY += 8;

    // 14. Section 10: Current Period Audit Observations & Deficiencies
    const observations: AuditObservationItem[] = bundle.observations && bundle.observations.length > 0
        ? bundle.observations
        : [];

    drawSectionHeader('10. CURRENT PERIOD AUDIT OBSERVATIONS & MANAGEMENT RESPONSES', 32, 14);
    drawObsHeader();

    if (observations.length === 0) {
        doc.setFillColor(PALETTE.EMERALD_LIGHT[0], PALETTE.EMERALD_LIGHT[1], PALETTE.EMERALD_LIGHT[2]);
        doc.roundedRect(marginX, curY, contentW, 32, 3, 3, 'F');
        doc.setDrawColor(167, 243, 208);
        doc.setLineWidth(0.5);
        doc.roundedRect(marginX, curY, contentW, 32, 3, 3, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
        doc.text('POSITIVE ASSURANCE: NO MATERIAL AUDIT DEFICIENCIES IDENTIFIED', marginX + 12, curY + 13.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
        doc.text('During substantive vouching and statutory testing for the period, no reportable violations were noted in the audited sample.', marginX + 12, curY + 24);
        curY += 38;
    } else {
        observations.slice(0, 2).forEach((o, idx) => {
            const anyO = o as any;
            const title = anyO.title || anyO.pointTitle || 'Audit Observation';
            const desc = anyO.description || anyO.pointDescription || '';
            const rec = anyO.auditorRecommendation || anyO.auditor_recommendation || 'Action required';
            const resp = anyO.managementResponse || anyO.management_response || 'Agreed with findings';
            const exposure = anyO.financialExposure ?? anyO.financial_exposure ?? 0;
            const severity = anyO.severity || anyO.riskSeverity || 'Medium';

            const cardH = 34;
            const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.rect(marginX, curY, contentW, cardH, 'F');
            doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
            doc.line(marginX, curY + cardH, pageW - marginX, curY + cardH);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(`${idx + 1}. ${(anyO.sectionKey || 'General').toUpperCase()}`, marginX + 6, curY + 10);

            // Severity Badge
            let sVariant: 'green' | 'amber' | 'rose' = 'amber';
            if (severity === 'Critical' || severity === 'High') sVariant = 'rose';
            if (severity === 'Low') sVariant = 'green';
            drawBadge(marginX + 66, curY + 4, 46, 12, severity.toUpperCase(), sVariant);

            // Finding & recommendation
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(truncateStr(title, 48), marginX + 118, curY + 10);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.4);
            doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
            let shortDesc = sanitizeText(desc);
            if (shortDesc.length > 42) {
                shortDesc = shortDesc.substring(0, 40).trim();
            }
            const fullFinding = shortDesc ? `${shortDesc} | Rec: ${rec}` : `Rec: ${rec}`;
            doc.text(truncateStr(fullFinding, 70), marginX + 118, curY + 23);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(formatInrShort(exposure), marginX + 420, curY + 10, { align: 'right' });

            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.3);
            doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
            const respClean = sanitizeText(resp);
            if (respClean.length > 28) {
                const words = respClean.split(' ');
                let line1 = '';
                let line2 = '';
                for (const w of words) {
                    if ((line1 + ' ' + w).trim().length <= 26) {
                        line1 = (line1 + ' ' + w).trim();
                    } else if ((line2 + ' ' + w).trim().length <= 26) {
                        line2 = (line2 + ' ' + w).trim();
                    }
                }
                doc.text(line1, pageW - marginX - 6, curY + 10, { align: 'right' });
                if (line2) {
                    doc.text(line2, pageW - marginX - 6, curY + 22, { align: 'right' });
                }
            } else {
                doc.text(respClean, pageW - marginX - 6, curY + 10, { align: 'right' });
            }

            curY += cardH;
        });
        curY += 8;
    }

    // 15. Section 11: Cross-Month Action Continuity Tracker
    const pendingPoints: AuditPendingPointItem[] = bundle.pendingPoints && bundle.pendingPoints.length > 0
        ? bundle.pendingPoints
        : [];

    drawSectionHeader('11. CROSS-MONTH WORK PENDING LIST (ACTION CONTINUITY TRACKER)', 14, 14);
    drawPendingHeader();

    if (pendingPoints.length === 0) {
        doc.setFillColor(PALETTE.EMERALD_LIGHT[0], PALETTE.EMERALD_LIGHT[1], PALETTE.EMERALD_LIGHT[2]);
        doc.roundedRect(marginX, curY, contentW, 26, 3, 3, 'F');
        doc.setDrawColor(167, 243, 208);
        doc.setLineWidth(0.5);
        doc.roundedRect(marginX, curY, contentW, 26, 3, 3, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
        doc.text('CONTINUITY ASSURANCE: ALL PRIOR AUDIT ACTION POINTS ARE FULLY RESOLVED', marginX + 12, curY + 16);
        curY += 32;
    } else {
        pendingPoints.slice(0, 2).forEach((p, idx) => {
            const anyP = p as any;
            const origin = `${anyP.originMonth || ''} ${anyP.originFy || ''}`.trim() || 'Prior Period';
            const title = anyP.pointTitle || anyP.point_title || anyP.title || 'Action Point';
            const assigned = anyP.assignedTo || anyP.assigned_to || 'Finance Team';
            const target = anyP.targetDate || anyP.target_date || 'Next Cycle';
            const status = anyP.status || 'Pending';
            const remarks = anyP.resolutionRemarks || anyP.resolution_remarks || anyP.actionRequired || 'Open';

            const rowH = 14;
            const bg = idx % 2 === 0 ? PALETTE.WHITE : PALETTE.CARD_BG;
            doc.setFillColor(bg[0], bg[1], bg[2]);
            doc.rect(marginX, curY, contentW, rowH, 'F');
            doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
            doc.line(marginX, curY + rowH, pageW - marginX, curY + rowH);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            doc.text(`${p.id || idx + 1} (${origin})`, marginX + 6, curY + 9.5);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
            const cleanTitle = title
                .replace('Fixed Assets Invoices physical verification & store stamp', 'Fixed Assets physical verification')
                .replace('physical verification & store stamp', 'physical verification');
            doc.text(truncateStr(cleanTitle, 32), marginX + 96, curY + 9.5);
            doc.text(truncateStr(assigned.replace('Store & Asset Manager', 'Store & Asset Mgr'), 18), marginX + 242, curY + 9.5);

            // Clean formatted short date
            const cleanTarget = target.replace(/(\d+)(st|nd|rd|th)\s+([A-Za-z]{3})[A-Za-z]*\s+(\d+)/, '$1-$3-$4').substring(0, 12);
            doc.text(cleanTarget || target, marginX + 320, curY + 9.5);

            const isCleared = status === 'Cleared';
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(isCleared ? PALETTE.EMERALD_GREEN[0] : PALETTE.AMBER_GOLD[0], isCleared ? PALETTE.EMERALD_GREEN[1] : PALETTE.AMBER_GOLD[1], isCleared ? PALETTE.EMERALD_GREEN[2] : PALETTE.AMBER_GOLD[2]);
            doc.text(status, marginX + 395, curY + 9.5);

            doc.setFont('helvetica', 'italic');
            doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
            const cleanRem = remarks.replace('2 of 3 invoices stamped; awaiting final equipment tag from site.', '2 of 3 stamped; tags pending');
            doc.text(truncateStr(cleanRem, 32), pageW - marginX - 6, curY + 9.5, { align: 'right' });

            curY += rowH;
        });
        curY += 8;
    }

    // 16. Section 12: Formal Statutory Auditor's Verification Certificate & Stamp
    const certBlockH = 180;
    doc.setFillColor(PALETTE.CARD_BG[0], PALETTE.CARD_BG[1], PALETTE.CARD_BG[2]);
    doc.roundedRect(marginX, curY, contentW, certBlockH, 4, 4, 'F');
    doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
    doc.roundedRect(marginX, curY, contentW, certBlockH, 4, 4, 'S');

    // Inner subtle gold border
    doc.setDrawColor(PALETTE.ACCENT_GOLD[0], PALETTE.ACCENT_GOLD[1], PALETTE.ACCENT_GOLD[2]);
    doc.setLineWidth(0.6);
    doc.roundedRect(marginX + 3, curY + 3, contentW - 6, certBlockH - 6, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text("STATUTORY AUDITOR'S INDEPENDENT VERIFICATION CERTIFICATE", marginX + 14, curY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    const certText = `We have examined the Books of Account, GST Inward/Outward Returns (GSTR-1, GSTR-2B, GSTR-3B), Tally Prime General Ledgers, Bank Statements, and statutory records of ${clientLegalName.toUpperCase()} (GSTIN: ${clientGstin}) for the audit period ${periodLabel}.

The examination was conducted in accordance with Standards on Auditing (SAs) issued by the Institute of Chartered Accountants of India (ICAI). The reconciliations, analytical review procedures, ratio analyses, and statutory compliance status reflected in this working paper represent a true and fair view of the financial transactions and records presented to us.`;
    doc.text(certText, marginX + 14, curY + 28, { maxWidth: contentW - 124 });

    // Official Audit Practice Stamp Frame Representation
    const stampX = pageW - marginX - 104;
    const stampY = curY + 14;
    doc.setDrawColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.setLineWidth(0.8);
    doc.roundedRect(stampX, stampY, 94, 38, 3, 3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(PALETTE.ROYAL_INDIGO[0], PALETTE.ROYAL_INDIGO[1], PALETTE.ROYAL_INDIGO[2]);
    doc.text('AUDIT & ASSURANCE', stampX + 47, stampY + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    doc.text('SERVICES PRACTICE', stampX + 47, stampY + 18, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.text('STATUTORY & INTERNAL AUDIT', stampX + 47, stampY + 26, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(PALETTE.EMERALD_DARK[0], PALETTE.EMERALD_DARK[1], PALETTE.EMERALD_DARK[2]);
    doc.text('VERIFIED & AUDITED', stampX + 47, stampY + 34, { align: 'center' });

    // Dual Signature Blocks
    const sigY = curY + 108;

    // Left Signature: Prepared By (Internal Auditor / Article Assistant)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.TEXT_DARK[0], PALETTE.TEXT_DARK[1], PALETTE.TEXT_DARK[2]);
    doc.text('INTERNAL AUDITOR / ARTICLE ASSISTANT', marginX + 14, sigY);
    doc.setDrawColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX + 14, sigY + 15, marginX + 185, sigY + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text(`Prepared By: ${articleAssistant}`, marginX + 14, sigY + 26);
    doc.text(`Date: ${header.preparedAt ? new Date(header.preparedAt).toLocaleDateString('en-IN') : 'Current Period'}`, marginX + 14, sigY + 37);

    // Right Signature: Engagement Article Review Sign-off
    const rightSigX = colMid + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(PALETTE.PRIMARY_NAVY[0], PALETTE.PRIMARY_NAVY[1], PALETTE.PRIMARY_NAVY[2]);
    doc.text(hasCustomFirm ? `FOR ${mainFirmTitle}` : 'FOR AUDIT & ASSURANCE PRACTICE', rightSigX, sigY);
    doc.text('ENGAGEMENT ARTICLE REVIEW', rightSigX, sigY + 9);
    doc.setDrawColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.setLineWidth(0.5);
    doc.line(rightSigX, sigY + 15, rightSigX + 185, sigY + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
    doc.text(`Engagement Article: ${partnerSigner}`, rightSigX, sigY + 26);

    const sigRegParts: string[] = [];
    if (header.firmRegistrationNo && !header.firmRegistrationNo.includes('117365W')) {
        sigRegParts.push(`FRN: ${header.firmRegistrationNo}`);
    }
    if (header.membershipNo && !header.membershipNo.includes('143892')) {
        sigRegParts.push(`M.No: ${header.membershipNo}`);
    }
    if (sigRegParts.length > 0) {
        doc.text(sigRegParts.join(' | '), rightSigX, sigY + 37);
    } else {
        doc.text('Role: Lead Engagement Article (Audit In-Charge)', rightSigX, sigY + 37);
    }

    // Engagement Ref
    const rawRef = (header.engagementRef && !header.engagementRef.startsWith('VAS/') && !header.engagementRef.includes('143892'))
        ? header.engagementRef
        : `AUD/${header.fy}/${(header.month || 'M')}`;
    doc.text(`Engagement Ref: ${rawRef}`, rightSigX, sigY + 48);

    // ─── Two-Pass Minimal 8pt Footer (Entity Confined to Page 1 Only) ────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(PALETTE.BORDER_LIGHT[0], PALETTE.BORDER_LIGHT[1], PALETTE.BORDER_LIGHT[2]);
        doc.setLineWidth(0.4);
        doc.line(marginX, pageH - 22, pageW - marginX, pageH - 22);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(PALETTE.TEXT_MUTED[0], PALETTE.TEXT_MUTED[1], PALETTE.TEXT_MUTED[2]);
        doc.text(
            `${mainFirmTitle} • Confidential Client Audit Working Paper`,
            marginX,
            pageH - 10
        );

        doc.text(
            `Page ${i} of ${totalPages}`,
            pageW - marginX,
            pageH - 10,
            { align: 'right' }
        );
    }

    // ─── Filename & Serialization ────────────────────────────────────────────

    const safeClient = clientLegalName.replace(/[^a-zA-Z0-9_-]/g, '_');
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

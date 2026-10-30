/**
 * gstr3bPdf.ts — Professional CA GSTR-3B Monthly Working Sheet PDF Generator
 * 
 * Generates an executive, audit-ready landscape PDF report for the selected month's
 * GSTR-3B tax computations, Table 3.1 outward liabilities, Table 4 eligible ITC,
 * Rule 88A statutory set-off cascade, and Section 49(4) cash settlement.
 */

import { jsPDF } from 'jspdf';
import { GSTR3BMonthData, GSTR3BClientProfile } from './gstr3bEngine';

interface TableRowItem {
  section: string;
  particulars: string;
  taxable?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  total?: number | string;
  isSectionHeader?: boolean;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  accentColor?: [number, number, number];
}

const formatInr = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '-';
  if (typeof val === 'string') return val;
  if (val === 0) return '0.00';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

export interface ExportPdfOptions {
  customFileName?: string;
  autoDownload?: boolean;
}

export interface ExportPdfResult {
  doc: jsPDF;
  fileName: string;
  blob: Blob;
  base64: string;
}

export function exportGstr3bMonthPdf(
  monthData: GSTR3BMonthData,
  profile: GSTR3BClientProfile,
  options?: ExportPdfOptions
): ExportPdfResult {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth(); // 841.89 pt
  const pageH = doc.internal.pageSize.getHeight(); // 595.28 pt
  const marginX = 36;
  const contentW = pageW - marginX * 2; // ~769.89 pt

  // Palette
  const cDark: [number, number, number] = [15, 23, 42]; // Slate 900
  const cNavy: [number, number, number] = [30, 41, 59]; // Slate 800
  const cHeaderBg: [number, number, number] = [24, 24, 27]; // Zinc 900
  const cLightBg: [number, number, number] = [248, 250, 252]; // Slate 50
  const cBorder: [number, number, number] = [226, 232, 240]; // Slate 200
  const cTextMuted: [number, number, number] = [100, 116, 139]; // Slate 500
  const cTextDark: [number, number, number] = [30, 41, 59]; // Slate 800

  // Section Accents
  const cOutward: [number, number, number] = [37, 99, 235]; // Blue 600
  const cInward: [number, number, number] = [16, 185, 129]; // Emerald 500
  const cSetoff: [number, number, number] = [217, 119, 6]; // Amber 600
  const cCash: [number, number, number] = [225, 29, 72]; // Rose 600
  const cPurple: [number, number, number] = [124, 58, 237]; // Purple 600

  // Column Layout (Total = 770 pt)
  const cols = [
    { key: 'section', label: 'Section', width: 75, align: 'left' as const },
    { key: 'particulars', label: 'Particulars / Statutory Head', width: 220, align: 'left' as const },
    { key: 'taxable', label: 'Taxable (Rs.)', width: 95, align: 'right' as const },
    { key: 'cgst', label: 'CGST (Rs.)', width: 95, align: 'right' as const },
    { key: 'sgst', label: 'SGST (Rs.)', width: 95, align: 'right' as const },
    { key: 'igst', label: 'IGST (Rs.)', width: 95, align: 'right' as const },
    { key: 'total', label: 'Total Tax (Rs.)', width: 95, align: 'right' as const },
  ];

  let currentY = 0;

  // Build Table Data
  const out = monthData.outward;
  const inw = monthData.inward;
  const setoff = monthData.setoff;
  const stl = monthData.settlement;

  const rows: TableRowItem[] = [
    // ── SECTION 1: OUTWARD SUPPLY ──
    {
      section: 'TABLE 3.1 & 3.2',
      particulars: '1. OUTWARD SUPPLY & TAX LIABILITY (Table 3.1 & 3.2)',
      isSectionHeader: true,
      accentColor: cOutward,
    },
    { section: '3.1(a)', particulars: 'Sales (B2B Taxable)', taxable: out.b2b.taxable, cgst: out.b2b.cgst, sgst: out.b2b.sgst, igst: out.b2b.igst, total: out.b2b.total },
    { section: '3.1(a)', particulars: 'Sales (B2C Others)', taxable: out.b2c.taxable, cgst: out.b2c.cgst, sgst: out.b2c.sgst, igst: out.b2c.igst, total: out.b2c.total },
    { section: '3.1(b)', particulars: 'SEZ Supply With Payment of Tax', taxable: out.sezWithPayment.taxable, cgst: out.sezWithPayment.cgst, sgst: out.sezWithPayment.sgst, igst: out.sezWithPayment.igst, total: out.sezWithPayment.total },
    { section: '3.1(b)', particulars: 'SEZ Supply Without Payment of Tax', taxable: out.sezWithoutPayment.taxable, cgst: out.sezWithoutPayment.cgst, sgst: out.sezWithoutPayment.sgst, igst: out.sezWithoutPayment.igst, total: out.sezWithoutPayment.total },
    { section: '3.1(b)', particulars: 'Zero Rated Supply / Export', taxable: out.zeroRated.taxable, cgst: out.zeroRated.cgst, sgst: out.zeroRated.sgst, igst: out.zeroRated.igst, total: out.zeroRated.total },
    { section: '3.1(c)', particulars: 'Nil Rated Supply', taxable: out.nilRated.taxable, cgst: out.nilRated.cgst, sgst: out.nilRated.sgst, igst: out.nilRated.igst, total: out.nilRated.total },
    { section: '3.1(c)', particulars: 'Exempt Sale', taxable: out.exempt.taxable, cgst: out.exempt.cgst, sgst: out.exempt.sgst, igst: out.exempt.igst, total: out.exempt.total },
    { section: '3.1(a)', particulars: 'Advances Collected for Services', taxable: out.advanceReceived.taxable, cgst: out.advanceReceived.cgst, sgst: out.advanceReceived.sgst, igst: out.advanceReceived.igst, total: out.advanceReceived.total },
    { section: '3.1(a)', particulars: 'Rent Received', taxable: out.rentReceived.taxable, cgst: out.rentReceived.cgst, sgst: out.rentReceived.sgst, igst: out.rentReceived.igst, total: out.rentReceived.total },
    { section: '3.1(a)', particulars: '(+) Sale Increased through Amendment', taxable: out.saleIncreaseAmendment?.taxable, cgst: out.saleIncreaseAmendment?.cgst, sgst: out.saleIncreaseAmendment?.sgst, igst: out.saleIncreaseAmendment?.igst, total: out.saleIncreaseAmendment?.total },
    { section: '3.1 Adj', particulars: '(-) Sale Decreased through Amendment', taxable: out.saleDecreaseAmendment?.taxable, cgst: out.saleDecreaseAmendment?.cgst, sgst: out.saleDecreaseAmendment?.sgst, igst: out.saleDecreaseAmendment?.igst, total: out.saleDecreaseAmendment?.total },
    { section: '3.1 Adj', particulars: '(-) Credit Note', taxable: out.creditNote.taxable, cgst: out.creditNote.cgst, sgst: out.creditNote.sgst, igst: out.creditNote.igst, total: out.creditNote.total },
    { section: '3.1 Adj', particulars: '(-) Advances Settled Against Services', taxable: out.advanceAdjusted.taxable, cgst: out.advanceAdjusted.cgst, sgst: out.advanceAdjusted.sgst, igst: out.advanceAdjusted.igst, total: out.advanceAdjusted.total },
    {
      section: 'Subtotal',
      particulars: 'Total Sale as per Working',
      taxable: out.totalSaleWorking.taxable,
      cgst: out.totalSaleWorking.cgst,
      sgst: out.totalSaleWorking.sgst,
      igst: out.totalSaleWorking.igst,
      total: out.totalSaleWorking.total,
      isSubtotal: true,
    },
    { section: '3.1(d)', particulars: 'Reverse Charge on Inward Supplies (Total RCM)', taxable: out.rcmInward.taxable, cgst: out.rcmInward.cgst, sgst: out.rcmInward.sgst, igst: out.rcmInward.igst, total: out.rcmInward.total },
    ...(out.rcmTransport && (out.rcmTransport.taxable || out.rcmTransport.total) ? [
      { section: 'RCM 5%', particulars: '  • RCM on Transport Charges 5%', taxable: out.rcmTransport.taxable, cgst: out.rcmTransport.cgst, sgst: out.rcmTransport.sgst, igst: out.rcmTransport.igst, total: out.rcmTransport.total }
    ] : []),
    ...(out.rcmSecurity && (out.rcmSecurity.taxable || out.rcmSecurity.total) ? [
      { section: 'RCM 18%', particulars: '  • RCM on Security Charges 18%', taxable: out.rcmSecurity.taxable, cgst: out.rcmSecurity.cgst, sgst: out.rcmSecurity.sgst, igst: out.rcmSecurity.igst, total: out.rcmSecurity.total }
    ] : []),
    ...(out.rcmGuestHouse && (out.rcmGuestHouse.taxable || out.rcmGuestHouse.total) ? [
      { section: 'RCM 18%', particulars: '  • RCM on Guest House Charges 18%', taxable: out.rcmGuestHouse.taxable, cgst: out.rcmGuestHouse.cgst, sgst: out.rcmGuestHouse.sgst, igst: out.rcmGuestHouse.igst, total: out.rcmGuestHouse.total }
    ] : []),
    ...(out.rcmAdvocate && (out.rcmAdvocate.taxable || out.rcmAdvocate.total) ? [
      { section: 'RCM 18%', particulars: '  • RCM on Advocate Charges 18%', taxable: out.rcmAdvocate.taxable, cgst: out.rcmAdvocate.cgst, sgst: out.rcmAdvocate.sgst, igst: out.rcmAdvocate.igst, total: out.rcmAdvocate.total }
    ] : []),
    {
      section: 'Portal 3.1',
      particulars: '(A) Total Sale as per Working including Reverse Charge',
      taxable: out.totalSalePortal.taxable,
      cgst: out.totalSalePortal.cgst,
      sgst: out.totalSalePortal.sgst,
      igst: out.totalSalePortal.igst,
      total: out.totalSalePortal.total,
      isSubtotal: true,
      accentColor: cOutward,
    },

    // ── SECTION 2: INWARD SUPPLIES & ITC ──
    {
      section: 'TABLE 4',
      particulars: '2. INWARD SUPPLIES & INPUT TAX CREDIT (Table 4)',
      isSectionHeader: true,
      accentColor: cInward,
    },
    { section: 'Books', particulars: 'ITC (As per books)', taxable: '-', cgst: '-', sgst: '-', igst: '-', total: inw.itcBooks },
    { section: '4(A)(5)', particulars: 'ITC as per GSTR 2B', taxable: inw.itc2b.taxable, cgst: inw.itc2b.cgst, sgst: inw.itc2b.sgst, igst: inw.itc2b.igst, total: inw.itc2b.total },
    { section: '4(A)(1)', particulars: '(+) Import purchase (Table 4(A)(1))', taxable: inw.importGoods?.taxable, cgst: inw.importGoods?.cgst, sgst: inw.importGoods?.sgst, igst: inw.importGoods?.igst, total: inw.importGoods?.total },
    { section: '4(A)(3)', particulars: '(+) RCM paid on Inward Supplies (Table 4(A)(3))', taxable: inw.rcmPaid.taxable, cgst: inw.rcmPaid.cgst, sgst: inw.rcmPaid.sgst, igst: inw.rcmPaid.igst, total: inw.rcmPaid.total },
    { section: '4(A) Notes', particulars: '(+) Credit Notes', taxable: inw.creditNotes?.taxable, cgst: inw.creditNotes?.cgst, sgst: inw.creditNotes?.sgst, igst: inw.creditNotes?.igst, total: inw.creditNotes?.total },
    { section: 'Opening', particulars: '(+) Opening Credit Balance (B/F from previous month)', taxable: '-', cgst: inw.openingCreditBal.cgst, sgst: inw.openingCreditBal.sgst, igst: inw.openingCreditBal.igst, total: inw.openingCreditBal.total },
    { section: '4(B) Adj', particulars: '(-) Debit Notes', taxable: '-', cgst: inw.debitNotes.cgst, sgst: inw.debitNotes.sgst, igst: inw.debitNotes.igst, total: inw.debitNotes.total },
    { section: '4(B)(1)', particulars: '(-) Permanent Reversal [Rule 38/42/43/17(5)]', taxable: inw.itcReversed?.taxable || '-', cgst: inw.itcReversed?.cgst || 0, sgst: inw.itcReversed?.sgst || 0, igst: inw.itcReversed?.igst || 0, total: inw.itcReversed?.total || 0 },
    { section: '4(B)(2)', particulars: '(-) Temporary Reversal [Rule 37 / 180 Days / Others]', taxable: inw.itcReversedOther?.taxable || '-', cgst: inw.itcReversedOther?.cgst || 0, sgst: inw.itcReversedOther?.sgst || 0, igst: inw.itcReversedOther?.igst || 0, total: inw.itcReversedOther?.total || 0 },
    {
      section: 'Table 4 Tot',
      particulars: '(B) Total ITC Available for Set off',
      taxable: inw.totalItcAvailable.taxable || '-',
      cgst: inw.totalItcAvailable.cgst,
      sgst: inw.totalItcAvailable.sgst,
      igst: inw.totalItcAvailable.igst,
      total: inw.totalItcAvailable.total,
      isSubtotal: true,
      accentColor: cInward,
    },

    // ── SECTION 3: STATUTORY SET-OFF ──
    {
      section: 'TABLE 6.1',
      particulars: '3. STATUTORY SET-OFF & UTILIZATION (Table 6.1 / Rule 88A)',
      isSectionHeader: true,
      accentColor: cSetoff,
    },
    { section: 'Raw Setoff', particulars: '(A-B) Payable before Adjustment', taxable: '-', cgst: setoff.rawPayable.cgst, sgst: setoff.rawPayable.sgst, igst: setoff.rawPayable.igst, total: setoff.rawPayable.total },
    { section: 'Rule 88A', particulars: '(-) Adjustment (Rule 88A IGST Set-off vs CGST/SGST)', taxable: '-', cgst: setoff.adjustment.cgst, sgst: setoff.adjustment.sgst, igst: setoff.adjustment.igst, total: setoff.adjustment.total },
    { section: 'TDS/TCS Cash', particulars: '(-) GST TDS/TCS Opening Cash Balance', taxable: '-', cgst: stl.tdsTcsOpeningCash?.cgst || 0, sgst: stl.tdsTcsOpeningCash?.sgst || 0, igst: stl.tdsTcsOpeningCash?.igst || 0, total: stl.tdsTcsOpeningCash?.total || 0 },
    {
      section: 'Outward Cash',
      particulars: 'Final Liability Payable',
      taxable: '-',
      cgst: setoff.payableAfterAdjustment.cgst,
      sgst: setoff.payableAfterAdjustment.sgst,
      igst: setoff.payableAfterAdjustment.igst,
      total: setoff.payableAfterAdjustment.total,
      isSubtotal: true,
      accentColor: cSetoff,
    },
    {
      section: 'Credit C/F',
      particulars: 'Balance C/f to next month (Surplus ITC)',
      taxable: '-',
      cgst: setoff.balanceCfNextMonth.cgst,
      sgst: setoff.balanceCfNextMonth.sgst,
      igst: setoff.balanceCfNextMonth.igst,
      total: setoff.balanceCfNextMonth.total,
      isSubtotal: true,
      accentColor: cInward,
    },

    // ── SECTION 4: CASH SETTLEMENT ──
    {
      section: 'CASH SEC',
      particulars: '4. MANDATORY CASH PAYMENTS & FINAL BALANCE',
      isSectionHeader: true,
      accentColor: cCash,
    },
    { section: 'Sec 49(4)', particulars: 'RCM Payable (Mandatory Cash Ledger - No ITC)', taxable: '-', cgst: stl.rcmPayable.cgst, sgst: stl.rcmPayable.sgst, igst: stl.rcmPayable.igst, total: stl.rcmPayable.total },
    { section: 'Statutory', particulars: 'Late Fees (CGST + SGST)', taxable: '-', cgst: stl.lateFees.cgst, sgst: stl.lateFees.sgst, igst: '-', total: stl.lateFees.total },
    { section: 'Sec 50', particulars: 'Interest on Delayed Tax (CGST + SGST + IGST)', taxable: '-', cgst: stl.interest.cgst, sgst: stl.interest.sgst, igst: stl.interest.igst, total: stl.interest.total },
    { section: 'Challan', particulars: '(-) GST Paid Through Cash (PMT-06 Challan)', taxable: '-', cgst: stl.gstPaidThroughCash.cgst, sgst: stl.gstPaidThroughCash.sgst, igst: stl.gstPaidThroughCash.igst, total: stl.gstPaidThroughCash.total },
    {
      section: 'NET CASH',
      particulars: 'Balance Payable if any (Net Cash Outflow)',
      taxable: '-',
      cgst: stl.balancePayable.cgst,
      sgst: stl.balancePayable.sgst,
      igst: stl.balancePayable.igst,
      total: stl.balancePayable.total,
      isGrandTotal: true,
      accentColor: cPurple,
    },
  ];

  // Helper: Draw running page header
  const drawPageHeader = (pageNumber: number) => {
    // Top banner
    doc.setFillColor(cDark[0], cDark[1], cDark[2]);
    doc.rect(0, 0, pageW, 40, 'F');

    // Accent Stripe
    doc.setFillColor(cPurple[0], cPurple[1], cPurple[2]);
    doc.rect(0, 40, pageW, 2.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('AUDIT WITH VASWANI — GSTR-3B WORKING STATEMENT', marginX, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text(
      `Period: ${monthData.month.toUpperCase()} ${monthData.year}  |  FY: ${profile.financialYear || '2025-26'}`,
      marginX,
      33
    );

    const metaRight = `Client: ${profile.firmName || 'N/A'}  |  GSTIN: ${profile.gstin || 'N/A'}`;
    doc.text(metaRight, pageW - marginX, 22, { align: 'right' });

    const genTimestamp = `Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(genTimestamp, pageW - marginX, 33, { align: 'right' });

    currentY = 48;
  };

  // Helper: Draw Top KPI Cards on Page 1
  const drawKpiCards = () => {
    const kpiY = currentY;
    const cardH = 34;
    const gap = 8;
    const numCards = 6;
    const cardW = (contentW - gap * (numCards - 1)) / numCards;

    const kpis = [
      {
        title: 'OUTWARD SALE',
        val: formatInr(out.totalSaleWorking.taxable),
        sub: `Tax: ${formatInr(out.totalSaleWorking.total)}`,
        borderColor: cOutward,
      },
      {
        title: '2B AVAILABLE ITC',
        val: formatInr(inw.totalItcAvailable.total),
        sub: `B/F: ${formatInr(inw.openingCreditBal.total)}`,
        borderColor: cInward,
      },
      {
        title: 'NET OUTWARD TAX',
        val: formatInr(setoff.payableAfterAdjustment.total),
        sub: 'Post Rule 88A',
        borderColor: cSetoff,
      },
      {
        title: 'SURPLUS ITC C/F',
        val: formatInr(setoff.balanceCfNextMonth.total),
        sub: 'Next Month Credit',
        borderColor: cInward,
      },
      {
        title: 'RCM CASH TAX',
        val: formatInr(stl.rcmPayable.total),
        sub: 'Sec 49(4) Cash',
        borderColor: cCash,
      },
      {
        title: 'NET CASH OUTFLOW',
        val: formatInr(stl.balancePayable.total),
        sub: 'Final Payable',
        borderColor: cPurple,
        isHighlight: true,
      },
    ];

    kpis.forEach((kpi, idx) => {
      const cx = marginX + idx * (cardW + gap);

      // Card Background
      if (kpi.isHighlight) {
        doc.setFillColor(243, 232, 255); // Purple 100
      } else {
        doc.setFillColor(248, 250, 252); // Slate 50
      }
      doc.roundedRect(cx, kpiY, cardW, cardH, 3, 3, 'F');

      // Border
      doc.setDrawColor(kpi.borderColor[0], kpi.borderColor[1], kpi.borderColor[2]);
      doc.setLineWidth(kpi.isHighlight ? 1.2 : 0.6);
      doc.roundedRect(cx, kpiY, cardW, cardH, 3, 3, 'S');

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(kpi.borderColor[0], kpi.borderColor[1], kpi.borderColor[2]);
      doc.text(kpi.title, cx + 5, kpiY + 9);

      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(cDark[0], cDark[1], cDark[2]);
      doc.text(kpi.val, cx + 5, kpiY + 20);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(cTextMuted[0], cTextMuted[1], cTextMuted[2]);
      doc.text(kpi.sub, cx + 5, kpiY + 29);
    });

    currentY += cardH + 10;
  };

  // Helper: Draw Table Columns Header
  const drawTableHeader = () => {
    const rowH = 17;
    doc.setFillColor(cNavy[0], cNavy[1], cNavy[2]);
    doc.rect(marginX, currentY, contentW, rowH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let x = marginX;
    cols.forEach(col => {
      if (col.align === 'left') {
        doc.text(col.label, x + 5, currentY + 11.5);
      } else {
        doc.text(col.label, x + col.width - 5, currentY + 11.5, { align: 'right' });
      }
      x += col.width;
    });

    currentY += rowH;
  };

  // Page 1 initial render
  drawPageHeader(1);
  drawKpiCards();
  drawTableHeader();

  // Draw Table Rows
  const rowHeight = 12.8;
  const sectionHeaderHeight = 15;

  rows.forEach((row, rowIndex) => {
    // Check page break
    const requiredH = row.isSectionHeader ? sectionHeaderHeight + rowHeight : rowHeight;
    if (currentY + requiredH > pageH - 45) {
      doc.addPage();
      drawPageHeader(doc.getNumberOfPages());
      drawTableHeader();
    }

    if (row.isSectionHeader) {
      // Section Banner
      const accent = row.accentColor || cNavy;
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(marginX, currentY, contentW, sectionHeaderHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(row.particulars.toUpperCase(), marginX + 6, currentY + 10.5);

      currentY += sectionHeaderHeight;
      return;
    }

    // Row Background
    if (row.isGrandTotal) {
      const accent = row.accentColor || cPurple;
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(marginX, currentY, contentW, rowHeight, 'F');
    } else if (row.isSubtotal) {
      doc.setFillColor(241, 245, 249); // Slate 100
      doc.rect(marginX, currentY, contentW, rowHeight, 'F');
      // Subtotal Top/Bottom border lines
      doc.setDrawColor(203, 213, 225); // Slate 300
      doc.setLineWidth(0.5);
      doc.line(marginX, currentY, marginX + contentW, currentY);
      doc.line(marginX, currentY + rowHeight, marginX + contentW, currentY + rowHeight);
    } else {
      // Zebra striping
      if (rowIndex % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(cLightBg[0], cLightBg[1], cLightBg[2]);
      }
      doc.rect(marginX, currentY, contentW, rowHeight, 'F');

      // Subtle bottom line
      doc.setDrawColor(cBorder[0], cBorder[1], cBorder[2]);
      doc.setLineWidth(0.3);
      doc.line(marginX, currentY + rowHeight, marginX + contentW, currentY + rowHeight);
    }

    // Row Content
    let x = marginX;
    cols.forEach(col => {
      let rawVal: any = (row as any)[col.key];
      let displayVal = col.key === 'section' || col.key === 'particulars'
        ? String(rawVal || '')
        : formatInr(rawVal);

      if (row.isGrandTotal) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
      } else if (row.isSubtotal) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        if (row.accentColor) {
          doc.setTextColor(row.accentColor[0], row.accentColor[1], row.accentColor[2]);
        } else {
          doc.setTextColor(cDark[0], cDark[1], cDark[2]);
        }
      } else {
        doc.setFont('helvetica', col.key === 'particulars' ? 'normal' : 'normal');
        doc.setFontSize(7);
        doc.setTextColor(cTextDark[0], cTextDark[1], cTextDark[2]);
      }

      if (col.align === 'left') {
        doc.text(displayVal, x + 5, currentY + 8.8);
      } else {
        doc.text(displayVal, x + col.width - 5, currentY + 8.8, { align: 'right' });
      }

      x += col.width;
    });

    currentY += rowHeight;
  });

  // Verification & Sign-off Block on Final Page
  const signBlockHeight = 46;
  if (currentY + signBlockHeight > pageH - 30) {
    doc.addPage();
    drawPageHeader(doc.getNumberOfPages());
  }

  currentY += 10;
  const signY = currentY;

  // Box for statutory declaration
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, signY, contentW, signBlockHeight, 3, 3, 'F');
  doc.setDrawColor(cBorder[0], cBorder[1], cBorder[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, signY, contentW, signBlockHeight, 3, 3, 'S');

  // Declaration text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(cTextMuted[0], cTextMuted[1], cTextMuted[2]);
  doc.text(
    'STATUTORY DECLARATION: Computed in accordance with CGST / SGST Act 2017 Sections 49, 49A, 49B & Rule 88A set-off cascade.',
    marginX + 8,
    signY + 11
  );
  doc.text(
    'Reverse charge liability under Section 9(3)/9(4) is mandatorily payable in cash under Section 49(4) and cannot be adjusted against ITC.',
    marginX + 8,
    signY + 20
  );
  doc.text(
    'Input Tax Credit reflected is subject to reconciliation with GSTR-2B & IMS actions under Section 16(2)(aa).',
    marginX + 8,
    signY + 29
  );
  doc.text(
    'CONFIDENTIAL WORKING PAPER • PREPARED VIA AUDIT WITH VASWANI COMPLIANCE SUITE',
    marginX + 8,
    signY + 38
  );

  // Signatures on right
  const sigRight = marginX + contentW - 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(cDark[0], cDark[1], cDark[2]);
  doc.text('For ' + (profile.firmName || 'Taxpayer'), sigRight, signY + 12, { align: 'right' });

  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.setLineWidth(0.5);
  doc.line(sigRight - 120, signY + 34, sigRight, signY + 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(cTextMuted[0], cTextMuted[1], cTextMuted[2]);
  doc.text('Authorized Signatory / Chartered Accountant', sigRight, signY + 41, { align: 'right' });

  // 2-Pass Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(cBorder[0], cBorder[1], cBorder[2]);
    doc.setLineWidth(0.4);
    doc.line(marginX, pageH - 20, pageW - marginX, pageH - 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(cTextMuted[0], cTextMuted[1], cTextMuted[2]);
    doc.text(
      'Audit With Vaswani • GSTR-3B Tax Computation Schedule • Form GSTR-3B (Rule 61(5))',
      marginX,
      pageH - 11
    );

    doc.text(
      `Page ${i} of ${totalPages}`,
      pageW - marginX,
      pageH - 11,
      { align: 'right' }
    );
  }

  // Trigger Save / Download
  const safeFirm = (profile.firmName || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
  const safeMonth = monthData.month.toUpperCase();
  const safeYear = monthData.year;
  const fileName = options?.customFileName || `GSTR-3B_WORKING_${safeFirm}_${safeMonth}_${safeYear}.pdf`;

  if (options?.autoDownload !== false) {
    doc.save(fileName);
  }

  const blob = doc.output('blob');
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes('base64,') ? dataUri.split('base64,')[1] : dataUri.split(',')[1] || '';

  return { doc, fileName, blob, base64 };
}

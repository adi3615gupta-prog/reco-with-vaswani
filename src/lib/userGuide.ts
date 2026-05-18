import jsPDF from 'jspdf';

export function downloadUserGuide() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  let y = 0;

  // Color palette (Midnight Indigo)
  const indigo: [number, number, number] = [79, 70, 229];
  const dark: [number, number, number] = [20, 20, 50];
  const muted: [number, number, number] = [110, 110, 130];

  const addWatermark = () => {
    doc.saveGraphicsState();
    // @ts-expect-error – setGState exists at runtime
    doc.setGState(new doc.GState({ opacity: 0.07 }));
    doc.setTextColor(...indigo);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(64);
    doc.text('VASWANI RETURN', pageW / 2, pageH / 2, {
      align: 'center',
      angle: 30,
    });
    doc.restoreGraphicsState();
    doc.setTextColor(...dark);
  };

  const addHeader = (title: string) => {
    // Gradient-ish header band
    doc.setFillColor(...indigo);
    doc.rect(0, 0, pageW, 70, 'F');
    doc.setFillColor(30, 27, 75);
    doc.rect(0, 70, pageW, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Vaswani Return', margin, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('GST Reconciliation • User Guide', margin, 52);
    doc.setFontSize(9);
    doc.text(title, pageW - margin, 52, { align: 'right' });
    doc.setTextColor(...dark);
  };

  const addFooter = (pageNum: number) => {
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text('© Vaswani Return — Confidential', margin, pageH - 24);
    doc.text(`Page ${pageNum}`, pageW - margin, pageH - 24, { align: 'right' });
    doc.setTextColor(...dark);
  };

  let pageNum = 0;
  const newPage = (sectionTitle: string) => {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    addWatermark();
    addHeader(sectionTitle);
    addFooter(pageNum);
    y = 100;
  };

  const ensureSpace = (h: number, sectionTitle: string) => {
    if (y + h > pageH - 60) newPage(sectionTitle);
  };

  const h1 = (text: string) => {
    ensureSpace(40, text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...indigo);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(...indigo);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + 50, y);
    y += 22;
    doc.setTextColor(...dark);
  };

  const h2 = (text: string, section: string) => {
    ensureSpace(34, section);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 27, 75);
    doc.text(text, margin, y);
    y += 18;
    doc.setTextColor(...dark);
  };

  const para = (text: string, section: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(60, 60, 75);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    for (const line of lines) {
      ensureSpace(16, section);
      doc.text(line, margin, y);
      y += 14;
    }
    y += 4;
    doc.setTextColor(...dark);
  };

  const bullets = (items: string[], section: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(60, 60, 75);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, pageW - margin * 2 - 18);
      ensureSpace(16 * lines.length, section);
      doc.setFillColor(...indigo);
      doc.circle(margin + 4, y - 3, 2, 'F');
      doc.text(lines, margin + 14, y);
      y += 14 * lines.length + 2;
    }
    y += 4;
    doc.setTextColor(...dark);
  };

  // ===== Cover page =====
  pageNum = 1;
  addWatermark();
  doc.setFillColor(...indigo);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(30, 27, 75);
  doc.rect(0, pageH - 180, pageW, 180, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  doc.text('Vaswani Return', margin, 200);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text('GST Reconciliation Tool', margin, 232);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1);
  doc.line(margin, 250, margin + 80, 250);

  doc.setFontSize(13);
  doc.text('User Guide & Reference Manual', margin, 280);

  doc.setFontSize(10);
  doc.text(
    'Purchase Register  •  Journal Registers  •  GSTR-2B  •  Debit Notes',
    margin,
    pageH - 220,
  );

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, pageH - 40);
  doc.text('v1.0', pageW - margin, pageH - 40, { align: 'right' });
  doc.setTextColor(...dark);

  // ===== Section: Overview =====
  newPage('Overview');
  h1('1. Overview');
  para(
    'Vaswani Return reconciles your books (Purchase Register and Journal Registers) against GSTR-2B downloaded from the GST Portal to maximise eligible Input Tax Credit (ITC) and surface mismatches before filing.',
    'Overview',
  );
  h2('What it does', 'Overview');
  bullets(
    [
      'Auto-detects column headers from your Excel/CSV files.',
      'Standardises GSTIN, invoice numbers and dates before comparison.',
      'Matches Purchase + Journal entries with GSTR-2B using strict and fuzzy logic.',
      'Categorises every record (perfect match, value mismatch, missing in 2B, etc.).',
      'Exports a multi-sheet Excel workbook for review and filing.',
      'Runs entirely in your browser — files never leave your device.',
    ],
    'Overview',
  );

  // ===== Section: Reconciliation Basis =====
  newPage('Reconciliation Basis');
  h1('2. Reconciliation Basis');
  h2('Primary match key', 'Reconciliation Basis');
  para(
    'A record is considered a match when the following key fields agree: Supplier GSTIN + Cleaned Invoice Number + Financial Year.',
    'Reconciliation Basis',
  );
  h2('Data standardisation rules', 'Reconciliation Basis');
  bullets(
    [
      'GSTIN: trimmed and converted to UPPERCASE.',
      'Invoice number: special characters removed (/, -, ., spaces) and leading zeros stripped.',
      'Dates: normalised to DD-MM-YYYY format.',
      'Tax amounts (CGST / SGST / IGST): rounded to 2 decimal places.',
    ],
    'Reconciliation Basis',
  );
  h2('Tolerance & fuzzy logic', 'Reconciliation Basis');
  bullets(
    [
      'A ₹1.00 tolerance is applied on Taxable / GST amounts.',
      'Fuzzy match: last 5 invoice digits with ±30 day date buffer if exact match fails.',
      'Supplier name mismatches are flagged in amber but do not block matches.',
      'Wrong GSTIN with otherwise matching data is highlighted in red.',
    ],
    'Reconciliation Basis',
  );

  // ===== Section: Required Columns =====
  newPage('Required Columns');
  h1('3. Required Columns');
  para(
    'The tool auto-detects columns. If headers differ, you can map them manually in Step 2.',
    'Required Columns',
  );
  h2('Purchase Register & Journal Registers', 'Required Columns');
  bullets(
    [
      'Supplier Name (Trade / Legal Name)',
      'GST No. (15-character GSTIN)',
      'Invoice No.',
      'Invoice Date',
      'Taxable Value',
      'CGST, SGST, IGST',
    ],
    'Required Columns',
  );
  h2('GSTR-2B', 'Required Columns');
  bullets(
    [
      'Trade / Legal Name (Supplier Name)',
      'GSTIN of Supplier',
      'Invoice Number',
      'Invoice Date',
      'Taxable Value',
      'CGST, SGST, IGST',
    ],
    'Required Columns',
  );
  h2('Debit Notes (optional)', 'Required Columns');
  bullets(
    ['Invoice / Note Date', 'CGST, SGST, IGST amounts (deducted from corresponding totals)'],
    'Required Columns',
  );

  // ===== Section: How to Use =====
  newPage('How to Use');
  h1('4. How to Use');
  h2('Step 1 — Upload', 'How to Use');
  bullets(
    [
      'Upload your Purchase Register and GSTR-2B file.',
      'Optionally upload PR Debit Notes and 2B Debit Notes.',
      'Add one or more Journal Registers using "Add Journal Register".',
    ],
    'How to Use',
  );
  h2('Step 2 — Map Columns', 'How to Use');
  bullets(
    [
      'Verify auto-detected mappings; required fields are marked with *.',
      'Each Journal Register maintains its own mapping.',
      'Click "Run Reconciliation" once all mappings are complete.',
    ],
    'How to Use',
  );
  h2('Step 3 — Review Results', 'How to Use');
  bullets(
    [
      'Summary cards show the high-level breakdown.',
      'Expand "Month-wise Breakdown" and "Party-wise Reconciliation" for drill-downs.',
      'Use the category tabs to inspect each status group.',
      'Export the Monthly Comparison Report or Party-wise Report from the action bar.',
    ],
    'How to Use',
  );

  // ===== Section: Status categories =====
  newPage('Status Categories');
  h1('5. Status Categories');
  bullets(
    [
      'Perfect Match — All key fields and amounts agree (within tolerance).',
      'Value Mismatch — Same invoice, but taxable / GST amounts differ.',
      'Name Mismatch — Match found, but supplier name differs.',
      'Missing in 2B — Found in books but not in GSTR-2B (ITC at risk).',
      'Missing in PR — In GSTR-2B but not in books (entry to be passed).',
      'Wrong GSTIN — Likely supplier GSTIN error.',
      'Probable Match — Fuzzy match using last digits / date proximity.',
    ],
    'Status Categories',
  );

  // ===== Section: Exported Sheets =====
  newPage('Exported Sheets');
  h1('6. Exported Sheets');
  h2('Monthly Comparison Report (.xlsx)', 'Exported Sheets');
  bullets(
    [
      'Reconciliation Detail — Row-by-row PR vs 2B comparison with status & differences.',
      'Monthly Summary — Variance of CGST / SGST / IGST per month (April → March).',
      'Monthly Tax Comparison — 6 side-by-side tables: 2B, Purchase, Journal, Total Books, Debit Notes, Total Purchase as per Tally.',
    ],
    'Exported Sheets',
  );
  h2('Party-wise Report (.xlsx)', 'Exported Sheets');
  bullets(
    [
      'One row per supplier with totals from both PR and 2B.',
      'Differences in taxable, CGST, SGST, IGST highlighted with semantic colours.',
    ],
    'Exported Sheets',
  );

  // ===== Section: Best Practices =====
  newPage('Best Practices');
  h1('7. Tips for Effective Use');
  bullets(
    [
      'Download GSTR-2B for the exact same period as your books.',
      'Clean obvious data-entry errors (extra spaces, wrong GSTIN length) before upload.',
      'Use Journal Registers to capture purchase entries booked in journals (RCM, expenses).',
      'Always cross-check "Missing in 2B" with the supplier — it is the biggest ITC leakage area.',
      'Re-run reconciliation after each correction; the tool is fast and stateless.',
      'Use the colour coding: Green = matched, Amber = check, Red = action needed, Blue = missing in books.',
    ],
    'Best Practices',
  );

  para(
    'For any queries or feature requests, contact the Vaswani Return team. This tool runs offline in your browser — your data is never uploaded to any server.',
    'Best Practices',
  );

  doc.save('Vaswani-Return-User-Guide.pdf');
}

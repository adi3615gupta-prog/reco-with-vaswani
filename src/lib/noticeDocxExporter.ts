/**
 * NOTICE-SHIELD AI: Courtroom Legal Reply DOCX & PDF Exporter
 * 
 * Generates audit-grade, court-formatted Word (.docx) and PDF documents
 * matching exact statutory standards:
 * - Font: Times New Roman throughout
 * - Body: 12pt (size: 24), line spacing 1.15 (line: 276), margins 1-inch (1440 twips)
 * - Headings: 14pt bold (size: 28)
 * - Body text: Justified alignment
 * - Native Tables: Auto-rendered from markdown tables with padded cells & header shading
 * - Dual Format: SCN/Intimation Letterhead vs DRC-07 Appellate Petition
 */

import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType
} from 'docx';
import { jsPDF } from 'jspdf';

export interface DocxTableSection {
    title?: string;
    headers: string[];
    rows: Array<Array<string | number>>;
}

export interface ExportNoticeDraftParams {
    clientLegalName: string;
    clientGstin: string;
    clientPan: string;
    referenceNo: string;
    din?: string;
    noticeType: string;
    financialYear: string;
    issuingOfficer: string;
    jurisdiction: string;
    draftMarkdown: string;
    totalDemanded: number;
    disputedAmount: number;
    documentHeading?: string;
    tables?: DocxTableSection[];
}

/**
 * Parses inline markdown for **bold** and *italic* formatting
 */
function parseInlineMarkdown(
    text: string,
    options?: { isBold?: boolean; size?: number; isItalic?: boolean }
): TextRun[] {
    const runs: TextRun[] = [];
    const defaultSize = options?.size ?? 24; // 12pt (24 half-points)
    const baseBold = options?.isBold ?? false;
    const baseItalic = options?.isItalic ?? false;

    // Split on **bold** or *italic*
    const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    for (const token of tokens) {
        if (!token) continue;
        if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
            runs.push(new TextRun({
                text: token.slice(2, -2),
                bold: true,
                italics: baseItalic,
                size: defaultSize,
                font: 'Times New Roman'
            }));
        } else if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
            runs.push(new TextRun({
                text: token.slice(1, -1),
                bold: baseBold,
                italics: true,
                size: defaultSize,
                font: 'Times New Roman'
            }));
        } else {
            runs.push(new TextRun({
                text: token,
                bold: baseBold,
                italics: baseItalic,
                size: defaultSize,
                font: 'Times New Roman'
            }));
        }
    }
    return runs;
}

/**
 * Builds a native DOCX Table from explicit DocxTableSection
 */
function buildNativeDocxTable(section: DocxTableSection): Paragraph | Table {
    const makeCell = (text: string | number, bold = false) =>
        new TableCell({
            width: { size: Math.floor(100 / Math.max(1, section.headers.length)), type: WidthType.PERCENTAGE },
            shading: bold ? { fill: 'F1F5F9' } : undefined,
            borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
            },
            children: [
                new Paragraph({
                    alignment: bold ? AlignmentType.CENTER : AlignmentType.LEFT,
                    spacing: { before: 60, after: 60 },
                    children: [new TextRun({ text: String(text ?? ''), bold, size: 20, font: 'Times New Roman' })]
                })
            ]
        });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ tableHeader: true, children: section.headers.map((h) => makeCell(h, true)) }),
            ...section.rows.map((r) => new TableRow({ children: r.map((cell) => makeCell(cell, false)) }))
        ]
    });
}

/**
 * Parses markdown pipe-separated table blocks into native DOCX Table
 */
function parseMarkdownTableBlock(lines: string[]): Table | null {
    const contentRows = lines.filter((l) => l.replace(/[\s|:-]/g, '').length > 0);
    if (contentRows.length === 0) return null;

    const parseRow = (line: string): string[] => {
        const raw = line.split('|');
        return raw.slice(1, raw.length - 1).map((c) => c.trim());
    };

    const headers = parseRow(contentRows[0]);
    if (headers.length === 0) return null;
    const colWidth = Math.floor(100 / Math.max(1, headers.length));

    const borderDef = {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    };

    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map((h) => new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            shading: { fill: 'F1F5F9' },
            borders: borderDef,
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: parseInlineMarkdown(h, { isBold: true, size: 20 })
            })]
        }))
    });

    const dataRows = contentRows.slice(1).map((rowLine) => {
        const cells = parseRow(rowLine);
        return new TableRow({
            children: cells.map((c) => new TableCell({
                width: { size: colWidth, type: WidthType.PERCENTAGE },
                borders: borderDef,
                children: [new Paragraph({
                    spacing: { before: 40, after: 40 },
                    children: parseInlineMarkdown(c, { size: 20 })
                })]
            }))
        });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows]
    });
}

/**
 * Internal builder creating the Document object from params
 */
function createDocxDocument(params: ExportNoticeDraftParams): Document {
    const rawMarkdown = params.draftMarkdown || '';
    const hasExistingHeader = rawMarkdown.trim().startsWith('#') ||
        rawMarkdown.trim().startsWith('Date:') ||
        /^\s*BEFORE\s*:/i.test(rawMarkdown) ||
        /^\s*To\s*,/i.test(rawMarkdown);

    const hasExistingSignoff = /Yours faithfully|Authorised Signatory|Respectfully Submitted/i.test(rawMarkdown);

    const docElements: Array<Paragraph | Table> = [];

    // Only prepend synthetic header if draftMarkdown doesn't already have one
    if (!hasExistingHeader) {
        docElements.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [
                    new TextRun({
                        text: params.documentHeading || `WRITTEN SUBMISSION IN RESPONSE TO ${params.noticeType || 'GST NOTICE'}`,
                        bold: true,
                        size: 28,
                        font: 'Times New Roman'
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [
                    new TextRun({
                        text: '[Under the Central Goods and Services Tax Act, 2017 & State GST Act]',
                        italics: true,
                        size: 20,
                        font: 'Times New Roman'
                    })
                ]
            }),
            new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: 'BEFORE: ', bold: true, size: 22, font: 'Times New Roman' }),
                    new TextRun({ text: params.issuingOfficer || 'The Proper Officer', bold: true, size: 22, font: 'Times New Roman' })
                ]
            }),
            new Paragraph({
                spacing: { after: 160 },
                children: [
                    new TextRun({ text: params.jurisdiction || 'Jurisdictional GST Office', size: 20, font: 'Times New Roman' })
                ]
            }),
            new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: 'IN THE MATTER OF:', bold: true, size: 22, font: 'Times New Roman' })]
            }),
            new Paragraph({
                spacing: { after: 40 },
                children: [
                    new TextRun({ text: 'Noticee / Taxpayer: ', bold: true, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: params.clientLegalName, size: 20, font: 'Times New Roman' })
                ]
            }),
            new Paragraph({
                spacing: { after: 40 },
                children: [
                    new TextRun({ text: 'GSTIN: ', bold: true, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: params.clientGstin, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: ' | PAN: ', bold: true, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: params.clientPan, size: 20, font: 'Times New Roman' })
                ]
            }),
            new Paragraph({
                spacing: { after: 200 },
                children: [
                    new TextRun({ text: 'Reference No / DIN: ', bold: true, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: `${params.referenceNo} ${params.din ? `(DIN: ${params.din})` : ''}`, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: ' | Period: ', bold: true, size: 20, font: 'Times New Roman' }),
                    new TextRun({ text: params.financialYear, size: 20, font: 'Times New Roman' })
                ]
            })
        );
    }

    // Process markdown line by line, grouping table blocks
    const lines = rawMarkdown.split('\n');
    let idx = 0;
    while (idx < lines.length) {
        const line = lines[idx];
        const trimmed = line.trim();

        if (!trimmed) {
            idx++;
            continue;
        }

        // Check for Markdown table block
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            const tableLines: string[] = [];
            while (idx < lines.length && lines[idx].trim().startsWith('|') && lines[idx].trim().endsWith('|')) {
                tableLines.push(lines[idx].trim());
                idx++;
            }
            const nativeTable = parseMarkdownTableBlock(tableLines);
            if (nativeTable) {
                docElements.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));
                docElements.push(nativeTable);
                docElements.push(new Paragraph({ spacing: { before: 60, after: 120 }, children: [] }));
            }
            continue;
        }

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(trimmed)) {
            idx++;
            continue;
        }

        // Heading 1 (# ...)
        if (line.startsWith('# ')) {
            const clean = line.replace(/^#\s+/, '').trim();
            docElements.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 120 },
                children: parseInlineMarkdown(clean, { isBold: true, size: 28 })
            }));
            idx++;
            continue;
        }

        // Heading 2 or 3 (## ... or ### ...)
        if (line.startsWith('## ') || line.startsWith('### ')) {
            const clean = line.replace(/^#{2,3}\s+/, '').trim();
            docElements.push(new Paragraph({
                spacing: { before: 220, after: 100 },
                children: parseInlineMarkdown(clean, { isBold: true, size: 26 })
            }));
            idx++;
            continue;
        }

        // Heading 4 (#### ...)
        if (line.startsWith('#### ')) {
            const clean = line.replace(/^####\s+/, '').trim();
            docElements.push(new Paragraph({
                spacing: { before: 180, after: 80 },
                children: parseInlineMarkdown(clean, { isBold: true, size: 24 })
            }));
            idx++;
            continue;
        }

        // Blockquote (> ...)
        if (line.startsWith('>')) {
            const clean = line.replace(/^>\s*/, '').trim();
            docElements.push(new Paragraph({
                spacing: { before: 80, after: 80, line: 276 },
                indent: { left: 720 },
                children: parseInlineMarkdown(clean, { isItalic: true, size: 22 })
            }));
            idx++;
            continue;
        }

        // Regular body paragraphs (12pt Times New Roman, 1.15 line spacing, Justified)
        docElements.push(new Paragraph({
            alignment: trimmed.startsWith('Date:') ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
            spacing: { before: 60, after: 100, line: 276 },
            children: parseInlineMarkdown(line, { size: 24 })
        }));
        idx++;
    }

    // Append any explicit tables passed via params if not already present
    for (const tbl of params.tables || []) {
        if (tbl.title) {
            docElements.push(new Paragraph({
                spacing: { before: 200, after: 80 },
                children: [new TextRun({ text: tbl.title, bold: true, size: 22, font: 'Times New Roman' })]
            }));
        }
        docElements.push(buildNativeDocxTable(tbl));
    }

    // Only append synthetic signoff if draftMarkdown does not have one
    if (!hasExistingSignoff) {
        docElements.push(
            new Paragraph({
                spacing: { before: 360, after: 80 },
                children: [new TextRun({ text: 'Yours faithfully,', bold: true, size: 22, font: 'Times New Roman' })]
            }),
            new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: `For ${params.clientLegalName}`, bold: true, size: 22, font: 'Times New Roman' })]
            }),
            new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: 'Authorised Signatory', italics: true, size: 20, font: 'Times New Roman' })]
            })
        );
    }

    return new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,    // 1 inch
                        bottom: 1440, // 1 inch
                        left: 1440,   // 1 inch
                        right: 1440   // 1 inch
                    }
                }
            },
            children: docElements
        }]
    });
}

/**
 * Generates a formatted DOCX blob for browser downloads
 */
export async function generateNoticeDocxBlob(params: ExportNoticeDraftParams): Promise<Blob> {
    const doc = createDocxDocument(params);
    return await Packer.toBlob(doc);
}

/**
 * Generates a formatted DOCX Buffer for Node.js scripts and vitest tests
 */
export async function generateNoticeDocxBuffer(params: ExportNoticeDraftParams): Promise<Buffer> {
    const doc = createDocxDocument(params);
    return await Packer.toBuffer(doc);
}

/**
 * Generates an audit-grade PDF using jsPDF
 */
export function generateNoticePdf(params: ExportNoticeDraftParams): jsPDF {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 50;

    const rawMarkdown = params.draftMarkdown || '';
    const hasExistingHeader = rawMarkdown.trim().startsWith('#') ||
        rawMarkdown.trim().startsWith('Date:') ||
        /^\s*BEFORE\s*:/i.test(rawMarkdown) ||
        /^\s*To\s*,/i.test(rawMarkdown);

    // Only draw synthetic title header if not present in markdown
    if (!hasExistingHeader) {
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.text(params.documentHeading || `WRITTEN SUBMISSION IN RESPONSE TO ${params.noticeType || 'GST NOTICE'}`, pageWidth / 2, y, { align: 'center' });
        y += 20;

        doc.setFont('times', 'italic');
        doc.setFontSize(10);
        doc.text('[Under Central Goods and Services Tax Act, 2017 & State GST Act]', pageWidth / 2, y, { align: 'center' });
        y += 26;

        doc.setFont('times', 'bold');
        doc.setFontSize(10);
        doc.text(`BEFORE: ${params.issuingOfficer || 'The Proper Officer'}`, 50, y);
        y += 14;
        doc.setFont('times', 'normal');
        doc.text(`${params.jurisdiction || 'Jurisdictional GST Office'}`, 50, y);
        y += 18;

        doc.setFont('times', 'bold');
        doc.text(`TAX-PAYER / NOTICEE: ${params.clientLegalName}`, 50, y);
        y += 14;
        doc.setFont('times', 'normal');
        doc.text(`GSTIN: ${params.clientGstin}  |  PAN: ${params.clientPan}  |  Ref: ${params.referenceNo}`, 50, y);
        y += 14;
        doc.text(`Period: ${params.financialYear}  |  Total Demanded: Rs. ${params.totalDemanded.toLocaleString('en-IN')}`, 50, y);
        y += 20;

        doc.setDrawColor(200, 200, 200);
        doc.line(50, y, pageWidth - 50, y);
        y += 18;
    }

    doc.setFont('times', 'normal');
    doc.setFontSize(10);

    const lines = rawMarkdown.split('\n');
    for (const rawLine of lines) {
        const line = rawLine.replace(/^[#* \t]+/, '').trim();
        if (!line) continue;

        if (rawLine.startsWith('# ') || rawLine.startsWith('## ') || rawLine.startsWith('### ')) {
            y += 10;
            if (y > 770) { doc.addPage(); y = 50; }
            doc.setFont('times', 'bold');
            doc.setFontSize(12);
            doc.text(line, 50, y);
            doc.setFont('times', 'normal');
            doc.setFontSize(10);
            y += 16;
        } else if (rawLine.startsWith('#### ')) {
            y += 8;
            if (y > 770) { doc.addPage(); y = 50; }
            doc.setFont('times', 'bold');
            doc.setFontSize(10.5);
            doc.text(line, 50, y);
            doc.setFont('times', 'normal');
            doc.setFontSize(10);
            y += 14;
        } else {
            const cleanText = line.replace(/\*\*/g, '');
            const splitLines = doc.splitTextToSize(cleanText, pageWidth - 100);
            for (const sl of splitLines) {
                if (y > 770) { doc.addPage(); y = 50; }
                doc.text(sl, 50, y);
                y += 13;
            }
            y += 3;
        }
    }

    // Sign off if not in markdown
    if (!/Yours faithfully|Authorised Signatory|Respectfully Submitted/i.test(rawMarkdown)) {
        if (y > 740) { doc.addPage(); y = 50; }
        y += 20;
        doc.setFont('times', 'bold');
        doc.text(`For ${params.clientLegalName}`, 50, y);
        y += 14;
        doc.setFont('times', 'italic');
        doc.text('Authorised Signatory / Counsel', 50, y);
    }

    return doc;
}

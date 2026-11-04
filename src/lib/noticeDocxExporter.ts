/**
 * NOTICE-SHIELD AI: Courtroom Legal Reply DOCX & PDF Exporter
 * 
 * Generates audit-grade, court-formatted Word (.docx) and PDF documents
 * ready for direct statutory submission under DRC-06 / ASMT-11.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { jsPDF } from 'jspdf';

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
}

/**
 * Generates a formatted DOCX blob for download
 */
export async function generateNoticeDocxBlob(params: ExportNoticeDraftParams): Promise<Blob> {
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440, // 1 inch
                        bottom: 1440,
                        left: 1440,
                        right: 1440
                    }
                }
            },
            children: [
                // Formal Title
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [
                        new TextRun({
                            text: "WRITTEN SUBMISSION IN RESPONSE TO GST NOTICE",
                            bold: true,
                            size: 28,
                            font: "Times New Roman"
                        })
                    ]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                    children: [
                        new TextRun({
                            text: `[Under the Central Goods and Services Tax Act, 2017 & State GST Act]`,
                            italics: true,
                            size: 22,
                            font: "Times New Roman"
                        })
                    ]
                }),

                // Addressed To
                new Paragraph({
                    spacing: { after: 100 },
                    children: [
                        new TextRun({ text: "BEFORE: ", bold: true, size: 22, font: "Times New Roman" }),
                        new TextRun({ text: params.issuingOfficer || "The Proper Officer", bold: true, size: 22, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 240 },
                    children: [
                        new TextRun({ text: params.jurisdiction || "Jurisdictional GST Office", size: 20, font: "Times New Roman" })
                    ]
                }),

                // Taxpayer Meta Box
                new Paragraph({
                    spacing: { after: 100 },
                    children: [
                        new TextRun({ text: "IN THE MATTER OF:", bold: true, size: 22, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 60 },
                    children: [
                        new TextRun({ text: "Noticee / Taxpayer: ", bold: true, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: params.clientLegalName, size: 20, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 60 },
                    children: [
                        new TextRun({ text: "GSTIN: ", bold: true, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: params.clientGstin, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: " | PAN: ", bold: true, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: params.clientPan, size: 20, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    children: [
                        new TextRun({ text: "Reference No / DIN: ", bold: true, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: `${params.referenceNo} ${params.din ? `(DIN: ${params.din})` : ''}`, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: " | Period: ", bold: true, size: 20, font: "Times New Roman" }),
                        new TextRun({ text: params.financialYear, size: 20, font: "Times New Roman" })
                    ]
                }),

                // Body Paragraphs parsed from draft text
                ...params.draftMarkdown.split('\n').filter(l => l.trim().length > 0).map(line => {
                    const isHeading = line.startsWith('#') || line.startsWith('###');
                    const cleanText = line.replace(/^[#* \t]+/, '').trim();

                    if (isHeading) {
                        return new Paragraph({
                            spacing: { before: 240, after: 120 },
                            children: [
                                new TextRun({
                                    text: cleanText,
                                    bold: true,
                                    size: 22,
                                    font: "Times New Roman"
                                })
                            ]
                        });
                    }

                    return new Paragraph({
                        spacing: { after: 120 },
                        children: [
                            new TextRun({
                                text: cleanText,
                                size: 20,
                                font: "Times New Roman"
                            })
                        ]
                    });
                }),

                // Sign-off block
                new Paragraph({
                    spacing: { before: 400, after: 100 },
                    children: [
                        new TextRun({ text: "Respectfully Submitted,", bold: true, size: 22, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 60 },
                    children: [
                        new TextRun({ text: `For ${params.clientLegalName}`, bold: true, size: 20, font: "Times New Roman" })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 100 },
                    children: [
                        new TextRun({ text: "Authorised Signatory / Counsel", italics: true, size: 20, font: "Times New Roman" })
                    ]
                })
            ]
        }]
    });

    return await Packer.toBlob(doc);
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

    // Title
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text('WRITTEN SUBMISSION IN RESPONSE TO GST NOTICE', pageWidth / 2, y, { align: 'center' });
    y += 20;

    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.text('[Under Central Goods and Services Tax Act, 2017 & State GST Act]', pageWidth / 2, y, { align: 'center' });
    y += 30;

    // Recipient & Taxpayer Meta
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(`BEFORE: ${params.issuingOfficer || 'The Proper Officer'}`, 50, y);
    y += 14;
    doc.setFont('times', 'normal');
    doc.text(`${params.jurisdiction || 'Jurisdictional GST Office'}`, 50, y);
    y += 20;

    doc.setFont('times', 'bold');
    doc.text(`TAX-PAYER / NOTICEE: ${params.clientLegalName}`, 50, y);
    y += 14;
    doc.setFont('times', 'normal');
    doc.text(`GSTIN: ${params.clientGstin}  |  PAN: ${params.clientPan}  |  Ref: ${params.referenceNo}`, 50, y);
    y += 14;
    doc.text(`Period: ${params.financialYear}  |  Total Demanded: Rs. ${params.totalDemanded.toLocaleString('en-IN')}`, 50, y);
    y += 24;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(50, y, pageWidth - 50, y);
    y += 20;

    // Body Lines
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);

    const lines = params.draftMarkdown.split('\n');
    for (const rawLine of lines) {
        const line = rawLine.replace(/^[#* \t]+/, '').trim();
        if (!line) continue;

        if (rawLine.startsWith('#') || rawLine.startsWith('###')) {
            y += 10;
            if (y > 770) { doc.addPage(); y = 50; }
            doc.setFont('times', 'bold');
            doc.text(line, 50, y);
            doc.setFont('times', 'normal');
            y += 14;
        } else {
            const splitLines = doc.splitTextToSize(line, pageWidth - 100);
            for (const sl of splitLines) {
                if (y > 770) { doc.addPage(); y = 50; }
                doc.text(sl, 50, y);
                y += 12;
            }
            y += 4;
        }
    }

    // Sign off
    if (y > 740) { doc.addPage(); y = 50; }
    y += 20;
    doc.setFont('times', 'bold');
    doc.text(`For ${params.clientLegalName}`, 50, y);
    y += 14;
    doc.setFont('times', 'italic');
    doc.text('Authorised Signatory / Counsel', 50, y);

    return doc;
}

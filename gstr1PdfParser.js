let CachedPDFParse = null;
async function resolvePDFParseClass() {
  if (CachedPDFParse) return CachedPDFParse;
  try {
    const mod = await import('pdf-parse');
    CachedPDFParse = mod.PDFParse || mod.default?.PDFParse || mod.default;
    return CachedPDFParse;
  } catch (err) {
    console.warn('[GSTR-1 PDF Parser] Failed to load pdf-parse dynamically:', err.message);
    return null;
  }
}

/**
 * Clean and convert string currency / amount to a float number
 */
export function cleanNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Map return period (e.g. "September", "092026", "Sep") to GSTR3BMonthKey
 */
export function mapPeriodToMonthKey(periodStr) {
  if (!periodStr) return undefined;
  const cleaned = periodStr.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  if (cleaned.startsWith('apr') || cleaned.startsWith('04') || cleaned.startsWith('4')) return 'April';
  if (cleaned.startsWith('may') || cleaned.startsWith('05') || cleaned.startsWith('5')) return 'May';
  if (cleaned.startsWith('jun') || cleaned.startsWith('06') || cleaned.startsWith('6')) return 'June';
  if (cleaned.startsWith('jul') || cleaned.startsWith('07') || cleaned.startsWith('7')) return 'July';
  if (cleaned.startsWith('aug') || cleaned.startsWith('08') || cleaned.startsWith('8')) return 'August';
  if (cleaned.startsWith('sep') || cleaned.startsWith('09') || cleaned.startsWith('9')) return 'September';
  if (cleaned.startsWith('oct') || cleaned.startsWith('10')) return 'October';
  if (cleaned.startsWith('nov') || cleaned.startsWith('11')) return 'November';
  if (cleaned.startsWith('dec') || cleaned.startsWith('12')) return 'December';
  if (cleaned.startsWith('jan') || cleaned.startsWith('01') || cleaned.startsWith('1')) return 'January';
  if (cleaned.startsWith('feb') || cleaned.startsWith('02') || cleaned.startsWith('2')) return 'February';
  if (cleaned.startsWith('mar') || cleaned.startsWith('03') || cleaned.startsWith('3')) return 'March';
  return undefined;
}

/**
 * Parses official GSTR-1 Filed Return Summary PDF Buffer into structured GSTR-1 data
 * and formats it into Gstr1IngestSummary for GSTR-3B Table 3.1 ingestion.
 */
export async function parseGstr1PdfBuffer(pdfBuffer, originalFileName = 'GSTR-1.pdf') {
  let text = '';
  const PDFParseClass = await resolvePDFParseClass();
  if (PDFParseClass) {
    try {
      const parser = new PDFParseClass({ data: pdfBuffer });
      const parseRes = await parser.getText();
      text = typeof parseRes === 'string' ? parseRes : (parseRes?.text || '');
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    } catch (parseErr) {
      console.warn('[GSTR-1 PDF Parser] pdf-parse extraction failed, attempting raw text fallback:', parseErr.message);
    }
  }

  if (!text || text.length < 50) {
    try {
      text = pdfBuffer.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    } catch (rawErr) {
      console.warn('[GSTR-1 PDF Parser] Raw stream fallback error:', rawErr.message);
    }
  }

  if (!text || text.length < 50) {
    throw new Error('Unable to extract text from PDF. The file may be empty or corrupted.');
  }

  // 1. Basic Metadata Extraction
  const gstinMatch = text.match(/GSTIN\s+([0-9A-Z]{15})/i) ||
                     originalFileName.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
  const gstin = gstinMatch ? (gstinMatch[1] || gstinMatch[0]).trim().toUpperCase() : '';

  const fyMatch = text.match(/Financial year\s+([0-9]{4}-[0-9]{2,4})/i);
  const financialYear = fyMatch ? fyMatch[1].trim() : '';

  const periodMatch = text.match(/Tax period\s+([A-Za-z]+)/i);
  const returnPeriod = periodMatch ? periodMatch[1].trim() : '';

  const legalMatch = text.match(/Legal name of the registered person\s+([^\n\r]+)/i);
  const legalName = legalMatch ? legalMatch[1].trim() : '';

  const tradeMatch = text.match(/Trade name if any\s+([^\n\r]+)/i);
  const tradeName = tradeMatch ? tradeMatch[1].trim() : '';

  const arnMatch = text.match(/ARN\s+([0-9A-Z]{15})/i);
  const arn = arnMatch ? arnMatch[1].trim() : '';

  const arnDateMatch = text.match(/ARN date\s+([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  const arnDate = arnDateMatch ? arnDateMatch[1].trim() : '';

  // 2. Total Outward Liability (Statutory Grand Total other than Reverse Charge)
  const totMatch = text.match(/Total Liability \(Outward supplies other than Reverse charge\)[\s\S]*?([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const totalLiability = {
    taxable: totMatch ? cleanNum(totMatch[1]) : 0,
    igst: totMatch ? cleanNum(totMatch[2]) : 0,
    cgst: totMatch ? cleanNum(totMatch[3]) : 0,
    sgst: totMatch ? cleanNum(totMatch[4]) : 0,
    cess: totMatch ? cleanNum(totMatch[5]) : 0
  };
  totalLiability.totalTax = totalLiability.igst + totalLiability.cgst + totalLiability.sgst + totalLiability.cess;

  // 3. Table 4A: B2B Regular Invoices
  const b2bMatch = text.match(/4A - Taxable outward supplies[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const b2b = {
    count: b2bMatch ? parseInt(b2bMatch[1], 10) : 0,
    taxable: b2bMatch ? cleanNum(b2bMatch[2]) : 0,
    igst: b2bMatch ? cleanNum(b2bMatch[3]) : 0,
    cgst: b2bMatch ? cleanNum(b2bMatch[4]) : 0,
    sgst: b2bMatch ? cleanNum(b2bMatch[5]) : 0,
    cess: b2bMatch ? cleanNum(b2bMatch[6]) : 0
  };
  b2b.total = b2b.igst + b2b.cgst + b2b.sgst + b2b.cess;

  // 4. Table 4B: B2B Reverse Charge Supplies
  const b2bRcmMatch = text.match(/4B - Taxable outward supplies[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const b2bRcm = {
    count: b2bRcmMatch ? parseInt(b2bRcmMatch[1], 10) : 0,
    taxable: b2bRcmMatch ? cleanNum(b2bRcmMatch[2]) : 0,
    igst: b2bRcmMatch ? cleanNum(b2bRcmMatch[3]) : 0,
    cgst: b2bRcmMatch ? cleanNum(b2bRcmMatch[4]) : 0,
    sgst: b2bRcmMatch ? cleanNum(b2bRcmMatch[5]) : 0,
    cess: b2bRcmMatch ? cleanNum(b2bRcmMatch[6]) : 0
  };
  b2bRcm.total = b2bRcm.igst + b2bRcm.cgst + b2bRcm.sgst + b2bRcm.cess;

  // 5. Table 5: B2CL (Large) Inter-State Supplies
  const b2clMatch = text.match(/5 - Taxable outward inter-state supplies[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const b2cl = {
    count: b2clMatch ? parseInt(b2clMatch[1], 10) : 0,
    taxable: b2clMatch ? cleanNum(b2clMatch[2]) : 0,
    igst: b2clMatch ? cleanNum(b2clMatch[3]) : 0,
    cgst: 0,
    sgst: 0,
    cess: b2clMatch ? cleanNum(b2clMatch[4]) : 0
  };
  b2cl.total = b2cl.igst + b2cl.cess;

  // 6. Table 6A: Exports (EXPWP / EXPWOP)
  const expMatch = text.match(/6A[^\n]*Exports[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const exportsData = {
    count: expMatch ? parseInt(expMatch[1], 10) : 0,
    taxable: expMatch ? cleanNum(expMatch[2]) : 0,
    igst: expMatch ? cleanNum(expMatch[3]) : 0,
    cgst: 0,
    sgst: 0,
    cess: expMatch ? cleanNum(expMatch[4]) : 0
  };
  exportsData.total = exportsData.igst + exportsData.cess;

  // 7. Table 6B: SEZ Supplies (SEZWP / SEZWOP)
  const sezMatch = text.match(/6B - Supplies made to SEZ[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const sez = {
    count: sezMatch ? parseInt(sezMatch[1], 10) : 0,
    taxable: sezMatch ? cleanNum(sezMatch[2]) : 0,
    igst: sezMatch ? cleanNum(sezMatch[3]) : 0,
    cgst: 0,
    sgst: 0,
    cess: sezMatch ? cleanNum(sezMatch[4]) : 0
  };
  sez.total = sez.igst + sez.cess;

  // 8. Table 6C: Deemed Exports
  const deMatch = text.match(/6C - Deemed Exports[\s\S]*?Total\s+([\d]+)\s+Invoice\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const deemedExports = {
    count: deMatch ? parseInt(deMatch[1], 10) : 0,
    taxable: deMatch ? cleanNum(deMatch[1]) : 0,
    igst: deMatch ? cleanNum(deMatch[2]) : 0,
    cgst: deMatch ? cleanNum(deMatch[3]) : 0,
    sgst: deMatch ? cleanNum(deMatch[4]) : 0,
    cess: deMatch ? cleanNum(deMatch[5]) : 0
  };
  deemedExports.total = deemedExports.igst + deemedExports.cgst + deemedExports.sgst + deemedExports.cess;

  // 9. Table 7: B2CS (Others) Supplies
  const b2csMatch = text.match(/7- Taxable supplies[\s\S]*?Total\s+([\d]+)\s+Net Value\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const b2cs = {
    count: b2csMatch ? parseInt(b2csMatch[1], 10) : 0,
    taxable: b2csMatch ? cleanNum(b2csMatch[2]) : 0,
    igst: b2csMatch ? cleanNum(b2csMatch[3]) : 0,
    cgst: b2csMatch ? cleanNum(b2csMatch[4]) : 0,
    sgst: b2csMatch ? cleanNum(b2csMatch[5]) : 0,
    cess: b2csMatch ? cleanNum(b2csMatch[6]) : 0
  };
  b2cs.total = b2cs.igst + b2cs.cgst + b2cs.sgst + b2cs.cess;

  // 10. Table 8: Nil Rated, Exempted & Non-GST Outward Supplies
  const nilMatch = text.match(/8 - Nil rated, exempted and non GST[\s\S]*?Total\s+([\d,\.]+)[\s\S]*?-\s+Nil\s+([\d,\.]+)[\s\S]*?-\s+Exempted\s+([\d,\.]+)[\s\S]*?-\s+Non-GST\s+([\d,\.]+)/i);
  const nilExempt = {
    total: nilMatch ? cleanNum(nilMatch[1]) : 0,
    nil: nilMatch ? cleanNum(nilMatch[2]) : 0,
    exempt: nilMatch ? cleanNum(nilMatch[3]) : 0,
    nonGst: nilMatch ? cleanNum(nilMatch[4]) : 0
  };

  // 11. Table 9B: CDNR (Credit/Debit Notes Registered)
  const cdnrMatch = text.match(/9B - Credit\/Debit Notes \(Registered\)[\s\S]*?Total - Net off debit\/credit notes[\s\S]*?([\d]+)\s+Note\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)/i);
  const cdnr = {
    count: cdnrMatch ? parseInt(cdnrMatch[1], 10) : 0,
    taxable: cdnrMatch ? cleanNum(cdnrMatch[2]) : 0,
    igst: cdnrMatch ? cleanNum(cdnrMatch[3]) : 0,
    cgst: cdnrMatch ? cleanNum(cdnrMatch[4]) : 0,
    sgst: cdnrMatch ? cleanNum(cdnrMatch[5]) : 0,
    cess: cdnrMatch ? cleanNum(cdnrMatch[6]) : 0
  };
  cdnr.total = cdnr.igst + cdnr.cgst + cdnr.sgst + cdnr.cess;

  // 12. Table 9B: CDNUR (Credit/Debit Notes Unregistered)
  const cdnurMatch = text.match(/9B - Credit\/Debit Notes \(Unregistered\)[\s\S]*?Total - Net off debit\/credit notes[\s\S]*?([\d]+)\s+Note\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)/i);
  const cdnur = {
    count: cdnurMatch ? parseInt(cdnurMatch[1], 10) : 0,
    taxable: cdnurMatch ? cleanNum(cdnurMatch[2]) : 0,
    igst: cdnurMatch ? cleanNum(cdnurMatch[3]) : 0,
    cgst: 0,
    sgst: 0,
    cess: cdnurMatch ? cleanNum(cdnurMatch[4]) : 0
  };
  cdnur.total = cdnur.igst + cdnur.cess;

  // 13. Table 11A & 11B: Advances Received and Adjusted
  const atMatch = text.match(/11A\(1\), 11A\(2\) - Advances received[\s\S]*?Total\s+([\d]+)\s+Net Value\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const advanceReceived = {
    count: atMatch ? parseInt(atMatch[1], 10) : 0,
    taxable: atMatch ? cleanNum(atMatch[2]) : 0,
    igst: atMatch ? cleanNum(atMatch[3]) : 0,
    cgst: atMatch ? cleanNum(atMatch[4]) : 0,
    sgst: atMatch ? cleanNum(atMatch[5]) : 0,
    cess: atMatch ? cleanNum(atMatch[6]) : 0
  };
  advanceReceived.total = advanceReceived.igst + advanceReceived.cgst + advanceReceived.sgst + advanceReceived.cess;

  const atAdjMatch = text.match(/11B\(1\), 11B\(2\) - Advance amount received in earlier[\s\S]*?Total\s+([\d]+)\s+Net Value\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const advanceAdjusted = {
    count: atAdjMatch ? parseInt(atAdjMatch[1], 10) : 0,
    taxable: atAdjMatch ? cleanNum(atAdjMatch[2]) : 0,
    igst: atAdjMatch ? cleanNum(atAdjMatch[3]) : 0,
    cgst: atAdjMatch ? cleanNum(atAdjMatch[4]) : 0,
    sgst: atAdjMatch ? cleanNum(atAdjMatch[5]) : 0,
    cess: atAdjMatch ? cleanNum(atAdjMatch[6]) : 0
  };
  advanceAdjusted.total = advanceAdjusted.igst + advanceAdjusted.cgst + advanceAdjusted.sgst + advanceAdjusted.cess;

  // 14. Table 12: HSN Summary
  const hsnMatch = text.match(/12 - HSN-wise summary of outward supplies[\s\S]*?Total\s+([\d]+)\s+NA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i);
  const hsn = {
    count: hsnMatch ? parseInt(hsnMatch[1], 10) : 0,
    taxable: hsnMatch ? cleanNum(hsnMatch[2]) : 0,
    igst: hsnMatch ? cleanNum(hsnMatch[3]) : 0,
    cgst: hsnMatch ? cleanNum(hsnMatch[4]) : 0,
    sgst: hsnMatch ? cleanNum(hsnMatch[5]) : 0,
    cess: hsnMatch ? cleanNum(hsnMatch[6]) : 0
  };

  // 15. Table 13: Documents Issued
  const docMatch = text.match(/13 - Documents issued[\s\S]*?Net issued documents\s+([\d]+)/i);
  const docsIssued = docMatch ? parseInt(docMatch[1], 10) : 0;

  // ─── COMPOSE STANDARD Gstr1IngestSummary ──────────────────────────────────────
  const monthKey = mapPeriodToMonthKey(returnPeriod) || mapPeriodToMonthKey(originalFileName);
  let periodDisplay = returnPeriod || 'September';
  if (financialYear) {
    const yr = financialYear.split('-')[0] || '';
    periodDisplay = `${periodDisplay} ${yr}`.trim();
  }

  // Calculate net credit notes breakdown
  const creditNoteBreakdown = {
    taxable: cdnr.taxable + cdnur.taxable,
    cgst: cdnr.cgst + cdnur.cgst,
    sgst: cdnr.sgst + cdnur.sgst,
    igst: cdnr.igst + cdnur.igst,
    cess: cdnr.cess + cdnur.cess,
    total: cdnr.total + cdnur.total
  };

  // Zero-rated total (Exports + SEZ)
  const zeroRatedBreakdown = {
    taxable: exportsData.taxable + sez.taxable,
    cgst: 0,
    sgst: 0,
    igst: exportsData.igst + sez.igst,
    cess: exportsData.cess + sez.cess,
    total: exportsData.total + sez.total
  };

  // B2C combined (B2CS + B2CL)
  const b2cBreakdown = {
    taxable: b2cs.taxable + b2cl.taxable,
    cgst: b2cs.cgst + b2cl.cgst,
    sgst: b2cs.sgst + b2cl.sgst,
    igst: b2cs.igst + b2cl.igst,
    cess: b2cs.cess + b2cl.cess,
    total: b2cs.total + b2cl.total
  };

  // Table 3.1(a) B2B calculation: If totalLiability exists and has positive amounts,
  // we align B2B outward so that (b2b + b2c - creditNote + advances) perfectly equals totalLiability.
  const effectiveTaxable = totalLiability.taxable > 0 ? totalLiability.taxable : (b2b.taxable + b2cBreakdown.taxable);
  const effectiveTax = totalLiability.totalTax > 0 ? totalLiability.totalTax : (b2b.total + b2cBreakdown.total);

  const gstr1Summary = {
    gstin,
    period: periodDisplay,
    monthKey,
    fileType: 'PDF',
    fileName: originalFileName,
    arn,
    arnDate,
    legalName,
    tradeName,
    counts: {
      b2b: b2b.count,
      b2cl: b2cl.count,
      b2cs: b2cs.count,
      exp: exportsData.count + sez.count,
      nil: nilExempt.total > 0 ? 1 : 0,
      cdnr: cdnr.count + cdnur.count,
      at: advanceReceived.count,
      totalDocs: docsIssued || (b2b.count + b2cs.count + cdnr.count)
    },
    breakdowns: {
      b2b: {
        taxable: b2b.taxable,
        cgst: b2b.cgst,
        sgst: b2b.sgst,
        igst: b2b.igst,
        cess: b2b.cess,
        total: b2b.total
      },
      b2c: b2cBreakdown,
      zeroRated: zeroRatedBreakdown,
      nilRated: {
        taxable: nilExempt.nil,
        cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0
      },
      exempt: {
        taxable: nilExempt.exempt,
        cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0
      },
      creditNote: creditNoteBreakdown,
      advanceReceived,
      advanceAdjusted,
      rcmOutward: {
        taxable: b2bRcm.taxable,
        cgst: b2bRcm.cgst,
        sgst: b2bRcm.sgst,
        igst: b2bRcm.igst,
        cess: b2bRcm.cess,
        total: b2bRcm.total
      }
    },
    totalOutwardTaxable: effectiveTaxable,
    totalOutwardTax: effectiveTax
  };

  return gstr1Summary;
}

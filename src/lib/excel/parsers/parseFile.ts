import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export async function parseFile(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean; sheetName?: string; docType?: string }
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // 1. Target the right sheet from workbook
  let targetSheetName = wb.SheetNames[0];
  let sheetFound = false;

  if (options?.sheetName && wb.Sheets[options.sheetName]) {
    targetSheetName = options.sheetName;
    sheetFound = true;
  }
  if (!sheetFound && options?.docType && wb.SheetNames.length > 1) {
    const dt = options.docType.toLowerCase();
    const matched = wb.SheetNames.find(sn => {
      const lower = sn.toLowerCase().trim();
      if (dt === 'b2b' && (lower.includes('b2b') || lower === 'b2b supplies')) return true;
      if (dt === 'b2c' && (lower.includes('b2c') || lower.includes('b2cs'))) return true;
      if (dt === 'b2cl' && lower.includes('b2cl')) return true;
      if (dt === 'cn' && (lower.includes('cdnr') || lower.includes('cn') || lower.includes('credit'))) return true;
      if (dt === 'exp' && (lower.includes('exp') || lower.includes('export'))) return true;
      if (dt === 'nil' && (lower.includes('nil') || lower.includes('exemp'))) return true;
      return false;
    });
    if (matched) targetSheetName = matched;
  }

  // If initial sheet is a help/readme sheet, skip to first data sheet
  if (wb.SheetNames.length > 1 && ['help', 'read me', 'readme', 'instructions'].includes(targetSheetName.toLowerCase().trim())) {
    targetSheetName = wb.SheetNames.find(sn => !['help', 'read me', 'readme', 'instructions'].includes(sn.toLowerCase().trim())) || wb.SheetNames[0];
  }

  const sheet = wb.Sheets[targetSheetName] || wb.Sheets[wb.SheetNames[0]];

  // 2. Automatic & Comprehensive Header Row Detection
  let range = 0;
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerKeywords = [
    'date', 'particulars', 'party name', 'ledger name', 'pan', 'section',
    'voucher type', 'voucher no', 'voucher number', 'deductee pan', 'deductee name',
    'amount paid', 'tds deposited', 'tds deducted',
    'gstin', 'gstin/uin', 'recipient', 'receiver name', 'supplier name',
    'invoice number', 'invoice date', 'taxable value', 'taxable amount',
    'integrated tax', 'central tax', 'state tax', 'igst', 'cgst', 'sgst',
    'place of supply', 'pos', 'rate', 'invoice value'
  ];

  let maxMatches = 0;
  let bestRow = 0;
  for (let r = 0; r < Math.min(rawData.length, 30); r++) {
    const row = rawData[r];
    if (Array.isArray(row)) {
      const matchCount = row.filter((cell) => {
        const s = String(cell || '').toLowerCase().trim();
        return headerKeywords.some((kw) => s === kw || s.includes(kw));
      }).length;

      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        bestRow = r;
      }
    }
  }

  if (maxMatches >= 2) {
    range = bestRow;
  }

  const rawOption = options?.raw !== undefined ? options.raw : false;
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range, defval: '', raw: rawOption });

  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  return { headers, rows: json };
}

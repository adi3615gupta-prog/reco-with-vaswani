import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export async function parseFile(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean; sheetName?: string; docType?: string; strictSheet?: boolean }
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // 1. Always read the 1st sheet of the workbook unless a specific sheetName is requested
  let targetSheetName = wb.SheetNames[0];

  if (options?.sheetName) {
    const matchedSheet = wb.SheetNames.find(
      (sn) => sn.toLowerCase().trim() === options.sheetName!.toLowerCase().trim()
    );
    if (matchedSheet) {
      targetSheetName = matchedSheet;
    } else if (options?.strictSheet) {
      return { headers: [], rows: [] };
    }
  }

  const sheet = wb.Sheets[targetSheetName] || wb.Sheets[wb.SheetNames[0]];

  // 2. Automatic & Comprehensive Header Row Detection
  let range = 0;
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
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
  const json = XLSX.utils.sheet_to_json(sheet, { range, defval: '', raw: rawOption }) as Record<string, unknown>[];

  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  return { headers, rows: json };
}

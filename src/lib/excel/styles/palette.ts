export interface StatusStyle {
  headerFill: string;
  headerFont: string;
  rowFill: string;
}

export const STATUS_STYLES: Record<string, StatusStyle> = {
  'Matched': { headerFill: '1B7A4D', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Matched (Rounded)': { headerFill: '2E8B57', headerFont: 'FFFFFF', rowFill: 'E6F5ED' },
  'Mismatch': { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Missing in 2B': { headerFill: 'DC2626', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Missing in PR': { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Not in Books': { headerFill: '2563EB', headerFont: 'FFFFFF', rowFill: 'DBEAFE' },
  'Possible Match': { headerFill: '6B7280', headerFont: 'FFFFFF', rowFill: 'F3F4F6' },
  'Name Matched (No GSTIN)': { headerFill: 'B45309', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Wrong GSTIN': { headerFill: 'B91C1C', headerFont: 'FFFFFF', rowFill: 'FEE2E2' },
  'Name Mismatch': { headerFill: 'D97706', headerFont: 'FFFFFF', rowFill: 'FEF3C7' },
  'Prior FY (Excluded)': { headerFill: '4B5563', headerFont: 'FFFFFF', rowFill: 'F3F4F6' },
};

export const DEFAULT_STYLE: StatusStyle = { headerFill: '1E3A5F', headerFont: 'FFFFFF', rowFill: 'FFFFFF' };

export const ACC_FMT = '_(* #,##0.00_);[Red]_(* (#,##0.00);_(* "-"??_);_(@_)';
export const ACC_FMT_ALT = '#,##0.00;(#,##0.00);"-"';

export const PARTY_STATUS_FILL: Record<string, string> = {
  'All Matched': 'E6F5ED',
  'Has Mismatches': 'FEF3C7',
  'Has Missing': 'FEE2E2',
};

export const PARTY_STATUS_HEADER: Record<string, string> = {
  'All Matched': '1B7A4D',
  'Has Mismatches': 'B45309',
  'Has Missing': 'B91C1C',
};

// Helper to add professional icons to status text
export function enrichStatusWithIcon(status: string): string {
  const s = status.trim();
  if (s.includes('Perfect') || s === 'Matched' || s.includes('Rounded') || s.includes('Diff Date')) return `✅ ${s}`;
  if (s.includes('Value Mismatch') || s === 'Mismatch' || s.includes('Name Mismatch')) return `⚠️ ${s}`;
  if (s === 'Missing in 2B' || s === 'Not in 2B' || s === 'Unmatched Vendor') return `🚨 ${s}`;
  if (s === 'Missing in PR' || s === 'Not in Books') return `🟦 ${s}`;
  if (s.includes('Prior FY')) return `⏳ ${s}`;
  if (s.includes('Wrong GSTIN')) return `❌ ${s}`;
  if (s.includes('Possible')) return `🔎 ${s}`;
  return s;
}

// Compute auto-fit widths from header + data arrays
export function autoFitCols(headers: string[], data: (string | number)[][]): { wch: number }[] {
  return headers.map((h, c) => {
    let max = String(h ?? '').length;
    for (const row of data) {
      const v = row[c];
      const len = v == null ? 0 : (typeof v === 'number' ? v.toFixed(2).length : String(v).length);
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 1, 8), 35) };
  });
}

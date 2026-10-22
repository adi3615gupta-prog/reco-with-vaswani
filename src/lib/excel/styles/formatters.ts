import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export const r2 = (n: number): number => +(Number(n) || 0).toFixed(2);

// Helper to convert unknown currency/string/number values to numeric float safely
export function numVal(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : Math.round(v * 100) / 100;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function parseMonthFY(s?: string): number {
  if (!s) return -1;
  const str = String(s).trim();
  if (!str) return -1;

  const fyIdx = (m: number) => ((m >= 3 && m <= 11) ? m - 3 : (m >= 0 && m <= 2) ? m + 9 : -1);

  const lower = str.toLowerCase();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  for (let i = 0; i < 12; i++) {
    if (lower.includes(fullMonths[i]) || lower.includes(months[i])) {
      return fyIdx(i);
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY date strings
  const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const month = parseInt(m[2], 10) - 1;
    if (month >= 0 && month <= 11) return fyIdx(month);
  }

  return -1;
}

// Convert Excel serial date number to { y, m, d }
export function serialToYMD(serial: number): { y: number; m: number; d: number } | null {
  if (isNaN(serial) || serial <= 0) return null;
  try {
    if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return { y: parsed.y, m: parsed.m, d: parsed.d };
      }
    }
  } catch {
    // fallback
  }

  const msPerDay = 86400000;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const date = new Date(excelEpoch.getTime() + serial * msPerDay);
  if (isNaN(date.getTime())) return null;

  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate()
  };
}

export function dateToYMD(d: Date): { y: number; m: number; d: number } {
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate()
  };
}

// Formats arbitrary date values into standard "DD-MMM-YYYY" format
export function formatDateStr(v: unknown, contextRow?: Record<string, unknown>): string {
  if (v == null || v === '') return '';

  let ymd: { y: number; m: number; d: number } | null = null;

  if (v instanceof Date) {
    if (!isNaN(v.getTime())) {
      ymd = dateToYMD(v);
    }
  } else if (typeof v === 'number') {
    ymd = serialToYMD(v);
  } else if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';

    // Regex 1: YYYY-MM-DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      ymd = { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
    }

    // Regex 2: DD-MM-YYYY or DD/MM/YYYY
    if (!ymd) {
      m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (m) {
        ymd = { d: parseInt(m[1], 10), m: parseInt(m[2], 10), y: parseInt(m[3], 10) };
      }
    }

    // Regex 3: DD-MMM-YYYY or DD-MMM-YY
    if (!ymd) {
      m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})/);
      if (m) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const mIdx = months.indexOf(m[2].toLowerCase());
        if (mIdx !== -1) {
          let y = parseInt(m[3], 10);
          if (y < 100) y += y > 50 ? 1900 : 2000;
          ymd = { d: parseInt(m[1], 10), m: mIdx + 1, y };
        }
      }
    }

    if (!ymd) {
      const parsedNum = Number(s);
      if (!isNaN(parsedNum) && parsedNum > 20000 && parsedNum < 90000) {
        ymd = serialToYMD(parsedNum);
      } else {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          ymd = dateToYMD(d);
        }
      }
    }
  }

  // Disambiguate US locale date swaps using contextRow period
  if (ymd && contextRow) {
    const periodField = String(
      contextRow['Period'] || contextRow['period'] ||
      contextRow['Return Period'] || contextRow['return period'] ||
      contextRow['Return period'] || contextRow['Month'] || contextRow['month'] || ''
    ).toLowerCase().trim();

    if (periodField) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      for (let i = 0; i < 12; i++) {
        const mNum = i + 1;
        const monthStr = months[i];
        const regex = new RegExp('\\b' + monthStr + '[a-z]*\\b', 'i');
        if (regex.test(periodField)) {
          if (ymd.d === mNum && ymd.m !== mNum && ymd.m <= 12) {
            const oldDay = ymd.m;
            ymd.m = mNum;
            ymd.d = oldDay;
          }
          break;
        }
      }
    }
  }

  if (ymd && ymd.y > 1900 && ymd.m >= 1 && ymd.m <= 12 && ymd.d >= 1 && ymd.d <= 31) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(ymd.d).padStart(2, '0');
    return `${dd}-${months[ymd.m - 1]}-${ymd.y}`;
  }

  return String(v).trim();
}

// Format date to "MMM-yy" string for difference months tracking (e.g. Apr-26)
export function getDiffMonthStr(v: unknown): string {
  if (v == null || v === '') return '';
  const formatted = formatDateStr(v);
  const m = formatted.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const yy = m[3].slice(-2);
    return `${m[2]}-${yy}`;
  }
  return '';
}

// Compute Financial Year from a date string/number
export function extractFY(v: unknown): string {
  if (v == null || v === '') return '';
  const formatted = formatDateStr(v);
  const m = formatted.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mm = months.indexOf(m[2]);
    const year = parseInt(m[3], 10);
    if (mm !== -1 && !isNaN(year)) {
      return mm >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
  }
  return '';
}

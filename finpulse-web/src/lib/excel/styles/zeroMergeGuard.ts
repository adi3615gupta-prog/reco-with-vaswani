import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

// Merges allowed in a sheet: only the title row (row 1) and subtitle row (row 2), when each holds a single text cell.
// Data tables never merge, so filters, sorting and lookups keep working.
export function titleMerges(ws: any): any[] {
  const ref = ws && ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  if (range.e.c < 1) return [];
  const merges: any[] = [];
  for (let r = 0; r <= Math.min(1, range.e.r); r++) {
    let filled = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') filled++;
    }
    const first = ws[XLSX.utils.encode_cell({ r, c: range.s.c })];
    if (filled === 1 && first && String(first.v).trim() !== '') {
      merges.push({ s: { r, c: range.s.c }, e: { r, c: range.e.c } });
    }
  }
  return merges;
}

// Strips every cell merge except the title and subtitle rows
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.Sheets) return wb;
  const names = Array.isArray(wb.SheetNames) && wb.SheetNames.length > 0 ? wb.SheetNames : Object.keys(wb.Sheets);
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (ws) {
      ws['!merges'] = titleMerges(ws);
    }
  }
  return wb;
}

// Invariant assertion verifying that NO sheet contains merged cells
export function assertZeroMerges(wb: XLSX.WorkBook): void {
  if (!wb || !wb.SheetNames || !wb.Sheets) return;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const allowed = titleMerges(ws);
    const extra = Array.isArray(ws && ws['!merges']) ? ws['!merges'].length - allowed.length : 0;
    if (ws && extra > 0) {
      throw new Error(`Zero-Merge Invariant Violation: Sheet '${name}' contains ${extra} merged cell ranges outside the title rows.`);
    }
  }
}

// Central Corporate Workbook Assembler Pipeline
export function buildCorporateWorkbook(
  builderFn: (wb: XLSX.WorkBook) => void,
  options?: { dense?: boolean }
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  builderFn(wb);
  removeAllMergesFromWorkbook(wb);
  assertZeroMerges(wb);
  return wb;
}

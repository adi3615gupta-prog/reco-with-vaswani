import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

// Strips all cell merges from an entire workbook to guarantee clean sorting, filtering and formulas
export function removeAllMergesFromWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  if (!wb || !wb.SheetNames || !wb.Sheets) return wb;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws) {
      if (ws['!merges']) {
        delete ws['!merges'];
      }
      ws['!merges'] = [];
    }
  }
  return wb;
}

// Invariant assertion verifying that NO sheet contains merged cells
export function assertZeroMerges(wb: XLSX.WorkBook): void {
  if (!wb || !wb.SheetNames || !wb.Sheets) return;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (ws && Array.isArray(ws['!merges']) && ws['!merges'].length > 0) {
      throw new Error(`Zero-Merge Invariant Violation: Sheet '${name}' contains ${ws['!merges'].length} merged cell ranges.`);
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

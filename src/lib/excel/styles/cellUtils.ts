import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export function isDenseWorksheet(ws: any): boolean {
  if (!ws) return false;
  return Array.isArray(ws['!data']) || Array.isArray(ws[0]);
}

export function setCell(ws: any, r: number, c: number, cell: any): void {
  if (!ws) return;
  const cellObj = typeof cell === 'object' && cell !== null ? cell : { v: cell, t: typeof cell === 'number' ? 'n' : 's' };

  if (Array.isArray(ws['!data'])) {
    while (ws['!data'].length <= r) {
      ws['!data'].push([]);
    }
    const row = ws['!data'][r];
    while (row.length <= c) {
      row.push(undefined);
    }
    row[c] = cellObj;
  } else if (Array.isArray(ws[r]) || ws[0] !== undefined) {
    if (!ws[r]) ws[r] = [];
    while (ws[r].length <= c) {
      ws[r].push(undefined);
    }
    ws[r][c] = cellObj;
  } else {
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = cellObj;
  }
}

export function getCell(ws: any, r: number, c: number): any {
  if (!ws) return undefined;
  if (Array.isArray(ws['!data'])) {
    const row = ws['!data'][r];
    return row ? row[c] : undefined;
  }
  if (Array.isArray(ws[r])) {
    return ws[r][c];
  }
  const addr = XLSX.utils.encode_cell({ r, c });
  return ws[addr];
}

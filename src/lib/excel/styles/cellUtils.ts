import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export function setCell(ws: any, r: number, c: number, cell: any): void {
  if (!ws) return;

  if (Array.isArray(ws['!data'])) {
    while (ws['!data'].length <= r) {
      ws['!data'].push([]);
    }
    const row = ws['!data'][r];
    while (row.length <= c) {
      row.push(undefined);
    }
    row[c] = typeof cell === 'object' && cell !== null ? cell : { v: cell, t: typeof cell === 'number' ? 'n' : 's' };
  } else {
    const addr = XLSX.utils.encode_cell({ r, c });
    ws[addr] = typeof cell === 'object' && cell !== null ? cell : { v: cell, t: typeof cell === 'number' ? 'n' : 's' };
  }
}

export function getCell(ws: any, r: number, c: number): any {
  if (!ws) return undefined;
  if (Array.isArray(ws['!data'])) {
    const row = ws['!data'][r];
    return row ? row[c] : undefined;
  }
  const addr = XLSX.utils.encode_cell({ r, c });
  return ws[addr];
}

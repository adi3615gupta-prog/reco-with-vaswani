const XLSX = require('xlsx');

const aoa = [
  ['Header', 'Val1', 'Val2', 'Diff'],
  ['Row1', 100, 20, '=B2-C2'],
  ['Total', '=SUM(B2:B2)', '=SUM(C2:C2)', '=SUM(D2:D2)']
];

const ws = XLSX.utils.aoa_to_sheet(aoa);

for (const k in ws) {
  if (k.startsWith('!')) continue;
  const cell = ws[k];
  if (typeof cell.v === 'string' && cell.v.startsWith('=')) {
    cell.f = cell.v.substring(1);
    delete cell.v;
    cell.t = 'n';
    cell.z = '#,##0.00;(#,##0.00);"-"';
  } else if (typeof cell.v === 'number') {
    cell.z = '#,##0.00;(#,##0.00);"-"';
  }
}

console.log('D2:', ws['D2']);
console.log('B3:', ws['B3']);
console.log('D3:', ws['D3']);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Test');
XLSX.writeFile(wb, 'scratch/test_out.xlsx');
console.log('Wrote test_out.xlsx');

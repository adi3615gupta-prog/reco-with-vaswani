import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';

export function exportClientTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['GSTIN', 'Trade Name', 'Legal Name', 'Email Address', 'Phone Number'],
    ['27AADCB2230M1Z4', 'Vaswani Enterprises', 'Sourav Vaswani', 'notifications@reco.com', '+91 98765 43210']
  ]);

  ws['A1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['B1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['C1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['D1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
  ws['E1'].s = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };

  ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 18 }];
  ws['!rows'] = [{ hpt: 20 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Client Import Template');
  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, 'GST_Client_Import_Template.xlsx');
  } catch (err) {
    console.error('Failed to write client template:', err);
  }
  return wb;
}

export function export3BTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Particulars', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'Total'],
    ['(4) All other ITC', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Integrated Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Central Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['State/UT Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Outward taxable supplies', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Taxable Value', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Integrated Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Central Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['State/UT Tax', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ]);

  ws['!cols'] = [{ wch: 30 }, ...Array(13).fill({ wch: 12 })];
  ws['!rows'] = [{ hpt: 22 }];

  const headerStyle = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center' } };
  const subHeadingStyle = { fill: { fgColor: { rgb: 'E5E7EB' } }, font: { bold: true } };

  for (let c = 0; c <= 13; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }
  ws['A2'].s = subHeadingStyle;
  ws['A7'].s = subHeadingStyle;

  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B Template');
  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, 'GSTR-3B_Manual_Template.xlsx');
  } catch (err) {
    console.error('Failed to write 3B template:', err);
  }
  return wb;
}

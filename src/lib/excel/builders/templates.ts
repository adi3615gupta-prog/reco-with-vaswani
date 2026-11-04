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
  XLSX.utils.book_append_sheet(wb, ws, 'Client Import Template');
  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, 'GST_Client_Import_Template.xlsx');
  } catch (err) {
    console.error('Failed to write client template:', err);
  }
  return wb;
}

export function exportClientAdditionTemplate(): XLSX.WorkBook {

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['GSTIN', 'Trade Name', 'Legal Name', 'Email Address', 'Phone Number', 'Portal Username', 'Portal Password'],
    ['27AADCB2230M1Z4', 'Vaswani Enterprises', 'Vaswani Enterprises Private Limited', 'accounts@vaswanient.com', '+91 98230 12345', 'vaswani_portal', 'Pass#2026'],
    ['24AAACA1234B1Z5', 'Gujarat Steel Traders', 'Gujarat Steel Traders LLP', 'tax@gujaratsteel.in', '+91 98790 54321', 'gujsteel_gst', 'Steel@8899'],
    ['07AAAAA0000A1Z5', 'Apex Logistics Solution', 'Apex Logistics Solution Pvt Ltd', 'billing@apexlogistics.com', '+91 99110 22334', 'apex_gstin', 'Apex#4433']
  ]);

  const headerStyle = {
    fill: { fgColor: { rgb: '1E3A8A' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'].forEach(cell => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });

  ws['!cols'] = [
    { wch: 20 }, // GSTIN
    { wch: 28 }, // Trade Name
    { wch: 32 }, // Legal Name
    { wch: 28 }, // Email Address
    { wch: 18 }, // Phone Number
    { wch: 20 }, // Portal Username
    { wch: 20 }  // Portal Password
  ];
  ws['!rows'] = [{ hpt: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Client Master Addition');
  removeAllMergesFromWorkbook(wb);
  try {
    XLSX.writeFile(wb, 'GST_Client_Addition_Template.xlsx');
  } catch (err) {
    console.error('Failed to write client addition template:', err);
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

import * as XLSX from 'xlsx-js-style';
import { makeHyperlinkCell } from './allInvoicesSheet';

export function appendNavigationSheet(
  wb: XLSX.WorkBook,
  sheetNames: string[],
  companyName?: string,
  stats?: { label: string; value: string | number }[],
  breakdown?: { label: string; value: string | number }[]
) {
  const ws = XLSX.utils.aoa_to_sheet([]);

  const rows: (string | number | XLSX.CellObject)[][] = [];

  // Rows 1-10: Large Corporate Banner
  for (let i = 0; i < 9; i++) {
    rows.push(['', '', '', '']);
  }

  rows[1][1] = 'VASWANI RETURN ENTERPRISE';
  rows[2][1] = 'GST RECONCILIATION DASHBOARD';
  rows[4][1] = `COMPANY: ${companyName?.toUpperCase() || 'NOT PROVIDED'}`;
  rows[5][1] = `GENERATED: ${new Date().toLocaleString('en-IN').toUpperCase()}`;
  rows[6][1] = 'PREPARED BY: SYSTEM AUDIT ENGINE';

  let rIdx = 9;

  // High-Level KPIs & Metrics
  if (stats && stats.length > 0) {
    rows.push(['', 'EXECUTIVE METRICS', '', '']);
    rIdx++;
    for (const st of stats) {
      rows.push(['', st.label, st.value, '']);
      rIdx++;
    }
    rows.push(['', '', '', '']);
    rIdx++;
  }

  // Navigation Links
  rows.push(['', 'INTERACTIVE DASHBOARD MENU', '', '']);
  rows.push(['', 'Report Section', 'Description', 'Action']);
  const navHeaderRow = rIdx + 1;
  rIdx += 2;

  const descriptions: Record<string, string> = {
    'Executive Summary': 'High-level reconciliation statistics and variance analysis.',
    'All Records': 'Master database of all reconciled and unreconciled invoices.',
    'Party Summary': 'Vendor/Customer-level net differences and matching status.',
    'Party Details': 'Deep-dive into individual invoices grouped by party.',
    'Monthly Comparison': 'Month-by-month summary of input vs 2B / output vs GSTR-1.',
    'Party-wise Summary': 'Vendor/Customer-level net differences and aggregated matching status.',
    'Monthly Tax Comparison': 'Detailed financial year matrix of Tax allocations.',
    'Monthly Tax Comparison FY': 'Alternative layout for FY tax allocations.',
    'Applied GSTINs': 'Log of GSTINs automatically corrected during review.',
    'GSTIN Conflicts': 'Duplicate GSTINs requiring manual resolution.',
    'GST Pipeline': 'Management view for missing and duplicate GSTINs.',
    '📖 Methodology & Legend': 'Explanation of matching logic, tolerances, and color codes.',
  };

  for (const sheetName of sheetNames) {
    rows.push([
      '',
      sheetName,
      descriptions[sheetName] || `${sheetName} Data Sheet`,
      makeHyperlinkCell(sheetName, `▶ OPEN MODULE`)
    ]);
    rIdx++;
  }

  XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A1' });

  // Columns: A: Spacer, B: Section/Label, C: Value/Desc, D: Action
  ws['!cols'] = [{ wch: 3 }, { wch: 35 }, { wch: 65 }, { wch: 20 }];

  if (!ws['!rows']) ws['!rows'] = [];

  // Banner Styling (Rows 0-8)
  for (let r = 0; r < 9; r++) {
    ws['!rows'][r] = { hpt: r === 2 ? 35 : (r === 1 ? 20 : 18) };
    for (let c = 0; c < 4; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      let fgColor = '1E3A8A'; // Deep Corporate Blue
      if (r === 8) fgColor = '0F172A'; // Darker bottom border line of banner

      ws[addr].s = { fill: { fgColor: { rgb: fgColor } } };
    }
  }

  // Banner Text Styling
  const setBannerText = (r: number, sz: number, bold: boolean, color: string) => {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '1E3A8A' } },
        font: { name: 'Segoe UI', sz, bold, color: { rgb: color } },
        alignment: { vertical: 'center', horizontal: 'left' }
      };
    }
  };

  setBannerText(1, 12, true, '93C5FD'); // Light blue subtitle
  setBannerText(2, 24, true, 'FFFFFF'); // White main title
  setBannerText(4, 11, true, 'F1F5F9');
  setBannerText(5, 10, false, 'CBD5E1');
  setBannerText(6, 10, false, 'CBD5E1');

  // Merging banner cells for clean look
  if (!ws['!merges']) ws['!merges'] = [];
  for (let r = 1; r <= 6; r++) {
    ws['!merges'].push({ s: { r, c: 1 }, e: { r, c: 3 } });
  }

  let currRow = 9;

  // Style Metrics Section
  if (stats && stats.length > 0) {
    ws['!rows'][currRow] = { hpt: 24 };
    const titleAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
    ws[titleAddr].s = {
      font: { name: 'Segoe UI', bold: true, sz: 12, color: { rgb: '1E3A8A' } },
      alignment: { vertical: 'bottom' }
    };
    ws['!merges'].push({ s: { r: currRow, c: 1 }, e: { r: currRow, c: 3 } });
    currRow++;

    for (const st of stats) {
      ws['!rows'][currRow] = { hpt: 20 };
      const lblAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
      const valAddr = XLSX.utils.encode_cell({ r: currRow, c: 2 });

      if (ws[lblAddr]) {
        ws[lblAddr].s = {
          font: { name: 'Segoe UI', bold: true, sz: 10, color: { rgb: '475569' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          border: { left: { style: 'thick', color: { rgb: '3B82F6' } }, bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
          alignment: { vertical: 'center', indent: 1 }
        };
      }

      if (ws[valAddr]) {
        ws[valAddr].s = {
          font: { name: 'Segoe UI', bold: true, sz: 11, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          border: { right: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
          alignment: { vertical: 'center' }
        };
      }
      ws['!merges'].push({ s: { r: currRow, c: 2 }, e: { r: currRow, c: 3 } });
      currRow++;
    }
    currRow++; // spacing
  }

  // Style Navigation Section
  ws['!rows'][currRow] = { hpt: 28 };
  const navTitleAddr = XLSX.utils.encode_cell({ r: currRow, c: 1 });
  ws[navTitleAddr].s = {
    font: { name: 'Segoe UI', bold: true, sz: 12, color: { rgb: '1E3A8A' } },
    alignment: { vertical: 'bottom' }
  };
  ws['!merges'].push({ s: { r: currRow, c: 1 }, e: { r: currRow, c: 3 } });
  currRow++;

  ws['!rows'][currRow] = { hpt: 20 };
  for (let c = 1; c <= 3; c++) {
    const addr = XLSX.utils.encode_cell({ r: currRow, c });
    if (ws[addr]) {
      ws[addr].s = {
        fill: { fgColor: { rgb: '0F172A' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: c === 3 ? 'center' : 'left', indent: c === 3 ? 0 : 1 }
      };
    }
  }
  currRow++;

  for (let i = 0; i < sheetNames.length; i++) {
    const row = currRow;
    ws['!rows'][row] = { hpt: 24 };
    const labelAddr = XLSX.utils.encode_cell({ r: row, c: 1 });
    const descAddr = XLSX.utils.encode_cell({ r: row, c: 2 });
    const actionAddr = XLSX.utils.encode_cell({ r: row, c: 3 });

    if (ws[labelAddr]) {
      ws[labelAddr].s = {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: '0F172A' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
        border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } } },
      };
    }
    if (ws[descAddr]) {
      ws[descAddr].s = {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        font: { name: 'Segoe UI', color: { rgb: '475569' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
        border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
      };
    }
    if (ws[actionAddr]) {
      ws[actionAddr].s = {
        fill: { fgColor: { rgb: '2563EB' } },
        font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: 'FFFFFF' } },
          bottom: { style: 'medium', color: { rgb: 'FFFFFF' } },
          left: { style: 'medium', color: { rgb: 'FFFFFF' } },
          right: { style: 'medium', color: { rgb: 'FFFFFF' } },
        },
      };
    }
    currRow++;
  }

  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 9 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Dashboard');
  wb.SheetNames = ['Dashboard', ...wb.SheetNames.filter((name) => name !== 'Dashboard' && name !== 'Navigation')];
}

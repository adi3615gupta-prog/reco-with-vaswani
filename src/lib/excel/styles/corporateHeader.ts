import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;

export function addCorporateHeader(
  ws: XLSX.WorkSheet,
  colCount: number,
  companyName: string | undefined,
  reportName: string,
  tabs?: { name: string; target: string }[]
): void {
  const comp = (companyName || 'GST Reconciliation').toUpperCase();
  const title = `${comp} - ${reportName.toUpperCase()}`;
  const subtitle = `Report Generated on: ${new Date().toLocaleString('en-IN')} | Powered by Vaswani Return`;

  XLSX.utils.sheet_add_aoa(ws, [[title], [subtitle]], { origin: 'A1' });

  const isNavSheet = reportName === 'Navigation' || reportName === 'Dashboard';
  const hasTabs = !isNavSheet && Boolean(tabs && tabs.length > 0);

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 24 };
  ws['!rows'][1] = { hpt: 14 };

  const tAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const sAddr = XLSX.utils.encode_cell({ r: 1, c: 0 });

  if (hasTabs && tabs) {
    const startTabCol = 8;
    const actualMaxCol = Math.max(colCount - 1, startTabCol + tabs.length - 1);

    for (let i = 0; i < tabs.length; i++) {
      const tabCol = startTabCol + i;
      const addr = XLSX.utils.encode_cell({ r: 0, c: tabCol });
      const subAddr = XLSX.utils.encode_cell({ r: 1, c: tabCol });
      const isActive = tabs[i].target === reportName;

      ws[addr] = {
        t: 's',
        v: tabs[i].name,
        l: { Target: `#'${tabs[i].target}'!A1`, Tooltip: `Switch to ${tabs[i].name}` },
      };
      ws[addr].s = {
        fill: { fgColor: { rgb: isActive ? '3B82F6' : '1E293B' } },
        font: { sz: 10, color: { rgb: 'FFFFFF' }, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: '0F172A' } },
          bottom: { style: 'medium', color: { rgb: '0F172A' } },
          left: { style: 'medium', color: { rgb: '0F172A' } },
          right: { style: 'medium', color: { rgb: '0F172A' } }
        },
      };
      ws[subAddr] = {
        t: 's',
        v: '',
        s: {
          fill: { fgColor: { rgb: isActive ? '3B82F6' : '1E293B' } },
          border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } }
        }
      };
    }

    for (let c = startTabCol + tabs.length; c <= actualMaxCol; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '0F172A' } } } };
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: '1E293B' } }, border: { bottom: { style: 'thin', color: { rgb: '0F172A' } } } } };
    }

    if (ws[tAddr]) {
      ws[tAddr].s = { fill: { fgColor: { rgb: '0F172A' } }, font: { sz: 13, color: { rgb: 'F8FAFC' }, bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    if (ws[sAddr]) {
      ws[sAddr].s = { fill: { fgColor: { rgb: '1E293B' } }, font: { sz: 9, color: { rgb: '94A3B8' }, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
  } else {
    // Clean corporate header without dark navbar fills
    if (ws[tAddr]) {
      ws[tAddr].s = { font: { sz: 12, color: { rgb: '0F172A' }, bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    if (ws[sAddr]) {
      ws[sAddr].s = { font: { sz: 9, color: { rgb: '64748B' }, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
  }
}

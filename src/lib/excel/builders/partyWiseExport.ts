import * as XLSX from 'xlsx-js-style';
import type { MonthlyComparisonRow, DebitNoteRecord } from '../types';
import type { PartySummary } from '@/lib/partyWise';
import { ACC_FMT } from '../styles/palette';
import { formatDateStr, numVal, parseMonthFY, getDiffMonthStr, r2 } from '../styles/formatters';
import { addCorporateHeader } from '../styles/corporateHeader';
import { removeAllMergesFromWorkbook } from '../styles/zeroMergeGuard';
import { normalizePartyName } from '@/lib/reconciliation';
import { appendExecutiveSummary, appendMethodologySheet } from './executiveSummary';
import { appendGstinReports } from './allInvoicesSheet';
import { appendNavigationSheet } from './navigationSheet';

export const PARTY_STATUS_FILL: Record<string, string> = {
  'All Matched': 'E6F5ED',
  'Has Mismatches': 'FEF3C7',
  'Has Missing': 'FEE2E2',
};

export const PARTY_STATUS_HEADER: Record<string, string> = {
  'All Matched': '1B7A4D',
  'Has Mismatches': 'B45309',
  'Has Missing': 'B91C1C',
};

export function deriveOverallStatus(statuses: Set<string>): string {
  if (
    statuses.has('Missing in 2B') ||
    statuses.has('Missing in PR') ||
    statuses.has('Wrong GSTIN') ||
    statuses.has('Not in 2B') ||
    statuses.has('Not in Books') ||
    statuses.has('Unmatched Vendor')
  ) {
    return 'Has Missing';
  }
  if (
    statuses.has('Mismatch') ||
    statuses.has('Name Mismatch') ||
    statuses.has('Possible Match') ||
    statuses.has('Name Matched (No GSTIN)') ||
    statuses.has('Value Mismatch')
  ) {
    return 'Has Mismatches';
  }
  return 'All Matched';
}

type PartyAccum = {
  gstin: string;
  gstinPR: string;
  gstin2B: string;
  party: string;
  partyPR: string;
  party2B: string;
  invoices: Record<string, unknown>[];
  prCgst: number;
  prSgst: number;
  prIgst: number;
  cgst2B: number;
  sgst2B: number;
  igst2B: number;
  statuses: Set<string>;
};

export function appendPartyWiseSheets(
  wb: XLSX.WorkBook,
  results: Record<string, unknown>[],
  companyName?: string,
  tabs?: { name: string; target: string }[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] }
) {
  const map = new Map<string, PartyAccum>();
  const nameIndex = new Map<string, string>();
  let unknownIdx = 0;

  for (const r of results) {
    if (String(r['Status']) === 'Prior FY (Excluded)') continue;
    const gstinPR = String(r['GSTIN (PR)'] || '').toUpperCase().trim();
    const gstin2B = String(r['GSTIN (2B)'] || '').toUpperCase().trim();
    const partyPR = String(r['Supplier Name (PR)'] || '').trim();
    const party2B = String(r['Supplier Name (2B)'] || '').trim();

    const gstin = gstinPR || gstin2B;
    const party = partyPR || party2B;
    const normName = normalizePartyName(party);

    let key = gstin ? gstin : (normName ? `NAME::${normName}` : `UNKNOWN::${++unknownIdx}`);

    if (!gstin && normName && nameIndex.has(normName)) {
      key = nameIndex.get(normName)!;
    }
    if (gstin && normName && nameIndex.has(normName) && nameIndex.get(normName) !== gstin) {
      const existingKey = nameIndex.get(normName)!;
      if (existingKey.startsWith('NAME::') || existingKey.startsWith('UNKNOWN::')) {
        const existing = map.get(existingKey);
        if (existing) {
          let p = map.get(gstin);
          if (!p) {
            p = { gstin, gstinPR, gstin2B, party: existing.party || party, partyPR, party2B, invoices: [], prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0, statuses: new Set() };
            map.set(gstin, p);
          }
          p.invoices.push(...existing.invoices);
          p.prCgst += existing.prCgst; p.prSgst += existing.prSgst; p.prIgst += existing.prIgst;
          p.cgst2B += existing.cgst2B; p.sgst2B += existing.sgst2B; p.igst2B += existing.igst2B;
          existing.statuses.forEach(s => p!.statuses.add(s));
          if (!p.gstinPR && existing.gstinPR) p.gstinPR = existing.gstinPR;
          if (!p.gstin2B && existing.gstin2B) p.gstin2B = existing.gstin2B;
          if (!p.partyPR && existing.partyPR) p.partyPR = existing.partyPR;
          if (!p.party2B && existing.party2B) p.party2B = existing.party2B;
          map.delete(existingKey);
        }
        nameIndex.set(normName, gstin);
      }
      key = gstin;
    }

    let p = map.get(key);
    if (!p) {
      p = { gstin, gstinPR, gstin2B, party, partyPR, party2B, invoices: [], prCgst: 0, prSgst: 0, prIgst: 0, cgst2B: 0, sgst2B: 0, igst2B: 0, statuses: new Set() };
      map.set(key, p);
      if (normName && (!nameIndex.has(normName) || nameIndex.get(normName)!.startsWith('NAME::'))) {
        nameIndex.set(normName, key);
      }
    }
    if (!p.party && party) p.party = party;
    if (!p.gstin && gstin) p.gstin = gstin;
    if (!p.gstinPR && gstinPR) p.gstinPR = gstinPR;
    if (!p.gstin2B && gstin2B) p.gstin2B = gstin2B;
    if (!p.partyPR && partyPR) p.partyPR = partyPR;
    if (!p.party2B && party2B) p.party2B = party2B;
    p.invoices.push(r);
    p.prCgst += numVal(r['CGST (PR)']);
    p.prSgst += numVal(r['SGST (PR)']);
    p.prIgst += numVal(r['IGST (PR)']);
    p.cgst2B += numVal(r['CGST (2B)']);
    p.sgst2B += numVal(r['SGST (2B)']);
    p.igst2B += numVal(r['IGST (2B)']);
    p.statuses.add(String(r['Status'] || ''));
  }

  // Adjust debit notes if present
  if (debitNotes) {
    const getPartyKey = (gstin?: string, supplierName?: string): string => {
      const g = (gstin || '').toUpperCase().trim();
      const s = (supplierName || '').trim();
      const normName = normalizePartyName(s);

      if (g) {
        if (map.has(g)) return g;
        for (const [k, p] of map.entries()) {
          if (p.gstinPR === g || p.gstin2B === g) return k;
        }
        return g;
      }
      if (normName) {
        if (nameIndex.has(normName)) return nameIndex.get(normName)!;
        return `NAME::${normName}`;
      }
      return `UNKNOWN::DN_${++unknownIdx}`;
    };

    // Process Tally/PR Debit Notes
    for (const dn of (debitNotes.pr || [])) {
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      if (cgst === 0 && sgst === 0 && igst === 0) continue;

      const key = getPartyKey(dn.gstin, dn.supplierName);
      if (!map.has(key)) {
        const partyName = dn.supplierName || 'Debit Note Party';
        map.set(key, {
          gstin: dn.gstin || '', gstinPR: dn.gstin || '', gstin2B: '',
          party: partyName, partyPR: partyName, party2B: '',
          invoices: [], prCgst: 0, prSgst: 0, prIgst: 0,
          cgst2B: 0, sgst2B: 0, igst2B: 0,
          statuses: new Set()
        });
      }
      const p = map.get(key)!;
      p.prCgst -= cgst;
      p.prSgst -= sgst;
      p.prIgst -= igst;

      p.invoices.push({
        'Financial Year': 'TALLY_DN',
        'Invoice No (PR)': 'DN-Books',
        'Invoice No (2B)': '',
        'Invoice Date (PR)': formatDateStr(dn.invoiceDate || ''),
        'Invoice Date (2B)': '',
        'CGST (PR)': -cgst,
        'CGST (2B)': 0,
        'SGST (PR)': -sgst,
        'SGST (2B)': 0,
        'IGST (PR)': -igst,
        'IGST (2B)': 0,
        'Status': 'Debit Note (Books)',
      });
      p.statuses.add('Debit Note (Books)');
    }

    // Process GSTR-2B Debit/Credit Notes
    for (const dn of (debitNotes.twoB || [])) {
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      if (cgst === 0 && sgst === 0 && igst === 0) continue;

      const key = getPartyKey(dn.gstin, dn.supplierName);
      if (!map.has(key)) {
        const partyName = dn.supplierName || 'Debit Note Party';
        map.set(key, {
          gstin: dn.gstin || '', gstinPR: '', gstin2B: dn.gstin || '',
          party: partyName, partyPR: '', party2B: partyName,
          invoices: [], prCgst: 0, prSgst: 0, prIgst: 0,
          cgst2B: 0, sgst2B: 0, igst2B: 0,
          statuses: new Set()
        });
      }
      const p = map.get(key)!;
      p.cgst2B -= cgst;
      p.sgst2B -= sgst;
      p.igst2B -= igst;

      p.invoices.push({
        'Financial Year': '2B_DN',
        'Invoice No (PR)': '',
        'Invoice No (2B)': 'DN-2B',
        'Invoice Date (PR)': '',
        'Invoice Date (2B)': formatDateStr(dn.invoiceDate || ''),
        'CGST (PR)': 0,
        'CGST (2B)': -cgst,
        'SGST (PR)': 0,
        'SGST (2B)': -sgst,
        'IGST (PR)': 0,
        'IGST (2B)': -igst,
        'Status': 'Debit Note (Portal)',
      });
      p.statuses.add('Debit Note (Portal)');
    }
  }

  const parties = Array.from(map.values()).sort((a, b) =>
    (a.party || a.gstin).localeCompare(b.party || b.gstin)
  );

  // ---- Build 'Party Details' first so we know each party's anchor row ----
  const detailHeaders = [
    'Financial Year',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'IGST (PR)', 'IGST (2B)',
    'Status',
    'Auditor Action'
  ];
  const detailRows: (string | number)[][] = [];
  const partyAnchorRow: number[] = [];
  const merges: XLSX.Range[] = [];
  const subtotalRowIdxs = new Set<number>();
  const emptyRowIdxs = new Set<number>();

  for (const p of parties) {
    const overall = deriveOverallStatus(p.statuses);
    const startRowIdx = detailRows.length + 3;
    partyAnchorRow.push(startRowIdx + 1);

    const headerRow = Array(detailHeaders.length).fill('');
    headerRow[0] = `PR: ${p.partyPR || p.party || '—'} (${p.gstinPR || p.gstin || '—'})   |   2B: ${p.party2B || '—'} (${p.gstin2B || '—'})`;
    headerRow[detailHeaders.length - 2] = overall;
    headerRow[detailHeaders.length - 1] = `${p.invoices.length} invoices`;

    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: detailHeaders.length - 3 } });
    detailRows.push(headerRow);

    for (const inv of p.invoices) {
      detailRows.push([
        String(inv['Financial Year'] ?? ''),
        String(inv['Invoice No (PR)'] ?? ''),
        String(inv['Invoice No (2B)'] ?? ''),
        formatDateStr(inv['Invoice Date (PR)']),
        formatDateStr(inv['Invoice Date (2B)']),
        numVal(inv['CGST (PR)']), numVal(inv['CGST (2B)']),
        numVal(inv['SGST (PR)']), numVal(inv['SGST (2B)']),
        numVal(inv['IGST (PR)']), numVal(inv['IGST (2B)']),
        String(inv['Status'] ?? ''),
        ''
      ]);
    }

    const subRow = Array(detailHeaders.length).fill('');
    subRow[0] = 'SUBTOTAL';
    const hasInv = p.invoices.length > 0;
    const invEndRow = detailRows.length + 3;
    const invStartRow = invEndRow - p.invoices.length + 1;
    const subRowIdx = detailRows.length + 3;

    for (let col = 5; col <= 10; col++) {
      const colLetter = XLSX.utils.encode_col(col);
      subRow[col] = hasInv ? { t: 'n', f: `SUM(${colLetter}${invStartRow}:${colLetter}${invEndRow})`, z: ACC_FMT } : 0;
    }
    subRow[11] = { t: 's', f: `"Diff: ₹" & TEXT(ABS(F${subRowIdx + 1}-G${subRowIdx + 1})+ABS(H${subRowIdx + 1}-I${subRowIdx + 1})+ABS(J${subRowIdx + 1}-K${subRowIdx + 1}), "0.00")` };

    merges.push({ s: { r: subRowIdx, c: 0 }, e: { r: subRowIdx, c: 3 } });
    subtotalRowIdxs.add(subRowIdx);
    detailRows.push(subRow);

    emptyRowIdxs.add(detailRows.length + 3);
    detailRows.push(Array(detailHeaders.length).fill(''));
  }
  if (detailRows.length > 0) detailRows.pop();

  const wsDetails = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsDetails, [detailHeaders, ...detailRows], { origin: 'A3' });
  addCorporateHeader(wsDetails, detailHeaders.length, companyName, 'Party Details', tabs);
  if (!wsDetails['!merges']) wsDetails['!merges'] = [];
  wsDetails['!merges'].push(...merges);
  wsDetails['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  wsDetails['!cols'] = [
    { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
  ];

  if (!wsDetails['!rows']) wsDetails['!rows'] = [];
  wsDetails['!rows'][2] = { hpt: 18 };

  // Style header
  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsDetails[addr]) continue;
    wsDetails[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  const headerRowSet = new Set(partyAnchorRow.map(r => r - 1));
  for (let r = 0; r < detailRows.length; r++) {
    const excelRow = r + 3;
    if (emptyRowIdxs.has(excelRow)) continue;

    const isPartyHeader = headerRowSet.has(excelRow);
    const isSubtotal = subtotalRowIdxs.has(excelRow);
    wsDetails['!rows'][excelRow] = {
      hpt: isPartyHeader || isSubtotal ? 18 : 15,
      level: isPartyHeader || isSubtotal ? 0 : 1,
      hidden: false
    };

    const overall = isPartyHeader ? String(detailRows[r][detailHeaders.length - 2] || '') : '';
    const headerFill = PARTY_STATUS_HEADER[overall] || '1E3A5F';

    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsDetails[addr]) continue;

      const isNumCol = c >= 5 && c <= 10;
      if (isNumCol && !isPartyHeader) {
        wsDetails[addr].t = 'n';
        wsDetails[addr].z = ACC_FMT;
      }

      if (isPartyHeader) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: headerFill } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
          alignment: { vertical: 'center', horizontal: c >= detailHeaders.length - 2 ? 'right' : 'left' },
        };
      } else if (isSubtotal) {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 9, bold: true },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? ACC_FMT : undefined,
        };
      } else {
        wsDetails[addr].s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: { sz: 9 },
          alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
          numFmt: isNumCol ? ACC_FMT : undefined,
        };
      }
    }
  }

  // Data Validation for Auditor Action in Party Details
  const actionColIdxDetails = detailHeaders.indexOf('Auditor Action');
  if (actionColIdxDetails >= 0) {
    const letter = XLSX.utils.encode_col(actionColIdxDetails);
    wsDetails['!dataValidation'] = [{
      sqref: `${letter}4:${letter}${detailRows.length + 5}`,
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
    }];
  }
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Party Details');

  // ---- Build 'Party Summary' with hyperlinks to anchor rows in 'Party Details' ----
  const sumHeaders = [
    'GSTIN (PR)', 'GSTIN (2B)', 'PR Party Name', '2B Party Name',
    'PR CGST', 'PR SGST', 'PR IGST',
    '2B CGST', '2B SGST', '2B IGST',
    'Diff CGST (PR-2B)', 'Diff SGST (PR-2B)', 'Diff IGST (PR-2B)',
    'Difference Months',
  ];
  const sumData: any[][] = parties.map((p, i) => {
    const rowNum = i + 5;

    const diffMonths = new Set<string>();
    for (const inv of p.invoices) {
      const cgstPR = numVal(inv['CGST (PR)']);
      const cgst2B = numVal(inv['CGST (2B)']);
      const sgstPR = numVal(inv['SGST (PR)']);
      const sgst2B = numVal(inv['SGST (2B)']);
      const igstPR = numVal(inv['IGST (PR)']);
      const igst2B = numVal(inv['IGST (2B)']);

      if (Math.abs(cgstPR - cgst2B) > 0.01 || Math.abs(sgstPR - sgst2B) > 0.01 || Math.abs(igstPR - igst2B) > 0.01) {
        const dateVal = (inv['Invoice Date (PR)'] || inv['Invoice Date (2B)']) as string;
        const monthStr = getDiffMonthStr(dateVal);
        if (monthStr) diffMonths.add(monthStr);
      }
    }
    const sortedMonths = Array.from(diffMonths).sort((a, b) => {
      const parseMY = (s: string) => {
        const parts = s.split('-');
        if (parts.length === 2) {
          const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(parts[0]);
          let y = parseInt(parts[1]);
          if (y < 100) y += 2000;
          if (mIdx >= 0 && !isNaN(y)) return new Date(y, mIdx, 1).getTime();
        }
        return 0;
      };
      return parseMY(a) - parseMY(b);
    });
    const diffMonthsStr = sortedMonths.join(', ') || '—';

    return [
      p.gstinPR || p.gstin || '',
      p.gstin2B || '',
      p.partyPR || p.party || '',
      p.party2B || '',
      +p.prCgst.toFixed(2), +p.prSgst.toFixed(2), +p.prIgst.toFixed(2),
      +p.cgst2B.toFixed(2), +p.sgst2B.toFixed(2), +p.igst2B.toFixed(2),
      { t: 'n', f: `E${rowNum}-H${rowNum}`, z: ACC_FMT },
      { t: 'n', f: `F${rowNum}-I${rowNum}`, z: ACC_FMT },
      { t: 'n', f: `G${rowNum}-J${rowNum}`, z: ACC_FMT },
      diffMonthsStr
    ];
  });
  const sumLastRow = parties.length + 5;
  sumData.unshift([
    'GRAND TOTAL', '', '', '',
    { t: 'n', f: `SUM(E5:E${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(F5:F${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(G5:G${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(H5:H${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(I5:I${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(J5:J${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${sumLastRow})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${sumLastRow})`, z: ACC_FMT },
    '',
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsSummary, [sumHeaders, ...sumData], { origin: 'A3' });
  addCorporateHeader(wsSummary, sumHeaders.length, companyName, 'Party Summary', tabs);
  wsSummary['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 18 },
  ];
  wsSummary['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  if (!wsSummary['!rows']) wsSummary['!rows'] = [];
  wsSummary['!rows'][2] = { hpt: 18 };

  // Header style
  for (let c = 0; c < sumHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsSummary[addr]) continue;

    let fill = '1E3A5F';
    if (c >= 4 && c <= 6) fill = '1E3A5F';
    else if (c >= 7 && c <= 9) fill = '0D7A5F';
    else if (c >= 10 && c <= 12) fill = 'B45309';
    else if (c === 13) fill = '7C3AED';

    wsSummary[addr].s = {
      fill: { fgColor: { rgb: fill } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data rows + hyperlinks on the Party Name cell
  for (let i = 0; i <= parties.length; i++) {
    const excelRow = i + 3;
    const isTotal = i === 0;
    wsSummary['!rows'][excelRow] = { hpt: 15 };

    for (let c = 0; c < sumHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsSummary[addr]) continue;

      wsSummary[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 9, bold: isTotal },
        alignment: { vertical: 'center', horizontal: (c >= 4 && c <= 12) ? 'right' : 'left' },
        border: isTotal ? { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'medium', color: { rgb: '000000' } } } : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: (c >= 4 && c <= 12) ? ACC_FMT : undefined,
      };
    }
    if (!isTotal) {
      const linkAddr = XLSX.utils.encode_cell({ r: excelRow, c: 2 });
      if (wsSummary[linkAddr]) {
        wsSummary[linkAddr].l = {
          Target: `#'Party Details'!A${partyAnchorRow[i - 1]}`,
          Tooltip: `Jump to ${parties[i - 1].party || parties[i - 1].gstin} in Party Details`,
        };
        wsSummary[linkAddr].s = {
          fill: { fgColor: { rgb: excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF' } },
          font: { sz: 9, color: { rgb: '1D4ED8' }, underline: true },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Party Summary');

  // Build 'GST Pipeline' sheet
  addGSTPipelineSheet(wb, parties as any, companyName, tabs);
}

export function addGSTPipelineSheet(
  wb: XLSX.WorkBook,
  parties: PartySummary[],
  companyName: string = '',
  tabs?: { name: string; target: string }[]
) {
  const pipelineHeaders = [
    'GSTIN', 'Party Name (PR)', 'Party Name (2B)',
    'PR Invoices', '2B Invoices', 'Status',
    'Issue Type', 'Suggested Action'
  ];

  const pipelineData: any[][] = (parties as any[])
    .filter(p => {
      const hasMissingGstin = !p.gstin || p.gstin === '';
      const hasMultipleNames = (p.party || p.partyName) !== (p.partyName2B || '') && p.partyName2B;
      const hasMismatch = p.partyNamePR && p.partyName2B && normalizePartyName(p.partyNamePR) !== normalizePartyName(p.partyName2B);
      return hasMissingGstin || hasMultipleNames || hasMismatch;
    })
    .map((p) => {
      let status = 'OK';
      let issueType = '—';
      let suggestedAction = '—';

      if (!p.gstin || p.gstin === '') {
        status = 'MISSING GSTIN';
        issueType = 'MISSING';
        suggestedAction = 'Add GSTIN to books';
      } else if (p.partyNamePR && p.partyName2B && normalizePartyName(p.partyNamePR) !== normalizePartyName(p.partyName2B)) {
        status = 'NAME MISMATCH';
        issueType = 'MISMATCH';
        suggestedAction = 'Review and harmonize party names';
      }

      const invoiceCount = p.totals ? p.totals.count : p.invoices?.length || 0;

      return [
        p.gstin || '(Missing)',
        p.party || p.partyName || '',
        p.partyName2B || '',
        invoiceCount,
        invoiceCount,
        status,
        issueType,
        suggestedAction,
      ];
    });

  const wsPipeline = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsPipeline, [pipelineHeaders, ...pipelineData], { origin: 'A3' });
  addCorporateHeader(wsPipeline, pipelineHeaders.length, companyName, 'GST Pipeline', tabs);
  wsPipeline['!cols'] = [
    { wch: 15 }, { wch: 25 }, { wch: 25 },
    { wch: 12 }, { wch: 12 }, { wch: 15 },
    { wch: 15 }, { wch: 25 },
  ];
  wsPipeline['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  wsPipeline['!autofilter'] = { ref: `A3:H${pipelineData.length + 3}` };

  if (!wsPipeline['!rows']) wsPipeline['!rows'] = [];
  wsPipeline['!rows'][2] = { hpt: 18 };

  // Header styling
  for (let c = 0; c < pipelineHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!wsPipeline[addr]) continue;
    wsPipeline[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '000000' } } },
    };
  }

  // Data row styling
  for (let i = 0; i < pipelineData.length; i++) {
    const excelRow = i + 3;
    const status = pipelineData[i][5];
    const fillColor = status === 'MISSING GSTIN' ? 'FCA5A5' : (status === 'NAME MISMATCH' ? 'FEEBC1' : 'FFFFFF');

    wsPipeline['!rows'][excelRow] = { hpt: 15 };

    for (let c = 0; c < pipelineHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!wsPipeline[addr]) continue;
      wsPipeline[addr].s = {
        fill: { fgColor: { rgb: fillColor } },
        font: { sz: 9 },
        alignment: { vertical: 'center', horizontal: c >= 3 && c <= 4 ? 'center' : 'left' },
        border: { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, wsPipeline, 'GST Pipeline');
}

export function appendPartywiseMonthlySheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const FY_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

  interface InvoiceSubRow {
    invoiceNo: string;
    invoiceDate: string;
    status: string;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    netDiff: number;
  }

  interface PartyMonthlyAgg {
    gstin: string;
    partyName: string;
    prMonths: number[];
    twoBMonths: number[];
    invoices: InvoiceSubRow[];
  }

  const partyMap = new Map<string, PartyMonthlyAgg>();

  const getOrCreate = (rawGstin: string, rawName: string): PartyMonthlyAgg => {
    const g = (rawGstin || '').trim().toUpperCase();
    const n = (rawName || '').trim();
    const norm = normalizePartyName(n);
    const key = g || norm || 'UNKNOWN';

    if (!partyMap.has(key)) {
      partyMap.set(key, {
        gstin: g,
        partyName: n,
        prMonths: Array(12).fill(0),
        twoBMonths: Array(12).fill(0),
        invoices: [],
      });
    }
    const p = partyMap.get(key)!;
    if (!p.gstin && g) p.gstin = g;
    if (!p.partyName && n) p.partyName = n;
    return p;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;

    const gstin = r.gstinTally || r.gstinCmp || '';
    const name = r.partyTally || r.partyCmp || '';
    const party = getOrCreate(gstin, name);

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    let prMonth = parseMonthFY(r.dateTally);
    if (prMonth < 0 && r.dateTally) prMonth = parseMonthFY(r.dateCmp);
    if (prMonth >= 0 && prMonth < 12) party.prMonths[prMonth] += prTax;

    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    let tbMonth = parseMonthFY(r.dateCmp);
    if (tbMonth < 0 && r.dateCmp) tbMonth = parseMonthFY(r.dateTally);
    if (tbMonth >= 0 && tbMonth < 12) party.twoBMonths[tbMonth] += tbTax;

    const isMatched = (st: string) => {
      const s = (st || '').toLowerCase();
      if (s.includes('perfect')) return true;
      if (s.includes('diff date') || s.includes('different date') || s.includes('date diff')) return true;
      if (s.includes('rounded')) return true;
      if (s === 'matched' || s === '✅ matched') return true;
      if (s.includes('matched') && !s.includes('mismatch') && !s.includes('unmatched')) return true;
      return false;
    };

    if (!isMatched(r.status)) {
      party.invoices.push({
        invoiceNo: r.invoiceTally || r.invoiceCmp || 'N/A',
        invoiceDate: r.dateTally || r.dateCmp || 'N/A',
        status: r.status,
        taxable: numVal(r.taxableTally || r.taxableCmp),
        cgst: numVal(r.cgstTally || r.cgstCmp),
        sgst: numVal(r.sgstTally || r.sgstCmp),
        igst: numVal(r.igstTally || r.igstCmp),
        netDiff: numVal(r.totalDiff),
      });
    }
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const party = getOrCreate(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      let m = parseMonthFY(dn.invoiceDate);
      if (m >= 0 && m < 12) party.prMonths[m] -= tax;

      party.invoices.push({
        invoiceNo: dn.noteNo || dn.invoiceNo || 'DN',
        invoiceDate: dn.invoiceDate || 'N/A',
        status: 'Books Debit Note',
        taxable: Math.abs(numVal(dn.taxableValue)),
        cgst: Math.abs(numVal(dn.cgst)),
        sgst: Math.abs(numVal(dn.sgst)),
        igst: Math.abs(numVal(dn.igst)),
        netDiff: -tax,
      });
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const party = getOrCreate(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      let m = parseMonthFY(dn.invoiceDate);
      if (m >= 0 && m < 12) party.twoBMonths[m] -= tax;

      party.invoices.push({
        invoiceNo: dn.noteNo || dn.invoiceNo || 'CN/DN',
        invoiceDate: dn.invoiceDate || 'N/A',
        status: '2B Credit/Debit Note',
        taxable: Math.abs(numVal(dn.taxableValue)),
        cgst: Math.abs(numVal(dn.cgst)),
        sgst: Math.abs(numVal(dn.sgst)),
        igst: Math.abs(numVal(dn.igst)),
        netDiff: -tax,
      });
    }
  }

  const parties = Array.from(partyMap.values()).map((p) => {
    const totalPR = p.prMonths.reduce((a, b) => a + b, 0);
    const total2B = p.twoBMonths.reduce((a, b) => a + b, 0);
    const netDiff = totalPR - total2B;
    return { ...p, totalPR, total2B, netDiff, absDiff: Math.abs(netDiff) };
  });

  const diffParties = parties.filter((x) => x.absDiff > 0.01);
  const nilParties = parties.filter((x) => x.absDiff <= 0.01);

  diffParties.sort((a, b) => b.absDiff - a.absDiff);
  nilParties.sort((a, b) => (a.partyName || a.gstin || '').localeCompare(b.partyName || b.gstin || ''));

  const sortedParties = [...diffParties, ...nilParties];

  const headers = [
    'GSTIN',
    'Party Name',
    'Total Books Tax (PR)',
    'Total Portal Tax (2B)',
    'Net Difference',
    ...FY_MONTHS.map((m) => `${m.substring(0, 3)} Diff`)
  ];

  const dataRows: any[][] = [];
  const rowTypes: ('total' | 'party' | 'sub')[] = [];

  let grandPR = 0, grand2B = 0, grandDiff = 0;
  const monthGrand = Array(12).fill(0);

  sortedParties.forEach((p) => {
    grandPR += p.totalPR;
    grand2B += p.total2B;
    grandDiff += p.netDiff;
    FY_MONTHS.forEach((_, mIdx) => {
      monthGrand[mIdx] += p.prMonths[mIdx] - p.twoBMonths[mIdx];
    });
  });

  let totalDataRowCount = 1;
  sortedParties.forEach((p) => {
    totalDataRowCount += 1;
    totalDataRowCount += p.invoices.length;
  });
  const lastRowIdx = Math.max(5, totalDataRowCount + 3);

  const totalsRow = [
    'GRAND TOTAL',
    '',
    sortedParties.length ? { t: 'n', v: r2(grandPR), f: `SUM(C5:C${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    sortedParties.length ? { t: 'n', v: r2(grand2B), f: `SUM(D5:D${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    sortedParties.length ? { t: 'n', v: r2(grandDiff), f: `C4-D4`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT },
    ...FY_MONTHS.map((_, mIdx) => {
      const colL = XLSX.utils.encode_col(5 + mIdx);
      return sortedParties.length ? { t: 'n', v: r2(monthGrand[mIdx]), f: `SUM(${colL}5:${colL}${lastRowIdx})`, z: ACC_FMT } : { t: 'n', v: 0, z: ACC_FMT };
    })
  ];
  dataRows.push(totalsRow);
  rowTypes.push('total');

  let currentRowNum = 5;

  for (let idx = 0; idx < sortedParties.length; idx++) {
    const p = sortedParties[idx];
    const partyRowIndex = currentRowNum;

    const row = [
      p.gstin,
      p.partyName,
      { t: 'n', v: r2(p.totalPR), z: ACC_FMT },
      { t: 'n', v: r2(p.total2B), z: ACC_FMT },
      { t: 'n', v: r2(p.netDiff), f: `C${partyRowIndex}-D${partyRowIndex}`, z: ACC_FMT },
      ...FY_MONTHS.map((_, mIdx) => {
        const mDiff = p.prMonths[mIdx] - p.twoBMonths[mIdx];
        return { t: 'n', v: r2(mDiff), z: ACC_FMT };
      })
    ];
    dataRows.push(row);
    rowTypes.push('party');
    currentRowNum++;

    if (p.invoices && p.invoices.length > 0) {
      for (const inv of p.invoices) {
        const taxBreakdown = `Taxable: ₹${inv.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | CGST: ₹${inv.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | SGST: ₹${inv.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | IGST: ₹${inv.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const subRow = [
          null,
          `   ↳ Inv: ${inv.invoiceNo} (${inv.invoiceDate})`,
          inv.status,
          taxBreakdown,
          { t: 'n', v: r2(inv.netDiff), z: ACC_FMT },
          ...Array(12).fill(null)
        ];
        dataRows.push(subRow);
        rowTypes.push('sub');
        currentRowNum++;
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...dataRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Partywise Monthly Working', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 16 },
    { wch: 36 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    ...Array(12).fill({ wch: 12 })
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  // Header Styling
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  // Row Styling & Collapsible Outline Grouping
  for (let r = 1; r <= dataRows.length; r++) {
    const rType = rowTypes[r - 1];
    const isTotal = rType === 'total';
    const isSub = rType === 'sub';
    const excelRow = r + 2;

    if (isSub) {
      ws['!rows'][excelRow] = { level: 1, hidden: true, hpt: 16 };
    } else {
      ws['!rows'][excelRow] = { level: 0, hpt: isTotal ? 20 : 15 };
    }

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 2;

      if (isSub) {
        ws[addr].s = {
          fill: { fgColor: { rgb: 'F3F4F6' } },
          font: { sz: 8, italic: true, color: { rgb: '374151' } },
          alignment: { vertical: 'center', horizontal: (c >= 3 && typeof ws[addr].v === 'number') ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } }
        };
      } else {
        ws[addr].s = {
          fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
          font: { sz: 9, bold: isTotal || c === 0 },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: isTotal
            ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
            : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } }
        };
      }
      if (isNum && typeof ws[addr].v === 'number') ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Partywise Monthly Working');
}

export function appendPartywiseMismatchInvoicesSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  const partyNetDiffMap = new Map<string, number>();
  const getOrCreateKey = (g: string, n: string) => {
    const key = (g || '').trim().toUpperCase() || normalizePartyName(n) || 'UNKNOWN';
    if (!partyNetDiffMap.has(key)) partyNetDiffMap.set(key, 0);
    return key;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const key = getOrCreateKey(r.gstinTally || r.gstinCmp || '', r.partyTally || r.partyCmp || '');
    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    partyNetDiffMap.set(key, partyNetDiffMap.get(key)! + (prTax - tbTax));
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const key = getOrCreateKey(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      partyNetDiffMap.set(key, partyNetDiffMap.get(key)! - tax);
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const key = getOrCreateKey(dn.gstin || '', dn.supplierName || '');
      const tax = Math.abs(numVal(dn.cgst)) + Math.abs(numVal(dn.sgst)) + Math.abs(numVal(dn.igst));
      partyNetDiffMap.set(key, partyNetDiffMap.get(key)! + tax);
    }
  }

  const headers = [
    'GSTIN (PR)',
    'GSTIN (2B)',
    'Party Name (PR)',
    'Party Name (2B)',
    'Invoice No (PR)',
    'Invoice No (2B)',
    'Invoice Date (PR)',
    'Invoice Date (2B)',
    'Match Status',
    'Invoice Value (PR)',
    'Invoice Value (2B)',
    'Taxable Value (PR)',
    'Taxable Value (2B)',
    'CGST (PR)',
    'CGST (2B)',
    'SGST (PR)',
    'SGST (2B)',
    'IGST (PR)',
    'IGST (2B)',
    'Net Tax Diff'
  ];

  const dataRows: any[][] = [];

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    const netDiff = prTax - tbTax;

    const invValPR = numVal(r.taxableTally) + prTax;
    const invVal2B = numVal(r.taxableCmp) + tbTax;

    dataRows.push([
      r.gstinTally || '',
      r.gstinCmp || '',
      r.partyTally || '',
      r.partyCmp || '',
      r.invoiceTally || '',
      r.invoiceCmp || '',
      formatDateStr(r.dateTally || ''),
      formatDateStr(r.dateCmp || ''),
      r.status || 'N/A',
      { t: 'n', v: r2(invValPR), z: ACC_FMT },
      { t: 'n', v: r2(invVal2B), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.taxableTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.taxableCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.cgstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.cgstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.sgstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.sgstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.igstTally)), z: ACC_FMT },
      { t: 'n', v: r2(numVal(r.igstCmp)), z: ACC_FMT },
      { t: 'n', v: r2(netDiff), z: ACC_FMT },
    ]);
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;

      dataRows.push([
        dn.gstin || '', '',
        dn.supplierName || '', '',
        dn.noteNo || dn.invoiceNo || 'DN', '',
        dn.invoiceDate || '', '',
        'Books Debit Note',
        { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue)) + tax), z: ACC_FMT }, 0,
        { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue))), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-cgst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-sgst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-igst), z: ACC_FMT }, 0,
        { t: 'n', v: r2(-tax), z: ACC_FMT },
      ]);
    }
  }

  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;

      dataRows.push([
        '', dn.gstin || '',
        '', dn.supplierName || '',
        '', dn.noteNo || dn.invoiceNo || 'CN/DN',
        '', dn.invoiceDate || '',
        '2B Credit/Debit Note',
        0, { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue)) + tax), z: ACC_FMT },
        0, { t: 'n', v: r2(Math.abs(numVal(dn.taxableValue))), z: ACC_FMT },
        0, { t: 'n', v: r2(-cgst), z: ACC_FMT },
        0, { t: 'n', v: r2(-sgst), z: ACC_FMT },
        0, { t: 'n', v: r2(-igst), z: ACC_FMT },
        { t: 'n', v: r2(tax), z: ACC_FMT },
      ]);
    }
  }

  let companyPR_CGST = 0, company2B_CGST = 0;
  let companyPR_SGST = 0, company2B_SGST = 0;
  let companyPR_IGST = 0, company2B_IGST = 0;
  let companyPR_Taxable = 0, company2B_Taxable = 0;

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    companyPR_CGST += numVal(r.cgstTally);
    company2B_CGST += numVal(r.cgstCmp);
    companyPR_SGST += numVal(r.sgstTally);
    company2B_SGST += numVal(r.sgstCmp);
    companyPR_IGST += numVal(r.igstTally);
    company2B_IGST += numVal(r.igstCmp);
    companyPR_Taxable += numVal(r.taxableTally);
    company2B_Taxable += numVal(r.taxableCmp);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      companyPR_CGST -= Math.abs(numVal(dn.cgst));
      companyPR_SGST -= Math.abs(numVal(dn.sgst));
      companyPR_IGST -= Math.abs(numVal(dn.igst));
      companyPR_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      company2B_CGST -= Math.abs(numVal(dn.cgst));
      company2B_SGST -= Math.abs(numVal(dn.sgst));
      company2B_IGST -= Math.abs(numVal(dn.igst));
      company2B_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }

  const companyPR_InvVal = companyPR_Taxable + companyPR_CGST + companyPR_SGST + companyPR_IGST;
  const company2B_InvVal = company2B_Taxable + company2B_CGST + company2B_SGST + company2B_IGST;
  const companyNetDiff = (companyPR_CGST + companyPR_SGST + companyPR_IGST) - (company2B_CGST + company2B_SGST + company2B_IGST);

  const lastRowIdx = Math.max(7, dataRows.length + 6);

  const companyTotalsRow = [
    'TOTAL RECONCILED COMPANY DIFFERENCE', '', '', '', '', '', '', '', 'COMPANY NET',
    { t: 'n', v: r2(companyPR_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), z: ACC_FMT },
  ];

  const subtotalRow = [
    'ACTIONABLE MISMATCHED INVOICES SUBTOTAL', '', '', '', '', '', '', '', 'ACTIONABLE SUB',
    { t: 'n', v: 0, f: `SUM(J7:J${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(K7:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(L7:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(M7:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(N7:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(O7:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(P7:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(Q7:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(R7:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(S7:S${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(T7:T${lastRowIdx})`, z: ACC_FMT },
  ];

  const matchedReconciledRow = [
    'LESS: RECONCILED MATCHED INVOICES DIFFERENCE (Timing & Gross Adjustments)', '', '', '', '', '', '', '', 'MATCHED ADJ',
    { t: 'n', v: r2(companyPR_InvVal), f: `J4-J5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), f: `K4-K5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), f: `L4-L5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), f: `M4-M5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), f: `N4-N5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), f: `O4-O5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), f: `P4-P5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), f: `Q4-Q5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), f: `R4-R5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), f: `S4-S5`, z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), f: `T4-T5`, z: ACC_FMT },
  ];

  const finalRows = [companyTotalsRow, subtotalRow, matchedReconciledRow, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...finalRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Partywise Mismatch Invoices', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${finalRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 4, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 16 }, { wch: 16 },
    { wch: 28 }, { wch: 28 },
    { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 },
    { wch: 22 },
    { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 16 }
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= finalRows.length; r++) {
    const isTotal = r === 1;
    const excelRow = r + 2;
    ws['!rows'][excelRow] = { hpt: isTotal ? 20 : 15 };
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 9;
      ws[addr].s = {
        fill: { fgColor: { rgb: isTotal ? 'E5E7EB' : (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF') } },
        font: { sz: 9, bold: isTotal },
        alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
        border: isTotal
          ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } }
      };
      if (isNum && typeof ws[addr].v === 'number') ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Partywise Mismatch Invoices');
}

export function appendPartyMismatchBreakdownSheet(
  wb: XLSX.WorkBook,
  rows: MonthlyComparisonRow[],
  debitNotes?: { pr?: DebitNoteRecord[]; twoB?: DebitNoteRecord[] },
  companyName?: string,
  tabs?: { name: string; target: string }[]
) {
  interface PartyAgg {
    gstin: string;
    partyName: string;
    totalPR: number;
    total2B: number;
    netDiff: number;
    invoices: {
      datePR: string;
      date2B: string;
      partyPR: string;
      party2B: string;
      gstinPR: string;
      gstin2B: string;
      invNoPR: string;
      invNo2B: string;
      status: string;
      taxablePR: number;
      taxable2B: number;
      cgstPR: number;
      cgst2B: number;
      sgstPR: number;
      sgst2B: number;
      igstPR: number;
      igst2B: number;
      taxDiff: number;
    }[];
  }

  const partyMap = new Map<string, PartyAgg>();

  const getOrCreateParty = (g: string, n: string): PartyAgg => {
    const rawG = (g || '').trim().toUpperCase();
    const rawN = (n || '').trim();
    const norm = normalizePartyName(rawN);
    const key = rawG || norm || 'UNKNOWN';

    if (!partyMap.has(key)) {
      partyMap.set(key, {
        gstin: rawG,
        partyName: rawN,
        totalPR: 0,
        total2B: 0,
        netDiff: 0,
        invoices: []
      });
    }
    const p = partyMap.get(key)!;
    if (!p.gstin && rawG) p.gstin = rawG;
    if (!p.partyName && rawN) p.partyName = rawN;
    return p;
  };

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    const g = r.gstinTally || r.gstinCmp || '';
    const n = r.partyTally || r.partyCmp || '';
    const party = getOrCreateParty(g, n);

    const prTax = numVal(r.cgstTally) + numVal(r.sgstTally) + numVal(r.igstTally);
    const tbTax = numVal(r.cgstCmp) + numVal(r.sgstCmp) + numVal(r.igstCmp);
    party.totalPR += prTax;
    party.total2B += tbTax;

    const diff = prTax - tbTax;
    party.invoices.push({
      datePR: r.dateTally || '',
      date2B: r.dateCmp || '',
      partyPR: r.partyTally || party.partyName,
      party2B: r.partyCmp || party.partyName,
      gstinPR: r.gstinTally || party.gstin,
      gstin2B: r.gstinCmp || party.gstin,
      invNoPR: r.invoiceTally || '',
      invNo2B: r.invoiceCmp || '',
      status: r.status || 'N/A',
      taxablePR: numVal(r.taxableTally),
      taxable2B: numVal(r.taxableCmp),
      cgstPR: numVal(r.cgstTally),
      cgst2B: numVal(r.cgstCmp),
      sgstPR: numVal(r.sgstTally),
      sgst2B: numVal(r.sgstCmp),
      igstPR: numVal(r.igstTally),
      igst2B: numVal(r.igstCmp),
      taxDiff: diff
    });
  }

  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      const party = getOrCreateParty(dn.gstin || '', dn.supplierName || '');
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;
      party.totalPR -= tax;

      party.invoices.push({
        datePR: dn.invoiceDate || '',
        date2B: '',
        partyPR: dn.supplierName || party.partyName,
        party2B: '',
        gstinPR: dn.gstin || party.gstin,
        gstin2B: '',
        invNoPR: dn.noteNo || dn.invoiceNo || 'DN',
        invNo2B: '',
        status: 'Books Debit Note',
        taxablePR: Math.abs(numVal(dn.taxableValue)),
        taxable2B: 0,
        cgstPR: cgst,
        cgst2B: 0,
        sgstPR: sgst,
        sgst2B: 0,
        igstPR: igst,
        igst2B: 0,
        taxDiff: tax
      });
    }
  }

  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      const party = getOrCreateParty(dn.gstin || '', dn.supplierName || '');
      const cgst = Math.abs(numVal(dn.cgst));
      const sgst = Math.abs(numVal(dn.sgst));
      const igst = Math.abs(numVal(dn.igst));
      const tax = cgst + sgst + igst;
      party.total2B -= tax;

      party.invoices.push({
        datePR: '',
        date2B: dn.invoiceDate || '',
        partyPR: '',
        party2B: dn.supplierName || party.partyName,
        gstinPR: '',
        gstin2B: dn.gstin || party.gstin,
        invNoPR: '',
        invNo2B: dn.noteNo || dn.invoiceNo || 'CN/DN',
        status: '2B Credit/Debit Note',
        taxablePR: 0,
        taxable2B: Math.abs(numVal(dn.taxableValue)),
        cgstPR: 0,
        cgst2B: cgst,
        sgstPR: 0,
        sgst2B: sgst,
        igstPR: 0,
        igst2B: igst,
        taxDiff: -tax
      });
    }
  }

  const sortedParties = Array.from(partyMap.values())
    .map((p) => ({ ...p, netDiff: p.totalPR - p.total2B, absDiff: Math.abs(p.totalPR - p.total2B) }))
    .filter((p) => p.invoices.length > 0)
    .sort((a, b) => b.absDiff - a.absDiff);

  const headers = [
    'Invoice Date (PR)',
    'Invoice Date (2B)',
    'Party Name (PR)',
    'Party Name (2B)',
    'GSTIN (PR)',
    'GSTIN (2B)',
    'Invoice No (PR)',
    'Invoice No (2B)',
    'Match Status',
    'Invoice Value (PR)',
    'Invoice Value (2B)',
    'Taxable Value (PR)',
    'Taxable Value (2B)',
    'CGST (PR)',
    'CGST (2B)',
    'SGST (PR)',
    'SGST (2B)',
    'IGST (PR)',
    'IGST (2B)',
    'Tax Difference'
  ];

  const dataRows: any[][] = [];
  const rowTypes: string[] = [];

  let companyPR_CGST = 0, company2B_CGST = 0;
  let companyPR_SGST = 0, company2B_SGST = 0;
  let companyPR_IGST = 0, company2B_IGST = 0;
  let companyPR_Taxable = 0, company2B_Taxable = 0;

  for (const r of rows) {
    if (r.status === 'Prior FY (Excluded)') continue;
    companyPR_CGST += numVal(r.cgstTally);
    company2B_CGST += numVal(r.cgstCmp);
    companyPR_SGST += numVal(r.sgstTally);
    company2B_SGST += numVal(r.sgstCmp);
    companyPR_IGST += numVal(r.igstTally);
    company2B_IGST += numVal(r.igstCmp);
    companyPR_Taxable += numVal(r.taxableTally);
    company2B_Taxable += numVal(r.taxableCmp);
  }
  if (debitNotes?.pr) {
    for (const dn of debitNotes.pr) {
      if (!dn) continue;
      companyPR_CGST -= Math.abs(numVal(dn.cgst));
      companyPR_SGST -= Math.abs(numVal(dn.sgst));
      companyPR_IGST -= Math.abs(numVal(dn.igst));
      companyPR_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }
  if (debitNotes?.twoB) {
    for (const dn of debitNotes.twoB) {
      if (!dn) continue;
      company2B_CGST -= Math.abs(numVal(dn.cgst));
      company2B_SGST -= Math.abs(numVal(dn.sgst));
      company2B_IGST -= Math.abs(numVal(dn.igst));
      company2B_Taxable -= Math.abs(numVal(dn.taxableValue));
    }
  }

  const companyPR_InvVal = companyPR_Taxable + companyPR_CGST + companyPR_SGST + companyPR_IGST;
  const company2B_InvVal = company2B_Taxable + company2B_CGST + company2B_SGST + company2B_IGST;
  const companyNetDiff = (companyPR_CGST + companyPR_SGST + companyPR_IGST) - (company2B_CGST + company2B_SGST + company2B_IGST);

  const lastRowIdx = Math.max(7, sortedParties.reduce((acc, p) => acc + 1 + p.invoices.length, 1) + 6);

  const companyTotalsRow = [
    'TOTAL RECONCILED COMPANY DIFFERENCE', '', '', '', '', '', '', '', 'COMPANY NET',
    { t: 'n', v: r2(companyPR_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), z: ACC_FMT },
  ];

  const subtotalRow = [
    'ACTIONABLE MISMATCHED INVOICES SUBTOTAL', '', '', '', '', '', '', '', 'ACTIONABLE SUB',
    { t: 'n', v: 0, f: `SUM(J7:J${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(K7:K${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(L7:L${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(M7:M${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(N7:N${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(O7:O${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(P7:P${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(Q7:Q${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(R7:R${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(S7:S${lastRowIdx})`, z: ACC_FMT },
    { t: 'n', v: 0, f: `SUM(T7:T${lastRowIdx})`, z: ACC_FMT },
  ];

  const matchedReconciledRow = [
    'LESS: RECONCILED MATCHED INVOICES DIFFERENCE (Timing & Gross Adjustments)', '', '', '', '', '', '', '', 'MATCHED ADJ',
    { t: 'n', v: r2(companyPR_InvVal), f: `J4-J5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_InvVal), f: `K4-K5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_Taxable), f: `L4-L5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_Taxable), f: `M4-M5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_CGST), f: `N4-N5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_CGST), f: `O4-O5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_SGST), f: `P4-P5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_SGST), f: `Q4-Q5`, z: ACC_FMT },
    { t: 'n', v: r2(companyPR_IGST), f: `R4-R5`, z: ACC_FMT },
    { t: 'n', v: r2(company2B_IGST), f: `S4-S5`, z: ACC_FMT },
    { t: 'n', v: r2(companyNetDiff), f: `T4-T5`, z: ACC_FMT },
  ];

  dataRows.push(companyTotalsRow);
  rowTypes.push('total');
  dataRows.push(subtotalRow);
  rowTypes.push('total');
  dataRows.push(matchedReconciledRow);
  rowTypes.push('total');

  const statusColors: Record<string, { fill: string; font: string }> = {
    'Not in 2B': { fill: 'FEF2F2', font: '991B1B' },
    'Not in Books': { fill: 'EFF6FF', font: '1E40AF' },
    'Value Mismatch': { fill: 'FFFBEB', font: 'B45309' },
    'Name Mismatch': { fill: 'FFEDD5', font: '9A3412' },
    'Wrong GSTIN': { fill: 'FEE2E2', font: '991B1B' },
    'Books Debit Note': { fill: 'F3E8FF', font: '6B21A8' },
    '2B Credit/Debit Note': { fill: 'F3E8FF', font: '6B21A8' },
  };

  let currentRowIdx = 7;
  sortedParties.forEach((p) => {
    const bannerText = `🏢 ${p.gstin || 'NO GSTIN'} - ${p.partyName || 'UNKNOWN'}  (Party Net Difference: ₹${p.netDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    const bannerRow = Array(headers.length).fill('');
    bannerRow[0] = bannerText;
    dataRows.push(bannerRow);
    rowTypes.push('banner');
    currentRowIdx++;

    p.invoices.forEach((inv) => {
      const rowNum = currentRowIdx;
      const invValPRCalc = r2(inv.taxablePR + inv.cgstPR + inv.sgstPR + inv.igstPR);
      const invVal2BCalc = r2(inv.taxable2B + inv.cgst2B + inv.sgst2B + inv.igst2B);
      const diffCalc = r2((inv.cgstPR + inv.sgstPR + inv.igstPR) - (inv.cgst2B + inv.sgst2B + inv.igst2B));

      const row = [
        formatDateStr(inv.datePR),
        formatDateStr(inv.date2B),
        inv.partyPR,
        inv.party2B,
        inv.gstinPR,
        inv.gstin2B,
        inv.invNoPR,
        inv.invNo2B,
        inv.status,
        { t: 'n', v: invValPRCalc, f: `L${rowNum}+N${rowNum}+P${rowNum}+R${rowNum}`, z: ACC_FMT },
        { t: 'n', v: invVal2BCalc, f: `M${rowNum}+O${rowNum}+Q${rowNum}+S${rowNum}`, z: ACC_FMT },
        { t: 'n', v: r2(inv.taxablePR), z: ACC_FMT },
        { t: 'n', v: r2(inv.taxable2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.cgstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.cgst2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.sgstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.sgst2B), z: ACC_FMT },
        { t: 'n', v: r2(inv.igstPR), z: ACC_FMT },
        { t: 'n', v: r2(inv.igst2B), z: ACC_FMT },
        { t: 'n', v: diffCalc, f: `(N${rowNum}+P${rowNum}+R${rowNum})-(O${rowNum}+Q${rowNum}+S${rowNum})`, z: ACC_FMT }
      ];
      dataRows.push(row);
      rowTypes.push('inv');
      currentRowIdx++;
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers, ...dataRows], { origin: 'A3' });
  addCorporateHeader(ws, headers.length, companyName, 'Party Mismatch Breakdown', tabs);

  ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(headers.length - 1)}${dataRows.length + 3}` };
  ws['!views'] = [{ state: 'frozen', xSplit: 8, ySplit: 4 }];

  ws['!cols'] = [
    { wch: 14 }, { wch: 14 },
    { wch: 28 }, { wch: 28 },
    { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 18 },
    { wch: 22 },
    { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 18 }
  ];

  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) continue;
    let headerBg = '0F172A';
    if ([9, 11, 13, 15, 17].includes(c)) headerBg = '1E3A8A';
    else if ([10, 12, 14, 16, 18].includes(c)) headerBg = '0D9488';
    else if (c === 19) headerBg = '9F1239';

    ws[addr].s = {
      fill: { fgColor: { rgb: headerBg } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= dataRows.length; r++) {
    const rType = rowTypes[r - 1];
    const isTotal = rType === 'total';
    const isBanner = rType === 'banner';
    const excelRow = r + 2;

    ws['!rows'][excelRow] = { hpt: isTotal ? 22 : isBanner ? 20 : 16 };

    if (isBanner) {
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push({ s: { r: excelRow, c: 0 }, e: { r: excelRow, c: 19 } });
    }

    const rowData = dataRows[r - 1];
    const statusStr = String(rowData[8] || '');
    const stConfig = statusColors[statusStr] || { fill: (excelRow % 2 === 0 ? 'F9FAFB' : 'FFFFFF'), font: '1E293B' };

    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws[addr]) continue;
      const isNum = c >= 9;

      if (isBanner) {
        ws[addr].s = {
          fill: { fgColor: { rgb: '1E3A5F' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: 'left' },
          border: { top: { style: 'medium', color: { rgb: '0F172A' } }, bottom: { style: 'medium', color: { rgb: '0F172A' } } }
        };
      } else if (isTotal) {
        ws[addr].s = {
          fill: { fgColor: { rgb: '1E293B' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
        };
      } else {
        const isStatusCol = c === 8;
        const isDiffCol = c === 19;
        let cellBg = stConfig.fill;

        if (!isStatusCol && !isDiffCol) {
          if ([9, 11, 13, 15, 17].includes(c)) cellBg = excelRow % 2 === 0 ? 'EEF2FF' : 'F5F3FF';
          else if ([10, 12, 14, 16, 18].includes(c)) cellBg = excelRow % 2 === 0 ? 'ECFDF5' : 'F0FDF4';
        }

        ws[addr].s = {
          fill: { fgColor: { rgb: cellBg } },
          font: {
            sz: 9,
            bold: isStatusCol || isDiffCol,
            color: { rgb: isStatusCol ? stConfig.font : isDiffCol ? 'DC2626' : '1E293B' }
          },
          alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
          border: { bottom: { style: 'hair', color: { rgb: 'CBD5E1' } } }
        };
      }
      if (isNum && typeof ws[addr].v === 'number') ws[addr].z = ACC_FMT;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Party Mismatch Breakdown');
}

export function buildPartyWiseWorkbook(
  parties: PartySummary[],
  companyName?: string,
  statusFilter?: string[],
  appliedGstins?: any[],
  conflicts?: any[]
): XLSX.WorkBook {
  const filteredParties = statusFilter && statusFilter.length > 0
    ? parties
      .map((p) => {
        const invoices = p.invoices.filter((inv) => statusFilter.includes(inv.status));
        if (!invoices.length) return null;
        const totals = invoices.reduce(
          (acc, inv) => {
            acc.count += 1;
            acc.igstPR += inv.igstPR;
            acc.cgstPR += inv.cgstPR;
            acc.sgstPR += inv.sgstPR;
            acc.igst2B += inv.igst2B;
            acc.cgst2B += inv.cgst2B;
            acc.sgst2B += inv.sgst2B;
            if (inv.status === 'Perfect Match' || inv.status === 'Matched' || inv.status === 'Matched (Rounded)' || inv.status === 'Matched (Diff Date)') acc.perfectMatch += 1;
            if (inv.status === 'Value Mismatch' || inv.status === 'Mismatch') acc.valueMismatch += 1;
            if (inv.status === 'Not in 2B' || inv.status === 'Missing in 2B') acc.invoiceMissing += 1;
            if (inv.status === 'Unmatched Vendor') acc.unmatchedVendor += 1;
            if (inv.status === 'Not in Books' || inv.status === 'Missing in PR') acc.missingInPR += 1;
            return acc;
          },
          {
            count: 0, perfectMatch: 0, valueMismatch: 0, invoiceMissing: 0,
            unmatchedVendor: 0, missingInPR: 0,
            igstPR: 0, cgstPR: 0, sgstPR: 0,
            igst2B: 0, cgst2B: 0, sgst2B: 0,
            igstDiff: 0, cgstDiff: 0, sgstDiff: 0, totalDiff: 0,
          }
        );

        totals.igstDiff = +(totals.igstPR - totals.igst2B).toFixed(2);
        totals.cgstDiff = +(totals.cgstPR - totals.cgst2B).toFixed(2);
        totals.sgstDiff = +(totals.sgstPR - totals.sgst2B).toFixed(2);
        totals.totalDiff = +(
          Math.abs(totals.igstDiff) + Math.abs(totals.cgstDiff) + Math.abs(totals.sgstDiff)
        ).toFixed(2);
        totals.igstPR = +totals.igstPR.toFixed(2);
        totals.cgstPR = +totals.cgstPR.toFixed(2);
        totals.sgstPR = +totals.sgstPR.toFixed(2);
        totals.igst2B = +totals.igst2B.toFixed(2);
        totals.cgst2B = +totals.cgst2B.toFixed(2);
        totals.sgst2B = +totals.sgst2B.toFixed(2);

        const overall: PartySummary['overall'] =
          totals.invoiceMissing + totals.unmatchedVendor + totals.missingInPR > 0
            ? 'Has Missing'
            : totals.valueMismatch > 0
              ? 'Has Mismatches'
              : 'All Matched';

        return {
          ...p,
          invoices,
          totals,
          overall,
        };
      })
      .filter(Boolean) as PartySummary[]
    : parties;

  const wb = XLSX.utils.book_new();

  const tabs = [
    { name: '🏠 Home', target: 'Dashboard' },
    { name: '📊 Summary', target: 'Executive Summary' },
    { name: '🏢 Party', target: 'Party Summary' },
    { name: '📑 Details', target: 'Party Details' },
    { name: '📖 Guide', target: '📖 Methodology & Legend' }
  ];

  const counts: Record<string, number> = {};
  let totalDiff = 0;
  for (const p of filteredParties) {
    counts[p.overall] = (counts[p.overall] || 0) + 1;
    totalDiff += p.totals.totalDiff;
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, c]) => ({ label: st, value: c }));

  const stats = [
    { label: 'Total Parties Analysed', value: parties.length },
    { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  appendExecutiveSummary(wb, companyName, 'Party-wise Summary', stats, breakdown, tabs);

  const summaryHeaders = [
    'Party Name (PR)', 'Party Name (2B)', 'GSTIN (PR)', 'GSTIN (2B)', 'Invoices',
    'Perfect', 'Mismatch', 'Inv Missing', 'Unmatched Vendor', 'Not in Books',
    'IGST (PR)', 'IGST (2B)', 'IGST Diff',
    'CGST (PR)', 'CGST (2B)', 'CGST Diff',
    'SGST (PR)', 'SGST (2B)', 'SGST Diff',
    'Total Diff', 'Difference Months', 'Overall Status',
  ];
  const summaryData = parties.map((p, idx) => {
    const rowNumber = idx + 4;

    const diffMonths = new Set<string>();
    for (const inv of p.invoices) {
      const cgstPR = numVal(inv.cgstPR);
      const cgst2B = numVal(inv.cgst2B);
      const sgstPR = numVal(inv.sgstPR);
      const sgst2B = numVal(inv.sgst2B);
      const igstPR = numVal(inv.igstPR);
      const igst2B = numVal(inv.igst2B);

      if (Math.abs(cgstPR - cgst2B) > 0.01 || Math.abs(sgstPR - sgst2B) > 0.01 || Math.abs(igstPR - igst2B) > 0.01) {
        const dateVal = inv.invoiceDatePR || inv.invoiceDate2B;
        const monthStr = getDiffMonthStr(dateVal);
        if (monthStr) diffMonths.add(monthStr);
      }
    }
    const sortedMonths = Array.from(diffMonths).sort((a, b) => {
      const parseMY = (s: string) => {
        const parts = s.split('-');
        if (parts.length === 2) {
          const mIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(parts[0]);
          let y = parseInt(parts[1]);
          if (y < 100) y += 2000;
          if (mIdx >= 0 && !isNaN(y)) return new Date(y, mIdx, 1).getTime();
        }
        return 0;
      };
      return parseMY(a) - parseMY(b);
    });
    const diffMonthsStr = sortedMonths.join(', ') || '—';

    return [
      p.partyNamePR || p.partyName, p.partyName2B || '', p.gstinPR || p.gstin, p.gstin2B || '', p.totals.count,
      p.totals.perfectMatch, p.totals.valueMismatch,
      p.totals.invoiceMissing, p.totals.unmatchedVendor, p.totals.missingInPR,
      p.totals.igstPR, p.totals.igst2B,
      { t: 'n', f: `K${rowNumber}-L${rowNumber}`, z: ACC_FMT },
      p.totals.cgstPR, p.totals.cgst2B,
      { t: 'n', f: `N${rowNumber}-O${rowNumber}`, z: ACC_FMT },
      p.totals.sgstPR, p.totals.sgst2B,
      { t: 'n', f: `Q${rowNumber}-R${rowNumber}`, z: ACC_FMT },
      { t: 'n', f: `ABS(M${rowNumber})+ABS(P${rowNumber})+ABS(S${rowNumber})`, z: ACC_FMT },
      diffMonthsStr,
      p.overall,
    ];
  });

  const totalRowIndex = parties.length + 4;
  const totalsRow: any[] = [
    'GRAND TOTAL', '', '', '', '',
    { t: 'n', f: `SUM(F5:F${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(G5:G${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(H5:H${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(I5:I${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(J5:J${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(K5:K${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(L5:L${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(M5:M${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(N5:N${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(O5:O${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(P5:P${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(Q5:Q${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(R5:R${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(S5:S${totalRowIndex})`, z: ACC_FMT },
    { t: 'n', f: `SUM(T5:T${totalRowIndex})`, z: ACC_FMT },
    '',
    '',
  ];
  summaryData.unshift(totalsRow);

  const ws1 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws1, [summaryHeaders, ...summaryData, totalsRow], { origin: 'A3' });
  addCorporateHeader(ws1, summaryHeaders.length, companyName, 'Party Summary', tabs);
  ws1['!autofilter'] = { ref: `A3:V${parties.length + 4}` };
  ws1['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  ws1['!cols'] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 13 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }, { wch: 13 },
  ];

  if (!ws1['!rows']) ws1['!rows'] = [];
  ws1['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < summaryHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws1[addr]) continue;
    ws1[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (let r = 1; r <= parties.length + 1; r++) {
    const isTotal = r === 1;
    const overall = isTotal ? '' : parties[r - 2].overall;
    const fill = isTotal ? 'E5E7EB' : (PARTY_STATUS_FILL[overall] || 'FFFFFF');
    ws1['!rows'][r + 2] = { hpt: isTotal ? 22 : 15, level: isTotal ? 0 : 1 };
    for (let c = 0; c < summaryHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + 2, c });
      if (!ws1[addr]) continue;
      ws1[addr].s = {
        fill: { fgColor: { rgb: fill } },
        font: { sz: isTotal ? 10 : 9, bold: isTotal || c === summaryHeaders.length - 1 },
        alignment: { vertical: 'center', horizontal: (c >= 4 && c < summaryHeaders.length - 1 && c !== 20) ? 'right' : 'left' },
        border: isTotal
          ? { top: { style: 'medium', color: { rgb: '000000' } }, bottom: { style: 'double', color: { rgb: '000000' } } }
          : { bottom: { style: 'hair', color: { rgb: 'D1D5DB' } } },
        numFmt: (c >= 5 && c < summaryHeaders.length - 1 && c !== 20) ? ACC_FMT : undefined,
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws1, 'Party Summary');

  // Sheet 2: Party Details
  const detailHeaders = [
    'Financial Year',
    'Inv No (PR)', 'Inv No (2B)',
    'Date (PR)', 'Date (2B)',
    'IGST (PR)', 'IGST (2B)',
    'CGST (PR)', 'CGST (2B)',
    'SGST (PR)', 'SGST (2B)',
    'Status',
    'Remark',
    'Auditor Action',
  ];
  const NUM_DETAIL_COLS = detailHeaders.length;
  const detailRows: (string | number)[][] = [];
  const partyHeaderRowIdxs: { idx: number; status: string }[] = [];
  const merges: XLSX.Range[] = [];
  const subtotalRowIdxs = new Set<number>();
  const emptyRowIdxs = new Set<number>();

  for (const p of parties) {
    const startRowIdx = detailRows.length + 3;
    partyHeaderRowIdxs.push({ idx: startRowIdx, status: p.overall });

    const headerRow: (string | number)[] = Array(NUM_DETAIL_COLS).fill('');
    headerRow[0] = `PR: ${p.partyNamePR || p.partyName || '—'} (${p.gstinPR || p.gstin || '—'})   |   2B: ${p.partyName2B || '—'} (${p.gstin2B || '—'})`;
    headerRow[NUM_DETAIL_COLS - 2] = p.overall;
    headerRow[NUM_DETAIL_COLS - 1] = `${p.totals.count} invoices`;

    merges.push({ s: { r: startRowIdx, c: 0 }, e: { r: startRowIdx, c: NUM_DETAIL_COLS - 3 } });
    detailRows.push(headerRow);

    const invoiceStartRow = detailRows.length + 4;
    for (const inv of p.invoices) {
      detailRows.push([
        inv.financialYear,
        inv.invoiceNoPR, inv.invoiceNo2B,
        inv.invoiceDatePR, inv.invoiceDate2B,
        numVal(inv.igstPR), numVal(inv.igst2B),
        numVal(inv.cgstPR), numVal(inv.cgst2B),
        numVal(inv.sgstPR), numVal(inv.sgst2B),
        inv.status,
        inv.remark || '',
        '',
      ]);
    }
    const invoiceEndRow = detailRows.length + 3;
    const hasInvoiceRows = p.invoices.length > 0;
    const subRow: any[] = Array(NUM_DETAIL_COLS).fill('');
    subRow[0] = 'SUBTOTAL';
    for (let col = 5; col <= 10; col += 1) {
      const colLetter = XLSX.utils.encode_col(col);
      subRow[col] = hasInvoiceRows
        ? { t: 'n', f: `SUM(${colLetter}${invoiceStartRow}:${colLetter}${invoiceEndRow})`, z: ACC_FMT }
        : 0;
    }
    subRow[11] = `Diff: ₹${p.totals.totalDiff.toFixed(2)}`;

    const subRowIdx = detailRows.length + 3;
    merges.push({ s: { r: subRowIdx, c: 0 }, e: { r: subRowIdx, c: 3 } });
    subtotalRowIdxs.add(subRowIdx);
    detailRows.push(subRow);

    emptyRowIdxs.add(detailRows.length + 3);
    detailRows.push(Array(NUM_DETAIL_COLS).fill(''));
  }
  if (detailRows.length > 0) detailRows.pop();

  const ws2 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws2, [detailHeaders, ...detailRows], { origin: 'A3' });
  addCorporateHeader(ws2, detailHeaders.length, companyName, 'Party Details', tabs);
  if (!ws2['!merges']) ws2['!merges'] = [];
  ws2['!merges'].push(...merges);
  ws2['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
  ws2['!cols'] = [
    { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 15 }, { wch: 25 }, { wch: 16 },
  ];

  if (!ws2['!rows']) ws2['!rows'] = [];
  ws2['!rows'][2] = { hpt: 18 };

  for (let c = 0; c < detailHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws2[addr]) continue;
    ws2[addr].s = {
      fill: { fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '000000' } } },
    };
  }

  for (const { idx, status } of partyHeaderRowIdxs) {
    const headerFill = PARTY_STATUS_HEADER[status] || '1E3A5F';
    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: idx, c });
      if (!ws2[addr]) continue;
      ws2[addr].s = {
        fill: { fgColor: { rgb: headerFill } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: c >= NUM_DETAIL_COLS - 2 ? 'right' : 'left' },
      };
    }
  }

  const headerRowSet2 = new Set(partyHeaderRowIdxs.map(x => x.idx));
  for (let r = 1; r <= detailRows.length; r++) {
    const excelRow = r + 2;
    if (headerRowSet2.has(excelRow)) continue;
    if (emptyRowIdxs.has(excelRow)) continue;

    const isSubtotal = subtotalRowIdxs.has(excelRow);
    ws2['!rows'][excelRow] = {
      hpt: isSubtotal ? 18 : 15,
      level: isSubtotal ? 0 : 1,
      hidden: false
    };

    for (let c = 0; c < detailHeaders.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: excelRow, c });
      if (!ws2[addr]) continue;

      const isNumCol = c >= 5 && c <= 10;
      if (isNumCol && !isSubtotal) {
        ws2[addr].t = 'n';
        ws2[addr].z = ACC_FMT;
      }

      ws2[addr].s = {
        fill: { fgColor: { rgb: isSubtotal ? 'F3F4F6' : 'FFFFFF' } },
        font: { sz: 9, bold: isSubtotal },
        alignment: { vertical: 'center', horizontal: isNumCol ? 'right' : 'left' },
        border: isSubtotal ? { top: { style: 'thin', color: { rgb: '9CA3AF' } }, bottom: { style: 'double', color: { rgb: '9CA3AF' } } } : { bottom: { style: 'hair', color: { rgb: 'E5E7EB' } } },
        numFmt: isNumCol ? ACC_FMT : undefined,
      };
    }
  }

  const actionColIdx2 = detailHeaders.indexOf('Auditor Action');
  if (actionColIdx2 >= 0) {
    const letter = XLSX.utils.encode_col(actionColIdx2);
    ws2['!dataValidation'] = [{
      sqref: `${letter}4:${letter}${detailRows.length + 5}`,
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formula1: '"Pending,Resolved,Vendor Contacted,Hold Payment"'
    }];
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'Party Details');

  const partySheetNames = ['Executive Summary', 'Party Summary', 'Party Details'];

  appendGstinReports(wb, partySheetNames, companyName, appliedGstins, conflicts, tabs);
  appendMethodologySheet(wb, companyName, tabs);
  partySheetNames.push('📖 Methodology & Legend');

  appendNavigationSheet(wb, partySheetNames, companyName, stats, breakdown);

  removeAllMergesFromWorkbook(wb);
  return wb;
}

export function exportPartyWise(
  parties: PartySummary[],
  filename: string,
  companyName?: string,
  statusFilter?: string[],
  appliedGstins?: any[],
  conflicts?: any[]
) {
  const wb = buildPartyWiseWorkbook(parties, companyName, statusFilter, appliedGstins, conflicts);
  wb.Props = {
    Title: filename.replace('.xlsx', ''),
    Subject: 'Party-wise Reconciliation Report',
    Author: 'Vaswani Return Enterprise Suite',
    Company: companyName || 'Client Organization',
    CreatedDate: new Date()
  };
  try {
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('XLSX.writeFile error:', error);
    throw error;
  }
}

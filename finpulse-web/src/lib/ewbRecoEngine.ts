/**
 * ewbRecoEngine.ts
 * 
 * E-Way Bill vs GSTR-1 Outward Supply Cross-Reconciliation Engine.
 * Reverse-engineered from TaxPower GST EWBRecoInvValueGSTR1Amount.
 * 
 * Highlights:
 * 1. Missing EWBs: Invoices > ₹50,000 without mandatory E-Way Bill (Rule 138 violation).
 * 2. Un-reported Sales: Active E-Way Bills without matching GSTR-1 invoice (Suppression risk).
 * 3. Value Mismatches: Discrepancies between E-Way Bill value and GSTR-1 outward value.
 * 4. Zero-Merge Excel Audit Exporter.
 */

import * as XLSX from 'xlsx';
import { Gstr1B2BInvoice } from './gstr1Engine';
import { removeAllMergesFromWorkbook } from './gstr1V22Export';

export interface EwbRecord {
  ewbNo: string;
  ewbDate?: string;
  docNo: string;
  docDate?: string;
  recipientGstin?: string;
  recipientName?: string;
  totalValue: number;
  taxableValue?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  cess?: number;
  status?: 'ACT' | 'CAN'; // Active or Cancelled
}

export type EwbMatchStatus =
  | 'Matched'
  | 'Value Mismatch'
  | 'E-Way Bill Missing (Rule 138 Risk)'
  | 'Missing in GSTR-1 (Suppression Risk)'
  | 'Cancelled E-Way Bill';

export interface EwbRecoResult {
  ewbRecord?: EwbRecord;
  gstr1Invoice?: {
    inum: string;
    idt: string;
    val: number;
    pos: string;
    ctin?: string;
    buyerName?: string;
  };
  status: EwbMatchStatus;
  diffValue: number;
  remarks: string;
}

/**
 * Reconciles E-Way Bills against GSTR-1 outward invoices.
 */
export function reconcileEwbWithGstr1(
  ewbRecords: EwbRecord[],
  gstr1Invoices: {
    inum: string;
    idt: string;
    val: number;
    pos: string;
    ctin?: string;
    buyerName?: string;
  }[],
  options: {
    tolerance?: number;
    mandatoryEwbThreshold?: number; // default: 50000
  } = {}
): {
  results: EwbRecoResult[];
  summary: {
    totalEwbCount: number;
    totalGstr1Count: number;
    matchedCount: number;
    missingEwbCount: number;
    missingGstr1Count: number;
    valueMismatchCount: number;
  };
} {
  const tolerance = options.tolerance ?? 2;
  const threshold = options.mandatoryEwbThreshold ?? 50000;

  const results: EwbRecoResult[] = [];
  const matchedGstr1Indices = new Set<number>();
  const activeEwbRecords = ewbRecords.filter(e => e.status !== 'CAN');

  // Map GSTR-1 invoices by cleaned document number
  const cleanDoc = (d: string) => (d || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const gstr1Map = new Map<string, number[]>();

  for (let i = 0; i < gstr1Invoices.length; i++) {
    const key = cleanDoc(gstr1Invoices[i].inum);
    if (!gstr1Map.has(key)) gstr1Map.set(key, []);
    gstr1Map.get(key)!.push(i);
  }

  // 1. Match Active E-Way Bills against GSTR-1
  for (const ewb of activeEwbRecords) {
    const key = cleanDoc(ewb.docNo);
    const candidates = gstr1Map.get(key) || [];
    const availableIdx = candidates.find(idx => !matchedGstr1Indices.has(idx));

    if (availableIdx !== undefined) {
      matchedGstr1Indices.add(availableIdx);
      const inv = gstr1Invoices[availableIdx];
      const diffVal = Math.round((inv.val - ewb.totalValue) * 100) / 100;

      if (Math.abs(diffVal) <= tolerance) {
        results.push({
          ewbRecord: ewb,
          gstr1Invoice: inv,
          status: 'Matched',
          diffValue: 0,
          remarks: 'E-Way Bill perfectly matched with GSTR-1 invoice'
        });
      } else {
        results.push({
          ewbRecord: ewb,
          gstr1Invoice: inv,
          status: 'Value Mismatch',
          diffValue: diffVal,
          remarks: `Value difference of ₹${diffVal} between E-Way Bill (₹${ewb.totalValue}) and GSTR-1 (₹${inv.val})`
        });
      }
    } else {
      // E-Way Bill generated on portal but no invoice found in GSTR-1
      results.push({
        ewbRecord: ewb,
        status: 'Missing in GSTR-1 (Suppression Risk)',
        diffValue: -ewb.totalValue,
        remarks: `E-Way Bill ${ewb.ewbNo} exists on EWB portal but is not reported in GSTR-1`
      });
    }
  }

  // 2. Identify GSTR-1 Invoices with Missing EWBs (> ₹50,000 threshold)
  for (let i = 0; i < gstr1Invoices.length; i++) {
    if (!matchedGstr1Indices.has(i)) {
      const inv = gstr1Invoices[i];
      const isOverThreshold = inv.val > threshold;

      results.push({
        gstr1Invoice: inv,
        status: isOverThreshold ? 'E-Way Bill Missing (Rule 138 Risk)' : 'Matched',
        diffValue: inv.val,
        remarks: isOverThreshold
          ? `Outward supply of ₹${inv.val} exceeds ₹${threshold} without an active E-Way Bill`
          : 'Invoice value is below mandatory E-Way Bill threshold'
      });
    }
  }

  // Summary counts
  const matchedCount = results.filter(r => r.status === 'Matched').length;
  const missingEwbCount = results.filter(r => r.status === 'E-Way Bill Missing (Rule 138 Risk)').length;
  const missingGstr1Count = results.filter(r => r.status === 'Missing in GSTR-1 (Suppression Risk)').length;
  const valueMismatchCount = results.filter(r => r.status === 'Value Mismatch').length;

  return {
    results,
    summary: {
      totalEwbCount: ewbRecords.length,
      totalGstr1Count: gstr1Invoices.length,
      matchedCount,
      missingEwbCount,
      missingGstr1Count,
      valueMismatchCount
    }
  };
}

/**
 * Exports E-Way Bill vs GSTR-1 Reconciliation to Zero-Merge Excel workbook.
 */
export function exportEwbVsGstr1Excel(
  results: EwbRecoResult[],
  clientProfile: { name?: string; gstin?: string; fp?: string } = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Status',
    'Document / Invoice No',
    'Invoice Date',
    'Recipient GSTIN',
    'Recipient Name',
    'GSTR-1 Invoice Value',
    'E-Way Bill No',
    'EWB Date',
    'E-Way Bill Value',
    'Difference Value',
    'Audit Remarks'
  ];

  const rows: any[][] = [];
  rows.push(['E-WAY BILL vs GSTR-1 OUTWARD SUPPLY AUDIT RECONCILIATION']);
  rows.push([`Client: ${clientProfile.name || ''} | GSTIN: ${clientProfile.gstin || ''} | Return Period: ${clientProfile.fp || ''}`]);
  rows.push(['']);
  rows.push(headers);

  for (const r of results) {
    rows.push([
      r.status,
      r.gstr1Invoice?.inum || r.ewbRecord?.docNo || '',
      r.gstr1Invoice?.idt || r.ewbRecord?.docDate || '',
      r.gstr1Invoice?.ctin || r.ewbRecord?.recipientGstin || '',
      r.gstr1Invoice?.buyerName || r.ewbRecord?.recipientName || '',
      r.gstr1Invoice?.val || 0,
      r.ewbRecord?.ewbNo || 'N/A',
      r.ewbRecord?.ewbDate || '',
      r.ewbRecord?.totalValue || 0,
      r.diffValue,
      r.remarks
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'EWB_vs_GSTR1');

  removeAllMergesFromWorkbook(wb);
  return wb;
}

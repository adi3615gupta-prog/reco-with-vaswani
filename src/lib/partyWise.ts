import type { ReconciliationResult } from './reconciliation';
import { deriveItcEligibility, daysOldFrom, taxRatePct, posCompliance, rule37Warning, actionableRemark, isLateFiler } from './compliance';

export interface PartyInvoiceRow {
  invoiceNoPR: string;
  invoiceNo2B: string;
  invoiceDatePR: string;
  invoiceDate2B: string;
  igstPR: number;
  igst2B: number;
  cgstPR: number;
  cgst2B: number;
  sgstPR: number;
  sgst2B: number;
  status: string;
  remark?: string;
  // Compliance audit columns
  itcEligibility?: string;
  gstr1Status?: string;
  filingDate?: string;
  daysOld?: number | '';
  taxRatePct?: number | '';
  posCompliance?: string;
  rule37Warning?: string;
}

export type PartyOverallStatus = 'All Matched' | 'Has Mismatches' | 'Has Missing';

export interface PartySummary {
  key: string;
  partyName: string;
  gstin: string;
  invoices: PartyInvoiceRow[];
  totals: {
    count: number;
    perfectMatch: number;
    valueMismatch: number;
    invoiceMissing: number;
    unmatchedVendor: number;
    missingInPR: number;
    igstPR: number;
    cgstPR: number;
    sgstPR: number;
    igst2B: number;
    cgst2B: number;
    sgst2B: number;
    igstDiff: number;
    cgstDiff: number;
    sgstDiff: number;
    totalDiff: number;
  };
  overall: PartyOverallStatus;
}

function pickPartyKey(r: ReconciliationResult): { key: string; name: string; gstin: string } {
  const rec = r.prRecord || r.twoBRecord;
  const gstin = (rec?.gstin || '').toUpperCase().trim();
  const name = rec?.supplierName || '';
  const key = gstin || name.trim().toUpperCase() || 'UNKNOWN';
  return { key, name, gstin };
}

export function aggregateByParty(results: ReconciliationResult[]): PartySummary[] {
  const map = new Map<string, PartySummary>();

  for (const r of results) {
    const { key, name, gstin } = pickPartyKey(r);
    let p = map.get(key);
    if (!p) {
      p = {
        key,
        partyName: name,
        gstin,
        invoices: [],
        totals: {
          count: 0, perfectMatch: 0, valueMismatch: 0, invoiceMissing: 0,
          unmatchedVendor: 0, missingInPR: 0,
          igstPR: 0, cgstPR: 0, sgstPR: 0,
          igst2B: 0, cgst2B: 0, sgst2B: 0,
          igstDiff: 0, cgstDiff: 0, sgstDiff: 0, totalDiff: 0,
        },
        overall: 'All Matched',
      };
      map.set(key, p);
    }
    if (!p.partyName && name) p.partyName = name;
    if (!p.gstin && gstin) p.gstin = gstin;

    const pr = r.prRecord;
    const tb = r.twoBRecord;

    const baseRec = pr || tb;
    const days = daysOldFrom(pr?.invoiceDate || tb?.invoiceDate);
    const totalTax = (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0);
    const lateFiler = isLateFiler(pr?.invoiceDate || tb?.invoiceDate, tb?.filingDate);

    p.invoices.push({
      invoiceNoPR: pr?.invoiceNo || '',
      invoiceNo2B: tb?.invoiceNo || '',
      invoiceDatePR: pr?.invoiceDate || '',
      invoiceDate2B: tb?.invoiceDate || '',
      igstPR: pr?.igst ?? 0,
      igst2B: tb?.igst ?? 0,
      cgstPR: pr?.cgst ?? 0,
      cgst2B: tb?.cgst ?? 0,
      sgstPR: pr?.sgst ?? 0,
      sgst2B: tb?.sgst ?? 0,
      status: r.status,
      remark: actionableRemark(r.status, r.remark, lateFiler),
      itcEligibility: deriveItcEligibility(baseRec?.supplierName),
      gstr1Status: tb?.filingStatus ?? '',
      filingDate: tb?.filingDate ?? '',
      daysOld: days,
      taxRatePct: taxRatePct(pr?.taxableValue ?? tb?.taxableValue, totalTax),
      posCompliance: posCompliance(baseRec),
      rule37Warning: rule37Warning(r.status, days),
    });

    p.totals.count++;
    p.totals.igstPR += pr?.igst ?? 0;
    p.totals.cgstPR += pr?.cgst ?? 0;
    p.totals.sgstPR += pr?.sgst ?? 0;
    p.totals.igst2B += tb?.igst ?? 0;
    p.totals.cgst2B += tb?.cgst ?? 0;
    p.totals.sgst2B += tb?.sgst ?? 0;

    switch (r.status) {
      case 'Perfect Match': case 'Matched': case 'Matched (Rounded)':
        p.totals.perfectMatch++; break;
      case 'Value Mismatch': case 'Mismatch':
        p.totals.valueMismatch++; break;
      case 'Invoice Missing': case 'Missing in 2B':
        p.totals.invoiceMissing++; break;
      case 'Unmatched Vendor':
        p.totals.unmatchedVendor++; break;
      case 'Missing in PR':
        p.totals.missingInPR++; break;
    }
  }

  for (const p of map.values()) {
    p.totals.igstDiff = +(p.totals.igstPR - p.totals.igst2B).toFixed(2);
    p.totals.cgstDiff = +(p.totals.cgstPR - p.totals.cgst2B).toFixed(2);
    p.totals.sgstDiff = +(p.totals.sgstPR - p.totals.sgst2B).toFixed(2);
    p.totals.totalDiff = +(
      Math.abs(p.totals.igstDiff) + Math.abs(p.totals.cgstDiff) + Math.abs(p.totals.sgstDiff)
    ).toFixed(2);
    p.totals.igstPR = +p.totals.igstPR.toFixed(2);
    p.totals.cgstPR = +p.totals.cgstPR.toFixed(2);
    p.totals.sgstPR = +p.totals.sgstPR.toFixed(2);
    p.totals.igst2B = +p.totals.igst2B.toFixed(2);
    p.totals.cgst2B = +p.totals.cgst2B.toFixed(2);
    p.totals.sgst2B = +p.totals.sgst2B.toFixed(2);

    if (p.totals.invoiceMissing + p.totals.unmatchedVendor + p.totals.missingInPR > 0) {
      p.overall = 'Has Missing';
    } else if (p.totals.valueMismatch > 0) {
      p.overall = 'Has Mismatches';
    } else {
      p.overall = 'All Matched';
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.partyName || a.key).localeCompare(b.partyName || b.key)
  );
}

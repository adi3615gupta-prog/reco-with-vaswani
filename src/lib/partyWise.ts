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

function normalizePartyName(name: string): string {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function createParty(key: string, partyName: string, gstin: string): PartySummary {
  return {
    key,
    partyName,
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
}

function mergePartySummaries(map: Map<string, PartySummary>, fromKey: string, toKey: string) {
  if (fromKey === toKey) return;
  const from = map.get(fromKey);
  const to = map.get(toKey);
  if (!from || !to) return;
  to.invoices.push(...from.invoices);
  if (!to.partyName && from.partyName) to.partyName = from.partyName;
  if (!to.gstin && from.gstin) to.gstin = from.gstin;
  map.delete(fromKey);
}

export function aggregateByParty(results: ReconciliationResult[], mode: 'input' | 'output' = 'input'): PartySummary[] {
  const map = new Map<string, PartySummary>();
  const nameIndex = new Map<string, string>();
  let unknownIndex = 0;

  for (const r of results) {
    const rec = r.prRecord || r.twoBRecord;
    const gstin = (rec?.gstin || '').toUpperCase().trim();
    const name = rec?.supplierName || '';
    const normalizedName = normalizePartyName(name);
    let key = gstin || normalizedName || `UNKNOWN-${++unknownIndex}`;

    if (!gstin && normalizedName && nameIndex.has(normalizedName)) {
      key = nameIndex.get(normalizedName)!;
    }

    if (gstin && normalizedName && nameIndex.has(normalizedName) && nameIndex.get(normalizedName) !== gstin) {
      const existingKey = nameIndex.get(normalizedName)!;
      if (existingKey !== gstin) {
        if (map.has(existingKey) && !map.has(gstin)) {
          const existingParty = map.get(existingKey)!;
          const newParty = createParty(gstin, existingParty.partyName || name, gstin);
          newParty.invoices.push(...existingParty.invoices);
          map.set(gstin, newParty);
          map.delete(existingKey);
        } else if (map.has(existingKey) && map.has(gstin)) {
          mergePartySummaries(map, existingKey, gstin);
        }
      }
      key = gstin;
    }

    if (!map.has(key)) {
      map.set(key, createParty(key, name, gstin));
    }
    if (normalizedName) nameIndex.set(normalizedName, key);

    const party = map.get(key)!;
    if (!party.partyName && name) party.partyName = name;
    if (!party.gstin && gstin) party.gstin = gstin;

    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const baseRec = pr || tb;
    const days = daysOldFrom(pr?.invoiceDate || tb?.invoiceDate);
    const totalTax = (pr?.igst ?? tb?.igst ?? 0) + (pr?.cgst ?? tb?.cgst ?? 0) + (pr?.sgst ?? tb?.sgst ?? 0);
    const lateFiler = isLateFiler(pr?.invoiceDate || tb?.invoiceDate, tb?.filingDate);

    party.invoices.push({
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
      remark: actionableRemark(r.status, r.remark, lateFiler, mode),
      itcEligibility: mode === 'output' ? '—' : deriveItcEligibility(baseRec?.supplierName),
      gstr1Status: tb?.filingStatus ?? '',
      filingDate: tb?.filingDate ?? '',
      daysOld: days,
      taxRatePct: taxRatePct(pr?.taxableValue ?? tb?.taxableValue, totalTax),
      posCompliance: posCompliance(baseRec),
      rule37Warning: mode === 'output' ? '—' : rule37Warning(r.status, days),
    });
  }

  const parties = Array.from(map.values()).map((p) => {
    const totals = p.invoices.reduce(
      (acc, inv) => {
        acc.count += 1;
        acc.igstPR += inv.igstPR;
        acc.cgstPR += inv.cgstPR;
        acc.sgstPR += inv.sgstPR;
        acc.igst2B += inv.igst2B;
        acc.cgst2B += inv.cgst2B;
        acc.sgst2B += inv.sgst2B;
        if (inv.status === 'Perfect Match' || inv.status === 'Matched' || inv.status === 'Matched (Rounded)') acc.perfectMatch += 1;
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

    const overall: PartyOverallStatus =
      totals.invoiceMissing + totals.unmatchedVendor + totals.missingInPR > 0
        ? 'Has Missing'
        : totals.valueMismatch > 0
        ? 'Has Mismatches'
        : 'All Matched';

    return {
      ...p,
      totals,
      overall,
    };
  });

  return parties.sort((a, b) => (a.partyName || a.key).localeCompare(b.partyName || b.key));
}

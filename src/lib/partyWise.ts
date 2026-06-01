import type { ReconciliationResult } from './reconciliation';
import { deriveItcEligibility, daysOldFrom, taxRatePct, posCompliance, rule37Warning, actionableRemark, isLateFiler } from './compliance';
import { normalizePartyName } from './reconciliation';

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
  partyNamePR: string;
  partyName2B: string;
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

function createParty(key: string, partyName: string, gstin: string, partyNamePR = '', partyName2B = ''): PartySummary {
  return {
    key,
    partyName,
    partyNamePR,
    partyName2B,
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
    const normalizedName = r.canonicalPartyName || normalizePartyName(name);
    
    let key = gstin ? gstin : (normalizedName ? `NAME::${normalizedName}` : `UNKNOWN::${++unknownIndex}`);

    if (!gstin && normalizedName && nameIndex.has(normalizedName)) {
      key = nameIndex.get(normalizedName)!;
    }
    if (gstin && normalizedName && nameIndex.has(normalizedName) && nameIndex.get(normalizedName) !== gstin) {
      const existingKey = nameIndex.get(normalizedName)!;
      if (existingKey !== gstin && (existingKey.startsWith('NAME::') || existingKey.startsWith('UNKNOWN::'))) {
        if (map.has(existingKey)) {
          const existingParty = map.get(existingKey)!;
          let newParty = map.get(gstin);
          if (!newParty) {
            newParty = createParty(gstin, existingParty.partyName || name, gstin, existingParty.partyNamePR, existingParty.partyName2B);
            map.set(gstin, newParty);
          }
          newParty.invoices.push(...existingParty.invoices);
          if (!newParty.partyName && existingParty.partyName) newParty.partyName = existingParty.partyName;
          if (!newParty.partyNamePR && existingParty.partyNamePR) newParty.partyNamePR = existingParty.partyNamePR;
          if (!newParty.partyName2B && existingParty.partyName2B) newParty.partyName2B = existingParty.partyName2B;
          map.delete(existingKey);
        }
        nameIndex.set(normalizedName, gstin);
      }
      key = gstin;
    }

    const pr = r.prRecord;
    const tb = r.twoBRecord;
    const prName = pr?.supplierName || '';
    const tbName = tb?.supplierName || '';

    if (!map.has(key)) {
      map.set(key, createParty(key, name, gstin, prName, tbName));
      if (normalizedName && (!nameIndex.has(normalizedName) || nameIndex.get(normalizedName)!.startsWith('NAME::'))) {
        nameIndex.set(normalizedName, key);
      }
    }

    const party = map.get(key)!;
    if (!party.partyName && name) party.partyName = name;
    if (!party.partyNamePR && prName) party.partyNamePR = prName;
    if (!party.partyName2B && tbName) party.partyName2B = tbName;
    if (!party.gstin && gstin) party.gstin = gstin;

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
        
        const status = inv.status;
        if (status === 'Perfect Match' || status === 'Matched' || status === 'Matched (Rounded)' || status === 'Matched (Diff Date)') {
          acc.perfectMatch += 1;
        } else if (status === 'Not in 2B' || status === 'Missing in 2B') {
          acc.invoiceMissing += 1;
        } else if (status === 'Unmatched Vendor') {
          acc.unmatchedVendor += 1;
        } else if (status === 'Not in Books' || status === 'Missing in PR') {
          acc.missingInPR += 1;
        } else {
          // Value Mismatch, Wrong GSTIN, Name Mismatch, etc.
          acc.valueMismatch += 1;
        }
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

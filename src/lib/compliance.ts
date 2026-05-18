// Compliance helpers — additive only. Used to enrich exports with audit columns.
// No existing matching/DN logic depends on these.

import type { InvoiceRecord, MatchStatus } from './reconciliation';

export interface ComplianceCols {
  itcEligibility: string;          // 'Eligible' | 'Blocked U/s 17(5)'
  gstr1Status: string;             // from 2B
  filingDate: string;              // from 2B
  daysOld: number | '';            // invoice age in days
  taxRatePct: number | '';         // (CGST+SGST+IGST)/Taxable * 100
  posCompliance: string;           // 'OK' | 'Mismatch — ...' | '—'
  rule37Warning: string;           // '⚠ >150 days' | ''
  actionableRemark: string;        // refined remark
}

// Section 17(5) blocked-credit keyword heuristics applied on supplier name.
// (No HSN feed available — best-effort flag for auditor review.)
const BLOCKED_KEYWORDS = [
  'hotel', 'restaurant', 'club', 'membership', 'gym', 'spa',
  'rent-a-cab', 'rent a cab', 'cab service', 'taxi',
  'health insurance', 'life insurance', 'beauty', 'cosmetic',
  'food and bever', 'catering', 'outdoor catering',
];

export function deriveItcEligibility(supplierName: string | undefined): string {
  if (!supplierName) return 'Eligible';
  const s = supplierName.toLowerCase();
  for (const k of BLOCKED_KEYWORDS) {
    if (s.includes(k)) return 'Blocked U/s 17(5)';
  }
  return 'Eligible';
}

function parseAnyDate(input?: string): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let yy = +m[3]; if (yy < 100) yy += 2000;
    return new Date(yy, +m[2] - 1, +m[1]);
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function daysOldFrom(invoiceDate?: string, today: Date = new Date()): number | '' {
  const d = parseAnyDate(invoiceDate);
  if (!d) return '';
  const ms = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function taxRatePct(taxable?: number, totalTax?: number): number | '' {
  if (!taxable || taxable <= 0) return '';
  const t = (totalTax ?? 0);
  if (t <= 0) return 0;
  return +((t / taxable) * 100).toFixed(2);
}

// POS validation: GSTIN's first 2 digits = state code. If both intra (CGST/SGST)
// and inter (IGST) tax types appear, or neither appears, flag a mismatch.
// We can't fetch the company GSTIN, so we validate tax-type self-consistency.
export function posCompliance(rec?: InvoiceRecord): string {
  if (!rec || !rec.gstin) return '—';
  const stateCode = rec.gstin.slice(0, 2);
  if (!/^\d{2}$/.test(stateCode)) return '—';
  const hasIntra = (rec.cgst || 0) > 0 || (rec.sgst || 0) > 0;
  const hasInter = (rec.igst || 0) > 0;
  if (hasIntra && hasInter) return 'Mismatch — Intra & Inter tax both present';
  if (!hasIntra && !hasInter) return '—';
  return 'OK';
}

export function rule37Warning(status: MatchStatus, days: number | ''): string {
  if (typeof days !== 'number') return '';
  const isMatched = status === 'Perfect Match' || status === 'Matched' || status === 'Matched (Rounded)' || status === 'Matched (Diff Date)';
  const isMissing2B = status === 'Invoice Missing' || status === 'Missing in 2B' || status === 'Unmatched Vendor';
  if ((isMatched || isMissing2B) && days > 150) return `⚠ ${days} days — Rule 37 (180-day) deadline approaching`;
  return '';
}

export function actionableRemark(status: MatchStatus, baseRemark?: string, lateFiler?: boolean): string {
  const parts: string[] = [];
  if (baseRemark) parts.push(baseRemark);
  switch (status) {
    case 'Invoice Missing':
    case 'Missing in 2B':
    case 'Unmatched Vendor':
      parts.push('Follow up with Vendor / Hold GST Payment.');
      break;
    case 'Value Mismatch':
    case 'Mismatch':
      parts.push('Verify Taxable Value with Vendor.');
      break;
    case 'Perfect Match':
    case 'Matched':
    case 'Matched (Rounded)':
    case 'Matched (Diff Date)':
      if (lateFiler) parts.push('Matched (Late Filer) — Check GSTR-3B filing before claiming.');
      break;
    default:
      break;
  }
  return parts.join(' ');
}

// Late filer heuristic: vendor's GSTR-1 filing date later than 11th of next month
export function isLateFiler(invoiceDate?: string, filingDate?: string): boolean {
  const inv = parseAnyDate(invoiceDate);
  const fil = parseAnyDate(filingDate);
  if (!inv || !fil) return false;
  // due date: 11th of month after invoice month
  const due = new Date(inv.getFullYear(), inv.getMonth() + 1, 11);
  return fil.getTime() > due.getTime();
}

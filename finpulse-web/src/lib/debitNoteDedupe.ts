import { normalizeInvoiceNo } from './debitNoteEngine';

/**
 * A debit-note voucher can sit in the purchase register twice: once as a normal
 * Books row (main invoice list) and once in the Purchase Return / debit-note sheet
 * that the debit-note engine reads. This removes the main-list copy so each
 * voucher is reconciled exactly once (by the debit-note engine).
 *
 * Matching is multiset-based: each debit-note row removes at most one main row,
 * so genuinely repeated invoice numbers are not wiped out.
 */
export function removeDebitNoteDuplicatesFromPr<
  M extends { invoiceNo: string; taxableValue?: number },
  D extends { invoiceNo: string; taxableValue?: number },
>(mainPr: M[], dnPr: D[]): { kept: M[]; removed: M[] } {
  const key = (inv: string, taxable: number) =>
    `${normalizeInvoiceNo(inv)}|${Math.round(taxable * 100)}`;

  const pending = new Map<string, number>();
  for (const d of dnPr) {
    const inv = normalizeInvoiceNo(d.invoiceNo);
    if (!inv || typeof d.taxableValue !== 'number') continue;
    const k = key(d.invoiceNo, d.taxableValue);
    pending.set(k, (pending.get(k) ?? 0) + 1);
  }

  const kept: M[] = [];
  const removed: M[] = [];
  for (const m of mainPr) {
    const inv = normalizeInvoiceNo(m.invoiceNo);
    if (inv && typeof m.taxableValue === 'number') {
      const k = key(m.invoiceNo, m.taxableValue);
      const n = pending.get(k) ?? 0;
      if (n > 0) {
        pending.set(k, n - 1);
        removed.push(m);
        continue;
      }
    }
    kept.push(m);
  }
  return { kept, removed };
}

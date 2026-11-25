import { describe, it, expect } from 'vitest';
import { computeAdvanceTdsAudit } from '../lib/tdsEngine';

// Worked examples from the advance-TDS note: opening Cr is cleared by payments, opening Dr absorbs expenses.
const base = (over: Record<string, unknown>) => ({
    date: new Date('2026-06-01'),
    partyName: 'ABC PARTY',
    partyPan: 'ABCDE1234F',
    ledgerName: 'Unmapped Expense',
    amount: 0,
    actualTdsDeducted: 0,
    ...over,
});

describe('advance TDS with opening balances', () => {
    // The expense ledger must be mapped for its amount to count
    const mapped = [{ ledgerName: 'Unmapped Expense', sectionCode: '194C' }];
    it('opening Cr of 50,000 with expense 5,000 and payment 10,000 leaves no advance', () => {
        const txns = [
            base({ amount: 5000 }),
            base({ ledgerName: 'Payments (TDS deducted)', isPayment: true, paymentAmount: 10000 }),
        ];
        const res = computeAdvanceTdsAudit(txns as any, mapped, [], undefined, new Map([['ABC PARTY', 50000]]));
        expect(res).toHaveLength(0);
    });

    it('opening Dr of 50,000 with expense 5,000 and payment 10,000 gives advance 10,000', () => {
        const txns = [
            base({ amount: 5000 }),
            base({ ledgerName: 'Payments (TDS deducted)', isPayment: true, paymentAmount: 10000 }),
        ];
        const res = computeAdvanceTdsAudit(txns as any, mapped, [], undefined, undefined, new Map([['ABC PARTY', 50000]]));
        expect(res).toHaveLength(1);
        expect(res[0].advanceAmount).toBe(10000);
    });
});

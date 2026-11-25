import { describe, it, expect } from 'vitest';
import { removeDebitNoteDuplicatesFromPr } from '../debitNoteDedupe';

describe('removeDebitNoteDuplicatesFromPr', () => {
  it('drops the main-list copy of a debit note that is also in the DN sheet', () => {
    const main = [
      { invoiceNo: 'DYP/DB/26-27/5', taxableValue: 15834 },
      { invoiceNo: 'INV-1', taxableValue: 1000 },
    ];
    const dn = [{ invoiceNo: 'DYP/DB/26-27/5', taxableValue: 15834 }];
    const { kept, removed } = removeDebitNoteDuplicatesFromPr(main, dn);
    expect(removed).toEqual([main[0]]);
    expect(kept).toEqual([main[1]]);
  });

  it('matches across dash/slash formatting of the invoice number', () => {
    const main = [{ invoiceNo: 'DYP-DB-26-27-5', taxableValue: 500 }];
    const dn = [{ invoiceNo: 'DYP/DB/26-27/5', taxableValue: 500 }];
    expect(removeDebitNoteDuplicatesFromPr(main, dn).kept).toHaveLength(0);
  });

  it('removes one main row per DN row, keeping genuine repeats', () => {
    const main = [
      { invoiceNo: 'X1', taxableValue: 100 },
      { invoiceNo: 'X1', taxableValue: 100 },
    ];
    const dn = [{ invoiceNo: 'X1', taxableValue: 100 }];
    const { kept, removed } = removeDebitNoteDuplicatesFromPr(main, dn);
    expect(removed).toHaveLength(1);
    expect(kept).toHaveLength(1);
  });

  it('does not touch rows when amounts differ', () => {
    const main = [{ invoiceNo: 'X1', taxableValue: 100 }];
    const dn = [{ invoiceNo: 'X1', taxableValue: 101 }];
    expect(removeDebitNoteDuplicatesFromPr(main, dn).kept).toHaveLength(1);
  });

  it('keeps rows with no taxable value or no invoice number', () => {
    const main = [
      { invoiceNo: '', taxableValue: 50 },
      { invoiceNo: 'X2', taxableValue: undefined },
    ];
    const dn = [
      { invoiceNo: '', taxableValue: 50 },
      { invoiceNo: 'X2', taxableValue: undefined as unknown as number },
    ];
    expect(removeDebitNoteDuplicatesFromPr(main, dn).kept).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPairDismatched,
  saveLearnedDismatch,
  saveBatchLearnedDismatches,
  getLearnedDismatches,
  clearLearnedDismatches,
  makeDismatchKey,
} from '../lib/recoLearnedMatches';

describe('Auto-Match Learning & Dis-match Rejection Store', () => {
  beforeEach(() => {
    clearLearnedDismatches();
  });

  it('initially reports no dis-matches', () => {
    expect(isPairDismatched('27ABCDE1234F1Z5', 'INV-001', 'INV/001')).toBe(false);
  });

  it('correctly remembers a dis-matched pair and ignores casing/punctuation', () => {
    saveLearnedDismatch('27ABCDE1234F1Z5', 'INV-001', 'INV/001', {
      partyName: 'ABC TRADERS',
      reason: 'Wrong Invoice Match',
    });

    expect(isPairDismatched('27ABCDE1234F1Z5', 'INV-001', 'INV/001')).toBe(true);
    // Casing and formatting tolerance:
    expect(isPairDismatched('27abcde1234f1z5', 'inv001', 'inv-001')).toBe(true);
    expect(isPairDismatched('27ABCDE1234F1Z5', 'INV-999', 'INV/001')).toBe(false);
  });

  it('supports batch saving of dis-matched pairs', () => {
    saveBatchLearnedDismatches([
      { gstin: '27ABC', prInvoiceNo: 'A1', twoBInvoiceNo: 'B1' },
      { gstin: '27XYZ', prInvoiceNo: 'A2', twoBInvoiceNo: 'B2' },
    ]);

    expect(isPairDismatched('27ABC', 'A1', 'B1')).toBe(true);
    expect(isPairDismatched('27XYZ', 'A2', 'B2')).toBe(true);
    expect(isPairDismatched('27ABC', 'A2', 'B2')).toBe(false);
  });

  it('clears learned dismatches cleanly', () => {
    saveLearnedDismatch('27ABC', 'A1', 'B1');
    expect(isPairDismatched('27ABC', 'A1', 'B1')).toBe(true);
    clearLearnedDismatches();
    expect(isPairDismatched('27ABC', 'A1', 'B1')).toBe(false);
  });
});

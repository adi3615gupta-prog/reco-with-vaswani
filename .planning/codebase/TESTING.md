---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# Testing Patterns

**Analysis Date:** 2026-10-22

## Test Framework

**Runner:**
- Vitest 1.x / 2.x
- Config: `vitest.config.ts`
- Environment: `jsdom` for React component/DOM compatibility
- Setup file: `src/test/setup.ts` (sets up `@testing-library/jest-dom` and `window.matchMedia` stub)

**Assertion Library:**
- Vitest built-in assertions (`expect`, `describe`, `it`, `beforeEach`, `vi`)
- `@testing-library/jest-dom` matchers

**Run Commands:**

```bash
npm run test           # Run all unit and integration tests once (vitest run)
npm run test:watch     # Run Vitest in interactive watch mode (vitest)
```

## Test File Organization

**Location:**
- Dedicated test suite directory: `src/test/`
- Co-located engine unit tests: `src/lib/*.test.ts`

**Naming:**
- `*.test.ts` or `*.test.tsx`
- Examples: `src/test/reconciliationEngine.test.ts`, `src/lib/tallyApi.test.ts`, `src/lib/incomeTaxEngine.test.ts`

**Structure:**

```
src/
├── lib/
│   ├── incomeTaxEngine.test.ts
│   └── tallyApi.test.ts
└── test/
    ├── example.test.ts
    ├── finalisationScrutiny.test.ts
    ├── reconciliationEngine.test.ts
    ├── setup.ts
    └── tdsEngine.test.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect } from 'vitest';
import { reconcile, extractCoreInvoiceNumber, type InvoiceRecord } from '../lib/reconciliation';

describe('GST Purchase Reconciliation Engine - Advanced Matching', () => {
  it('should extract core invoice numbers correctly stripping prefixes, FY tokens, and leading zeros', () => {
    expect(extractCoreInvoiceNumber('BILL-2024-0012')).toBe('12');
    expect(extractCoreInvoiceNumber('INV/24-25/0099')).toBe('99');
    expect(extractCoreInvoiceNumber('GST-2024-05')).toBe('5');
    expect(extractCoreInvoiceNumber('0045')).toBe('45');
    expect(extractCoreInvoiceNumber('AB-1234')).toBe('1234');
  });

  it('should match invoices with prefix/FY differences using core invoice fuzzy matching', () => {
    const prRecords: InvoiceRecord[] = [
      {
        supplierName: 'ABC ENTERPRISES',
        gstin: '27AAAAA0000A1Z5',
        invoiceNo: 'BILL-2024-0012',
        invoiceDate: '2024-05-10',
        igst: 0,
        cgst: 900,
        sgst: 900,
        source: 'PR'
      }
    ];

    const twoBRecords: InvoiceRecord[] = [
      {
        supplierName: 'ABC ENTERPRISES',
        gstin: '27AAAAA0000A1Z5',
        invoiceNo: '12',
        invoiceDate: '2024-05-10',
        igst: 0,
        cgst: 900,
        sgst: 900,
        source: '2B'
      }
    ];

    const results = reconcile(prRecords, twoBRecords, 'input');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Matched (Cleaned / Fuzzy No)');
  });
});
```

**Patterns:**
- Arrange: Construct realistic statutory invoice rows (`InvoiceRecord[]`) with IGST, CGST, SGST amounts
- Act: Invoke pure reconciliation function (`reconcile()`, `calculateTaxLiability()`, `aggregateByParty()`)
- Assert: Verify exact match status strings, rounding differences, and tolerance thresholds

## Mocking

**Framework:**
- Vitest `vi` mock utilities (`vi.fn()`, `vi.spyOn()`, `vi.mock()`)

**Patterns:**
- Mocking browser globals in `src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
```

**What to Mock:**
- Browser APIs unavailable in JSDOM (e.g. `matchMedia`, `ResizeObserver`)
- External network requests to TallyPrime port 9000 or GST Portal
- Electron IPC bridges (`window.electronAPI`)

**What NOT to Mock:**
- Core domain mathematical engines (`reconciliation.ts`, `incomeTaxEngine.ts`, `tdsEngine.ts`) — test pure algorithms with concrete inputs and outputs

## Fixtures and Factories

**Test Data:**
- Synthetic GSTINs following Indian 15-character GST format (e.g. `27AAAAA0000A1Z5`)
- Test invoice fixtures constructed directly inline in `describe` blocks or imported from JSON mocks

**Location:**
- Inline in `src/test/*.test.ts`
- Benchmark data: `src/lib/gtcBenchmarkData.json`

## Coverage

**Requirements:**
- Core business engines (`reconciliation.ts`, `partyWise.ts`, `incomeTaxEngine.ts`, `tdsEngine.ts`) must maintain high test coverage for edge cases (tolerance boundaries, cross-state PANs, debit note reversals).

**View Coverage:**

```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Regex sanitizers (`cleanInvoiceNumber`, `extractCoreInvoiceNumber`, `normalizePartyName`)
- Tax computation math (Old vs New tax regime slabs in `incomeTaxEngine.test.ts`)
- TDS Section 194C/J threshold evaluation (`tdsEngine.test.ts`)

**Integration Tests:**
- End-to-end 8-pass reconciliation pipeline (`reconciliationEngine.test.ts`)
- Multi-party aggregation and debit note pairing (`partyWise.ts`)
- Tally XML serialization and parsing (`tallyApi.test.ts`)

## Common Patterns

**Tolerance Boundary Verification:**

```typescript
it('should categorize difference <= 2.0 as Matched (Rounded) and > 2.0 as Value Mismatch', () => {
  const prRecord = { ...basePR, cgst: 100.00 };
  const twoBRecordWithinTol = { ...base2B, cgst: 101.50 };
  const twoBRecordAboveTol = { ...base2B, cgst: 102.50 };

  const res1 = reconcile([prRecord], [twoBRecordWithinTol]);
  expect(res1[0].status).toBe('Matched (Rounded)');

  const res2 = reconcile([prRecord], [twoBRecordAboveTol]);
  expect(res2[0].status).toBe('Value Mismatch');
});
```

---

*Testing analysis: 2026-10-22*

# Plan 28-02 Summary: TDS Engine Core Calculation Fixes & Scrutiny Test Recovery (100% Pass Rate)

**Plan:** 28-02  
**Phase:** 28 — System Hardening, Security Safeguards & Comprehensive Bug Resolution  
**Status:** Completed  
**Execution Date:** 2026-11-01  

---

## 1. Key Accomplishments

1. **Eliminated Duplicate "Missing in Books" Rows (`src/lib/tdsEngine.ts`):**
   - Uncommented `unmatchedTraces.delete(tKeyExact)` upon exact PAN + Section matching.
   - Ensured trace records paired with books entries are removed from `unmatchedTraces` so they are not processed a second time by the leftover loop at line 1050.
2. **Strictly Enforced Confirmed Matches Override (`src/lib/tdsEngine.ts`):**
   - Replaced `if (confirmedMatches && confirmedMatches.length > 0)` with `if (confirmedMatches !== undefined)`.
   - When callers pass an empty list `confirmedMatches = []`, the engine now strictly prevents automatic pairing of unconfirmed parties with similar names.
3. **Harmonized PAN Group Key Formatting (`src/lib/tdsEngine.ts`):**
   - Standardized `groupKey` to `${rawPan}_${resolvedSection}` (and `NOPAN-${cleanName}_${resolvedSection}` for unregistered parties).
   - Preserved `txn.partyName` inside the generated object, resolving `undefined` lookups for Section 194Q threshold violations (> ₹50L) and negative credit reversals.
4. **100% Vitest Pass Rate on TDS Engine:**
   - Resolved all 4 previous failing test cases in `src/test/tdsEngine.test.ts`. All 13 tests now pass with 0 errors.

---

## 2. Verification

- Ran `npx vitest run src/test/tdsEngine.test.ts`:
  ```text
  Test Files  1 passed (1)
       Tests  13 passed (13)
  ```
- Verified test cases:
  - Spaced PAN matching (`BUDPA 3038 A` -> `BUDPA3038A`)
  - Confirmed matches empty list disallowance
  - Net balance with credit adjustments
  - Section 194Q ₹50L threshold calculations
  - Form 26Q rate prioritization

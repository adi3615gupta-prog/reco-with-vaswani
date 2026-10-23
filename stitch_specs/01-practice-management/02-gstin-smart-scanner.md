# Module 1.2: GSTIN Smart Scanner & Auditor

> **Suite Accent Color:** Emerald / Amber (`#10b981` / `#f59e0b`)  
> **Route:** `/gstin-scan`  
> **Source Component:** [`src/pages/GstinScan.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GstinScan.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Books me recorded vendor aur customer GSTINs ka structural, mathematical (Modulo 36 checksum), aur cross-state PAN verification karta hai.
- **Kyu karta hai:** Wrong GSTINs ki wajah se recipient ka ITC reject ho jata hai ya incorrect state me tax transfer ho jata hai (e.g. CGST+SGST vs IGST dispute).
- **Kaise karta hai:** 15-character GSTIN regex `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}` evaluate karta hai, state code (characters 1-2) check karta hai, 10-character PAN extract karta hai, aur Luhn-variant checksum compute karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Inspection Stats & Summary Cards
1. **Total GSTINs Scanned:** e.g. `1,280 Parties Scanned`
2. **Valid GSTINs:** e.g. `1,262 Valid (98.6%)` (Emerald)
3. **Invalid Checksums:** e.g. `8 Flagged Checksum Errors` (Red)
4. **Duplicate Master Accounts:** e.g. `10 Multi-Ledger Conflict` (Amber)

### 2.2 Live GSTIN Analyzer Input Deck
- **Single GSTIN Tester Box:**
  - Input field with real-time character badge breakdown:
    - `[27]` State Code: Maharashtra
    - `[AABCS1234D]` Vendor PAN: Verified Private Limited Company (`C`)
    - `[1]` Entity Serial Number
    - `[Z]` Default GST Alphabet
    - `[2]` Checksum Digit: Valid
- **Batch Conflict Data Table:**
  | Vendor Ledger Name in Books | Recorded GSTIN | Extracted PAN | Error Category | Suggested Correction | Action |
  |---|---|---|---|---|---|
  | Apex Steel Corp (Ahmedabad) | 27AABCA5555B1Z1 | AABCA5555B | State Code Mismatch (Vendor in GJ, code 27) | Change to 24AABCA5555B1Z1 | `Auto-Correct` |
  | Apex Steel Corp (Gujarat) | 24AABCA5555B1Z2 | AABCA5555B | Duplicate Ledger under same PAN | Merge Ledgers | `Consolidate` |

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise GSTIN Verification & Diagnostic screen.
- Layout: Top analyzer cards for Valid, Invalid Checksum, and Duplicate PAN accounts.
- Centerpiece: Interactive 15-character GSTIN breakdown widget displaying State, PAN, Entity Number, and Checksum status.
- Grid: Dense discrepancy resolution table showing Ledger Name, Problem Detected, and 1-Click Auto-Fix button.
```

# Phase 06: Core Compliance Modules UI/UX Overhaul & Financial Cockpit Elevation - Context

**Gathered:** 2026-10-23
**Status:** Ready for execution (Plan 06-07)

<domain>
## Phase Boundary

Split the unified Returns Auto-Pilot & Ingestion Deck (`ReturnsAutoIngestDeck.tsx`) into two independent operational cockpits:
1. **GSTR-1 Outward Sales Deck:** Independent download/sync via `/api/gstr1/portal-sync-browser`, independent file dropzone, live sales preview (B2B, B2C, CDNR), and injection into GSTR-3B Table 3.1 with confirmation dialog.
2. **GSTR-2B Inward ITC Deck:** Independent download/sync via `/api/gstr2b/portal-sync-browser`, independent file dropzone, live eligible ITC preview (All other ITC, RCM, CDNR reversals), and injection into GSTR-3B Table 4 with confirmation dialog.

Scope is strictly locked to `ReturnsAutoIngestDeck.tsx`, `ReturnsDashboard.tsx`, `gstrAutoIngest.ts`, and `gstr3bEngine.ts` to ensure full compliance with the reference accounting workbook in `D:\My software\full and final\6. September-2026`.
</domain>

<decisions>
## Implementation Decisions

### 1. Visual Layout & Cockpit Structure
- **D-01:** **Side-by-Side 2-Column Grid** — Reversible — The deck presents two distinct visual cards side-by-side on desktop (`grid grid-cols-1 lg:grid-cols-2 gap-4`):
  - **Left Card (Blue/Indigo styling):** GSTR-1 Outward Sales Deck.
  - **Right Card (Emerald/Teal styling):** GSTR-2B Inward ITC Deck.
  - Both cards feature independent Action triggers (Sync Portal, Drag-and-drop file upload, Table Preview, and Injection button).

### 2. Injection Confirmation Protocol
- **D-02:** **Pre-Injection Confirmation Modal / Prompt** — Reversible — Before data is injected into the GSTR-3B working sheet:
  - System must show a confirmation dialog detailing the breakdown: Taxable value, CGST, SGST, IGST, and affected Table rows.
  - User can review and confirm before the GSTR-3B state is updated.
  - Prevents accidental overwriting of manual entries or work-in-progress returns.

### 3. Accounting & Field Injection Contract
- **D-03:** **Reference Tie-Out against DYP Infraprojects Sept-2026 Sample** — Costly — Must tie out to `D:\My software\full and final\6. September-2026`:
  - **GSTR-1 $\rightarrow$ GSTR-3B Table 3.1:**
    - `b2b` $\rightarrow$ Row 8: `Sales (B2B)` (₹20,018,168.24)
    - `b2cs` $\rightarrow$ Row 9: `Sales (B2C)` (₹491,948.31)
    - `cdnr`/`cdnur` $\rightarrow$ Row 19: `(-) Credit Note`
    - Summation $\rightarrow$ Row 22: `Total Sale as per Working` (₹20,510,116.55, Tax: ₹3,678,622.58)
  - **GSTR-2B $\rightarrow$ GSTR-3B Table 4:**
    - `b2b` (regular) $\rightarrow$ Row 33: `ITC as per GSTR 2B` (Taxable: ₹6,356,996.75, Tax: ₹961,184.83)
    - `b2b` (RCM) $\rightarrow$ Row 25: `RCM on Transport Charges` & Row 35: `(+) RCM paid on Inward Supplies` (Taxable: ₹76,310, Tax: ₹10,367.52)
    - `cdnr` $\rightarrow$ Row 38: `(-) Debit Notes` (Taxable: ₹13,800, Tax: ₹1,728)
    - Summation $\rightarrow$ Row 41: `(B) Total ITC Available for Set off` (₹6,398,609.17)
  - **Rule 88A & Net Balance Recalculation:** Automatic recomputation of Row 43 (Payable), Row 44 (IGST set-off), Row 48 (Final liability), and Row 56 (Balance Payable).

</decisions>

<canonical_refs>
## Canonical References

- `.planning/phases/06-compliance-modules-ui-overhaul/06-07-PLAN.md` — Plan for Returns Autopilot & Ingestion Deck Split.
- `src/components/ReturnsAutoIngestDeck.tsx` — Ingestion Deck UI component.
- `src/pages/ReturnsDashboard.tsx` — Returns Preparation & Filing cockpit container.
- `src/lib/gstrAutoIngest.ts` — Injection transformer mapping GSTR-1/GSTR-2B to GSTR-3B working sheet.
- `src/lib/gstr3bEngine.ts` — GSTR-3B calculation, Rule 88A set-off, and cash ledger engine.
- `D:\My software\full and final\6. September-2026\DYP Infraprojects Private Limited GSTR-3B Working September-26.xlsx` — Gold standard reference workbook.
</canonical_refs>

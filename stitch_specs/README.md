# Vaswani Return Enterprise — Modular Stitch UI Specification Directory (Light Corporate Edition)

> **Theme:** **Luminous Fluid Corporate (Light Mode)** — Apple & Stripe caliber design system with pristine white frosted surfaces, crisp slate typography, and responsive micro-animations.  
> **Global Settings Architecture:** **Docked Bottom-Left Settings Tab** managing Data Path (Server LAN & SQLite), Tally Connection (Port 9000), and Client Credentials.  
> **Typography:** `Inter` for interface elements, `JetBrains Mono` for all currency, invoice numbers, and GSTINs (`tabular-nums`).  
> **Functional Invariance:** Strictly 100% preservation of all underlying calculations, set-off algorithms, autopilot routines, and data structures.

---

## Master Directory Map

```
stitch_specs/
│
├── 01-practice-management/
│   ├── 01-practice-dashboard.md          # 300+ Clients Roster, Due Dates, SQLite Backup
│   ├── 02-gstin-smart-scanner.md         # Modulo-36 Checksum, State Code, Duplicate PANs
│   ├── 03-gstr2b-3b-tracker.md           # 12-Month Panoramic Filing Status Grid
│   ├── 04-financial-statements.md        # Schedule III Balance Sheet, P&L, Cash Flow
│   ├── 05-cma-project-report.md          # Term Loan Feasibility, CapEx, Amortization
│   └── 06-voucher-reclassifier.md        # Bulk Voucher Ledger Remapping
│
├── 02-reconciliation-engine/
│   ├── 01-gst-reconciliation-matcher.md  # 8-Pass 2B vs Books Matching, Tolerance, Fuzzy
│   ├── 02-vendor-party-wise-dispute-hub.md# Vendor Aggregation, 4-Pass Debit Notes, Dispute Notices
│   ├── 03-tds-reconciliation-traces-26q.md# Books vs TRACES 26Q, 194C/J/I/H/Q, Multi-Ledger PAN
│   └── 04-zero-merge-excel-export-deck.md # Strict Zero-Merge Architecture (12-Tab Corporate Workbook)
│
├── 03-tally-connectors/
│   ├── 01-tally-xml-converter.md         # Drag-and-drop Daybook/TB XML Parser
│   └── 02-tally-direct-port9000-bridge.md# Real-Time HTTP:9000 Live XML Extractor
│
├── 04-returns-preparation-filing/
│   ├── 01-gstr3b-working-sheet.md        # Table 3.1, Table 4 Net ITC, Rule 88A Set-off Cascade
│   ├── 02-12month-fy-matrix.md           # 13-Column Annual Comparative Matrix (3B vs 2B vs G1 vs Books)
│   ├── 03-gst-ims-manager.md             # 300+ Clients Inward Action Hub (ACCEPT, REJECT, PENDING)
│   ├── 04-gstr2b-autopilot-downloader.md # 1-Login 12-Month Autonomous Loop, 8-Sheet Consolidated Excel
│   └── 05-gstr1-autopilot-downloader.md  # 12-Month Outward Sales Matrix Downloader
│
├── 05-statutory-tax-audit/
│   ├── 01-sa530-audit-sampling-hub.md    # Materiality Threshold, Monetary Unit Sampling, Outliers
│   ├── 02-tax-audit-clause44.md          # Form 3CD Clause 44 Registered vs Unregistered Spend
│   ├── 03-dual-depreciation-engine.md    # Schedule II vs Sec 32, 180-Day Rule, AS-22 DTA/DTL
│   └── 04-cash-compliance-forensics.md   # Sec 269ST, Sec 40A(3), Benford's Law Fraud Scanner
│
├── 06-income-tax-suite/
│   └── 01-income-tax-regime-optimizer.md # Old vs New (115BAC), Surcharge, Marginal Relief
│
├── 07-bank-cma-appraisal/
│   └── 01-cma-bank-credit-engine.md      # Tandon Committee Method I & II MPBF, 10 Financial Ratios
│
└── README.md                             # Master Index (This File)
```

---

## Global System Settings (Bottom-Left Settings Tab)
Every module connects to the global **Bottom-Left Settings Tab** for:
1. **Data Path Management:** Server Shared Storage LAN Path and Local SQLite Database location.
2. **Tally Connection Bridge:** Localhost Port 9000 live connectivity, Ping test, and active company detection.
3. **Firm & GST Credentials Vault:** Multi-client portal login tokens and automation mode.
4. **UI & Animation Controls:** Fluid 60fps spring transitions and compact spreadsheet density toggle.

---

## How to Prompt Stitch for Individual Modules
1. Open the target module spec (e.g. [`01-gstr3b-working-sheet.md`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/stitch_specs/04-returns-preparation-filing/01-gstr3b-working-sheet.md)).
2. Copy the **Stitch UI Prompt Snippet** at the bottom of the file.
3. Paste it directly into Stitch Canvas ([https://stitch.google.com/projects/8651010648981320354](https://stitch.google.com/projects/8651010648981320354)) to generate that screen with the animated light corporate theme.

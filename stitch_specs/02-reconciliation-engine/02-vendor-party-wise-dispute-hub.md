# Module 2.2: Vendor Party-Wise Consolidated Report & Dispute Center

> **Suite Accent Color:** Emerald / Amber (`#10b981` / `#f59e0b`)  
> **Primary Component:** [`src/components/PartyWiseReport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/components/PartyWiseReport.tsx)  
> **Core Engine:** [`src/lib/partyWise.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/partyWise.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Individual invoices ko vendor GSTIN / PAN ke hisaab se aggregate karta hai, vendor-level net tax discrepancy nikalta hai, 4-pass debit note pairing execute karta hai, aur vendor payment hold / dispute communication manage karta hai.
- **Kyu karta hai:** Tax consultants aur CFOs invoices ko ek-ek karke nahi dekhte; vendor-wise dekhte hain. Agar kisi vendor ke ₹1.5 Lakh ka ITC 2B me missing hai, toh client us vendor ki payment hold karta hai aur GSTR-1 amendment maangta hai.
- **Kaise karta hai:**
  - Multi-ledger vendor consolidation into a single master party.
  - 4-Pass Debit Note Reconciler (Note No clean match $\rightarrow$ Tax match within ₹2 + Date proximity $\rightarrow$ Unpaired Books DN $\rightarrow$ Unpaired Portal CDNR).
  - One-click WhatsApp & Email dispute notice dispatch with automated payment hold amounts.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Top Party Summary KPI Deck
1. **Total Unique Vendors:** e.g. `248 Vendors Reconciled`
2. **All Matched Parties:** e.g. `182 Clean Vendors (No Hold Needed)` (Emerald)
3. **Parties with Missing ITC:** e.g. `44 Vendors (ITC at Risk)` (Red)
4. **Parties with Debit Notes:** e.g. `22 Vendors with Notes` (Amber)

### 2.2 Vendor Card / Accordion Layout
Each vendor is presented as a high-density, expandable card:
- **Collapsed Header Row:**
  - Left: Vendor Legal Name, Trade Name, GSTIN, PAN, State.
  - Middle Badges: Overall Status (`All Matched`, `Has Missing ITC`, `Has Mismatches`, `Has Debit Notes`), Invoice Count (e.g. `18 Invoices, 2 Debit Notes`).
  - Right: Net Differences: `Net Taxable Diff: ₹0.00`, `Net Tax Diff: -₹42,300.00` (Red alert).
  - Quick Actions: `1-Click Auto Match`, `Send WhatsApp Notice`, `Send Email`, `Merge Party`.
- **Expanded Invoice & Debit Note Table:**
  - Sub-grid listing all individual invoices and paired debit notes under this party.
  - Status pills on each row (`Perfect Match`, `Value Mismatch`, `Debit Note Books`, `Debit Note Portal`).
  - Inline Action: `Manual Match Pair`, `Force Match`.

### 2.3 Vendor Dispute Notice Modal
- Triggered by "Send Notice" button.
- Displays pre-filled notice message with:
  - Firm name & client legal name.
  - Table of missing / mismatched invoices (Invoice No, Date, Taxable, Tax Amount).
  - Call to action: "Please file GSTR-1 amendment in current tax period to release pending payment of ₹XX,XXX."
  - 1-Click "Open WhatsApp Web" or "Send Email Client" buttons.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise Vendor-Wise GST Dispute & Payment Hold Center.
- Top: 4 Summary metric cards (Total Vendors, Clean Vendors, At-Risk Vendors, Debit Note Vendors).
- Main View: Expandable vendor accordion cards showing Vendor GSTIN, PAN, Invoice Count, and Net Tax Discrepancy.
- Inside Card: High-density side-by-side invoice matching table and paired debit notes with inline action buttons.
- Action Modal: Clean WhatsApp/Email Dispute Notice Generator with pre-populated missing invoice tables and payment hold amounts.
```

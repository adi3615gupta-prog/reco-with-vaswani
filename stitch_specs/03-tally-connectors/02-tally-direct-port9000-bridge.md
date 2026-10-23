# Module 3.2: TallyPrime Direct HTTP Port 9000 Live XML Connector

> **Suite Accent Color:** Pink 500 (`#ec4899`)  
> **Routes:** `/tally-direct`, `/ledger-import`  
> **Source Components:** [`src/pages/TallyDirectImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyDirectImport.tsx), [`src/pages/TallyLedgerImport.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyLedgerImport.tsx)  
> **API Library:** [`src/lib/tallyApi.ts`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/lib/tallyApi.ts)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Local PC par chal rahe TallyPrime application ke XML Server port (`http://localhost:9000`) se directly communicate karke bina kisi manual file export ke live vouchers, ledgers, closing balances aur daybook transactions fetch karta hai.
- **Kyu karta hai:** Manual Excel export/import ka samay bachata hai aur human manipulation ka risk 0% kar deta hai.
- **Kaise karta hai:** Standard TDL XML requests build karta hai (`NOT $IsCancelled AND NOT $IsOptional`), HTTP POST ke zariye TallyPrime ko dispatch karta hai, aur real-time data ingest karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Live Tally Connection Deck
- **Connection Status Widget:**
  - Status Indicator: Pulsing Green Dot ("TALLYPRIME ONLINE") or Red Dot ("OFFLINE — Launch Tally & enable port 9000").
  - Target URL: `http://localhost:9000` (Configurable port input).
  - Button: `Ping Tally Server`.
- **Active Company Selector:**
  - Auto-detected dropdown showing companies currently loaded in TallyPrime:
    - Selected: `Siddha Edibles Pvt Ltd (FY 2024-25)`
    - GUID: `c839f21-8841-4ba2-8812...`

### 2.2 1-Click Extraction Action Grid (4 Interactive Cards)
1. **Extract Purchase Vouchers (PR):**
   - Filters: Date range picker (`01-Apr-2024` to `31-Mar-2025`).
   - Action: "Fetch Inward Supplies" $\rightarrow$ sends directly to Reco Engine.
2. **Extract Sales Vouchers (GSTR-1 Outward):**
   - Action: "Fetch Outward Supplies" $\rightarrow$ sends to GSTR-3B Table 3.1.
3. **Extract Ledger Master & Balances:**
   - Classifies ledgers into `Sundry Creditors`, `Sundry Debtors`, `Expenses`, `Duties & Taxes`.
4. **Extract TDS Transactions & Form 26Q Vouchers:**
   - Automatically filters all vouchers with TDS debit/credit entries.

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise TallyPrime Direct Live Sync Cockpit.
- Header: Real-time Tally Port 9000 connection badge (pulsing green indicator) and active open company selector.
- Controls: Date range picker and Tally Server configuration drawer (Host, Port, Timeout).
- Action Cards: 4 Extraction cards (Purchase Register, Sales Register, Master Ledgers, TDS Vouchers) with live loading progress indicators and record count counters.
```

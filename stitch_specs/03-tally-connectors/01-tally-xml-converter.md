# Module 3.1: Tally XML Converter & Parser

> **Suite Accent Color:** Pink 500 (`#ec4899`)  
> **Route:** `/tally`  
> **Source Component:** [`src/pages/TallyConverter.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/TallyConverter.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** TallyPrime se export kiye huye complex, nested XML files (Daybook XML, Trial Balance XML, Ledger Vouchers XML) ko instantly parse karke audit-ready Excel sheets aur JSON objects me convert karta hai.
- **Kyu karta hai:** Tally ka raw XML format standard tools me read karna mushkil hota hai aur Excel me garbled dikhta hai.
- **Kaise karta hai:** Fast recursive DOM / regex parser jo Tally envelope tags (`<TALLYMESSAGE>`, `<VOUCHER>`, `<ALLLEDGERENTRIES.LIST>`) ko flatten karke tabular structure banata hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Drag & Drop Ingestion Zone
- Large central dropzone:
  - Icon: `FileCode2` (Pink glow)
  - Text: "Drag & drop Tally Daybook or Trial Balance XML file here, or browse files"
  - Supported Formats: `.xml`, `.txt` (Tally XML output)
  - Max Size: Up to 500 MB (Client-side streaming parse).

### 2.2 Conversion Output Deck
- **Detected Metadata Card:**
  - Company Name extracted from XML: e.g. `VASWANI TRADING CO.`
  - Date Range: `01-Apr-2024 to 31-Mar-2025`
  - Total Vouchers Count: `12,450 Vouchers Parsed in 1.4s`
- **Output Action Buttons:**
  - `Download Clean Excel (XLSX)`
  - `Export Normalized JSON`
  - `Directly Send to GST Reconciliation Engine`
  - `Directly Send to TDS Reconciler`

---

## 3. Stitch UI Prompt Snippet
```markdown
Design a Tally XML to Clean Excel Converter interface.
- Central Area: High-tech drag-and-drop dropzone with pink neon accents and parsing progress bar.
- Metadata Card: Extracted company name, financial period, voucher breakdown (Purchase, Sales, Payment, Journal).
- Action Bar: Direct download buttons for XLSX and JSON, plus 1-Click "Send to Reco Engine" button.
```

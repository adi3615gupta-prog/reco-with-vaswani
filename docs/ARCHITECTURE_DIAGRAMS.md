# Architecture & Data Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER'S COMPUTER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    TALLY APPLICATION                           │ │
│  │  Gateway → Display → Statutory Reports → Register → Export   │ │
│  │                                                               │ │
│  │  Output: *.xml (UTF-16 LE or UTF-8 encoded)                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│                        tally_export.xml                             │
│                      (UTF-16 LE encoded)                            │
│                               ↓                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │               BROWSER (React Application)                     │ │
│  │                                                               │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │  TallyConverter Component                            │   │ │
│  │  │  (src/pages/TallyConverter.tsx)                      │   │ │
│  │  │                                                      │   │ │
│  │  │  1. User selects XML file                           │   │ │
│  │  │  2. Reads as ArrayBuffer                            │   │ │
│  │  │  3. Calls decodeFileBuffer()                        │   │ │
│  │  │  4. Calls parseTallyXML()                           │   │ │
│  │  │  5. Calls exportToExcel()                           │   │ │
│  │  │  6. Downloads .xlsx file                           │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  │                                                               │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │  tallyXmlParser.ts (Utility Functions)              │   │ │
│  │  │                                                      │   │ │
│  │  │  decodeFileBuffer()                                 │   │ │
│  │  │  ├─ Detect BOM (FF FE / FE FF / EF BB BF)          │   │ │
│  │  │  ├─ Choose TextDecoder (UTF-16-LE/BE or UTF-8)     │   │ │
│  │  │  └─ Return decoded text                            │   │ │
│  │  │                                                      │   │ │
│  │  │  parseTallyXML()                                    │   │ │
│  │  │  ├─ Parse XML with DOMParser                        │   │ │
│  │  │  ├─ Find all DBCFIXED elements                      │   │ │
│  │  │  ├─ Extract fields from siblings                    │   │ │
│  │  │  ├─ Collect DBCLEDAMT values                        │   │ │
│  │  │  └─ Return structured data                          │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  │                                                               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│                  Formatted_Journal_Register.xlsx                    │
│                      (Excel file in memory)                         │
│                               ↓                                      │
│                    DOWNLOAD TO YOUR COMPUTER                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Data Flow

### **Step 1: Encoding Detection**

```
Binary File
(ArrayBuffer)
    ↓
    ├─ First 2 bytes: FF FE? → UTF-16 LE
    ├─ First 2 bytes: FE FF? → UTF-16 BE  
    ├─ First 3 bytes: EF BB BF? → UTF-8 with BOM
    └─ Default → UTF-8 (try) → UTF-16 LE (fallback)
    ↓
Text String
(UTF-16 decoded)
```

### **Step 2: XML Parsing**

```
XML Text
    ↓
DOMParser
    ↓
Parse & check for errors
    ↓
Traverse elements
    ├─ Find DBCFIXED tags (row markers)
    ├─ For each DBCFIXED:
    │   ├─ Get date from inside DBCFIXED
    │   ├─ Get party from inside DBCFIXED
    │   ├─ Get all siblings until next DBCFIXED
    │   │   ├─ DBCVCHTYPE → Voucher Type
    │   │   ├─ DBCVCHNO → Voucher No.
    │   │   ├─ DBCVCHREF → Reference
    │   │   ├─ DBCGSTIN → GSTIN
    │   │   ├─ DBCGROSSAMT → Amount
    │   │   └─ DBCLEDAMT × N → Ledger Columns
    │   └─ Create row object
    └─ Collect all rows
    ↓
Structured Data
{
  companyInfo: {...},
  headers: [...],
  rows: [[...], [...], ...]
}
```

### **Step 3: Excel Generation**

```
Structured Data
    ↓
Create Array of Arrays
    ├─ Rows 1-6: Company headers (merged cells)
    ├─ Row 7: Column headers (formatted)
    ├─ Rows 8+: Data rows
    └─ Last row: Grand totals
    ↓
Apply Styling
    ├─ Company name: Bold, size 12, centered
    ├─ Headers: Bold, gray background, borders
    ├─ Data: Arial 10, borders
    └─ Totals: Bold, borders, number format
    ↓
Auto-fit Columns
    ├─ Calculate width per column
    ├─ Cap at 60 characters
    └─ Apply column widths
    ↓
Freeze Rows
    ├─ Freeze at row 7 (headers)
    └─ Allow scroll through data
    ↓
Create Workbook
    ├─ Create sheet
    ├─ Add data with styles
    ├─ Add formulas for totals
    └─ Write to file
    ↓
Download Excel
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              TallyConverter React Component                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  State: isProcessing, parsedData                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ UI Layer                                            │  │
│  │                                                     │  │
│  │ ┌─────────────────┐  ┌──────────────────────────┐  │  │
│  │ │ File Upload Box │→ │ handleFileUpload()      │  │  │
│  │ └─────────────────┘  │                          │  │  │
│  │                      │ 1. Get file             │  │  │
│  │                      │ 2. Read ArrayBuffer     │  │  │
│  │                      │ 3. Call parser funcs    │  │  │
│  │                      └──→ parsedData (state)   │  │  │
│  │                                                 │  │  │
│  │                                                 │  │  │
│  │ ┌──────────────────────┐   ┌──────────────┐   │  │  │
│  │ │ "Download Excel" Btn │→ │ exportToExcel│   │  │  │
│  │ │ (appears after parse)│   │ (formatting) │   │  │  │
│  │ └──────────────────────┘   └──────────────┘   │  │  │
│  │                                ↓              │  │  │
│  │                           Download file      │  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Parser Layer (src/lib/tallyXmlParser.ts)        │  │
│  │                                                 │  │
│  │ decodeFileBuffer(buffer: ArrayBuffer)          │  │
│  │   → string (UTF-16 or UTF-8 decoded)           │  │
│  │                                                 │  │
│  │ parseTallyXML(xmlText: string)                 │  │
│  │   → TallyParseResult {                         │  │
│  │       companyInfo,                             │  │
│  │       headers[],                               │  │
│  │       rows[][]                                 │  │
│  │     }                                          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Excel Export (in component)                     │  │
│  │                                                 │  │
│  │ exportToExcel()                                │  │
│  │   1. Format headers (merged cells, colors)     │  │
│  │   2. Apply styles to all rows                  │  │
│  │   3. Calculate grand totals                    │  │
│  │   4. Format numbers (#,##0.00)                 │  │
│  │   5. Auto-fit columns                          │  │
│  │   6. Use XLSX + XLSXStyle libraries            │  │
│  │   7. Download via browser                      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
└─────────────────────────────────────────────────────────┘
         ↓
      External Libraries
         ↓
    ┌─────────────┬──────────────┐
    │   XLSX      │  XLSXStyle   │
    │ (Excel I/O) │ (Styling)    │
    └─────────────┴──────────────┘
```

---

## XML to Excel Mapping

```
INPUT XML
═════════════════════════════════════════════════════════════════════

<ENVELOPE>
  <DBCFIXED>
    <DBCDATE>25-Apr-25</DBCDATE>
    <DBCPARTY>Company A</DBCPARTY>
  </DBCFIXED>
  <DBCVCHTYPE>Debit Note</DBCVCHTYPE>
  <DBCVCHNO>1</DBCVCHNO>
  <DBCVCHREF>REF-001</DBCVCHREF>
  <DBCVCHREFDATE>25-Apr-25</DBCVCHREFDATE>
  <DBCGSTIN>27ABC</DBCGSTIN>
  <DBCAMOUNT>100</DBCAMOUNT>
  <DBCADDLCOST>50</DBCADDLCOST>
  <DBCGROSSAMT>-150</DBCGROSSAMT>
  <DBCLEDAMT>100</DBCLEDAMT>
  <DBCLEDAMT>45</DBCLEDAMT>
  <DBCLEDAMT>5</DBCLEDAMT>
</ENVELOPE>

        ↓ (Parsing)

STRUCTURED DATA
═════════════════════════════════════════════════════════════════════

{
  companyInfo: {
    name: "DYP INFRAPROJECTS PVT.LTD.",
    addr1: "Address line 1",
    addr2: "Address line 2",
    addr3: "Address line 3",
    dateRange: "25-Apr-25 to 26-Apr-25"
  },
  headers: [
    "Date",
    "Particulars",
    "Voucher Type",
    "Voucher No.",
    "Voucher Ref. No.",
    "Voucher Ref. Date",
    "GSTIN/UIN",
    "Value",
    "Addi. Cost",
    "Gross Total",
    "Column 1",
    "Column 2",
    "Column 3"
  ],
  rows: [
    [
      "25-Apr-25",
      "Company A",
      "Debit Note",
      "1",
      "REF-001",
      "25-Apr-25",
      "27ABC",
      "100",
      "50",
      "-150",
      "100",
      "45",
      "5"
    ]
  ]
}

        ↓ (Excel Export)

OUTPUT EXCEL
═════════════════════════════════════════════════════════════════════

Row 1: │ DYP INFRAPROJECTS PVT.LTD.                              │
       │ (merged across all columns, bold, size 12)             │

Row 2: │ Address line 1                                          │
Row 3: │ Address line 2                                          │
Row 4: │ Address line 3                                          │

Row 5: │ Debit Note Register                                     │
       │ (merged, bold, size 10)                                │

Row 6: │ 25-Apr-25 to 26-Apr-25                                 │
       │ (merged)                                               │

Row 7: │ Date   │ Particulars │ Vch Type │ Vch No. │ Vch Ref   │
       │ (gray bg, bold, borders, centered)                     │
       │ Vch Ref. Date │ GSTIN/UIN │ Value │ Addi. Cost        │
       │ Gross Total │ Column 1 │ Column 2 │ Column 3          │

Row 8: │ 25-Apr │ Company A   │ Debit    │ 1       │ REF-001   │
       │ (normal style, borders)                                │
       │ 25-Apr │ 27ABC       │ 100.00   │ 50.00               │
       │ -150.00 │ 100.00     │ 45.00    │ 5.00                │

Row 9: │ (Grand Total row with calculations)                    │
       │ (bold, borders, number format)                         │

```

---

## File Encoding Detection Flow

```
Tally XML Export
       ↓
  Read as Binary
  (ArrayBuffer)
       ↓
Check First Bytes
       ├─ FF FE (first 2 bytes)?
       │  ├─ YES → UTF-16 LE
       │  │  └─ Use TextDecoder('utf-16-le')
       │  │     ✓ Most Tally 9+ exports use this
       │  │
       │  └─ NO → Check next condition
       │
       ├─ FE FF (first 2 bytes)?
       │  ├─ YES → UTF-16 BE
       │  │  └─ Use TextDecoder('utf-16-be')
       │  │
       │  └─ NO → Check next condition
       │
       ├─ EF BB BF (first 3 bytes)?
       │  ├─ YES → UTF-8 with BOM
       │  │  └─ Use TextDecoder('utf-8')
       │  │
       │  └─ NO → Assume UTF-8 (no BOM)
       │
       └─ Try UTF-8 → If fails, try UTF-16 LE
          ✓ Fallback strategy for edge cases
       ↓
  Text String
  (properly decoded)
```

---

## Performance Chart

```
Number of Rows vs Processing Time
═══════════════════════════════════════════════════════════════════

1,000     ██ 1-2 seconds
          
10,000    ████████████ 10-15 seconds
          
100,000   ████████████████████████████ 100-150 seconds

1,000,000 ✗ Excel limit (use multiple sheets)


Memory Usage vs Dataset Size
═══════════════════════════════════════════════════════════════════

1,000 rows     ███ 2-3 MB
               
10,000 rows    ██████████████ 20-30 MB
               
100,000 rows   ██████████████████████ 200-300 MB


Recommendation:
- Under 10K rows: Process immediately (< 15 sec)
- 10K-100K rows: Show spinner, allow ~2 minutes
- Over 1M rows: Split into multiple files/sheets
```

---

## Error Handling Flow

```
File Upload
     ↓
File Valid? (XML extension)
  ├─ NO → Show error: "Invalid File Format"
  └─ YES ↓
     ↓
Read as ArrayBuffer
     ├─ FAIL → Show error: "Cannot read file"
     └─ SUCCESS ↓
        ↓
Detect Encoding
  (Always succeeds - has fallbacks)
     ↓
Parse XML with DOMParser
  ├─ Parser error found?
  │  ├─ YES → Show error: "Invalid XML format"
  │  └─ NO ↓
  │     ↓
  │  Find DBCFIXED or VOUCHER tags
  │  ├─ NONE found?
  │  │  ├─ YES → Show error: "No valid data rows found"
  │  │  └─ NO ↓
  │  │     ↓
  │  │  Extract data successfully
  │  │     ↓
  │  │  Show: "Successfully parsed X rows"
  │  │     ↓
  │  │  Generate Excel
  │  │     ├─ SUCCESS → Download file ✓
  │  │     └─ FAIL → Show error: "Export Failed"
```

---

## Browser API Usage

```
┌───────────────────────────────────────────────────────┐
│         Browser APIs Used by This Converter            │
├───────────────────────────────────────────────────────┤
│                                                       │
│ File API                                            │
│ ├─ File.arrayBuffer()      ← Read file as binary   │
│ └─ Used in: handleFileUpload()                      │
│                                                       │
│ TextDecoder API                                     │
│ ├─ new TextDecoder('utf-16-le')                    │
│ ├─ new TextDecoder('utf-16-be')                    │
│ ├─ new TextDecoder('utf-8')                        │
│ └─ Used in: decodeFileBuffer()                      │
│                                                       │
│ DOM APIs                                            │
│ ├─ DOMParser.parseFromString()   ← Parse XML      │
│ ├─ Element.querySelector()        ← Find elements  │
│ ├─ Element.textContent            ← Get text       │
│ └─ Used in: parseTallyXML()                         │
│                                                       │
│ Excel Generation (npm packages)                    │
│ ├─ XLSX (xlsx library)                            │
│ ├─ XLSXStyle (xlsx-js-style)                       │
│ └─ Used in: exportToExcel()                         │
│                                                       │
│ Browser Download                                   │
│ ├─ Creates blob                                    │
│ ├─ Triggers download                              │
│ └─ Used in: XLSXStyle.writeFile()                 │
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## Technology Stack

```
Frontend Framework
└─ React 18+ (TypeScript)
   ├─ src/pages/TallyConverter.tsx
   └─ State management: useState hooks

XML Parsing
└─ Browser's native DOMParser
   └─ No external XML library needed

Encoding Detection
└─ Browser's native TextDecoder API
   └─ Supports: UTF-8, UTF-16 LE/BE

Excel Generation
├─ XLSX (xlsx library)
│  └─ Core Excel file I/O
└─ XLSXStyle (xlsx-js-style)
   └─ Cell styling, formatting, colors

UI Components
├─ Lucide React icons
├─ Sonner toast notifications
└─ Tailwind CSS styling

Build Tools
├─ Vite (fast bundling)
├─ TypeScript (type safety)
└─ Vitest (testing framework)
```

---

## Summary

**The converter uses a 3-layer architecture:**

1. **UI Layer** (TallyConverter.tsx)
   - File upload
   - Progress indication
   - Excel download button

2. **Parser Layer** (tallyXmlParser.ts)
   - Encoding detection
   - XML parsing
   - Data extraction

3. **Export Layer** (in component)
   - Excel formatting
   - Styling & colors
   - Grand total calculation
   - Download trigger

**Data flows:**
File → Buffer → Text → DOM → JSON → Excel → Download

**All processing happens locally in the browser - no server needed!** 🚀

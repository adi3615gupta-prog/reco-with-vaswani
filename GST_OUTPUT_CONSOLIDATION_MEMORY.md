# GST Output Liability & Multi-Entity Consolidation Memory File
This file serves as a persistent memory module for the GST Output reconciliation engine (GSTR-1 vs GSTR-3B vs Sales Register) and the Multi-Company GST consolidator pipeline.

---

## 1. GST Output Reconciliation Engine

- **Path:** `src/lib/outputReconciliationService.ts`
- **Primary Pages:** `src/pages/Reconciliation.tsx`, `src/components/OutputDashboard.tsx`

### Data Structures & Types
```typescript
export interface TaxBreakdown {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  nilRated: number;
  nonTaxable: number; // Added for Exempted/Non-GST supplies
}

export interface MonthlySummary {
  month: string;
  booksSales: TaxBreakdown;
  booksCn: TaxBreakdown;
  booksNet: TaxBreakdown;
  portalB2b: TaxBreakdown;
  portalExport?: TaxBreakdown; // Added for EXP portal matching
  portalB2c: TaxBreakdown;
  portalNil: TaxBreakdown;
  portalCn: TaxBreakdown;
  portalNet: TaxBreakdown;
  variance: TaxBreakdown;
}

export interface PartySummary {
  month: string;
  booksPartyName: string;
  portalPartyName: string;
  booksGstNo: string;
  portalGstNo: string;
  booksNet: TaxBreakdown;
  portalNet: TaxBreakdown;
  variance: TaxBreakdown;
}

export interface OutputReconciliationResponse {
  monthlySummaries: MonthlySummary[];
  partySummaries: PartySummary[];
  b2bResults: MatchedRecord[];
  expResults: MatchedRecord[]; // Added for Export matches details
  b2cResults: BlockRecord[];
  nilResults: NilRecord[];
  buffer: any; // Raw generated Excel workbook buffer
}
```

### Matching Pipeline & Data Flow
1. **Sanitize Data**: Headers alias parser maps standard names (`Non-GST`, `Exempted`, `Non Taxable`, etc.) to extract non-taxable figures.
2. **Segregation**:
   - Outward export invoices are automatically isolated in Books (`expBooks`) by checking if GSTIN, Voucher Type, or Party description contains the keyword `'export'`.
   - Non-taxable ledger lines are isolated into `nilBooks`.
3. **Reconciliation**:
   - **Line-level Matching**: Matches `expBooks` vs `portalExport` (EXP records uploaded via UI portal queue) u/s GSTIN + Invoice Number + Date range tolerance, compiling `expResults`.
   - **Block-level Matching**: Matches B2C and Nil-Rated/Non-Taxable supplies by aggregating books vs portal rates and Places of Supply (POS).

### Excel Spreadsheet Compiler Coordinate Grid
The Excel compiler in the service builds a 37-column master matrix (`wsMaster`) and styled worksheets:
- **Block Layout (6 columns each)**:
  - Column 1: Taxable Value
  - Column 2: CGST
  - Column 3: SGST
  - Column 4: IGST
  - Column 5: Nil Rated
  - Column 6: Non Taxable
- **Master Sheet Grid Sections**:
  - Section 1: Net Books Data (Columns B to G)
  - Section 2: Less: Credit Notes (Columns H to M)
  - Section 3: Net Portal Data (Portal B2B, Portal Export, Portal B2C, Portal Nil Rated, Less Portal CN - Columns N to AK)
  - Section 4: Final Variances Books vs Portal (Columns AL to AQ)
- **Detailed Tabs**:
  - `Export_Details` tab: Lists matched, books-only, and portal-only exports.
  - `Nil_Rated_Details` tab: Reports Nil Rated and Non-Taxable supplies side-by-side.
- Columns offsets are computed dynamically using helper `C(colIndex)` to map numerical indices to Excel coordinates (e.g. 0 -> A, 1 -> B, etc.).

### UI Mappings & Configurations
- **Column Aliases (`src/lib/fileParser.ts`)**: Mapped aliases `nonTaxable?: string` and standard headers.
- **UI Fields Mapper (`src/components/ColumnMapper.tsx`)**: Registered `nonTaxable` with label `'Non Taxable / Exempt (optional)'`.
- **Upload Queue Selection (`src/pages/Reconciliation.tsx`)**: Option `<option value="exp">Export (EXP)</option>` added to portal upload dropdown.
- **Standalone Mapper (`src/pages/Index.tsx`)**: Extracts `nonTaxable` rows, aggregates `exp` documents into `portalExport` state, and routes them.
- **Server API Endpoint (`src/pages/server.ts`)**: Destructures and forwards `portalExport` through HTTP router requests.

---

## 2. Multi-Entity Consolidation Pipeline

- **Path:** `src/lib/gstPipeline.ts`, `src/lib/gst-processor.ts`
- **Dashboard / UI Pages:** `src/pages/Consolidation.tsx`

### Stepper Flow:
1. **Step 1: Profiles Setup**: Details company names, GSTINs, and default states.
2. **Step 2: Upload Zone**: Multi-file dropzones for sister concern sheets.
3. **Step 3: Column Mapping**: Maps heterogeneous system headers (Tally/SAP/Marg) into target consolidated GSTIN fields.
4. **Step 4: Merged Output**: Compiles aggregated reports, matches inter-company trades, and generates final consolidated tax spreadsheets.

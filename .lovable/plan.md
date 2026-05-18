# Add Output Reconciliation (Sales vs GSTR-1)

## Mode selector (new landing screen)
On app load, show two large choice cards before any uploads:
- **Input Reconciliation** — Purchase Register + Journals vs GSTR-2B (existing flow, unchanged)
- **Output Reconciliation** — Sales Register vs GSTR-1 (new flow)

User can switch modes via a toggle in the header after selecting.

## Output Reconciliation flow
Mirrors the input flow with these differences:

### Uploads
- **Sales Register** (primary, like PR) — required
- **Additional Sales Books** (like Journals) — optional, multiple, "+ Add Sales Book" button
- **GSTR-1** (like 2B) — required

### Column mapping
Same fields as input mapping, with **Taxable Value made required** (not optional) for both Sales and GSTR-1 sides. Labels updated:
- "GSTR-1 Status" → not relevant; replaced with "Filing Period" (optional)
- Customer/Recipient name instead of Supplier name (label-only change)

### Reconciliation logic
- Same hierarchical engine: GSTIN → invoice number → values
- **Taxable value diff** added as a first-class compared field alongside IGST/CGST/SGST (±₹1 tolerance)
- Status semantics flipped:
  - "Missing in GSTR-1" (was Missing in 2B) → action: "File in next GSTR-1 / amend"
  - "Missing in Sales" (was Missing in PR) → action: "Verify with customer; possible unrecorded sale"
  - "Value Mismatch" remark: "Verify Taxable Value & tax with customer"

### Exports
Same 3 reports (Results, Monthly Comparison, Party-wise) but:
- Headers say "Sales" / "GSTR-1" instead of "PR" / "2B"
- New **Taxable Value PR / Taxable Value 2B / Taxable Diff** columns in Results and Party-wise sheets
- Monthly Comparison's 6-table layout reused with renamed labels

### UI labels
All "PR", "2B", "Supplier", "ITC" wording becomes mode-aware via a small `terminology` helper based on selected mode. ITC-specific compliance columns (Rule 37, ITC eligibility) hidden in Output mode; replaced with "Output Liability" framing.

## Technical implementation

### New files
- `src/lib/mode.ts` — `ReconciliationMode = 'input' | 'output'`, terminology map
- `src/components/ModeSelector.tsx` — two-card landing screen
- `src/components/ModeSwitcher.tsx` — header pill to switch modes (resets data)

### Edited files
- `src/pages/Index.tsx` — render ModeSelector when no mode chosen; pass mode through to children; mode-aware labels and export filenames
- `src/components/ColumnMapper.tsx` — accept `mode` prop, mark `taxableValue` required when mode === 'output', adjust labels
- `src/lib/fileParser.ts` — `ColumnMapping` already has `taxableValue`; update `isMappingComplete`/required list per mode; export functions accept mode and emit taxable columns
- `src/lib/reconciliation.ts` — extend value-comparison step to also diff `taxableValue` when present; add `taxableDiff` to `ReconciliationResult`; tolerance same ±₹1
- `src/lib/partyWise.ts` — aggregate taxable totals + diff per party
- `src/lib/compliance.ts` — short-circuit ITC/Rule37 fields in output mode (return blank)
- `src/components/ResultsTable.tsx`, `MonthlyBreakdown.tsx`, `PartyWiseReport.tsx`, `SummaryCards.tsx`, `ResultsCategoryTabs.tsx` — read `mode` from props/context for labels; show taxable columns in output mode
- `src/lib/userGuide.ts` — append Output Reconciliation section

### Data flow
Mode stored in `Index.tsx` local state (no persistence required this iteration). Switching mode clears uploaded files and results.

### Constraints preserved
- Existing Input Reconciliation logic, 6-table monthly layout, debit-note handling, and all existing exports remain byte-identical when mode === 'input'.
- New taxable-value comparison only activates when both sides have it mapped.

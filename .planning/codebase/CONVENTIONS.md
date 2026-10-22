---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# Coding Conventions

**Analysis Date:** 2026-10-22

## Naming Patterns

**Files:**
- React Components: PascalCase (e.g. `PartyWiseReport.tsx`, `Gstr1MasterDownloader.tsx`)
- TypeScript Libraries: camelCase (e.g. `reconciliation.ts`, `partyWise.ts`, `fileParser.ts`)
- TypeScript Interfaces / Types: camelCase or `*Types.ts` (e.g. `incomeTaxTypes.ts`, `capitalGainsTypes.ts`)
- Test Files: Co-located or in `src/test/` with `*.test.ts` (e.g. `src/test/reconciliationEngine.test.ts`)
- Server Modules: snake_case ending with `_routes.js` (e.g. `gstr1_routes.js`, `tds_routes.js`)

**Functions:**
- camelCase for functions and helper methods (e.g. `extractCoreInvoiceNumber`, `cleanInvoiceNumber`, `aggregateByParty`, `removeAllMergesFromWorkbook`)
- Event handlers prefixed with `handle` (e.g. `handleManualMatch`, `handleForceMatch`, `handleAutoMatchParty`)
- Predicates and validators prefixed with `is`, `has`, or `can` (e.g. `isDebitNote`, `hasMissing`, `canReadOutputFile`)

**Variables:**
- camelCase for standard variables and object properties (e.g. `invoiceDate`, `supplierGstin`, `taxableValue`)
- UPPER_SNAKE_CASE for module constants (e.g. `TABLE_W`, `GDRIVE_CONFIG_FILE`, `DEFAULT_TOLERANCE`)

**Types:**
- PascalCase for interfaces and type aliases (e.g. `InvoiceRecord`, `ReconciliationResult`, `PartySummary`, `PartyInvoiceRow`)

## Code Style

**Formatting:**
- Single quotes / double quotes handled consistently per domain
- 2-space indentation
- ESLint with TypeScript-ESLint flat config (`eslint.config.js`)
- React Hooks rules enforced (`eslint-plugin-react-hooks`)

**Linting:**
- Config: `eslint.config.js` with ECMAScript 2020 globals
- Key rules:
  - `react-hooks/rules-of-hooks`: error
  - `react-hooks/exhaustive-deps`: warn
  - `react-refresh/only-export-components`: warn
  - `@typescript-eslint/no-unused-vars`: off (allowing domain parameter flexibility)

## Import Organization

**Order:**
1. React and React-related packages (`react`, `react-router-dom`, `@tanstack/react-query`)
2. Third-party UI and icon libraries (`lucide-react`, `@radix-ui/*`, `framer-motion`)
3. Internal path-aliased modules via `@/` (`@/components/...`, `@/lib/...`, `@/hooks/...`)
4. Relative imports (`./submodule`, `../types`)
5. Style sheets and assets

**Path Aliases:**
- `@/*` -> `./src/*` configured in `vite.config.ts`, `tsconfig.json`, and `vitest.config.ts`

## Error Handling

**Patterns:**
- Try-catch wrapping around all file I/O, JSON parsing, and external API requests
- Safe default fallbacks (e.g. returning `[]` or `{}` rather than throwing uncaught errors to UI)
- Global React Error Boundary (`src/App.tsx`) with state reset button and stack trace diagnostics
- Server process unhandled rejection and IPC disconnect guards (`server.js`) to prevent crashes during browser automation

## Logging

**Framework:**
- Native `console.log`, `console.warn`, `console.error` with contextual tags (e.g. `[Reconciliation]`, `[Playwright IPC Guard]`, `[Returns Storage]`)
- `electron-log` for desktop packaging in `main.cjs`

**Patterns:**
- Errors logged with `.message` and context parameters
- Suppress transient/expected disconnects (e.g. Playwright target closed)

## Comments

**When to Comment:**
- Crucial statutory references and CGST Act rules (e.g. Section 16(2)(aa) matching rationale, Rule 36(4), Section 194C/J TDS slabs)
- Multi-pass algorithm steps (Pass 1 through Pass 8 in `reconciliation.ts`)
- Strict architectural directives (e.g. Zero-Merge Excel rule explanations in `fileParser.ts`)

**JSDoc/TSDoc:**
- Parameter and return descriptions on core engine exports

## Function Design

**Size:**
- Single responsibility functions where feasible; complex pipeline controllers (e.g. `reconcile`, `exportToXlsx`) broken into distinct indexed sub-passes

**Parameters:**
- Explicit typing with default values for tolerance and configuration flags:
  ```typescript
  export function reconcile(
    prRecords: InvoiceRecord[],
    twoBRecords: InvoiceRecord[],
    sourceType: 'input' | 'raw' = 'input',
    tolerance: number = 2.0
  ): ReconciliationResult[]
  ```

**Return Values:**
- Strictly typed return structures with complete discrepancy breakdown (`taxDiff`, `cgstDiff`, `sgstDiff`, `igstDiff`)

## Module Design

**Exports:**
- Named exports preferred for domain engines and helper functions (`export function extractCoreInvoiceNumber`, `export function reconcile`)
- Default exports used for top-level React pages and route module setup functions (`export default function setupGstr1Routes(app, db)`)

**Barrel Files:**
- Avoid sprawling barrel exports for heavy libraries; direct module imports preferred (`import { reconcile } from '@/lib/reconciliation'`)

---

*Convention analysis: 2026-10-22*

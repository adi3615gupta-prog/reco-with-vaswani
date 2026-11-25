# Tally Direct Integration & Sync Memory File
This file serves as a persistent memory module for Tally direct connection APIs, XML requests, proxies, and parsers.

## Module Location
- **API Connector Path:** `src/lib/tallyApi.ts`
- **Data Parsers:** `src/lib/tallyParser.ts`, `src/lib/tallyXmlParser.ts`
- **Integration Pages:** `src/pages/TallyDirectImport.tsx`, `src/pages/TallyConverter.tsx`

## Architecture & Communication Flow
1. **Request Dispatching (`sendTallyRequest`):**
   - Transmits raw XML payloads to a locally running TallyPrime instance (typically port 9000).
   - **Cross-Origin / CORS Handling:**
     - **In Electron:** Routes requests through main-process IPC (`electronAPI.fetchTallyData`) to bypass Chrome's webSecurity restrictions.
     - **In Web Browsers:** Proxies connections through Vite proxy (`/tally-api`) in development, or Express backend proxy (`/api/tally-proxy`) in production, transmitting the port in headers (`x-tally-port`).
   - Implements AbortController thresholds (default 15s) to detect freezing connections or stuck Tally modal dialogs.
2. **Metadata & Ledger Retrieval:**
   - **`pingTally(config)`:** Tests if local port is active.
   - **`fetchCompanyInfo(config)`:** Fetches active company metadata (name, books from/to date).
   - **`fetchTallyMetadata(...)`:** Queries and cache-flushes Tally's structural collections (accounts, groups, custom fields).
   - **`fetchVouchers(...)` & `fetchVouchersForForensics(...)`:** Requests full XML journals or ledger cash/bank transactions.
3. **XML Cleaning & Parsing:**
   - **Tally XML Bugs:** TallyPrime exports unescaped ampersands (`&`) in ledger names (e.g. `A & B Co`), which natively breaks DOMParser. The engine automatically replaces unescaped `&` characters with standard `&amp;` entities before parsing.
   - **`parseTallyVouchers(...)`:** Evaluates XML nodes, resolving multi-ledger debit/credit lines into standard JSON flat entry lists.

## Tally XML Protocols
- Custom `<ENVELOPE>` structures:
  - `<HEADER>` with `<VERSION>1</VERSION>` and `<TALLYREQUEST>Export</TALLYREQUEST>`.
  - `<BODY>` containing `<EXPORTDATA>` details, targeting System Collections (e.g. `Ledgers`, `Vouchers`).
  - Uses native Tally formula functions (e.g. `$$SysName:XML` formats).

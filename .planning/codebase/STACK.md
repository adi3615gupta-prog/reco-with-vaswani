---
last_mapped_commit: 2767eb1c5944b9af02382e532c64119f7847f32a
last_mapped_at: 2026-10-22
---
# Technology Stack

**Analysis Date:** 2026-10-22

## Languages

**Primary:**
- TypeScript 5.x (`src/**/*.ts`, `src/**/*.tsx`) - UI components, core reconciliation algorithms, business logic, type definitions
- JavaScript (ES Modules & CommonJS) (`server.js`, `gstr1/*.js`, `gstr2b/*.js`, `main.cjs`, `preload.js`) - Express backend API, Playwright automations, Electron lifecycle

**Secondary:**
- SQL (`sqlite3`) - Database queries across local SQLite databases (`returns.db`, `gstr1.db`, `gstr2b.db`)
- XML - TallyPrime HTTP XML exchange payloads (`src/lib/tallyApi.ts`, `src/lib/tallyCmaApi.ts`)

## Runtime

**Environment:**
- Node.js (v18+ recommended with ES module support)
- Electron 42.2.0 (`main.cjs`) - Desktop application wrapper
- Web Worker API (`src/workers/reconciliation.worker.ts`, `src/workers/fileParser.worker.ts`) - Background multi-pass reconciliation off UI thread

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- React 18.3.1 - UI presentation layer
- Express 5.2.1 - Backend REST API service on local port 3001
- Vite 5.x with `@vitejs/plugin-react-swc` - Frontend bundler & dev server (port 8080)
- Tailwind CSS 3.4.17 with `@tailwindcss/typography` & `tailwindcss-animate` - Styling framework
- Radix UI (`@radix-ui/*`) - Headless accessible UI primitives (dialogs, tooltips, dropdowns, popovers, tabs)

**Testing:**
- Vitest (`vitest.config.ts`) - Fast unit and integration test runner
- `@testing-library/react` & `@testing-library/jest-dom` - React component test utilities

**Build/Dev:**
- `electron-builder` 26.8.1 - Desktop installer packaging (NSIS Windows targets)
- `javascript-obfuscator` - Source code protection via `obfuscate.cjs` before builds
- `concurrently` - Multi-process development runner (`server.js`, `vite`, `localtunnel`)

## Key Dependencies

**Critical:**
- `xlsx` 0.18.5 & `xlsx-js-style` 1.2.0 (`src/lib/fileParser.ts`, `gstr2b/fullYearExcel.js`, `gstr1/fullYearExcel.js`) - Multi-sheet Excel parsing and Zero-Merge workbook generation
- `exceljs` 4.4.0 - Advanced spreadsheet manipulation and streaming
- `sqlite3` 6.0.1 - Embedded relational persistence for returns, batches, vouchers, and taxpayer profiles
- `firebase` 12.14.0 - Remote licensing and taxpayer subscription verification via Firestore
- `jspdf` 4.2.1 - Client-side PDF generation for GSTR-3B and audit summaries
- `date-fns` 3.6.0 - Robust date parsing, formatting, and proximity comparison

**Infrastructure:**
- `helmet` 8.2.0 & `cors` 2.8.6 - Express HTTP security headers and CORS policy
- `jsonwebtoken` 9.0.3 & `bcryptjs` 2.4.3 - Admin authentication and session tokens
- `googleapis` 173.0.0 - Google Drive backup synchronization
- `nodemailer` 10.1.0 - Automated vendor notice emails
- `lucide-react` 0.462.0 - Iconography suite
- `framer-motion` 12.40.0 - UI transitions and animations
- `@tanstack/react-query` 5.83.0 - Server-state synchronization and caching

## Configuration

**Environment:**
- Local configuration stored in `server_config.json` (JWT secret, port overrides, runtime flags)
- SQLite database location configured via `USER_DATA_PATH` (defaults to current directory or Electron appData)
- Tally connection defaults to `http://localhost:9000`

**Build:**
- `vite.config.ts` - Configures React SWC, path aliases (`@` -> `./src`), server port 8080
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript compiler configurations
- `tailwind.config.ts` - Tailwind color tokens, animations, and typography rules
- `components.json` - shadcn/ui configuration

## Platform Requirements

**Development:**
- Windows 10/11 or modern POSIX environment with Node.js 18+ and npm
- TallyPrime (optional for live accounting sync on port 9000)

**Production:**
- Windows 64-bit desktop application installer (`dist-electron/` NSIS exe) or local web server service

---

*Stack analysis: 2026-10-22*

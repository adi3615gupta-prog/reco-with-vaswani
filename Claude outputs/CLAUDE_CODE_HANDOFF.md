# Handoff: Vaswani Return Enterprise (from Claude chat, 2026-11-17)

Repo: `E:\backup\full and final\full and final\gst consolidater\reco-with-vaswani-main`
Read first: `CLAUDE.md`, `PROJECT_CONTEXT_HANDOFF.md`, `.agents/AGENTS.md`, `docs/MODULE_WISE_FILE_DIRECTORY.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`.

## 1. Milestone status

- **v2.9 is closed.** Phases 40 and 41 are complete. The roadmap heading and `STATE.md` now say "SHIPPED (2026-11-15)". These edits were written to disk from the chat session.
- **v2.10 is not chosen yet.** Three candidates were proposed:
  1. Windows Electron packaging and multi-office LAN deployment (recommended first). Groundwork: `main.cjs`, electron-builder, `build:exe`, integrity signing, `license-gateway`, `admin-web`.
  2. Suite 09 automated voucher expansion, reusing the Phase 41 pattern (DB tracking, duplicate prevention, Port 9000 push).
  3. Bank statement OCR via `LevitateExtract`, wired into Monthly Audit section 3.4 and Suite 07. Treat as a spike.
- **Planning-doc gaps to fix:**
  - `REQUIREMENTS.md` still has unchecked TXML-01..10 and G2B-BP-01..10 boxes for shipped phases. It has no requirements for Phases 37–41.
  - `PROJECT.md` still lists v2.4 under "Active" and is dated 2026-11-03.
  - `.planning/todos/` has not been reviewed.
- Next step: run `/gsd-new-milestone` once v2.10 is chosen.

## 2. Skills status

- All four command files exist in `.claude/commands/`: `ponytail.md`, `gsd-debug.md`, `ui-ux.md`, `cinematic.md`.
- Matching skill folders exist in `.agents/skills/`: `ponytail`, `ui-ux-pro-max`, `ui-styling`, `cinematic-film`.
- Each command file is a short instruction that points to a `SKILL.md`. The `SKILL.md` contents were not opened in the chat session.

## 3. GSTR-1 countdown timer bug (open, not applied)

Target: `src/components/ReturnsAutoIngestDeck.tsx`. Backend: `gstr1_routes.js`, `gstr1/db.js`.

**Findings**

- **NaN is not reproduced.** `requested_at` is INTEGER milliseconds (`gstr1/db.js` line 27, inserts at 299–303). The route returns it unchanged. If "instant ready" appears on old rows, check for values stored in seconds.
- **Clickable countdown.** The `disabled` list (lines 1965–1971) ignores `gstr1SecondsLeft`. The JSON click (1957–1958) calls `handleGstr1AutopilotSync()`, and `markGstr1MonthRequested` (`db.js` 302–304) sets `requested_at = now`. A click mid-countdown restarts the 20-minute clock.
- **Latch never clears while `REQUESTED`.** `hasAutoTriggeredGstr1` (785–805) resets only when the status leaves `REQUESTED`/`READY_TO_DOWNLOAD` (789–792). A second expiry with status still `REQUESTED` never auto-fires.
- **Stale state on month switch.** The 12-second poll (824–826) and hydrate (411–412) only write when the response has a batch. A failed fetch or an empty month keeps the previous month's `requestedAt` and status.

**Proposed fix (Ponytail, minimal)**

1. Line 785: `const hasAutoTriggeredGstr1 = useRef<number | null>(null); // requestedAt that already auto-fired`
2. Lines 789–792: `hasAutoTriggeredGstr1.current = null;` in place of `false`.
3. Line 800: replace `!hasAutoTriggeredGstr1.current` with `hasAutoTriggeredGstr1.current !== gstr1RequestedAt &&`.
4. Line 805: replace `hasAutoTriggeredGstr1.current = true;` with `hasAutoTriggeredGstr1.current = gstr1RequestedAt;`.
5. Lines 1965–1971, add to the `disabled` list: `(gstr1SourceMode === 'json' && gstr1BatchStatus === 'REQUESTED' && gstr1SecondsLeft > 0) ||`
6. Lines 824–826, replace the block with:
```tsx
        if (dataG1.success) {
          setGstr1BatchStatus(dataG1.batch?.status || 'PENDING');
          setGstr1RequestedAt(dataG1.batch?.requested_at || null);
        }
```

**Unverified:** `gstr1/autopilot.js` (123 KB) was not read. It is not yet confirmed whether the autopilot re-requests generation on expiry. The start of the hydrate effect (around lines 260–300) was also not read. Confirm both before applying.

**Tests not run.** `npm test` has not been run. Run it after applying the fix. No `npm run obfuscate` is needed because `server.js` and the route files are unchanged by this fix.

## 4. Working rules (from CLAUDE.md, must keep)

1. Zero merged cells: call `removeAllMergesFromWorkbook(wb)` before any XLSX write.
2. GST portal: never `page.goto` to `return.gst.gov.in`. Click the on-screen `BACK` button.
3. Data preservation: failed or cancelled downloads never delete or overwrite SQLite data.
4. Tally XML: port 9000, dates `YYYYMMDD`, debits positive, credits negative or `ISDEEMEDPOSITIVE`.
5. After changing `server.js`, `tax_routes.js`, `tds_routes.js`, `ims_routes.js` or `gstr2b_routes.js`, run `npm run obfuscate`.

## 5. Ask the user on resume

- Which v2.10 focus to start with.
- Whether to apply the timer fix in section 3.

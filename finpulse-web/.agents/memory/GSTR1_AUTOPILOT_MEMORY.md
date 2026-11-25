# GSTR-1 Autopilot — Dedicated Architecture & Granular Memory Manual

> **Module Identity:** GSTR-1 Outward Supplies Auto Downloader & Full-Year Consolidator  
> **Source Files:**
> - Core Autopilot: `gstr1/autopilot.js` (Lines 1–2207)
> - Database Layer: `gstr1/db.js`
> - Parsers (JSON, Excel, ZIP): `gstr1/parsers.js`
> - Full Year Excel: `gstr1/fullYearExcel.js`
> - API Routes: `gstr1_routes.js`
> - Autopilot Config: `gstr1/autopilot_config.json`

---

## 1. Exact Line-by-Line Code Map (`gstr1/autopilot.js`)

| Line Range | Function / Phase | Kya Karta Hai | Kaise Karta Hai |
|---|---|---|---|
| **Lines 430–488** | `ensureReturnsSearchScreen()` | Guarantees browser is on Returns Dashboard | Detects URL, clicks in-page Return Dashboard tiles, verifies `>= 2` select dropdowns. |
| **Lines 493–650** | `selectPeriodAndSearch()` | Period selection & AJAX search synchronization | Selects FY, Quarter, Month via Angular `$apply()`, clicks `SEARCH`, waits for `.loading, .spinner, [ng-show*="loading"]` to hide. |
| **Lines 653–835** | `downloadAndProcessGstr1()` — **Step 5** | Identifies GSTR-1 tile & clicks offline/download | Title-down search matching `OUTWARD SUPPLIES` or `GSTR-1` (excluding 3B/2B). Targets `PREPARE OFFLINE` (unfiled) or `DOWNLOAD` (filed). Verifies landing on `/offline` or `/offlinedownload`. |
| **Lines 837–985** | `downloadAndProcessGstr1()` — **Step 6** | Verifies Download screen state | If already on `/offlinedownload`, proceeds directly. If on `/offline`, switches to in-page `#download` tab. |
| **Lines 988–1310** | `downloadAndProcessGstr1()` — **Step 7** | Dynamic 3-Case Link Discovery & Request Generation | Pre-waits up to 6s for Angular DOM to settle. Checks for `Click here to download - File 1`. If present, tests validity (Case A error tab vs Case B download). If missing/expired, clicks `GENERATE JSON FILE TO DOWNLOAD` and executes Post-Generate monitor loop (up to 8s) to test and click newly ready download link. |
| **Lines 1312–1395** | `downloadAndProcessGstr1()` — **Case B** | Valid link download & persistence | Captures file stream, parses `.json`/`.zip`, saves line-items to `gstr1_invoices`, marks batch `SYNCED`, clicks official on-screen `BACK` button. |
| **Lines 1397–1440** | `downloadAndProcessGstr1()` — **Case C / Requested** | 20-Minute Queue Handling | Clicks `GENERATE JSON FILE TO DOWNLOAD`, confirms 20-min wait message, marks `REQUESTED`, clicks official on-screen `BACK` button. |

---

## 2. Step 7: Dynamic 3-Case Execution Logic (Detailed Flow)

```mermaid
flowchart TD
    A["Screen: GSTR-1 Offline Download (/offlinedownload)"] --> B["Pre-Wait up to 6s for DOM to settle"]
    B --> C{"Is 'Click here to download - File 1' on screen?"}
    
    C -- Yes --> D["Click 'Click here to download - File 1'"]
    D --> E{"Did a new tab open with error?"}
    
    E -- "Yes (Error Tab / Invalid Response)" --> F["Case A: Expired Link"]
    F --> G["1. Immediately close error tab"]
    G --> H["2. Refocus original portal tab"]
    H --> I["3. Click 'GENERATE JSON FILE TO DOWNLOAD'"]
    I --> J["4. Wait up to 8s for 20-min portal confirmation"]
    J --> K["5. Set SQLite status = 'REQUESTED'"]
    K --> L["6. Click official on-screen 'BACK' button"]
    L --> M["7. UI starts live 20-min countdown timer"]
    
    E -- "No (Download Event Triggered)" --> N["Case B: Valid Link"]
    N --> O["1. Intercept file stream (.zip / .json)"]
    O --> P["2. Extract invoices & persist to SQLite"]
    P --> Q["3. Set SQLite status = 'SYNCED'"]
    Q --> R["4. Click official on-screen 'BACK' button"]
    
    C -- No --> S["Case C: First Time Request"]
    S --> T["1. Click 'GENERATE JSON FILE TO DOWNLOAD'"]
    T --> U["2. Post-Generate Monitor Loop (up to 8s)"]
    U --> V{"Did 'Click here to download - File 1' appear?"}
    V -- Yes --> D
    V -- No --> J
```

---

## 3. Critical Rules for GSTR-1 Autopilot

1. **NO EXCLUDING CONTENT HEADERS VIA `.header`:** Only top navigation elements (`header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav`) are excluded when locating download links. Generic class `.header` must NEVER be excluded, as portal content containers use header classes.
2. **BROAD ELEMENT SELECTION FOR DOWNLOAD LINK:** Queries `a, span, button, [role='link'], p, div` with regex `/Click\s*here\s*to\s*download|File\s*1/i` to ensure Angular compiled elements are never missed.
3. **POST-GENERATE DETECTION GUARANTEE:** After clicking `GENERATE JSON FILE TO DOWNLOAD`, the script runs a polling loop (up to 8s) that tests and clicks `Click here to download - File 1` if it is present or becomes ready.
4. **NO RE-CLICKING CONFIRMED EXPIRED LINKS:** Once a link is confirmed expired via error tab in the current cycle, the script will not re-click it.
5. **OFFICIAL ON-SCREEN BACK BUTTON:** Always targets official button (`button:has-text('BACK'), input[value='BACK' i]`), strictly ignoring breadcrumbs, anchor tags, or top navigation.

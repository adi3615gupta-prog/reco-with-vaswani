# Module 1.3: GSTR-2B & 3B Monthly Tracker

> **Suite Accent Color:** Yellow / Amber (`#eab308` / `#f59e0b`)  
> **Route:** `/tracker`  
> **Source Component:** [`src/pages/GSTR2BTracker.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/GSTR2BTracker.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** Poore saal ke 12 maheenon (April to March) ka month-by-month return status aur tax summary matrix client-wise track karta hai.
- **Kyu karta hai:** Audit season me missing return periods aur unfiled returns ko ek single panoramic screen me detect karne ke liye.
- **Kaise karta hai:** Local SQLite database aur uploaded batches se data aggregate karta hai, filed vs unfiled periods color-code karta hai, aur return liability vs ITC comparison dikhata hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 12-Month Panoramic Calendar Grid
- Multi-client row layout with 12 monthly status columns:
  | Client Legal Name | GSTIN | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar | Year Total |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Siddha Edibles Pvt Ltd | 27AABCS... | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | 12/12 Synced |
  | Vaswani Steels LLP | 24AAGFV... | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `✓ 2B` | `⏳ Sync`| `-` | `-` | `-` | `-` | `-` | 6/12 Synced |

### 2.2 Status Badges & Indicators
- `✓ Filed / Synced` (Emerald pill)
- `⏳ In-Progress / Processing` (Amber pulsing pill)
- `✕ Unfiled / Delayed` (Rose red pill)
- `Nil Synced` (Slate blue pill)

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise 12-Month Return Filing Status Heatmap for 300+ corporate clients.
- Design: High-density spreadsheet-like Luminous Fluid Corporate (Light Mode) grid with sticky client name and GSTIN columns.
- Columns: 12 monthly status cells (April through March) with compact status pills (Synced, Pending, Delayed).
- Interactive: Clicking any cell opens the drill-down summary for that specific month.
```

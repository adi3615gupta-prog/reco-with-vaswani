# Suite 01: Practice Management & Client Hub

> **Suite Accent Color:** Amber 500 (`#f59e0b`)  
> **Glow / Glass Border:** `rgba(245, 158, 11, 0.25)`  
> **Route:** `/dashboard`  
> **Source Component:** [`src/pages/ClientDashboard.tsx`](file:///D:/My%20software/full%20and%20final/gst%20consolidater/reco-with-vaswani-main/src/pages/ClientDashboard.tsx)

---

## 1. Module Overview & Business Rationale
- **Kya karta hai:** 300+ enterprise clients ka centralized roster maintain karta hai, monthly/quarterly GSTIN filing due dates track karta hai, aur SQLite database ka automated snapshot backup/restore handle karta hai.
- **Kyu karta hai:** Chartered Accountant firms me ek single client ki return miss hone par ₹50/day late fee + Section 50 interest lagti hai. Practice dashboard multi-client risk ko eliminate karta hai.
- **Kaise karta hai:** SQLite table `clients` se live status read karta hai, GST portal filing frequencies (Monthly vs QRMP) map karta hai, aur 1-click database dump produce karta hai.

---

## 2. Screen Layout & Wireframe Architecture

### 2.1 Top KPI Metrics Deck (4 Cards)
1. **Total Managed Clients:**
   - Value: `342 Active Clients`
   - Subtext: `284 Regular • 58 QRMP / Composition`
   - Icon: `Users` (Amber glow)
2. **Approaching Deadlines (Next 7 Days):**
   - Value: `28 Returns Due`
   - Subtext: `GSTR-1 Due on 11th • GSTR-3B Due on 20th`
   - Icon: `CalendarClock` (Red/Amber alert pill)
3. **Filing Compliance Rate:**
   - Value: `96.4% Compliant`
   - Subtext: `329 Filed • 13 Pending Action`
   - Icon: `ShieldCheck` (Emerald badge)
4. **Local Database Health:**
   - Value: `SQLite Active`
   - Subtext: `Last backed up 18 mins ago (LAN Mode)`
   - Icon: `Database` (Blue pill)

### 2.2 Client Roster Data Table (Dense Grid)
- **Toolbar & Filters:**
  - Search Input: Filter by Legal Name, Trade Name, GSTIN, PAN.
  - Frequency Filter: `All`, `Monthly (Regular)`, `Quarterly (QRMP)`, `Composition`.
  - State Filter: Dropdown of State Codes (27-MH, 24-GJ, 07-DL, etc.).
  - Actions: `+ Add New Client`, `Export Client Master (Excel)`, `Backup Database Now`.
- **Table Columns:**
  | # | Legal Name | Trade Name | GSTIN | Filing Type | Return Due | 3B Status | 1 Status | Actions |
  |---|---|---|---|---|---|---|---|---|
  | 1 | Siddha Edibles Pvt Ltd | Siddha Foods | 27AABCS1234D1Z2 | Monthly | 20-Oct | `Filed` | `Filed` | `Launch Work` |
  | 2 | Vaswani Steels LLP | Vaswani Steels | 24AAGFV9876C1Z8 | Monthly | 20-Oct | `Pending` | `Filed` | `Launch Work` |

---

## 3. Stitch UI Prompt Snippet
```markdown
Design an enterprise-grade Luminous Fluid Corporate (Light Mode) screen for "Practice Dashboard & Client Roster".
- Theme: Luminous Fluid Corporate (#F8FAFC background, glass cards with rgba(245, 158, 11, 0.2) amber glow).
- Top: 4 KPI metric cards (Total Clients, Due Deadlines, Compliance Rate, Database Health).
- Center: Multi-column client master table with search, status pills (Filed, Pending, Overdue), and Quick-Launch button.
- Header: Client import/export action buttons and SQLite backup status pill.
```

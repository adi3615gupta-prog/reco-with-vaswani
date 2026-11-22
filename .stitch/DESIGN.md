# Design System Specification: Vaswani Return Enterprise

Single source of truth for visual rhythm, typographic hierarchy, materiality, and spatial layout of **Vaswani Return Enterprise** (AI-powered GST & Income Tax Autonomous Suite).

---

## 1. Visual Theme and Atmosphere

- **Theme Style**: Clean, authoritative, luminous enterprise financial platform.
- **Root Surface Lightness**:
  - Light mode canvas: `#F8FAFC` (Slate-50) / Card Surface: `#FFFFFF`.
  - Dark mode canvas: `#0F1319` / Card Surface: `#141920`.
- **Materiality & Aesthetic**: Crisp high-contrast financial telemetry, subtle glassmorphic header borders (`rgba(226, 232, 240, 0.8)`), micro-radii on badges (`4px` - `6px`), generous rounded corners on action cards (`12px` - `16px`).
- **Tone & Mood**: Precision-engineered, dependable, institutional-grade speed, audit defense ready.

---

## 2. Color Palette and Roles

### Primary Foundation
- **Canvas / Root Background**: `#F8FAFC` (Light) / `#0F1319` (Dark)
- **Primary Card Surface**: `#FFFFFF` (Light) / `#141920` (Dark)
- **Elevated Container**: `#F1F5F9` (Light) / `#1A2130` (Dark)
- **Primary Border**: `#E2E8F0` (Light) / `#1E293B` (Dark)
- **Subtle Outline / Border 2**: `#CBD5E1`

### Accent and Interactive
- **Enterprise Cobalt Primary**: `#2563EB` (Blue-600) / Hover: `#1D4ED8`
- **Electric Sky Highlight**: `#3B82F6` (Blue-500)
- **Luminous Indigo**: `#4F46E5` (Audit & Analytics)
- **Interactive Focus Ring**: `rgba(37, 99, 235, 0.2)`

### Domain & Module Color Accents
- **Emerald GST (Section 16 / Reco / Returns)**: `#059669`
- **Amber Practice (Pending / Disputes / CDNR)**: `#D97706`
- **Pink Tally (Prime XML Integration)**: `#DB2777`
- **Indigo Audit (Tax Audit Clause 44 & CMA)**: `#4F46E5`

### Typography Hierarchy
- **Headline / Primary Text**: `#0F172A` (Slate-900)
- **Body / Secondary Text**: `#334155` (Slate-700)
- **Muted / Caption Text**: `#64748B` (Slate-500)
- **Dark Mode Primary Text**: `#F8FAFC` / Muted: `#94A3B8`

### Functional Status States
- **Success / Match (Clean Reco)**: `#059669` (Emerald-600) / Background: `#ECFDF5`
- **Warning / Mismatch / Tolerance**: `#D97706` (Amber-600) / Background: `#FFFBEB`
- **Critical / Missing in Books / Alert**: `#DC2626` (Red-600) / Background: `#FEF2F2`
- **Info / Portal Synced**: `#2563EB` / Background: `#EFF6FF`

---

## 3. Typography Rules

- **Primary Sans Font**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Financial & Data Monospace**: `JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace`

### Typographic Scale
- **Display Hero**: `font-size: 3.5rem (56px)`, `font-weight: 800`, `letter-spacing: -0.03em`, `line-height: 1.1`
- **H1 Page Header**: `font-size: 2.25rem (36px)`, `font-weight: 700`, `letter-spacing: -0.025em`, `line-height: 1.2`
- **H2 Section Header**: `font-size: 1.75rem (28px)`, `font-weight: 600`, `letter-spacing: -0.02em`, `line-height: 1.25`
- **H3 Card Header**: `font-size: 1.25rem (20px)`, `font-weight: 600`, `letter-spacing: -0.015em`, `line-height: 1.35`
- **Body Regular**: `font-size: 1rem (16px)`, `font-weight: 400`, `line-height: 1.6`
- **Body Small / Subtitle**: `font-size: 0.875rem (14px)`, `font-weight: 400`, `line-height: 1.5`
- **Tabular Data / Badges**: `font-size: 0.75rem (12px)`, `font-weight: 600`, `font-family: monospace`

---

## 4. Component Stylings

### Primary Action Button (`Button`)
- **Background**: `#2563EB`
- **Hover**: `#1D4ED8` with subtle transform `translateY(-1px)`
- **Text**: `#FFFFFF`, `font-weight: 600`, `font-size: 14px`
- **Border Radius**: `12px` (`0.75rem`)
- **Shadow**: `0 10px 15px -3px rgba(37, 99, 235, 0.2), 0 4px 6px -4px rgba(37, 99, 235, 0.1)`
- **Padding**: `12px 24px`

### Secondary / Ghost Button
- **Background**: `#FFFFFF` or `transparent`
- **Border**: `1px solid #E2E8F0`
- **Text**: `#0F172A`, `font-weight: 600`
- **Hover**: `#F1F5F9`, `border-color: #CBD5E1`

### Feature & Metric Card (`Card`)
- **Background**: `#FFFFFF`
- **Border**: `1px solid #E2E8F0`
- **Border Radius**: `16px` (`1rem`)
- **Padding**: `24px` to `32px`
- **Hover**: Subtle lift with border transitioning to `#CBD5E1` and shadow `0 20px 25px -5px rgba(15, 23, 42, 0.05)`

### Navigation Bar (`Navbar`)
- **Height**: `72px`
- **Background**: `rgba(255, 255, 255, 0.85)` with `backdrop-filter: blur(12px)`
- **Border Bottom**: `1px solid #E2E8F0`
- **Layout**: Centered container max `1280px`, brand mark on left, nav links center, "Launch App" CTA on right.

---

## 5. Layout Principles

- **Maximum Container Width**: `1280px` (`max-w-7xl`)
- **Grid Layout**: 12-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- **Base Spacing Rhythm**: `8px` scale (`gap-4`, `gap-6`, `gap-8`, `gap-12`)
- **Section Vertical Padding**: `80px` to `120px` (`py-20` to `py-28`)
- **Responsive Breakpoints**:
  - Mobile: `< 640px`
  - Tablet: `640px` - `1024px`
  - Desktop: `> 1024px` (Fluid desktop canvas: `1280px`)

---

## 6. Stitch Generation Notes

- **Atmosphere Keywords**: High-conversion B2B SaaS landing page, authoritative fintech, luxury typography, luminous glass, sleek executive metrics, subtle gradient mesh background, trusted Indian tax compliance badges.
- **Key Modules Highlighted**:
  1. *GST Reco Engine (2B vs Books / Section 16(2)(aa))*
  2. *Autopilot Inward Ingestion & 12-Month Consolidated GSTR-2B*
  3. *Tally Prime Direct XML Integration (Port 9000 bidirectional sync)*
  4. *GSTR-1, GSTR-3B & Tax Audit Clause 44 Suite*
  5. *Autonomous GST Notice & Audit Defense Hub*
- **Call-to-Action (CTA)**: "Launch Enterprise Suite", "Live Interactive Demo", "Explore 14 Modules".


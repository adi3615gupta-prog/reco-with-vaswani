---
phase: 37-enterprise-audit-remediation-hardening
plan: 04
subsystem: statutory-and-tax-engines
tags: [gstr-3b, tds, 194c, 194q, 40a-3, cma-tandon-ii, clause-44, income-tax-engine, sec-115bbe, sec-288b, zero-merge]

requires:
  - 37-01
provides:
  - Rule 88A surplus IGST credit retained strictly in balanceCfNextMonth.igst without illegal CGST conversion
  - Section 49(4) RCM protection via MAX(0, ...) wrapper preventing excess TDS/TCS cash offset against RCM
  - Section 194C(5) retroactive cumulative aggregate threshold catch-up for all prior untaxed bills
  - Unmatched TRACES deletion uncommented in tds_routes.js and scratch JSON debug dumps removed
  - Client-server parity for Income Tax Engine (deemed income 115BBE, basic exemption shortfall set-off, Sec 288B rounding)
  - Decimal half-up round correction for toFixed(0) across client and server
  - Multi-FY income tax slabs for FY2023-24, FY2024-25, FY2025-26+ and Rebate 87A
  - Tandon Committee Method II Working Capital Gap calculation with bank borrowings exclusion from OCL
  - Section 16(4) calendar year FY boundary correction for Q4 (Jan-Mar) invoices
  - Section 40A(3) split cash payment aggregation per party per date
  - Section 194Q evaluation on all purchases/expenses exceeding ₹50 Lakhs without keyword restrictions
  - Clause 44 quarterly chunking default to eliminate 180s Tally Port 9000 timeout hangs
  - Strict Zero-Merge architecture in CMA ExcelJS and Audit SheetJS exports
affects:
  - 37-05
  - 37-06

actuals:
  tasks: 3
  test_suites_passed: 7
  total_tests_passed: 56

key-files:
  created:
    - src/test/cmaAndAuditCompliance.test.ts
  modified:
    - src/lib/gstr3bEngine.ts
    - src/lib/tdsEngine.ts
    - tds_routes.js
    - src/server_lib/decimal.js
    - src/lib/decimal.ts
    - src/lib/incomeTaxEngine.ts
    - src/server_lib/incomeTaxEngine.js
    - src/lib/taxSlabData.ts
    - src/server_lib/taxSlabData.js
    - src/lib/incomeTaxEngine.test.ts
    - src/lib/cmaEngine.ts
    - src/lib/monthlyAuditEngine.ts
    - src/lib/auditEngine.ts
    - src/lib/tallyApi.ts

key-decisions:
  - "Preserved surplus unutilized IGST ITC in balanceCfNextMonth.igst without converting to CGST, complying strictly with Rule 88A and Sec 49(5)"
  - "Enforced Sec 194C(5) cumulative threshold catch-up to retroactively tax untaxed prior bills once annual payments exceed ₹1,00,000"
  - "Implemented resident basic exemption shortfall set-off sequentially against LTCG 112, LTCG 112A, and STCG 111A per statutory provisos"
  - "Included deemed income u/s 115BBE in total taxable income and added Sec 288B rounding to nearest ₹10"
  - "Calculated Tandon Committee Method II Working Capital Gap using Other Current Liabilities (CL excluding CC/OD bank borrowings)"
  - "Fixed Sec 16(4) deadline boundary so Jan-Mar Q4 invoices expire on Nov 30 of the same calendar year"
  - "Aggregated Sec 40A(3) cash payments per counterparty per day, detecting split vouchers exceeding ₹10,000"
  - "Removed restrictive keyword filters on Sec 194Q scrutiny, evaluating all purchases/expenses > ₹50 Lakhs"
  - "Defaulted Tally Clause 44 extraction to quarterly chunks to prevent HTTP Port 9000 timeouts"
  - "Stripped all cell merges from CMA ExcelJS and Audit SheetJS workbooks to uphold the Zero-Merge architecture"

requirements-completed:
  - TAX-01
  - TAX-02
  - TAX-03
  - TAX-04
  - TAX-05
  - TAX-06
  - TAX-07
  - TAX-08
  - TAX-09
  - TAX-10
  - TAX-11
  - TAX-12
  - TAX-13
  - TAX-14
  - TAX-15
  - TAX-16
  - TAX-17
  - TAX-18
  - SEC-14
---

# Plan 37-04 Summary: Statutory & Tax Engines Enterprise Remediation

## Overview
Plan 37-04 hardened and brought statutory compliance to 5 core tax engines across the application:
1. **GSTR-3B Working Sheet & Rule 88A Set-off Engine**
2. **TDS Consolidator & TRACES Reconciliation Engine**
3. **Income Tax Engine (Dual Client-Server Parity & Finance Acts)**
4. **CMA Credit Appraisal Engine (Tandon Committee Method II & Zero-Merge ExcelJS)**
5. **Statutory & Tax Audit Scrutiny Suite (Sec 16(4), Sec 40A(3), Sec 194Q, Clause 44 & Zero-Merge)**

All 56 tests across 7 vitest test files passed with 100% success.


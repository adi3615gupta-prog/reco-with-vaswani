# Synthesized Planning Intel

**Analysis Date:** 2026-10-22
**Mode:** Net-new bootstrap from technical specification

## Executive Summary
Ingested 1 technical specification document (`gst_debit_note_reconciliation_engine_spec.md`) defining the data model, normalization pipeline, 6-pass waterfall matching algorithm, 1-to-many consolidated batch solver, and 21-column reconciled register schema for Purchase Register Debit Notes against GSTR-2B Credit/Debit Notes.

## Project Scope
- Core Domain: GST Purchase Register (PR) vs GSTR-2B Credit/Debit Note reconciliation
- Target Audience: Chartered Accountants, Tax Practitioners, and Enterprise Accounting Teams handling complex vendor debit notes and volume discount credit batches
- Key Subsystems:
  1. Data normalization & cleaning engine (numeric parser, FY prefix stripper, placeholder detector, missing GSTIN fallback)
  2. 6-pass waterfall matching engine
  3. 1-to-many consolidated batch solver (date-cluster & bounded subset-sum solver)
  4. 21-column standardized reconciled register and export suite

## Key Invariants & Constraints
- **Zero Double-Counting Accounting Invariant:** Column sums of reconciled register must strictly equal column sums of raw input data.
- **Lead Row + Grouped Sub-Rows Pattern:** 1-to-many batch matches display all individual 2B note rows with sub-rows zeroing PR values to avoid grand total inflation.
- **Strict Zero-Merge Architecture:** All generated analytical Excel exports must have zero cell merges to allow formula lookups, sorting, and filtering.

## Ingested Requirements Breakdown
- `REQ-DN-01`: 6-Pass Waterfall Reconciliation Pipeline
- `REQ-DN-02`: 1-to-Many Consolidated Batch Solver
- `REQ-DN-03`: Composite Invoice Number Detection Guardrail
- `REQ-DN-04`: Robust Pre-Processing & Supplier Name Resolution
- `REQ-DN-05`: 21-Column Reconciled Register Output

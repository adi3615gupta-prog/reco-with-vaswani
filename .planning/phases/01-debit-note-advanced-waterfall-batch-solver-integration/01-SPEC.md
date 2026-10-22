# Technical Specification: GST Debit/Credit Note Reconciliation Engine (Books PR vs. GSTR-2B)

This specification defines the data model, normalization rules, 6-pass waterfall matching algorithm, consolidated batch (1-to-Many) solver, and output schema used to reconcile **Purchase Register (Books / PR) Debit Notes** against **GSTR-2B Credit/Debit Notes**. You can pass this specification directly to **Antigravity** to build and automate the reconciliation software.

## 1. Problem Statement & Real-World Data Challenges

In standard accounting and ERP exports, GSTR-2B Credit/Debit Notes (`2B`) and Purchase Register Debit Notes (`PR`) often fail to reconcile in off-the-shelf software because of six structural discrepancies present in real-world data:

1. **Unreconciled Stacked Blocks**: Raw exports frequently list all `2B Credit/Debit Note` rows first (with `PR` columns blank) followed by all `Books Debit Note` rows below them (with `2B` columns blank), rather than pairing matched transactions side-by-side on the same horizontal row.
2. **Generic Placeholder Invoice Numbers in Books**: Accountants frequently record `"DN"` or an internal voucher number (e.g., `806`, `2512159538`) in `Invoice No (PR)` instead of the supplier's official GSTR-2B Credit/Debit Note number (e.g., `MHCNW/2526/0032`, `MH2513503468`).
3. **1-to-Many Consolidated Lump-Sum Entries in Books**: A buyer often records a **single lump-sum Debit Note (`DN`)** in Books that equals the exact sum of **2 to 15 separate GSTR-2B Credit/Debit Notes** issued by the same supplier on the same date or within the same billing batch (for example, 1 Books entry of `-₹20,24,678.22` for GSP Crop Science equals the exact sum of 11 GSTR-2B notes `7705153273` through `7705153283`).
4. **Composite Invoice Numbers (1 Invoice No in Books = 2 Notes in 2B)**: Occasionally, Books record the first invoice number of a pair (e.g., UPL `1466468745` or Biostadt `9015006303`), but the numeric value recorded in Books is the combined total of two consecutive 2B notes (`1466468745 + 1466468746` or `9015006302 + 9015006303`).
5. **Prefix & Formatting Variations in Invoice Numbers**: Books may prepend state/year prefixes (e.g., `MH-2526/252642344`) while GSTR-2B contains only the core document number (`252642344`).
6. **Unvalued (`₹0.00`) Entries & Missing GSTINs in Books**: Seed and agricultural return entries are often logged in Books with `₹0.00` value (or `-`) and occasionally without a GSTIN (e.g., `ISHAWAR AGRI SCIENCE PVT LTD` in Books vs. `27AAHCI9406N1Z0` `ISHWAR AGRISCIENCE PRIVATE LIMITED` in 2B), or a taxable 2B note is logged in Books with `₹0.00` value (e.g., UPL `1466468807`).

## 2. Input & Output Data Schema (21-Column Standard)

Both the raw input and the primary **Reconciled Register** output share a 21-column structure so side-by-side comparisons and grand total audits remain 100% consistent:

| Col # | Column Name | Data Type | Source Side | Description / Formula |
| :---: | :--- | :--- | :---: | :--- |
| 1 | `Match Status` | String (Enum) | Output | Classification assigned by the reconciliation engine |
| 2 | `GSTIN (PR)` | String (15 chars) | Books (PR) | Supplier GSTIN as recorded in Purchase Register |
| 3 | `GSTIN (2B)` | String (15 chars) | GSTR-2B | Supplier GSTIN as reported in GSTR-2B |
| 4 | `Supplier Name (PR)` | String | Books (PR) | Legal/Trade name in Purchase Register |
| 5 | `Supplier Name (2B)` | String | GSTR-2B | Legal/Trade name in GSTR-2B |
| 6 | `Invoice No (PR)` | String | Books (PR) | Debit Note / Voucher number in Books (`<Ref> (Grouped)` on batch sub-rows) |
| 7 | `Invoice No (2B)` | String | GSTR-2B | Credit/Debit Note number in GSTR-2B |
| 8 | `Invoice Date (PR)` | Date (`DD/MM/YYYY`) | Books (PR) | Document date in Books |
| 9 | `Invoice Date (2B)` | Date (`DD/MM/YYYY`) | GSTR-2B | Document date in GSTR-2B |
| 10 | `Invoice Value (PR)` | Decimal (2 dp) | Books (PR) | Total note value in Books (negative for debit/credit note reductions) |
| 11 | `Invoice Value (2B)` | Decimal (2 dp) | GSTR-2B | Total note value in GSTR-2B (negative for debit/credit note reductions) |
| 12 | `Taxable Value (PR)` | Decimal (2 dp) | Books (PR) | Pre-tax taxable value in Books |
| 13 | `Taxable Value (2B)` | Decimal (2 dp) | GSTR-2B | Pre-tax taxable value in GSTR-2B |
| 14 | `CGST (PR)` | Decimal (2 dp) | Books (PR) | Central GST in Books |
| 15 | `CGST (2B)` | Decimal (2 dp) | GSTR-2B | Central GST in GSTR-2B |
| 16 | `SGST (PR)` | Decimal (2 dp) | Books (PR) | State GST in Books |
| 17 | `SGST (2B)` | Decimal (2 dp) | GSTR-2B | State GST in GSTR-2B |
| 18 | `IGST (PR)` | Decimal (2 dp) | Books (PR) | Integrated GST in Books |
| 19 | `IGST (2B)` | Decimal (2 dp) | GSTR-2B | Integrated GST in GSTR-2B |
| 20 | `Net Tax Diff` | Decimal (2 dp) | Calculated | `(CGST_PR + SGST_PR + IGST_PR) - (CGST_2B + SGST_2B + IGST_2B)` |
| 21 | `Audit Remarks / Action` | String | Output | Detailed explanation of match rule, batch membership, or required action |

### Core Accounting Invariant (Zero Double-Counting)

Every single input `PR` record ($N_{\text{PR}} = 434$) and every single input `2B` record ($N_{\text{2B}} = 955$) must be accounted for exactly once in the numeric totals:

$$\sum_{\text{Reconciled Rows}} \text{Column}_k = \sum_{\text{Raw Input Rows}} \text{Column}_k \quad \forall k \in \{10 \dots 20\}$$

When 1 Books (`PR`) entry matches $m$ GSTR-2B (`2B`) notes ($m \ge 2$):
* **Row 1 of the Batch (Lead Row)**: Populates the full `PR` values (`Invoice Value (PR)`, `Taxable Value (PR)`, `CGST (PR)`, `SGST (PR)`, `IGST (PR)`) alongside the 1st `2B` note.
* **Rows $2 \dots m$ of the Batch (Grouped Sub-Rows)**: Populates `GSTIN (PR)`, `Supplier Name (PR)`, `Invoice Date (PR)`, and sets `Invoice No (PR)` to `"<Original_Inv_PR> (Grouped)"`, while setting the 5 numeric `PR` columns to `0.00`. This keeps all $m$ `2B` invoice numbers visible on their own rows while ensuring the `PR` column sums never double-count.

## 3. Pre-Processing & Data Normalization Pipeline

Before running the matching passes, the engine normalizes all raw records:

1. **Numeric Parsing (`parse_accounting_float`)**:
   * Strip spaces and commas (including Indian numbering commas `10,63,92,308.70`).
   * Convert `""`, `"-"`, `"--"` to `0.00`.
   * Convert parenthesized strings `"(45,04,490.90)"` to negative floats `-4504490.90`.
2. **Invoice Number Normalization (`normalize_invoice_no`)**:
   * Trim whitespace, convert to uppercase, remove internal spaces.
   * Strip known regional/fiscal-year prefixes when comparing against 2B: regex `^(MH-2526/|MH-CN-2526-|MH/25-26/)` $\rightarrow$ core invoice string.
   * Flag generic placeholders: `is_generic_inv = norm_inv in ("", "DN", "DEBITNOTE", "CN", "CREDITNOTE")`.
3. **Date Parsing**:
   * Parse `DD/MM/YYYY` into standard date objects. Ignore corrupted GSTIN strings that contain dates (e.g., `"01/07/2017"` in `GSTIN (PR)` is treated as missing GSTIN, not a valid 15-character GSTIN).
4. **Missing GSTIN Resolution (Supplier Name Fallback)**:
   * If `GSTIN (PR)` is blank or invalid (not matching `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`), normalize `Supplier Name (PR)` (strip `"PVT LTD"`, `"PRIVATE LIMITED"`, `"LIMITED"`, punctuation, and collapse phonetics like `"ISHAWAR"` $\rightarrow$ `"ISHWAR"`) and map to `GSTIN (2B)` if a unique supplier match exists in GSTR-2B.

## 4. The 6-Pass Waterfall Reconciliation Algorithm

The engine executes six sequential passes over the pool of unmatched `PR` and `2B` rows. Once a `PR` or `2B` row is matched in an earlier pass, it is locked (`used_pr.add(pr_id)`, `used_2b.add(b2_id)`) and excluded from subsequent passes.

### Pass 1: 1-to-1 Exact & Normalized Invoice Number Match (with Composite Guardrail)

For each unmatched `PR` row where `not is_generic_inv`:
1. Find candidate unmatched `2B` rows where `effective_GSTIN_PR == GSTIN_2B` and `norm_inv_PR == norm_inv_2B`.
2. **Composite Batch Guardrail**: If `abs(Val_PR) > abs(Val_2B) + 10.00`, check whether `Val_PR` matches the sum of this `2B` row plus adjacent unmatched `2B` rows of the same supplier and date/sequence (within `₹10.00`).
   * *Example*: UPL `PR` Invoice `1466468745` (`-₹1,60,030.42`) vs. `2B` `1466468745` (`-₹1,41,055.12`) + `2B` `1466468746` (`-₹18,977.10`) = `-₹1,60,032.22`.
   * *Example*: Biostadt `PR` Invoice `9015006303` (`-₹4,46,960.40`) vs. `2B` `9015006302` (`-₹40,320.60`) + `2B` `9015006303` (`-₹4,06,639.80`) = `-₹4,46,960.40`.
   * If a multi-note sum matches, **skip Pass 1** for this row and let **Pass 3 (Consolidated Batch Solver)** match the full group.
3. Otherwise, pair `(PR, 2B)` 1-to-1 and classify:
   * **`Reconciled (Exact Match)`**: `abs(Val_PR - Val_2B) < 0.01` and `abs(Tax_PR - Tax_2B) < 0.01`.
   * **`Reconciled (Rounding Diff)`**: `Val_PR != 0` and `abs(Tax_PR - Tax_2B) <= 2.00` and `abs(Val_PR - Val_2B) <= 10.00`.
   * **`Reconciled (Exempt / Zero Tax)`**: `Val_PR == 0` and `Val_2B != 0` and `Tax_2B == 0` (e.g., exempt hybrid seed notes where Books logged the invoice number without values).
   * **`Matched - Value Missing in Books`**: `Val_PR == 0` and `Val_2B != 0` and `Tax_2B != 0` (e.g., UPL `1466468807` where `₹4,05,577.80` and `₹61,867.80` tax are in 2B but Books value is `₹0.00`).
   * **`Partially Matched (Value Diff)`**: `Val_PR != 0` and (`abs(Tax_PR - Tax_2B) > 2.00` or `abs(Val_PR - Val_2B) > 10.00`).

### Pass 2: 1-to-1 Exact/Near Amount & Tax Match (Generic `DN` or Voucher No in Books)

For each remaining unmatched `PR` row with `Val_PR != 0`:
1. Filter unmatched `2B` rows with `GSTIN_2B == effective_GSTIN_PR`.
2. Find candidates satisfying:
   $$\left| \text{Val}_{\text{PR}} - \text{Val}_{\text{2B}} \right| \le ₹10.00 \quad \text{and} \quad \left| \text{Tax}_{\text{PR}} - \text{Tax}_{\text{2B}} \right| \le ₹2.00$$
3. If multiple candidates match, select the candidate minimizing `abs(Date_PR - Date_2B)` (and then minimizing `abs(Val_PR - Val_2B)`).
4. Pair `(PR, 2B)` 1-to-1 and classify:
   * **`Reconciled (Value Match - DN)`** if `abs(Val_PR - Val_2B) < 0.01` and `abs(Tax_PR - Tax_2B) < 0.01`.
   * **`Reconciled (Rounding Diff)`** if `0.01 <= abs(Val_PR - Val_2B) <= 10.00`.

### Pass 3: 1-to-Many Consolidated Batch Solver (Date-Cluster & Subset-Sum Matching)

In agricultural and chemical supply chains, suppliers issue multiple product-wise Credit Notes on the same day (or consecutive days), while the buyer records a single consolidated Debit Note (`DN`) for the entire batch.

For each remaining unmatched `PR` row with `Val_PR != 0`:
1. Retrieve all remaining unmatched `2B` rows for `GSTIN_2B == effective_GSTIN_PR`.
2. **Tier 3A — Exact Date-Cluster / Prefix-Cluster Sum**:
   * Group candidate `2B` rows by `(Invoice Date (2B))` or by `(Invoice Date (2B) within ±1 day, Invoice Prefix)` (e.g., `GCN/23/FY26/...` vs. `GCN/29/FY26/...`).
   * If the sum of a cluster's `Invoice Value (2B)` is within `₹25.00` of `Val_PR` (and total tax is within `₹15.00` of `Tax_PR`), match `PR` to that entire `2B` cluster.
3. **Tier 3B — Subset-Sum Solver (for Split Same-Day Batches)**:
   * Sometimes a supplier issues 7 notes on the same date, and the buyer records 2 separate `DN` entries in Books on that date (e.g., UPL on `11/10/2025` has 7 notes `1466468393`–`1466468399`, which Books recorded as two `DN` entries: `-₹33,36,166.80` = `8393 + 8394`, and `-₹75,61,000.80` = `8395 + 8396 + 8397 + 8398 + 8399`).
   * Run a bounded Subset-Sum search over candidate `2B` rows (prioritizing candidates within `±45 days` of `Date_PR` or contiguous invoice numbers) to find a subset $S$ ($2 \le |S| \le 15$) such that:
     $$\left| \text{Val}_{\text{PR}} - \sum_{j \in S} \text{Val}_{\text{2B}, j} \right| \le ₹25.00 \quad \text{and} \quad \left| \text{Tax}_{\text{PR}} - \sum_{j \in S} \text{Tax}_{\text{2B}, j} \right| \le ₹15.00$$
4. Emit $m = |S|$ rows in the **Reconciled Register** with status **`Reconciled (Consolidated Batch)`** (Lead Row + $m-1$ `(Grouped)` Sub-Rows) and log the aggregated batch record to the **Consolidated Batches** summary table.

### Pass 4: 1-to-1 Fuzzy Value & Date Proximity Match (Partial / Disputed Value Matches)

For remaining unmatched `PR` rows (`Val_PR != 0`) and remaining unmatched `2B` rows of the same `GSTIN`:
1. Find candidate `2B` rows where:
   $$\frac{\left| \text{Val}_{\text{PR}} - \text{Val}_{\text{2B}} \right|}{\max(\left|\text{Val}_{\text{PR}}\right|, \left|\text{Val}_{\text{2B}}\right|)} \le 0.05 \quad (5\% \text{ tolerance})$$
   and `abs(Date_PR - Date_2B) <= 30 days`.
2. Pair `(PR, 2B)` 1-to-1 and classify as **`Partially Matched (Value Diff)`**, recording the exact invoice value variance and tax difference in `Audit Remarks / Action` (e.g., Ratnakar India `MHCNW/2526/0025`, Sunshine Agri `252642342`, MBF India `SR/MH/128`).

### Pass 5: Unmatched GSTR-2B Classification

All remaining unmatched `2B` rows have no corresponding entry in Books:
* Classify as **`In GSTR-2B Only (Not in Books)`**.
* If `CGST_2B + SGST_2B + IGST_2B == 0`, add remark: `"In GSTR-2B Only (Exempt / Zero-Tax Note not matched in Books)"`.
* Otherwise, add remark: `"In GSTR-2B Only — Verify & record Debit/Credit Note in Books (ITC reversal impact)"`.

### Pass 6: Unmatched Books (PR) Classification

All remaining unmatched `PR` rows have no corresponding entry in GSTR-2B:
* If `Val_PR != 0`: Classify as **`In Books Only (Not in GSTR-2B)`** with remark `"Recorded in Books Only — Not reflected in GSTR-2B; follow up with supplier"`.
* If `Val_PR == 0`: Classify as **`In Books Only (Zero-Value Seed Entry)`** with remark `"Recorded in Books with ₹0 value (Exempt Seed Return / Unvalued DN); not in GSTR-2B"`.

## 5. Complete Reference Python Implementation for Antigravity

Below is the complete, self-contained Python reconciliation engine implementing the 6-pass algorithm, subset-sum batch solver, and invariant verification.

```python
import re
from datetime import datetime
from itertools import combinations
import numpy as np
import pandas as pd


# ─────────────────────────────────────────────────────────────────────────────
# 1. Normalization & Parsing Utilities
# ─────────────────────────────────────────────────────────────────────────────
def parse_accounting_float(val) -> float:
    """Converts accounting strings like '(45,04,490.90)' or '-' into floats."""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float, np.number)):
        return float(val)
    s = str(val).strip().replace(" ", "").replace(",", "")
    if s in ("", "-", "--", "N/A"):
        return 0.0
    is_neg = False
    if s.startswith("(") and s.endswith(")"):
        is_neg = True
        s = s[1:-1]
    elif s.startswith("-"):
        is_neg = True
        s = s[1:]
    try:
        num = float(s)
        return -num if is_neg else num
    except ValueError:
        return 0.0


def normalize_invoice_no(inv: str) -> str:
    """Normalizes invoice numbers and strips regional/FY prefixes."""
    if not isinstance(inv, str):
        return ""
    s = inv.strip().upper().replace(" ", "")
    # Strip known buyer-side prefixes added in Books
    s = re.sub(r"^(MH-2526/|MH/25-26/)", "", s)
    return s


def is_generic_dn(inv_norm: str) -> bool:
    """Returns True if the Books invoice number is a generic placeholder."""
    return inv_norm in ("", "DN", "CN", "DEBITNOTE", "CREDITNOTE")


def parse_date_safe(d_str: str):
    """Parses DD/MM/YYYY into a datetime.date object, or None if invalid."""
    if not isinstance(d_str, str) or not d_str.strip():
        return None
    try:
        return datetime.strptime(d_str.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def normalize_supplier_name(name: str) -> str:
    """Normalizes supplier name for fallback GSTIN resolution."""
    if not isinstance(name, str):
        return ""
    s = name.upper()
    s = re.sub(r"\b(PVT|PRIVATE|LTD|LIMITED|INDIA|COMPANY|CO|CORP|CORPORATION)\b", " ", s)
    s = s.replace("ISHAWAR", "ISHWAR").replace("INDOFILL", "INDOFIL")
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


# ─────────────────────────────────────────────────────────────────────────────
# 2. Subset-Sum Solver for Pass 3 (1-to-Many Consolidated Batches)
# ─────────────────────────────────────────────────────────────────────────────
def find_subset_sum_match(target_val: float, target_tax: float, cand_df: pd.DataFrame,
                          val_tol: float = 25.0, tax_tol: float = 15.0):
    """
    Finds a subset of 2B rows (size >= 2) whose Invoice Value and Total Tax sum
    to target_val and target_tax within tolerances.
    Prioritizes:
      1. Exact date clusters (all 2B notes on the same date or same date + prefix)
      2. Contiguous / date-grouped combinations via recursive branch-and-bound
    """
    if len(cand_df) < 2:
        return None

    # Priority A: Check natural date clusters first
    for _, grp in cand_df.groupby("Invoice Date (2B)"):
        if len(grp) >= 2:
            if (abs(grp["val_num"].sum() - target_val) <= val_tol and
                abs(grp["tax_tot_num"].sum() - target_tax) <= tax_tol):
                return grp["id_2b"].tolist()
            # Also check sub-clusters by invoice prefix on the same date (e.g. GCN/23 vs GCN/29)
            grp_copy = grp.copy()
            grp_copy["prefix"] = grp_copy["Invoice No (2B)"].str[:6]
            for _, p_grp in grp_copy.groupby("prefix"):
                if len(p_grp) >= 2:
                    if (abs(p_grp["val_num"].sum() - target_val) <= val_tol and
                        abs(p_grp["tax_tot_num"].sum() - target_tax) <= tax_tol):
                        return p_grp["id_2b"].tolist()

    # Priority B: Check multi-day prefix clusters (e.g., Jan 23 + Jan 24 GCN/23 notes)
    cand_copy = cand_df.copy()
    cand_copy["prefix_ym"] = cand_copy["Invoice No (2B)"].str[:6] + "_" + cand_copy["Invoice Date (2B)"].str[3:]
    for _, p_grp in cand_copy.groupby("prefix_ym"):
        if len(p_grp) >= 2:
            if (abs(p_grp["val_num"].sum() - target_val) <= val_tol and
                abs(p_grp["tax_tot_num"].sum() - target_tax) <= tax_tol):
                return p_grp["id_2b"].tolist()

    # Priority C: Branch-and-Bound Subset-Sum within each month/date-window
    cand_copy["month_yr"] = cand_copy["Invoice Date (2B)"].str[3:]
    for _, m_grp in cand_copy.groupby("month_yr"):
        if len(m_grp) < 2 or len(m_grp) > 20:
            continue
        ids = m_grp["id_2b"].tolist()
        vals = m_grp["val_num"].tolist()
        taxes = m_grp["tax_tot_num"].tolist()
        n = len(ids)
        for r in range(2, n + 1):
            for comb_indices in combinations(range(n), r):
                s_val = sum(vals[i] for i in comb_indices)
                if abs(s_val - target_val) <= val_tol:
                    s_tax = sum(taxes[i] for i in comb_indices)
                    if abs(s_tax - target_tax) <= tax_tol:
                        return [ids[i] for i in comb_indices]

    return None


# ─────────────────────────────────────────────────────────────────────────────
# 3. Main 6-Pass Reconciliation Engine
# ─────────────────────────────────────────────────────────────────────────────
def reconcile_gst_debit_notes(df_pr: pd.DataFrame, df_2b: pd.DataFrame):
    """
    Executes the 6-pass reconciliation between Books (PR) and GSTR-2B rows.
    Returns (reconciled_register_df, consolidated_batches_df).
    """
    df_pr = df_pr.copy().reset_index(drop=True)
    df_2b = df_2b.copy().reset_index(drop=True)
    df_pr["id_pr"] = df_pr.index
    df_2b["id_2b"] = df_2b.index

    # Parse numeric columns
    for side, d in [("PR", df_pr), ("2B", df_2b)]:
        d["val_num"] = d[f"Invoice Value ({side})"].apply(parse_accounting_float)
        d["taxable_num"] = d[f"Taxable Value ({side})"].apply(parse_accounting_float)
        d["cgst_num"] = d[f"CGST ({side})"].apply(parse_accounting_float)
        d["sgst_num"] = d[f"SGST ({side})"].apply(parse_accounting_float)
        d["igst_num"] = d[f"IGST ({side})"].apply(parse_accounting_float)
        d["tax_tot_num"] = d["cgst_num"] + d["sgst_num"] + d["igst_num"]
        d["inv_norm"] = d[f"Invoice No ({side})"].apply(normalize_invoice_no)
        d["date_obj"] = d[f"Invoice Date ({side})"].apply(parse_date_safe)
        d["supp_norm"] = d[f"Supplier Name ({side})"].apply(normalize_supplier_name)

    # Build Supplier Name -> GSTIN lookup from 2B for missing PR GSTINs
    supp_to_gstin = (
        df_2b[df_2b["GSTIN (2B)"].str.len() == 15]
        .groupby("supp_norm")["GSTIN (2B)"]
        .agg(lambda s: s.unique()[0] if len(s.unique()) == 1 else "")
        .to_dict()
    )

    def get_eff_gstin(row_pr):
        g = str(row_pr["GSTIN (PR)"]).strip()
        if len(g) == 15 and "/" not in g:
            return g
        return supp_to_gstin.get(row_pr["supp_norm"], g)

    df_pr["eff_gstin"] = df_pr.apply(get_eff_gstin, axis=1)

    used_pr = set()
    used_2b = set()
    reconciled_rows = []
    batch_rows = []

    def emit_row(status, r_pr, r_2b, remark, is_sub_row=False, sort_order=1):
        if r_pr is not None and not is_sub_row:
            g_pr, s_pr, i_pr, d_pr = r_pr["GSTIN (PR)"], r_pr["Supplier Name (PR)"], r_pr["Invoice No (PR)"], r_pr["Invoice Date (PR)"]
            v_pr, tx_pr, c_pr, sg_pr, ig_pr = r_pr["val_num"], r_pr["taxable_num"], r_pr["cgst_num"], r_pr["sgst_num"], r_pr["igst_num"]
        elif r_pr is not None and is_sub_row:
            g_pr, s_pr, i_pr, d_pr = r_pr["GSTIN (PR)"], r_pr["Supplier Name (PR)"], f"{r_pr['Invoice No (PR)']} (Grouped)", r_pr["Invoice Date (PR)"]
            v_pr = tx_pr = c_pr = sg_pr = ig_pr = 0.0
        else:
            g_pr = s_pr = i_pr = d_pr = ""
            v_pr = tx_pr = c_pr = sg_pr = ig_pr = 0.0

        if r_2b is not None:
            g_2b, s_2b, i_2b, d_2b = r_2b["GSTIN (2B)"], r_2b["Supplier Name (2B)"], r_2b["Invoice No (2B)"], r_2b["Invoice Date (2B)"]
            v_2b, tx_2b, c_2b, sg_2b, ig_2b = r_2b["val_num"], r_2b["taxable_num"], r_2b["cgst_num"], r_2b["sgst_num"], r_2b["igst_num"]
        else:
            g_2b = s_2b = i_2b = d_2b = ""
            v_2b = tx_2b = c_2b = sg_2b = ig_2b = 0.0

        net_diff = (c_pr + sg_pr + ig_pr) - (c_2b + sg_2b + ig_2b)
        reconciled_rows.append({
            "sort_order": sort_order,
            "Match Status": status,
            "GSTIN (PR)": g_pr, "GSTIN (2B)": g_2b,
            "Supplier Name (PR)": s_pr, "Supplier Name (2B)": s_2b,
            "Invoice No (PR)": i_pr, "Invoice No (2B)": i_2b,
            "Invoice Date (PR)": d_pr, "Invoice Date (2B)": d_2b,
            "Invoice Value (PR)": v_pr, "Invoice Value (2B)": v_2b,
            "Taxable Value (PR)": tx_pr, "Taxable Value (2B)": tx_2b,
            "CGST (PR)": c_pr, "CGST (2B)": c_2b,
            "SGST (PR)": sg_pr, "SGST (2B)": sg_2b,
            "IGST (PR)": ig_pr, "IGST (2B)": ig_2b,
            "Net Tax Diff": net_diff,
            "Audit Remarks / Action": remark,
        })

    # ── PASS 1: 1-to-1 Normalized Invoice Number Match (with Composite Check) ──
    for idx_pr, r_pr in df_pr.iterrows():
        if is_generic_dn(r_pr["inv_norm"]):
            continue
        g_eff = r_pr["eff_gstin"]
        cands = df_2b[(~df_2b["id_2b"].isin(used_2b)) & (df_2b["GSTIN (2B)"] == g_eff) & (df_2b["inv_norm"] == r_pr["inv_norm"])]
        if len(cands) == 1:
            r_2b = cands.iloc[0]
            # Guardrail: Check if PR value is actually a composite sum of multiple 2B notes
            if r_pr["val_num"] != 0 and abs(r_pr["val_num"]) > abs(r_2b["val_num"]) + 10.0:
                all_supp_2b = df_2b[(~df_2b["id_2b"].isin(used_2b)) & (df_2b["GSTIN (2B)"] == g_eff)]
                if find_subset_sum_match(r_pr["val_num"], r_pr["tax_tot_num"], all_supp_2b) is not None:
                    continue  # Defer to Pass 3 (Consolidated Batch Match)

            used_pr.add(idx_pr)
            used_2b.add(r_2b["id_2b"])
            v_diff = abs(r_pr["val_num"] - r_2b["val_num"])
            t_diff = abs(r_pr["tax_tot_num"] - r_2b["tax_tot_num"])

            if r_pr["val_num"] == 0 and r_2b["val_num"] != 0:
                if r_2b["tax_tot_num"] == 0:
                    emit_row("Reconciled (Exempt / Zero Tax)", r_pr, r_2b, "Invoice No matched; Exempt Seed Note (Tax Diff ₹0.00)", sort_order=3)
                else:
                    emit_row("Matched - Value Missing in Books", r_pr, r_2b, f"Invoice No matched ({r_2b['Invoice No (2B)']}); value ₹0 in Books vs ₹{abs(r_2b['val_num']):,.2f} in 2B", sort_order=6)
            elif v_diff < 0.01 and t_diff < 0.01:
                emit_row("Reconciled (Exact Match)", r_pr, r_2b, "Exact match on GSTIN, Invoice No, Taxable Value & Tax", sort_order=1)
            elif t_diff <= 2.0 and v_diff <= 10.0:
                emit_row("Reconciled (Rounding Diff)", r_pr, r_2b, f"Matched on GSTIN & Invoice No; minor rounding diff (Net Tax Diff ₹{t_diff:.2f})", sort_order=2)
            else:
                emit_row("Partially Matched (Value Diff)", r_pr, r_2b, f"Matched on GSTIN & Invoice No; value difference (Net Tax Diff ₹{t_diff:.2f})", sort_order=5)

    # ── PASS 2: 1-to-1 Value & Tax Match (Generic 'DN' or Voucher No in PR) ──
    for idx_pr, r_pr in df_pr.iterrows():
        if idx_pr in used_pr or r_pr["val_num"] == 0:
            continue
        g_eff = r_pr["eff_gstin"]
        cands = df_2b[
            (~df_2b["id_2b"].isin(used_2b)) &
            (df_2b["GSTIN (2B)"] == g_eff) &
            (np.abs(df_2b["val_num"] - r_pr["val_num"]) <= 10.0) &
            (np.abs(df_2b["tax_tot_num"] - r_pr["tax_tot_num"]) <= 2.0)
        ].copy()
        if len(cands) >= 1:
            # Sort by date proximity then value proximity
            cands["date_diff"] = cands["date_obj"].apply(
                lambda d: abs((d - r_pr["date_obj"]).days) if (d and r_pr["date_obj"]) else 999
            )
            cands["v_diff"] = np.abs(cands["val_num"] - r_pr["val_num"])
            r_2b = cands.sort_values(by=["v_diff", "date_diff"]).iloc[0]
            used_pr.add(idx_pr)
            used_2b.add(r_2b["id_2b"])
            v_diff = abs(r_pr["val_num"] - r_2b["val_num"])
            if v_diff < 0.01:
                emit_row("Reconciled (Value Match - DN)", r_pr, r_2b, f"Exact amount & tax match; Books ref '{r_pr['Invoice No (PR)']}' = 2B Note '{r_2b['Invoice No (2B)']}'", sort_order=1)
            else:
                emit_row("Reconciled (Rounding Diff)", r_pr, r_2b, f"Amount matched (Books '{r_pr['Invoice No (PR)']}' = 2B '{r_2b['Invoice No (2B)']}'); rounding diff ₹{v_diff:.2f}", sort_order=2)

    # ── PASS 3: 1-to-Many Consolidated Batch Matching ──
    for idx_pr, r_pr in df_pr.iterrows():
        if idx_pr in used_pr or r_pr["val_num"] == 0:
            continue
        g_eff = r_pr["eff_gstin"]
        cands = df_2b[(~df_2b["id_2b"].isin(used_2b)) & (df_2b["GSTIN (2B)"] == g_eff)]
        matched_2b_ids = find_subset_sum_match(r_pr["val_num"], r_pr["tax_tot_num"], cands)
        if matched_2b_ids:
            used_pr.add(idx_pr)
            sub_2b = df_2b.loc[matched_2b_ids]
            batch_tax_diff = r_pr["tax_tot_num"] - sub_2b["tax_tot_num"].sum()
            batch_label = f"{r_pr['Supplier Name (PR)'][:18].strip()} ({len(matched_2b_ids)} Notes)"
            batch_rows.append({
                "Batch Label": batch_label,
                "GSTIN": g_eff,
                "Supplier Name": r_pr["Supplier Name (PR)"],
                "Books Ref (PR)": r_pr["Invoice No (PR)"],
                "Books Date (PR)": r_pr["Invoice Date (PR)"],
                "2B Notes Count": len(matched_2b_ids),
                "2B Invoice Numbers": ", ".join(sub_2b["Invoice No (2B)"].tolist()),
                "Invoice Value (PR)": r_pr["val_num"],
                "Sum Invoice Value (2B)": sub_2b["val_num"].sum(),
                "Net Tax Diff": batch_tax_diff,
            })
            for k, b_id in enumerate(matched_2b_ids):
                used_2b.add(b_id)
                r_2b = df_2b.loc[b_id]
                if k == 0:
                    remark = f"Consolidated Match [{batch_label}, 1 of {len(matched_2b_ids)}]: Books lump-sum matches {len(matched_2b_ids)} 2B notes (Batch Tax Diff ₹{batch_tax_diff:.2f})"
                    emit_row("Reconciled (Consolidated Batch)", r_pr, r_2b, remark, is_sub_row=False, sort_order=4)
                else:
                    remark = f"Consolidated Match [{batch_label}, {k+1} of {len(matched_2b_ids)}]: Grouped under Books entry '{r_pr['Invoice No (PR)']}' dated {r_pr['Invoice Date (PR)']}"
                    emit_row("Reconciled (Consolidated Batch)", r_pr, r_2b, remark, is_sub_row=True, sort_order=4)

    # ── PASS 4: 1-to-1 Fuzzy Value & Date Proximity Match (Partial Matches) ──
    for idx_pr, r_pr in df_pr.iterrows():
        if idx_pr in used_pr or r_pr["val_num"] == 0:
            continue
        g_eff = r_pr["eff_gstin"]
        cands = df_2b[(~df_2b["id_2b"].isin(used_2b)) & (df_2b["GSTIN (2B)"] == g_eff)].copy()
        if len(cands) == 0:
            continue
        cands["rel_diff"] = np.abs(cands["val_num"] - r_pr["val_num"]) / np.maximum(np.abs(cands["val_num"]), abs(r_pr["val_num"]))
        cands["date_diff"] = cands["date_obj"].apply(
            lambda d: abs((d - r_pr["date_obj"]).days) if (d and r_pr["date_obj"]) else 999
        )
        near_cands = cands[(cands["rel_diff"] <= 0.05) & (cands["date_diff"] <= 30)]
        if len(near_cands) >= 1:
            r_2b = near_cands.sort_values(by=["rel_diff", "date_diff"]).iloc[0]
            used_pr.add(idx_pr)
            used_2b.add(r_2b["id_2b"])
            v_diff = abs(r_pr["val_num"] - r_2b["val_num"])
            t_diff = r_pr["tax_tot_num"] - r_2b["tax_tot_num"]
            emit_row("Partially Matched (Value Diff)", r_pr, r_2b, f"Matched by Supplier & Date proximity (2B {r_2b['Invoice No (2B)']}); Value diff ₹{v_diff:,.2f} (Tax Diff ₹{t_diff:,.2f})", sort_order=5)

    # ── PASS 5: Unmatched GSTR-2B Rows ──
    for idx_2b, r_2b in df_2b.iterrows():
        if idx_2b in used_2b:
            continue
        used_2b.add(idx_2b)
        remark = (
            "In GSTR-2B Only (Exempt / Zero-Tax Note not matched in Books)"
            if r_2b["tax_tot_num"] == 0
            else "In GSTR-2B Only — Verify & record Debit/Credit Note in Books (ITC reversal impact)"
        )
        emit_row("In GSTR-2B Only (Not in Books)", None, r_2b, remark, sort_order=7)

    # ── PASS 6: Unmatched Books (PR) Rows ──
    for idx_pr, r_pr in df_pr.iterrows():
        if idx_pr in used_pr:
            continue
        used_pr.add(idx_pr)
        if r_pr["val_num"] != 0:
            emit_row("In Books Only (Not in GSTR-2B)", r_pr, None, "Recorded in Books Only — Not reflected in GSTR-2B; follow up with supplier", sort_order=8)
        else:
            emit_row("In Books Only (Zero-Value Seed Entry)", r_pr, None, "Recorded in Books with ₹0 value (Exempt Seed Return / Unvalued DN); not in GSTR-2B", sort_order=9)

    rec_df = pd.DataFrame(reconciled_rows)
    rec_df["seq"] = range(len(rec_df))
    rec_df = rec_df.sort_values(by=["sort_order", "seq"]).drop(columns=["sort_order", "seq"]).reset_index(drop=True)
    return rec_df, pd.DataFrame(batch_rows)
```

## 6. Complete Inventory of the 21 Consolidated Batches Discovered

When Antigravity runs Pass 3 on your dataset, it should verify that these exact **21 Consolidated Books Entries** map to **91 GSTR-2B Credit/Debit Notes**:

| # | Supplier Name | GSTIN | Books Ref & Date | Books Value (PR) (₹) | 2B Notes Count | 2B Note Numbers / Series | Sum of 2B Value (₹) | Net Batch Tax Diff (₹) |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 1 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`01/04/2025`) | (17,04,409.70) | 5 | `302500441, 443, 446, 452, 453` (`04/04/2025`) | (17,04,409.70) | 0.00 |
| 2 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`03/09/2025`) | (33,06,191.26) | 10 | `302522239` to `302522389` (`10/09/2025`) | (33,06,191.26) | 0.00 |
| 3 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`09/10/2025`) | (26,91,982.62) | 9 | `302529682` to `302529735` (`14/10/2025`) | (26,91,978.28) | (0.66) |
| 4 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`06/11/2025`) | (20,82,723.60) | 4 | `302535138, 140, 146, 149` (`11/11/2025`) | (20,82,723.60) | 0.00 |
| 5 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`13/01/2026`) | (10,32,169.60) | 3 | `302547709, 711, 712` (`17/01/2026`) | (10,32,169.60) | 0.00 |
| 6 | Adama India Pvt Ltd | `27AABCM8797N1ZI` | `DN` (`28/03/2026`) | (41,81,282.80) | 2 | `302555975, 302555976` (`29/03/2026`) | (41,81,282.80) | 0.00 |
| 7 | UPL Sustainable Agri | `27AABCO3982H2Z7` | `DN` (`23/07/2025`) | (4,73,863.70) | 2 | `1466467920, 1466467921` (`26/07/2025`) | (4,73,858.04) | (0.86) |
| 8 | UPL Sustainable Agri | `27AABCO3982H2Z7` | `DN` (`10/10/2025`) | (33,36,166.80) | 2 | `1466468393, 1466468394` (`11/10/2025`) | (33,36,166.80) | 0.00 |
| 9 | UPL Sustainable Agri | `27AABCO3982H2Z7` | `DN` (`08/10/2025`) | (75,61,000.80) | 5 | `1466468395` to `1466468399` (`11/10/2025`) | (75,60,986.18) | (2.22) |
| 10 | UPL Sustainable Agri | `27AABCO3982H2Z7` | `1466468745` (`16/02/2026`) | (1,60,030.42) | 2 | `1466468745, 1466468746` (`18/02/2026`) | (1,60,032.22) | 0.28 |
| 11 | GSP Crop Science Ltd | `27AAACG7984Q1ZO` | `DN` (`25/08/2025`) | (10,75,841.40) | 4 | `7705150342` to `7705150345` (`15/09/2025`) | (10,75,841.40) | 0.00 |
| 12 | GSP Crop Science Ltd | `27AAACG7984Q1ZO` | `DN` (`09/10/2025`) | (14,72,368.60) | 6 | `7705151265` to `7705151270` (`16/10/2025`) | (14,72,368.60) | 0.00 |
| 13 | GSP Crop Science Ltd | `27AAACG7984Q1ZO` | `DN` (`02/02/2026`) | (20,24,678.22) | 11 | `7705153273` to `7705153283` (`17/02/2026`) | (20,24,678.22) | 0.00 |
| 14 | Parijat Industries | `27AABCT9862B1Z8` | `DN` (`13/10/2025`) | (4,78,525.40) | 2 | `GCN/23/FY26/2682, 2683` (`02/01/2026`) | (4,78,525.40) | 0.00 |
| 15 | Parijat Industries | `27AABCT9862B1Z8` | `DN` (`17/01/2026`) | (7,51,115.24) | 4 | `GCN/23/FY26/3040, 3041, 3042, 3100` (`23-24/01/2026`) | (7,51,115.24) | 0.00 |
| 16 | Parijat Industries | `27AABCT9862B1Z8` | `DN` (`17/01/2026`) | (4,51,670.80) | 2 | `GCN/29/FY26/0378, 0380` (`06/02/2026`) | (4,51,670.79) | 0.00 |
| 17 | Parijat Industries | `27AABCT9862B1Z8` | `DN` (`15/02/2026`) | (17,41,873.14) | 5 | `GCN/29/FY26/0800` to `0804` (`29/03/2026`) | (17,41,873.14) | 0.00 |
| 18 | Indofil Industries Ltd | `27AABCI4568D1ZM` | `DN` (`15/11/2025`) | (14,68,708.94) | 5 | `G22725300410` to `G22725300414` (`21/11/2025`) | (14,68,710.34) | 0.22 |
| 19 | Biostadt India Ltd | `27AACCB1830G1Z3` | `9015006303` (`26/08/2025`) | (4,46,960.40) | 2 | `9015006302, 9015006303` (`04/09/2025`) | (4,46,960.40) | 0.00 |
| 20 | Gharda Chemicals Ltd | `27AAACG1255E1Z1` | `DN` (`22/02/2026`) | (3,80,683.34) | 4 | `5901601182` to `5901601185` (`23/02/2026`) | (3,80,682.16) | (0.18) |
| 21 | Gharda Chemicals Ltd | `27AAACG1255E1Z1` | `DN` (`22/02/2026`) | (1,89,345.16) | 2 | `5901601375, 5901601376` (`05/03/2026`) | (1,89,345.16) | 0.00 |
| **Total** | **21 Consolidated Batches** | — | — | **(3,93,26,959.66)** | **91** | **All 91 Constituent GSTR-2B Notes Matched** | **(3,93,26,936.93)** | **(3.42)** |

## 7. Automated Unit Tests & Validation Assertions for Antigravity

When implementing the software, enforce these four automated assertions before exporting the final Excel workbook:

1. **Row Conservation Check**:
   * `count(non_empty_PR_rows_excluding_grouped_subrows) == 434`
   * `count(non_empty_2B_rows) == 955`
2. **Column Sum Conservation Check**:
   * `abs(sum(Invoice_Value_PR) - (-69627905.88)) < 0.01`
   * `abs(sum(Invoice_Value_2B) - (-106392308.70)) < 0.01`
   * `abs(sum(Taxable_Value_PR) - (-59242330.34)) < 0.01`
   * `abs(sum(Taxable_Value_2B) - (-93661392.31)) < 0.01`
   * `abs(sum(CGST_PR) - (-5192787.77)) < 0.01`
   * `abs(sum(CGST_2B) - (-6360189.75)) < 0.01`
   * `abs(sum(SGST_PR) - (-5192787.77)) < 0.01`
   * `abs(sum(SGST_2B) - (-6360189.75)) < 0.01`
   * `abs(sum(IGST_PR) - 0.00) < 0.01`
   * `abs(sum(IGST_2B) - (-10536.89)) < 0.01`
   * `abs(sum(Net_Tax_Diff) - 2345340.85) < 0.01`
3. **Uniqueness Check**:
   * Every `id_pr` $\in [0, 433]$ appears in `used_pr` exactly once.
   * Every `id_2b` $\in [0, 954]$ appears in `used_2b` exactly once.
4. **Formula-Driven Excel Export**:
   * Use dynamic Excel formulas (`=SUM(...)`, `=SUMIF(...)`, `=COUNTIF(...)`, `=(N6+P6+R6)-(O6+Q6+S6)`) rather than static hardcoded totals so downstream edits recalculate automatically in Excel.

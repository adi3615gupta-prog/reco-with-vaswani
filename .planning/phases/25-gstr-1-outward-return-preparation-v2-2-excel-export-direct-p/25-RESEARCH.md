# Phase 25 Research: Official Offline Tool & TaxPower GST Reverse-Engineering

## 1. Executive Summary
This document synthesizes forensic architectural analysis from two primary sources:
1. **GST Offline Tool.exe (Release 3.2.4):** Decompressed Inno Setup LZMA stream containing the official NW.js / Express.js portal offline engine, schema rules, and 32-sheet Excel template (`GSTR1_Excel_Workbook_Template_V2.2.xlsx`).
2. **TaxPower GST (`D:\Magnum Infosystem\TaxPower GST`):** Decompiled .NET assemblies, Tally connector, SQL options schema, Rule 88A set-off request model, reconciliation engine options, and Excel audit comparison workbooks (`GSTR1-AllInOne.xlsx`, `CompareGSTR3BWithGSTR1Detailed.xlsx`, `CompareGSTR3BWithBooksNew.xlsx`).

---

## 2. GST Offline Tool Official Schemas

### Top-Level Attributes
```json
{
  "gstin": "STRING(15)",
  "fp": "MMYYYY (e.g. 092026)",
  "gt": 0.00,
  "cur_gt": 0.00,
  "version": "GSTR1_V3.2.4",
  "hash": "hash_string"
}
```

### Table 4: B2B, SEZ, DE (`b2b`)
```json
[
  {
    "ctin": "27AAGCD4105L1ZO",
    "cfs": "Y",
    "inv": [
      {
        "inum": "INV-2026-001",
        "idt": "15-09-2026",
        "val": 118000.00,
        "pos": "27",
        "rchrg": "N",
        "inv_typ": "R",
        "itms": [
          {
            "num": 1,
            "itm_det": {
              "txval": 100000.00,
              "rt": 18.0,
              "iamt": 0.0,
              "camt": 9000.0,
              "samt": 9000.0,
              "csamt": 0.0
            }
          }
        ]
      }
    ]
  }
]
```

### Table 5: B2CL (Inter-State Unregistered > ₹1,00,000) (`b2cl`)
```json
[
  {
    "pos": "24",
    "inv": [
      {
        "inum": "B2CL-001",
        "idt": "18-09-2026",
        "val": 150000.00,
        "itms": [
          {
            "num": 1,
            "itm_det": {
              "txval": 127118.64,
              "rt": 18.0,
              "iamt": 22881.36,
              "csamt": 0.0
            }
          }
        ]
      }
    ]
  }
]
```

### Table 7: B2CS (Consolidated Intra-State or Inter-State $\le$ ₹1,00,000) (`b2cs`)
```json
[
  {
    "sply_ty": "INTER",
    "pos": "24",
    "typ": "OE",
    "txval": 45000.00,
    "rt": 18.0,
    "iamt": 8100.00,
    "csamt": 0.00
  },
  {
    "sply_ty": "INTRA",
    "pos": "27",
    "typ": "OE",
    "txval": 80000.00,
    "rt": 18.0,
    "camt": 7200.00,
    "samt": 7200.00,
    "csamt": 0.00
  }
]
```

### Table 9B: Registered & Unregistered Credit/Debit Notes (`cdnr` & `cdnur`)
Delinked structure — no `oinum` or `oidt` required:
```json
[
  {
    "ctin": "27AAGCD4105L1ZO",
    "cfs": "Y",
    "nt": [
      {
        "ntty": "C",
        "nt_num": "CRN-001",
        "nt_dt": "22-09-2026",
        "val": 11800.00,
        "pos": "27",
        "rchrg": "N",
        "itms": [
          {
            "num": 1,
            "itm_det": {
              "txval": 10000.00,
              "rt": 18.0,
              "camt": 900.0,
              "samt": 900.0,
              "csamt": 0.0
            }
          }
        ]
      }
    ]
  }
]
```

### Table 12: Bifurcated HSN Summary (`hsn`)
```json
"hsn": {
  "hsn_b2b": [
    {
      "num": 1,
      "hsn_sc": "847130",
      "desc": "Portable automatic data processing machines",
      "uqc": "NOS-NUMBERS",
      "qty": 5.0,
      "val": 250000.00,
      "txval": 211864.41,
      "rt": 18.0,
      "iamt": 0.0,
      "camt": 19067.80,
      "samt": 19067.80,
      "csamt": 0.0
    }
  ],
  "hsn_b2c": [
    {
      "num": 1,
      "hsn_sc": "847130",
      "desc": "Portable automatic data processing machines",
      "uqc": "NOS-NUMBERS",
      "qty": 2.0,
      "val": 100000.00,
      "txval": 84745.76,
      "rt": 18.0,
      "iamt": 15254.24,
      "camt": 0.0,
      "samt": 0.0,
      "csamt": 0.0
    }
  ]
}
```

### Table 13: Documents Issued (`doc_issue`)
```json
"doc_issue": {
  "doc_det": [
    {
      "doc_num": 1,
      "doc_typ": "Invoices for outward supply",
      "docs": [
        {
          "num": 1,
          "from": "INV-2026-001",
          "to": "INV-2026-150",
          "totnum": 150,
          "canc": 2,
          "net_issue": 148
        }
      ]
    }
  ]
}
```

---

## 3. Official V2.2 Excel Workbook Sheet Manifest (32 Sheets)
The workbook `GSTR1_Excel_Workbook_Template_V2.2.xlsx` contains:
1. `Help Instruction`, 2. `b2b,sez,de`, 3. `b2ba`, 4. `b2cl`, 5. `b2cla`, 6. `b2cs`, 7. `b2csa`, 8. `cdnr`, 9. `cdnra`, 10. `cdnur`, 11. `cdnura`, 12. `exp`, 13. `expa`, 14. `at`, 15. `ata`, 16. `atadj`, 17. `atadja`, 18. `exemp`, 19. `hsn(b2b)`, 20. `hsn(b2c)`, 21. `docs`, 22. `eco`, 23. `ecoa`, 24. `ecob2b`, 25. `ecourp2b`, 26. `ecob2c`, 27. `ecourp2c`, 28. `ecoab2b`, 29. `ecoab2c`, 30. `ecoaurp2b`, 31. `ecoaurp2c`, 32. `master`.

---

## 4. Forensic Reverse-Engineering of TaxPower GST

### A. Tally Connector & Unit UQC Normalization (`tallyUnitUqcMap`)
In `TaxPowerGST.Core.Helper.TallyFunctions` and `TaxPowerGSTTallyConnector.dll`:
- Arbitrary custom units created by accountants in Tally are normalized to the GSTN official UQC table before assembling Table 12 HSN:
```typescript
export const TALLY_UNIT_UQC_MAP: Record<string, string> = {
  'PCS': 'NOS-NUMBERS',
  'NOS': 'NOS-NUMBERS',
  'NUM': 'NOS-NUMBERS',
  'UNIT': 'NOS-NUMBERS',
  'BOX': 'BOX-BOX',
  'PKT': 'PAC-PACKETS',
  'PAC': 'PAC-PACKETS',
  'BAG': 'BAG-BAGS',
  'BGS': 'BAG-BAGS',
  'KGS': 'KGS-KILOGRAMS',
  'KG': 'KGS-KILOGRAMS',
  'GMS': 'GMS-GRAMS',
  'GM': 'GMS-GRAMS',
  'MTR': 'MTR-METRES',
  'MET': 'MTR-METRES',
  'CMS': 'CMS-CENTIMETRES',
  'LTR': 'LTR-LITRES',
  'LIT': 'LTR-LITRES',
  'MLT': 'MLT-MILLILITRE',
  'DOZ': 'DOZ-DOZENS',
  'SET': 'SET-SETS',
  'ROL': 'ROL-ROLLS',
  'ROLL': 'ROL-ROLLS',
  'CAN': 'CAN-CANS',
  'BTL': 'BTL-BOTTLES',
  'QTL': 'QTL-QUINTAL',
  'TUB': 'TUB-TUBES',
  'BND': 'BND-BUNDLES',
  'PRS': 'PRS-PAIRS',
  'THD': 'THD-THOUSANDS',
  'SQF': 'SQF-SQUARE FEET',
  'SQM': 'SQM-SQUARE METRES',
  'SQY': 'SQY-SQUARE YARDS',
  'TON': 'TON-TONNES',
  'MT': 'TON-TONNES',
  'DRM': 'DRM-DRUMS',
  'KLR': 'KLR-KILOLITRE',
  'OTH': 'OTH-OTHERS'
};
```

### B. Table 13 Document Series Gap Analyzer (`TallyDocIssuedMapper`)
TaxPower extracts consecutive invoice numbers and applies regular expression decomposition:
```regex
^([A-Za-z0-9\/\-_]*?)(\d+)([A-Za-z0-9\/\-_]*)$
```
- Groups by common series (`prefix + suffix`).
- Sorts numeric serial integers: `[1, 2, 3, 5, 6, 7]`.
- Identifies starting serial (`from`), ending serial (`to`), total range count (`to - from + 1`).
- Identifies missing integers in the range (`[4]`), tallying them as cancelled documents (`canc`).
- Computes `net_issue = totnum - canc`.

### C. All-In-One Flat Register Format (`GSTR1-AllInOne.xlsx`)
- Two-sheet flat workbook:
  - Sheet 1: `Sales` (26 Columns: GSTIN/UIN, Receiver Name, Invoice Number, Invoice Date, Invoice Value, Place of Supply, Reverse Charge, Applicable % of Rate, Invoice Type, E-Commerce GSTIN, Rate, Taxable Value, Cess Amount, HSN/SAC, Description, Quantity, Unit, Export Type, Shipping Bill No, Shipping Bill Date, Port Code).
  - Sheet 2: `CDN` (Note Number, Note Date, Note Type C/D, Note Value, etc.).
- TaxPower parser reads both sheets, derives B2B, B2CL (> ₹1L inter-state unregistered), B2CS, EXP, Nil, and bifurcated HSN (B2B/B2C).

### D. DRC-01B Outward Difference Workbook (`CompareGSTR3BWithGSTR1Detailed.xlsx`)
- Line-by-line comparison between GSTR-3B Table 3.1 and GSTR-1:
  1. Outward Taxable Supplies (Table 3.1(a) vs Table 4+5+7+9B)
  2. Zero-Rated Supplies / Exports (Table 3.1(b) vs Table 6A)
  3. Other Outward Supplies - Nil/Exempted (Table 3.1(c) vs Table 8)
  4. Inward Supplies Liable to Reverse Charge (Table 3.1(d) vs Table 4(A)(3))
  5. Non-GST Outward Supplies (Table 3.1(e))
- Alerts if Tax Difference exceeds ₹50,000 and 20% variance threshold.

### E. Books vs 3B Inward ITC Comparison Workbook (`CompareGSTR3BWithBooksNew.xlsx`)
- Compares Table 4 Inward ITC claimed in GSTR-3B vs Purchase Register (Books):
  - Row 1: All Other ITC Claimed (Table 4(A)(5) vs PR Tax)
  - Row 2: Inward Supplies Liable to RCM (Table 4(A)(3) vs PR RCM)
  - Row 3: Import of Goods (Table 4(A)(1) vs ICEGATE / PR)
  - Row 4: ITC Reversals (Table 4(B) vs PR Reversals)
- Explicitly isolates:
  - **Excess ITC Claimed in 3B** $\to$ Immediate DRC-01C demand liability.
  - **Short ITC Claimed in 3B** $\to$ Unclaimed credit eligible for refund or subsequent month claim prior to Sec 16(4) limitation.

### F. Rule 88A Mathematical Cash Liability Set-Off Optimizer
Decompiled model `TaxPowerGST.Core.GSTAPI.GSTR3B.Model.GSTR3BOffSetLiabilityGSTNRequest`:
```csharp
public class OpLiab2 {
    public decimal igst_igst_amt { get; set; }
    public decimal igst_cgst_amt { get; set; }
    public decimal igst_sgst_amt { get; set; }
    public decimal cgst_cgst_amt { get; set; }
    public decimal cgst_igst_amt { get; set; }
    public decimal sgst_sgst_amt { get; set; }
    public decimal sgst_igst_amt { get; set; }
    public decimal cess_cess_amt { get; set; }
}
```
- Strict Legal Algorithm:
  1. IGST liability is satisfied first from IGST credit.
  2. Remaining IGST credit is distributed between CGST and SGST liabilities to minimize cash payout.
  3. CGST credit is utilized for remaining CGST liability, then IGST (never SGST).
  4. SGST credit is utilized for remaining SGST liability, then IGST (never CGST).
  5. Net liability remaining after ITC utilization must be discharged via Electronic Cash Ledger (`UtilCsshReqVO`).

### G. Configurable Reconciliation Settings Options
Extracted from `TaxPowerGST.dbo.Options` and `ReconciliationSettingsWindow`:
- `ReconciliationConsiderPreviousYearInvoices` (Boolean)
- `ReconciliationFilterType` (`Document Date` vs `Document Period`)
- `ReconciliationConsiderInvoicesNextPeriod` (Boolean - handles timing differences)
- `GSTR2BConsiderITCNotAvailable` (Boolean - filters out ineligible invoices)
- `IgnoreMatchAmount` (Decimal tolerance: ₹1, ₹2, ₹5, ₹10)
- `ReconciliationDocumentNoMatchType` (`Exact` vs `Difference in Invoice No` vs `Core Serial`)
- `ConsiderRCMInvoicesGSTR2B98AReco` (Boolean)
- `EWBRecoInvValueGSTR1Amount` (E-Way bill vs GSTR-1 outward invoice value matcher)

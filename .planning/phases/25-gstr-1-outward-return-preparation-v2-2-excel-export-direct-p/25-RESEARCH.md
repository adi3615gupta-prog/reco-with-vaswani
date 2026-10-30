# Phase 25 Research: GSTR-1 Offline Tool Reverse-Engineering & Architecture Findings

## 1. Executive Summary
Reverse-engineering `GST Offline Tool.exe` (Release 3.2.4) by decompressing its Inno Setup LZMA stream revealed its complete architecture:
- **Runtime:** Node.js Express server running on `http://localhost:3010` wrapped in NW.js/HTA (`msie-app.hta`).
- **Internal Package:** `GSTR1-Offline` v2.2.3 with Infosys Artifactory dependencies.
- **Official Payload Generator:** Stringified JSON generator located in the controller that compiles outward tables into the exact format accepted by the GST Portal offline intake engine.

---

## 2. Decompressed Schema Specifications

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
`inv_typ` values:
- `R`: Regular B2B
- `DE`: Deemed Exports
- `SEWP`: SEZ Supplies with payment
- `SEWOP`: SEZ Supplies without payment
- `CBW`: Intra-state supplies attracting IGST

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
*Note:* Post-Aug 2024 threshold is ₹1,00,000. For older periods (prior to Aug 2024), threshold was ₹2,50,000.

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

### Tables 14 & 15: E-Commerce Operator (ECO) Supplies
- Table 14: `"supeco": { "clttx": [], "paytx": [] }`
- Table 14A: `"supecoa": { "clttxa": [], "paytxa": [] }`
- Table 15: `"ecom": { "b2b": [], "b2c": [], "urp2b": [], "urp2c": [] }`
- Table 15A: `"ecoma": { "b2ba": [], "b2ca": [], "urp2ba": [], "urp2ca": [] }`

---

## 3. Official V2.2 Excel Workbook Sheet Manifest
The workbook `GSTR1_Excel_Workbook_Template_V2.2.xlsx` contains 32 sheets:
1. `Help Instruction`
2. `b2b,sez,de`
3. `b2ba`
4. `b2cl`
5. `b2cla`
6. `b2cs`
7. `b2csa`
8. `cdnr`
9. `cdnra`
10. `cdnur`
11. `cdnura`
12. `exp`
13. `expa`
14. `at`
15. `ata`
16. `atadj`
17. `atadja`
18. `exemp`
19. `hsn(b2b)`
20. `hsn(b2c)`
21. `docs`
22. `eco`
23. `ecoa`
24. `ecob2b`
25. `ecourp2b`
26. `ecob2c`
27. `ecourp2c`
28. `ecoab2b`
29. `ecoab2c`
30. `ecoaurp2b`
31. `ecoaurp2c`
32. `master`

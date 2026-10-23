# Plan 06-08 Summary: GSTR-3B Official GSTN Offline JSON Schema Compliance (RT-SCVU101 Remediation)

## Execution Summary
Resolved the GST Portal offline upload rejection error `RT-SCVU101: The JSON which you are uploading is not valid` by reverse-engineering the official GSTN Excel utilities:
- `C:\Users\PC-10\Downloads\GSTR3B_Excel_Utility\GSTR3B_Excel_Utility\GSTR3B_Excel_Utility_V5.6.xlsm`
- `C:\Users\PC-10\Downloads\GSTR3B_Excel_Utility\GSTR3B_Excel_Utility\GSTR3B_Excel_Utility_V5.8.xlsm` (`Sheet1.cls` - `Private Sub export_in_json_format()`)

---

## 1. Root Causes Remediated

1. **Stripped Prohibited Key `sec_sum`:** Removed GSTR-1 summary block that previously caused instant schema rejection.
2. **Stripped Prohibited Key `tax_pmt`:** Removed Table 6.1 payment block (tax payment is handled online via portal cash ledger, strictly forbidden in offline JSON).
3. **Added Mandatory Table 3.1.1 (`eco_dtls`):** Injected `eco_sup` and `eco_reg_sup` mandatory since July 2022.
4. **Added Mandatory Table 5.1 (`intr_ltfee`):** Injected `intr_details` and `ltfee_details` objects.
5. **Structured Table 4(D) Ineligible ITC (`itc_inelg`):** Replaced empty array `[]` with required 2-element array containing `RUL` and `OTH` entries.
6. **Populated All 5 Tax Fields Across `sup_details`:** Provided full `{ txval, iamt, camt, samt, csamt }` across all rows.
7. **Fixed Double JSON Stringification in `ReturnsDashboard.tsx`:** Eliminated `JSON.stringify(portalJsonData)` wrapping an already stringified payload.
8. **Normalized Standard Filename:** Enforced `GSTR3B_{gstin}_{ret_period}.json` format across both export triggers.

---

## 2. Verification Results

- **Automated Schema Parity Test:** `npx tsx scratch/test_gstr3b_json_schema.ts` passed 100% assertions:
  - `sec_sum` absent: `PASS`
  - `tax_pmt` absent: `PASS`
  - `eco_dtls` (Table 3.1.1) present & compliant: `PASS`
  - `intr_ltfee` (Table 5.1) present & compliant: `PASS`
  - `itc_elg.itc_avl` (5 items: IMPG, IMPS, ISRC, ISD, OTH): `PASS`
  - `itc_elg.itc_rev` (2 items: RUL, OTH): `PASS`
  - `itc_elg.itc_inelg` (2 items: RUL, OTH): `PASS`
  - Exact numeric tie-out with DYP September 2026:
    - 3.1(a) Sales: ₹20,510,116.55, CGST: ₹1,839,311.29, SGST: ₹1,839,311.29
    - Table 4(A)(5) ITC: IGST ₹113,124.55, CGST ₹424,030.14, SGST ₹424,030.14
    - Table 4(C) Net ITC: IGST ₹113,124.55, CGST ₹426,469.11, SGST ₹426,469.11
- **Production Build:** `npm run build` completed cleanly without errors.

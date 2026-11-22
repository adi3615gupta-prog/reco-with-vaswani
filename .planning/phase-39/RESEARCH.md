# Phase 39 Research: GST & VAT Notices & Orders Autonomous Suite — A-to-Z Practice Encyclopedia & Codebase Gap Analysis

> **Evidence Base:** Exhaustive analysis of `E:\software test files\IMS_27AAGCD4105L1ZO_12102026_1\7. SCRUTINY FILES\1. GST & VAT` (56 CA client folders, 4,928+ files: 2,074 PDFs [1,694 text-based, 347 scanned/empty inspected visually, 33 password-protected/error], 1,349 Excel/CSV [403 Portal raw + 946 Custom Working/Reco], 226 `.docx`, 35 `.txt`, 92 `.zip` [55 case bundles], 9 `.rar`, `.xlsb` refund/MVAT utilities) mapped 1:1 against Module 12 (`notices/db.js`, `notices_routes.js`, `notices/autopilot.js`, `src/lib/noticeReconciliation.ts`, `src/lib/noticeReplyGenerator.ts`, `src/lib/noticeDocxExporter.ts`, `src/lib/geminiTaxEngine.ts`, `src/lib/piiSanitizer.ts`, `src/pages/GstNoticesDashboard.tsx`, `src/components/NoticeReplyWorkbenchModal.tsx`, `src/components/NoticePipelineVisualizer.tsx`).

---

## 1. A-to-Z GST, MVAT & Indirect Tax Form Encyclopedia

> **Parser Normalization Rule:** Portal PDFs frequently insert whitespace around hyphens (e.g., `FORM GST DRC - 01`, `GST ASMT - 10`, `FORM GST REG -19`, `FORM GST SPL -02`, `FORM GST APL – 04`). Classifier regex MUST normalize `\s*[-–]\s*` before matching form codes.

### 1.1 Pre-Scrutiny, Audit & Return Default Notices

| Form / Notice Type | Statutory Provision | Typical Deadline | Purpose & Observed Case Evidence |
|---|---|---|---|
| **GST ASMT-10** | Sec 61(1), Rule 99(1) | **30 days** (or explicit PH date) | Return scrutiny discrepancy intimation citing parameter codes (`0070`, `0073`, `0074`, `0077`, `0078`, `0080`, `0103`, `0127`, `0219`, `RFR-5`) via EIU/DGARM/PRAISE. *(Mastertech, Goyal Trading, Viraj, HCH Bearing)* |
| **GST ASMT-11** | Sec 61(2), Rule 99(2) | Within ASMT-10 period | Formal taxpayer reply submitting working sheets, 2A/2B reco, CA/Supplier certificates, or voluntary `DRC-03` proof. *(Mauli Construction, Parag Construction)* |
| **GST ASMT-12** (`SR_DrpProcd`) | Sec 61(2), Rule 99(3) | Final closure | Order of acceptance of ASMT-11 explanation and dropping scrutiny proceedings. *(Goyal Trading 2021-22)* |
| **GST ASMT-13** | Sec 62(1), Rule 100(1) | Best Judgment (30d to file pending return for auto-withdrawal) | Best-judgment assessment on non-filers after GSTR-3A; auto-deemed withdrawn if valid return filed within 30 days (+ Sec 16(6) relief). |
| **GST GSTR-3A** | Sec 46, Rule 68 | **15 days** | System/officer notice to non-filers of GSTR-3B, GSTR-9, or GSTR-9C. *(Balaji Enterprises, Destination Travel Solutions)* |
| **GSTR-10 Non-Filing Notice** | Sec 45, Rule 81 | **07 days** (incl. Personal Hearing) | Notice post registration cancellation (`3 months` from cancellation date or cancellation order date, whichever later). Threatens Sec 47(1) late fee (₹100 CGST + ₹100 SGST/day, max ₹5,000 each), Sec 122(1)(iii) ₹10,000 penalty, and Sec 62 Best Judgment. *(Bluesurf Engineering)* |
| **E-Way Bill Nil-Filer Notice** | Sec 37 / Rule 59 / 61 / CMD-08 | **07 days** | DG Audit / State Tax alert when taxpayer files **Nil GSTR-1 / Nil GSTR-3B** despite active **E-Way Bill generation** showing taxable movement. *(Revive Energies)* |
| **GST ADT-01 & Rule 101(4)** | Sec 65(1), Rule 101(1)/(4) | **15–30 days** | Departmental Audit commencement + document requisition (`ADT-01`), followed by Audit Discrepancy Notice u/r `101(4)` before finalizing report. *(Tilekart Pvt Ltd, Goyal Trading)* |
| **GST ADT-02** | Sec 65(6), Rule 101(5) | Leads to DRC-01 if unpaid | Final Audit Report detailing accepted vs unaccepted objections across 6 standard audit heads: 3B/9 vs 2A ITC, RC-cancelled ITC, RCM 9/3B vs GSTR-1, Sec 50 interest, Sec 17(5) blocked ITC, and GSTR-9 non-filing penalty (₹25k+₹25k). *(Tilekart Pvt Ltd)* |

### 1.2 Demand, Intimation, Adjudication & Rectification

| Form / Notice Type | Statutory Provision | Typical Deadline | Purpose & Observed Case Evidence |
|---|---|---|---|
| **GST DRC-01A (Part A / Part B)** | Sec 73(5) / 74(5) / 74A(8), Rule 142(1A) | **15 days** | Pre-SCN intimation of tax ascertained. Allows taxpayer to file **Part-B** objections or pay tax + (0%/15% penalty u/s 73/74/74A) + Sec 50 interest via `DRC-03` to drop proceedings before formal SCN. *(Adesh Kad `B-320` Drop, Ajay Garg NGTP, Deep Gas, DYP Infraprojects)* |
| **GST DRC-01 (Sec 73/74/74A)** | Sec 73(1) / 74(1) / 74A(1), Rule 142(1)(a) | **30 days** | Formal Show Cause Notice (`Sec 73` non-fraud, `Sec 74` fraud/suppression up to FY 2023-24, **`Sec 74A` unified framework FY 2024-25+**: 42m SCN / 48m Order). *Notice 30-day zero-penalty window u/s 73(8) & 15%/25% Tier u/s 74/74A(8).* *(Mauli Construction, Parth Valves, Solvi Enterprises, Prime Professional)* |
| **GST DRC-01 (Sec 125 Penalty SCN)** | Rule 100(2) & 142(1)(a), Sec 125 | **07 days** | Specific DRC-01 Variant imposing general penalty up to ₹50,000 (₹25k CGST + ₹25k SGST) for GSTR-3B non-filing/delay. *(Viraj Enterprises `ZD2709260238911`)* |
| **GST DRC-01B (Part A / Part B)** | Rule 88C, Sec 75(12) | **07 days** | Automated intimation where **GSTR-1 outward tax > GSTR-3B tax paid** beyond prescribed threshold. Requires Part-B explanation or DRC-03 payment else recoverable u/s 79 without Sec 73/74 SCN. |
| **GST DRC-01C (Part A / Part B)** | Rule 88D | **07 days** | Automated intimation where **GSTR-3B ITC > GSTR-2B ITC** beyond threshold. Observed **9 exact portal Part-B reasons**, including timing mismatch, ITC omitted in earlier periods, bona fide error, and **Real Estate commercial vs residential reclaim**. *(Pentagon Premises)* |
| **GST DRC-03 & DRC-03A** | Rule 142(2) & 142(2B) | On payment / Before Appeal/SPL | `DRC-03`: Voluntary payment challan (specify section: `Scrutiny`, `Intimation`, `SCN`, `Audit`, `Others`; track **Cash vs ITC** head-wise). **`DRC-03A`**: Critical utility linking an earlier `DRC-03` ARN (`AD...`) to a specific Demand Order ID (`ZD...`) in the Electronic Liability Register (mandatory before filing `SPL-02` waiver if tax was paid via DRC-03!). *(Pranav Industries, Goyal Trading, Mastertech)* |
| **GST DRC-05** (`AMYDT_DRPRC` / `ADJDT_DRPRC`) | Sec 73(8)/74(8), Rule 142(3) | Proceeding Dropped | Order concluding/dropping proceedings once SCN/Intimation reply or payment is accepted. *(Shripad Multi Product, DYP Infraprojects `ZD271122059207L`)* |
| **GST DRC-06** | Rule 142(4) | Within SCN window | Statutory electronic reply form to `DRC-01` attaching Statement of Facts, Rebuttal Grounds, Legal Precedents, and Request for Personal Hearing u/s 75(4). |
| **GST DRC-07 & Assessment Order** | Sec 73(9)/74(9)/74A, Rule 142(5) | **90 days** to Appeal (`APL-01`) | Summary of Demand Order confirming Tax, Interest, and Penalty. Must be checked for: proper service (Sec 169), PH grant (Sec 75(4)), overlap with parallel Investigation Wing orders *(Sai Readymix)*, and limitation. |
| **Standalone Sec 50(1) Interest Order / SCN** | Sec 50(1) r/w Sec 75(12) & Sec 79 | Immediate recovery risk | Direct order demanding 18% interest on delayed GSTR-3B filing/payment without Sec 73 SCN on self-assessed tax. Must audit **Cash-only Rule 88B** & Covid Notif extensions. *(Mastertech `2020-21`)* |
| **Sec 125 Penalty Order** | Sec 125 | **90 days** (`APL-01`) | Standalone penalty order (₹25k+₹25k) post late filing. *(Mastertech)* |
| **Rule 86A ITC Blocking SCN / Communication** | Rule 86A | **07 days** / 1-yr sunset Rule 86A(3) | EIU/Deputy Commissioner blocking Electronic Credit Ledger (`ECrL`) over suspicious/RC-cancelled suppliers or self-cancellation. *(Parag Construction, Promote and Play `2026:BHC-OS:9751-DB`)* |
| **Sec 148 Notif 22/2024 Rectification (`DRC-08` / `RO_AddtnlInfo`)** | Sec 148, Notif `22/2024-CT` (08.10.2024), Sec 16(5)/(6) | Within 6 months of Notif / Officer 3m disposal | Special rectification procedure for confirmed Sec 73/74/107/108 orders involving Sec 16(4) ITC now eligible u/s 16(5)/(6) (FY 2017-18 to 2020-21 up to 30.11.2021). Uses **`Annexure-A` Proforma**. Can trigger `RO_AddtnlInfo` notice for extra documents; results in `DRC-08` (or `APL-04`). *(Mauli Construction, Morya Enterprises, Goyal Trading)* |
| **GST DRC-08 / Sec 161 Rectification** | Sec 161, Rule 142(7) | **3 months** (or **6 months** for clerical/arithmetical error apparent on record) | General rectification of error apparent on the face of record in order. |

### 1.3 Section 128A Amnesty / Waiver Scheme (`SPL` Series)

| Form | Provision | Critical Deadlines & Practice Traps |
|---|---|---|
| **GST SPL-01 / SPL-02** | Sec 128A, Rule 164(1)/(2), Notif 21/2024, Circular 238/32/2024 | Application for **100% waiver of Interest & Penalty** on Sec 73 notices (`SPL-01`) or Sec 73/107/112 orders (`SPL-02`) for FY 2017-18 to 2019-20. **Tax payment deadline: `31.03.2025`; Application deadline: `30.06.2025`**. *(Parth Valves, R.B. Enterprises, Goyal Trading)* |
| **GST SPL-03** | Rule 164 | Notice proposing rejection of SPL waiver. **Observed Traps:** (1) Rejects if **Late Fee** (GSTR-3B/9) remains unpaid alongside tax; (2) Rejects if demand contains **self-assessed liability** (Para `0070` outward or Para `0080` standalone interest u/s 75(12)) rather than pure Sec 73 tax demand! |
| **GST SPL-04** | Rule 164(9) | Reply to `SPL-03` within **1 month** attaching late-fee challan / clarifying Sec 73 breakdown. *(Goyal Trading 2019-20)* |
| **GST SPL-05** | Rule 164(10) | Final Waiver Approval Order. Enables refund (`RFD-01 ASSORD`) of any pre-deposit/excess already recovered where tax is settled. *(Goyal Trading 2018-19, Parth Valves `ZD2707250263097`)* |
| **GST SPL-07 & Appeal Restoration Undertaking** | Rule 164(12) | Waiver Rejection Order. **Crucial Workflow:** If original `APL-01` appeal was withdrawn to apply for `SPL-02`, on receiving `SPL-07` rejection the taxpayer submits **`Undertaking for Restoration of Appeal`** promising not to appeal `SPL-07`, reviving the original withdrawn `APL-01`. *(R.B. Enterprises `ZD270625008116K` -> `ZD271225069558Y`)* |

### 1.4 Appeals, Advance Ruling & High Court Writs

| Form / Proceeding | Statutory Provision | Deadlines & Pre-Deposit Rules |
|---|---|---|
| **GST APL-01** | Sec 107(1), Rule 108(1) | **90 days** from communication date (+30d condonable). Admitted tax = **100%**; Disputed tax pre-deposit = **10%** (cap ₹25 Cr CGST + ₹25 Cr SGST). **Sec 129 Detention pre-deposit = 25%**. **Notif 53/2023 Amnesty = 12.5%** (min 20% of pre-deposit [i.e. 2.5% of tax] from Cash Ledger). *(Bluesurf, Deep Gas, Ethics Engg, R.B. Enterprises, Gothe Global)* |
| **GST APL-02 & APL-04** | Rule 108(3), Sec 107(11), Rule 113(1) | `APL-02`: Final acknowledgment (`Admitted`) or deficiency/time-bar rejection. `APL-04`: Summary of Appellate Order showing Tax/Interest/Penalty Disputed vs Determined. |
| **GST APL-05 & APL-02A Part A** | Sec 112, Rule 110(1) | Appeal to **GSTAT Appellate Tribunal** (Principal Bench Delhi if Place-of-Supply/multi-state issue [Item 7 = Yes], else State Bench). Additional pre-deposit **+10%** (cumulative **20%**, Finance Act 2024). In Maharashtra, accompany with **`Trade Circular 21T/2024 Annexure-I & Annexure-II`**, hardcopy/self-certified sets, and `Vakalatnama`. *(Sai Readymix, Steadfast Poly)* |
| **GST ARA-01** | Sec 97(1), Rule 98 | Application for Advance Ruling (Classification, Notification exemption, RCM liability — e.g. LLP/Body Corporate Passenger Transport). *(Shripad Multi Product LLP)* |
| **High Court Writ (Art. 226)** | Constitution of India | Used when natural justice violated u/s 75(4), ECrL blocked post-revocation (`2026:BHC-OS:9751-DB` *JYM Global*), retrospective RC cancellation against bona fide buyer (`2025:AHC:42270` *Solvi Enterprises*), or portal technical glitch (`SPL-01/02` grievance). |

### 1.5 Registration Suspension, Cancellation & Revocation (`REG` Series)

| Form | Provision | Deadline & Workflow |
|---|---|---|
| **GST REG-17** | Sec 29(2), Rule 22(1) | SCN for cancellation (6m continuous non-filing u/r 21(h)/(i), bogus premises, tax evasion). Reply within **07 working days**. *(Shree Swami Samarth, Siddharth Industries, Vivek Construction)* |
| **GST REG-31** | Rule 21A(2A) | Immediate **suspension + cancellation SCN** for 6-month / 2-quarter return default. **30-day window**. Filing all pending returns + late fee/interest triggers automatic lifting of suspension / drop u/r 21A(4) proviso. *(Swapnil Enterprises `ZA270226026334S`)* |
| **GST REG-19 & REG-20** | Rule 22(3) & 22(4) | `REG-19`: Cancellation Order (often prospective/retrospective — note **Sec 122(1)(xvii) ₹20,000 penalty** & triggers **3-month GSTR-10 Final Return** clock). `REG-20`: Order dropping cancellation proceedings. *(Balaji Enterprises `AA271122034818A`)* |
| **GST REG-21, REG-22, REG-23, REG-05, REG-06** | Sec 30, Rule 23 | `REG-21`: Application for **Revocation of Cancellation** within **90 days** (+180d extension by JC/ADC; requires all pending returns + tax + interest + late fee paid). `REG-23`: **07-day SCN** proposing rejection of `REG-21`. `REG-22`: Revocation Order (`REG-06` RC restored). `REG-05`: Rejection of Revocation -> remedy is `APL-01` appeal u/s 107. *(Balaji, Siddharth, Vivek, Promote and Play, R & A Construction)* |

### 1.6 Goods in Transit Detention (`MOV` Series)

| Form | Provision | Deadline & Strategy |
|---|---|---|
| **MOV-01 to MOV-06** | Sec 68 & 129 | `MOV-01`: Statement of owner/driver recorded at roadside check *(Indian Electricals `ZD330925247869N`)*; `MOV-02`: Inspection order; `MOV-06`: Detention order. |
| **MOV-07 & MOV-09** | Sec 129(3) | `MOV-07`: **07-day SCN** proposing Sec 129(1)(a) penalty (**200% of tax**) or Sec 129(1)(b) (**50% of value**). `MOV-09`: Detention Penalty Order + `DRC-07`. |
| **MOV-10 / MOV-11** | Sec 130 | Confiscation SCN & Order if 129 penalty unpaid within 15 days. **Defense:** Appeal `APL-01` requires **25% pre-deposit**; rely on *ACST v. Satyam Shivam Papers Pvt. Ltd.* (SC, 12.01.2022) & Circular 64/38/2018 (minor/clerical EWB errors with zero tax-evasion intent). *(Indian Electricals)* |

### 1.7 Refunds & Re-Credit (`RFD` & `PMT-03` Series)

| Form / Reason Code | Provision | Critical Workflow & Evidence |
|---|---|---|
| **RFD-01 (`INVST` / `EXPWOP` / `ASSORD` / `EXBCL` / `ANYOTH`)** | Sec 54(1)/(3), Rule 89(2)/(4)/(5) | File within **2 years** of relevant date. **Utilities observed:** `Statement-1A.xlsb` + `GST_REFUND_ANNEXURE_B.xlsb` (Inverted Duty Structure u/r 89(5)); `Statement-3 / RFD_STMT03.xlsb` (Export WOP LUT u/r 89(4) w/ Shipping Bills, EGM, BRC/FIRC); `ASSORD` (Appellate `APL-04`/Rectification/Amnesty `SPL-05` refund of excess cash/pre-deposit); `EXBCL` (Excess Balance in Electronic Cash Ledger). *(Tirupack, Gothe Global, Parth Valves, Deep Gas, Goyal Trading, Parth Enterprises)* |
| **RFD-02 & RFD-03** | Rule 90(2) & 90(3) | `RFD-02`: Acknowledgment (15 days). **`RFD-03`: Deficiency Memo** *(Tirupack `ZD270626103525F`)* — **TRAP:** Cannot "reply" to RFD-03! Must file a **brand-new RFD-01** after ECrL re-credit, curing missing Non-Prosecution Declaration, No-Drawback Declaration, CA Certificate (`UDIN`), and GSTR-2B Annexure-B invoice matching. |
| **RFD-04, RFD-06, RFD-08, RFD-09** | Rule 91, 92(1)/(3)/(4) | `RFD-04`: 90% Provisional Refund; `RFD-06`: Final Sanction/Rejection Order; `RFD-08`: Refund Rejection SCN (**15 days**, seen 17d incl. transit) -> **`RFD-09` Reply** within deadline attaching missing GSTR-1/3B export linkage or ITR/26AS/Bank closure proofs. *(Parth Enterprises `ZD271026032480S`, Gothe Global `ZD2701251052312`)* |
| **PMT-03 / PMT-03A** | Rule 86(4) & 87(11) | Re-credit of rejected/deficient refund back to ECrL/ECaL once Undertaking not to appeal is submitted. *(Gothe Global `ZD270225123068L`)* |

### 1.8 Pre-GST Maharashtra VAT (MVAT) & Amnesty Forms

| Form / Act | Provision | Purpose & Defense |
|---|---|---|
| **MVAT Form 303 (231)** | MVAT Sec 23(2)/(5)/(6), Form 704 | Assessment Order triggered by Form 704 / EIU (`Non-filer`, `J2 x J1 ITC mismatch`, `suppliers not showing taxable sales`). Includes Sec 30(2)/(3) interest & Sec 29(3) penalty + Sec 32 Notice of Demand + Sec 26 Appeal. *(Balaji Corro Wood 2015-16)* |
| **MVAT Settlement Act 2022 (`FORM I`, `FORM III`, `FORM IV`)** | Maharashtra Settlement Act 2022 Sec 8/9/10/12/13 | `FORM I`: Application; `FORM III` / `FORM IV`: Order of Settlement. **Lump-sum option below ₹10 Lakh:** pay ~20% (`80% waiver`) of Post-2005 arrears to settle full Tax + Interest + Penalty. *(Daware Construction `92333439`, Parag Construction, Balaji Corro Wood)* |

---

## 2. Maharashtra Return Scrutiny Parameter Code Dictionary (Observed Across EIU / DGARM / ASMT-10 Notices)

| Param Code | Official Discrepancy Description | Formula / Detection Logic | Standard Defense & Working Required |
|---|---|---|---|
| **0070** | Outward tax liability in **GSTR-3B / GSTR-9 < GSTR-1** | `GSTR-1 Tax - (3B 3.1(a)/(b) + GSTR-9 Table 4/10/11)` | Check credit notes/amendments in subsequent FY (`Oct/Nov`), advances adjusted, double entry in GSTR-1 Table 4 vs 11, verify `DRC-03` already paid; if unpaid, calculate Sec 50 interest on net cash shortfall only. |
| **0073** / **RFR-5** | **Excess ITC claimed in GSTR-3B / GSTR-9** not confirmed in GSTR-2A/2B / Table 8A | Split into **4 sub-heads**: (i) `4A(1)` vs ICEGATE Imports (BOE); (ii) `4A(2)+4A(3)` vs `3.1(d)` RCM; (iii) `4A(4)` vs ISD `GSTR-6A`; (iv) `4A(5)` vs B2B `2A/2B` (or `9 Table 8B+8C - 8A`) | 8-Column Year-to-Year Spillover Reco (`Prior FY ITC in Curr FY + Curr FY in Curr FY + Curr FY in Next FY`), Circular **183/15/2022** (`<=₹5L` Supplier CA Cert; `>₹5L` CA/CMA Cert w/ UDIN), Circular **193/05/2023**, Invoice/EWB/LR/Bank proof, check whether IGST vs CGST+SGST inter-head mismatch nets to ₹0. *(Viraj, Goyal, Mastertech, Mauli)* |
| **0074** | ITC claimed from **Non-Genuine Taxpayer (NGTP)** or **RC Cancelled Suppliers** | Supplier GSTR-1 invoice date > Effective Date of RC Cancellation, or supplier flagged EIU/PRAISE bogus | **Date Test:** Prove supply & invoice date *predate* cancellation effective date; invoke *M/s Solvi Enterprises* (`2025:AHC:42270`), Circular 183, Sec 16(2) physical movement evidence (tax invoice, E-Way Bill, LR/bilty, weighment slip, bank payment RTGS/NEFT). *(Ajay Garg, Parth Valves, Tilekart)* |
| **0077** | **Short RCM Liability / Excess RCM ITC**: `3B 4A(2)+4A(3)` vs `3B 3.1(d)` vs supplier GSTR-1 RCM flags & P&L expenses | Compares RCM tax paid in `3.1(d)` (cash) against RCM ITC in `4A(3)`, supplier B2B RCM invoices, and Tally expenses (GTA, Security, Legal/Advocate, Director, Rent, Royalty, Import of Service) | Reconcile Tally P&L expense ledgers (`GTA @5%`, `Legal Fee`, `Mining Royalty`, `Govt Fees` — *Prithvi Buildcon*) with `3.1(d)` cash challans + Exempt GTA <= ₹750/1500 or supplier opting FCM 12%/18%. |
| **0078** | ITC claimed beyond **Section 16(4)** time limit | GSTR-3B filed after statutory due date (20th Oct / Nov 30th) | **Finance (No. 2) Act 2024 Sec 16(5) & 16(6) Override:** For **FY 2017-18 to 2020-21**, all GSTR-3B returns filed up to **30.11.2021** are retroactively valid! If DRC-07/APL-04 already passed, file **`Notif 22/2024 Sec 148 Annexure-A`** within 6 months (or plead in `APL-01`/`SPL-02` Table 2A). *(Deep Gas, Bluesurf, Mauli, Parth Valves)* |
| **0080** | **Interest u/s 50 / Rule 88B** on belated GSTR-3B filing | `(3B Filing Date - Due Date)` applied on Tax Paid | **3-Layer Attack:** (1) Exclude **ITC-offset tax** — proviso to Sec 50(1) / Rule 88B(1) applies 18% ONLY on **Net Cash** debited (`GSTR-3B Table 6.1 Cash`); (2) Verify **ECL advance deposit date** (`Rule 88B` / PMT-06 challan date reduction — *RB Enterprises*); (3) Verify Covid-19 staggered due date waivers (*Circular 136/06/2020*, *Notif 30/2020-CT*); (4) Check Sec 50(3) **utilized vs unutilized** (*Adesh Kad `B-320`*). |
| **0103** | Additional Liability reported in **GSTR-9** (Table 4N/10/11) vs DRC-03 paid | `GSTR-9 Tax Payable - Cash/ITC Paid in GSTR-9 Part IV` | Match GSTR-9 additional liability against `DRC-03` ARN dates and Rule 88B interest computation. |
| **0127** | ITC availed in **Next FY** (`GSTR-3B 4(B)(1)/(2) / Table 13 of GSTR-9`) vs Table 12 | Cross-year ITC reversal/reclaim check | Prove **Rule 37 reclaim** (paid vendor within/after 180 days) or **Real Estate / Rule 42 reclaim** (`DRC-01C Reason #5`), preventing double taxation across two FYs. |
| **0219** | **GSTR-9C Reconciliation Diff**: Table `9S` (Tax Payable Diff) & Table `12F` (ITC Diff) | Checks unreconciled variance reported by Tax Auditor in 9C | Check for **Double-Counting with Param 0070 / 0073** (both cite same turnover/ITC diff!). Reconcile Table 9Q-9S & 12A-12F with Audit Notes & Books. *(Mastertech)* |

---

## 3. Working Paper & Calculator Schemas (Observed Across 946 Custom Excels & `.xlsb` Utilities)

1. **8-Column Multi-FY ITC Reconciliation (`HCH Bearing`, `Viraj Final Reco`, `Morya Enterprises`):**
   - Books FY ITC + Prior FY ITC claimed in Current FY 3B - Current FY ITC claimed in Next FY 3B = Net Eligible 3B Claim vs GSTR-2A/2B (matched via Normalized Invoice + Fuzzy Clean + Core Serial + PAN Cross-State) + BOE/ICEGATE + ISD + RCM.
   - Identifies **Unreconciled Vendor Bucket** for Circular 183 (`<= ₹5L` Supplier CA Cert; `> ₹5L` CA/CMA UDIN Cert).
2. **Sec 50 / Rule 88B Cash & ECrL Interest Calculator (`RB Enterprises`, `Adesh Kad`, `Parag Construction`, `Mastertech`):**
   - Inputs: Return Period, Turnover Slab (<₹5Cr Group A/B or >₹5Cr + Covid Notifs), Statutory Due Date, PMT-06 Cash Challan Date(s), GSTR-3B Filing Date, Tax Offset Split (`ITC` vs `Cash`), Daily Minimum Balance of ECrL (`Wrongly Availed vs Utilized` check).
   - Output: Exact day-by-day interest `@18%` (`(Days / 365)`), plus Section 50(3) nil-interest shield whenever ECrL balance remained $\ge$ disputed ITC (`Parag Construction` 295-day check; `Adesh Kad` ₹2,316 on ₹1.56L utilized vs ₹27L claimed).
3. **Sec 73 vs 74 vs 74A(8) & Sec 128A Eligibility & Penalty Matrix (`Prime with Interest`, `Parth Valves`, `Goyal Trading`):**
   - Auto-determines applicable Section (`Sec 73/74` up to FY 2023-24; **`Sec 74A`** FY 2024-25+), Statutory Time-Bar Date (with Sec 169 check), Penalty Tier (0% before/30d SCN u/s 73/74A, 10% Order u/s 73, 15%/25%/50%/100% u/s 74), and `SPL-01/02` waiver qualification (validates FY 17-18..19-20, excludes self-assessed Para `0070`/`0080` u/s 75(12), checks Late Fee paid status to prevent `SPL-03` rejection!).
4. **Head-Wise Demand, DRC-03/03A Adjustment & Appeal Pre-Deposit Calculator (`Shree Swami Samarth`, `Parth Valves Refund`, `Mastertech Libility`):**
   - Tracks Demand (`Tax`, `Interest`, `Penalty`, `Late Fee`) across `IGST / CGST / SGST / Cess`, subtracts already-paid `DRC-03` (flagged Cash vs ITC + whether linked via `DRC-03A`), computes Pre-Deposit (`10% APL-01`, `12.5% Notif 53` [min 2.5% Cash], `20% APL-05`, `25% Sec 129`), and calculates **refundable excess (`RFD-01 ASSORD`)** post `APL-04`/`SPL-05` order!
5. **Rule 37 (180-Day Creditor Ageing), Rule 42 (Exempt/Taxable Ratio) & Sec 122 / Sec 17(5) Working:**
   - Flags purchase invoices unpaid > 180 days from invoice date (Rule 37 interest + reclaim date tracking); calculates common credit reversal `D1 = C2 * (E/F)` and `D2 = 5% * C2` (Rule 42).
6. **Refund Calculators (`RFD-01` Rule 89(4) Exports & Rule 89(5) Inverted Duty — `Tirupack`, `Gothe Global`):**
   - Exports WOP (`Rule 89(4)`): `(Zero-Rated Turnover / Adjusted Total Turnover) * Net ITC`, matched with `Statement-3` Shipping Bills & BRC.
   - Inverted Duty (`Rule 89(5)`): `{(Turnover of Inverted Rated Supply * Net ITC) / Adjusted Total Turnover} - {Tax payable on Inverted Supply * (Net ITC / ITC on Inputs & Input Services)}`, paired with `Statement-1A` & `Annexure-B`.

---

## 4. Standard Reply Architecture & Mandatory Document Annexures (Observed in 226 `.docx` + Replies)

Every formal legal reply in real-world CA practice combines **Two Halves**:
1. **Part A — Narrative Legal Submission:** Addressee (Designation, Office/Cabin, Email), Metadata Block (`Trade Name`, `Legal Name`, `GSTIN`, `FY`, `Notice/Order Ref`, `DIN`, `Due Date`), Without-Prejudice Opening, Brief Facts of the Case, Issue-by-Issue Legal & Mathematical Rebuttal (statutory text + CBIC Circular + High Court/SC citations + Table summary), Specific Prayer (Drop Proceeding / Rectify / Condone / Refund / Lift Suspension + Mandatory Request for Personal Hearing u/s `75(4)` before any adverse order), and Verification.
2. **Part B — Standardized Document & Compliance Kit:**
   - **Representation Authorities:** `Authority Letter (LOA)`, `CA Engagement Acceptance Letter`, **`FORM GST PCT-05`** (Part A & B Authorization for GST Practitioner), **`Vakalatnama`** (for GSTAT `APL-05` / High Court).
   - **Tribunal / Amnesty / Rectification Statutory Proformas:** `Notif 22/2024 Annexure-A` (Sec 148/16(5) rectification), **`Trade Circular 21T/2024 Annexure-I & II`** (GSTAT appeal checklist & undertaking), **`SPL-07 Undertaking for Appeal Restoration`** (restoring withdrawn `APL-01`), `RFD-03 PMT-03 Recredit Undertaking`, `Non-Prosecution & No-Unjust-Enrichment Affidavits` (Refund), `Rule 37` / `Circular 183/193` **CA Certificate (with UDIN)** & **Supplier Section 16 Payment Declaration**, **Adjournment Request (u/s 75(5))** & **Physical Hearing Request**.

---

## 5. Module 12 Codebase Gap Matrix (Current State vs Target A-to-Z Suite)

| File & Verified Symbol | Current Capability | Critical Gaps Found Against Real-World Practice |
|---|---|---|
| `notices/db.js` — `initGstNoticesDatabase`, `computeLimitationDueDate`, `checkNoticeLimitation` | Only 4 flat tables (`gst_notices`, `gst_notice_attachments`, `gst_notice_invoices`, `gst_notice_replies`). Deadlines only handle basic `ASMT-10/DRC-01` (30d), `DRC-01B/C` (7d), `REG-03/17/23` (7d), `ASMT-13/DRC-07` (90d). Limitation schedule stops at FY `2023-24` (`Section 73/74`). | - Missing `gst_cases`, `gst_case_documents`, `gst_case_payments` (`DRC-03`/`DRC-03A`, cash vs ITC split, pre-deposit %), `gst_case_timeline`, and `gst_notice_issues` (Parameter-level rows).<br>- Wrong/missing deadlines for **`DRC-01A` (15d)**, **`Sec 125 DRC-01` (7d)**, **`REG-31` (30d)**, **`GSTR-3A` (15d)**, **`GSTR-10` notice (7d)**, **`MOV-07` (7d)**, **`SPL-04` (1m)**, **`RFD-08` (15d)**.<br>- Missing **`Section 74A`** (`FY 2024-25+`, 42m SCN / 48m Order), `Section 169` service-date trigger, and `MVAT Sec 23/26`. |
| `notices_routes.js` — `/api/notices/upload-pdf`, `/reconcile`, `/reconcile/export/:noticeId` | Upload route only classifies `ASMT-10`, `DRC-01B`, `DRC-01` and **fabricates `interest_demanded = Math.round(detectedAmount * 0.25)`**. No folder scanner, no `.docx`/`.xlsx`/`.zip` parsing, no `DRC-03` ledger API. | - Needs full-corpus classifier (`64+` forms, `\s*[-–]\s*` normalized), authentic parameter & table extractor (no 0.25 fabrication!), offline client-folder batch scanner & ZIP/Excel/DOCX/PDF ingestion endpoints, and Case/Payment/Timeline CRUD APIs. |
| `notices/autopilot.js` — `runNoticesAutopilot` | Scrapes 3 GST portal tabs (`viewnotices`, `case/additionalnotices`, `Return Compliance`). | - Needs explicit scraping/tagging of `SPL` Waiver orders, `RFD` Refund orders/deficiencies, `APL` Appeal orders/notices, and automatic PDF text parsing on downloaded attachments into `gst_notice_issues`. |
| `src/lib/noticeReconciliation.ts` — `reconcileNoticeDiscrepancy`, `generateNoticeAnnexureExcel` | Only reconciles alleged invoices against `twoBInvoices` (timing) & `isRetrospectiveFy` vs `'2021-11-30'`. Exports 1 basic Excel sheet (`ws['!merges'] = []`). | - Lacks Parameter-specific engines for `0070`, `0073` (4 sub-heads + BOE/ISD/RCM), `0074` (RC cancellation date test), `0077` (P&L RCM), `0080` (Rule 88B Cash-only + PMT-06 challan dates + Section 50(3) ECrL min balance), `0127`, `0219` (double-count guard), `Rule 37/42`, `Sec 128A SPL validator` (Late fee & 75(12) trap), `Pre-deposit & ASSORD Refund Calculator`, `Rule 89(4)/(5)`.<br>- Needs multi-tab **Zero-Merge** Defense Workbook (`Summary`, `Param Working`, `8-Col 2A/2B/3B`, `Rule 88B Interest`, `DRC-03/03A Ledger`, `Checklist`). |
| `src/lib/noticeReplyGenerator.ts` — `generateAsmt11Reply`, `generateDrc06Reply` | Only generates 2 generic reply templates (`ASMT-11` and `DRC-06`). | - Missing 18+ specialized templates: `DRC-01A Part B`, `DRC-01B Part B`, `DRC-01C Part B` (9 reasons), `APL-01`, `APL-05` (+ `Trade Circular 21T Annexure-I/II`), `SPL-02/04` (+ `SPL-07 Appeal Restoration Undertaking`), `Notif 22/2024 Annexure-A` & `Sec 161 Rectification`, `REG-21 Revocation + Condonation`, `MOV-07 Reply`, `RFD-09 Reply`, `ADT-01/Rule 101(4) Reply`, `Rule 86A Unblocking Request`, plus standardized **Legal Kit** (`LOA`, `CA Acceptance`, `PCT-05`, `Vakalatnama`, `CA Cert 183/193`, `Supplier Sec 16 Cert`, `Adjournment/PH Request`, `Non-Prosecution Affidavit`). |
| `src/lib/noticeDocxExporter.ts` — `generateNoticeDocxBlob`, `generateNoticePdf` | Hardcodes `"WRITTEN SUBMISSION IN RESPONSE TO GST NOTICE"`. Cannot render structured calculation tables cleanly inside DOCX. | - Needs dynamic statutory form headers, structured `docx` `Table` builders (Demand vs Admitted vs Disputed, Param Rebuttal Table, DRC-03/03A Payment Table), and Annexures Packet batch export. |
| `src/lib/geminiTaxEngine.ts` & `src/lib/piiSanitizer.ts` | `DEFENSE_QUICK_CHIPS` has 5 static chips; fallback analyzer only detects 3 forms. `piiSanitizer` masks GSTIN/PAN/Phone/Email. | - Extend `piiSanitizer.ts` for `DIN`, `TIN`, `Case ID` (`AD...`), `Demand ID` (`ZD...`), `ARN`, `Challan CIN`, Bank Account numbers.<br>- Expand `geminiTaxEngine.ts` with Situation-Aware Defense Playbook routing across all 64 forms & 9 Parameter codes + verified Case Law / Circular Injection Bank (zero hallucinated citations!). |
| `src/pages/GstNoticesDashboard.tsx`, `NoticeReplyWorkbenchModal.tsx`, `NoticePipelineVisualizer.tsx` | Flat list of notices with a 4-stage pipeline visualizer and basic reply modal. | - Lacks Case Hierarchy (`Client -> FY -> Case -> Notices/Orders -> Timeline`), **Parameter Defense Workbench** (toggleable defense arguments per Param code), **DRC-03 / DRC-03A & Pre-Deposit Calculator UI**, **Offline Scrutiny Folder Import Wizard**, **Document Kit Generator Drawer**, and Master Tracker Zero-Merge Export. |

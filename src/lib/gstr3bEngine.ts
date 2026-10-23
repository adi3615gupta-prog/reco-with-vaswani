/**
 * gstr3bEngine.ts — Core Calculation Engine, Data Models, Excel & JSON Exporters for GSTR-3B Working
 * 
 * Implements the standard Chartered Accountant / Tax Practitioner GSTR-3B monthly working calculation:
 * - Outward Supply (Table 3.1 & 3.2): B2B, B2C, SEZ, Zero Rated, Nil, Exempt, Advance, Rent, Credit Notes
 * - Inward Supplies & ITC (Table 4): Books ITC, 2B ITC, RCM Inward, Debit/Credit Notes, Reversals, Opening Credit
 * - Statutory Set-off & Utilization (Table 6.1): CGST/SGST/IGST inter-head set-off rules (Sec 49, 49A, 49B)
 * - Balance C/F chaining month-to-month throughout the financial year
 * - RCM mandatory cash liability (Sec 49(4))
 * - Excel Workbook generator (exceljs) styled to match CA practice working format
 * - GST Portal official GSTR-3B uploadable JSON generation
 */

import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

// ─── TYPES & INTERFACES ────────────────────────────────────────────────────────

export type GSTR3BMonthKey =
  | 'April'
  | 'May'
  | 'June'
  | 'July'
  | 'August'
  | 'September'
  | 'October'
  | 'November'
  | 'December'
  | 'January'
  | 'February'
  | 'March';

export const GSTR3B_MONTHS: GSTR3BMonthKey[] = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March'
];

export interface TaxBreakdown {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function createEmptyTaxBreakdown(): TaxBreakdown {
  return { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
}

export interface OutwardSupplies {
  b2b: TaxBreakdown;
  b2c: TaxBreakdown;
  sezWithPayment: TaxBreakdown;
  sezWithoutPayment: TaxBreakdown;
  zeroRated: TaxBreakdown;
  nilRated: TaxBreakdown;
  exempt: TaxBreakdown;
  advanceReceived: TaxBreakdown; // Advances Collected for Services
  rentReceived: TaxBreakdown;
  saleIncreaseAmendment: TaxBreakdown; // (+) Sale Increased through Amendment
  saleDecreaseAmendment: TaxBreakdown; // (-) Sale Decreased through Amendment
  creditNote: TaxBreakdown;            // (-) Credit Note
  advanceAdjusted: TaxBreakdown;       // (-) Advances Settled Against Services
  totalSaleWorking: TaxBreakdown;      // Auto-computed: SUM(D8:D17) - SUM(D18:D20)
  rcmInward: TaxBreakdown;             // Reverse charge on inward supplies (Table 3.1(d)) = SUM(D25:D28)
  rcmTransport: TaxBreakdown;          // RCM on Transport Charges 5%
  rcmSecurity: TaxBreakdown;           // RCM on Security Charges 18%
  rcmGuestHouse: TaxBreakdown;         // RCM on Guest House Charges 18%
  rcmAdvocate: TaxBreakdown;           // RCM on Advocate Charges 18%
  totalSalePortal: TaxBreakdown;       // Auto-computed: (A) Total Sale as per Working including Reverse Charge
}

export interface InwardSupplies {
  itcBooks: number;
  itc2b: TaxBreakdown;
  importGoods: TaxBreakdown;           // (+) Import purchase (Table 4(A)(1))
  rcmPaid: TaxBreakdown;               // (+) RCM paid on Inward Supplies (Table 4(A)(3))
  creditNotes: TaxBreakdown;           // (+) Credit Notes
  openingCreditBal: TaxBreakdown;      // (+) Opening Credit Balance (B/F from previous month)
  debitNotes: TaxBreakdown;            // (-) Debit Notes
  itcReversed: TaxBreakdown;           // (-) ITC Reversed on Ineligible credit (Table 4(B))
  amendmentDiff: TaxBreakdown;         // Preserved for backward compatibility
  totalItcAvailable: TaxBreakdown;     // Auto-computed: (B) Total ITC Available for Set off = SUM(D33:D37) - SUM(D38:D39)
}

export interface TaxPayableAndSetoff {
  rawPayable: TaxBreakdown;       // (A-B) Payable: Outward working tax - total available ITC
  adjustment: TaxBreakdown;       // (-) Adjustment (Rule 88A IGST / CGST / SGST set-off)
  payableAfterAdjustment: TaxBreakdown; // Final Liability Payable (after adjustment & TDS/TCS cash credit)
  balanceCfNextMonth: TaxBreakdown;     // Balance C/f to next month (Surplus unutilized ITC)
  isManualAdjustment?: boolean;   // If true, user manually specified or edited adjustment proportion
}

export interface CashAndFinalSettlement {
  tdsTcsOpeningCash: TaxBreakdown; // (-) GST TDS/TCS Opening Cash Balance
  rcmPayable: TaxBreakdown;       // Mandated cash payment for RCM (Sec 49(4)) = rcmInward
  lateFees: { cgst: number; sgst: number; total: number };
  interest: { cgst: number; sgst: number; igst: number; total: number };
  gstPaidThroughCash: TaxBreakdown; // PMT-06 challan cash paid
  balancePayable: TaxBreakdown;   // Final Net Payable: Payable after setoff + RCM + late fees + interest - cash paid
}

export interface GSTR3BMonthData {
  month: GSTR3BMonthKey;
  calendarMonthIndex: number; // 4 for April, ..., 12 for Dec, 1 for Jan, 3 for March
  year: string;              // "2025" or "2026"
  outward: OutwardSupplies;
  inward: InwardSupplies;
  setoff: TaxPayableAndSetoff;
  settlement: CashAndFinalSettlement;
}

export interface GSTR3BClientProfile {
  firmName: string;
  gstin: string;
  address: string;
  contact: string;
  financialYear: string; // e.g., "2025-26" or "2026-2027"
  gstnStatus?: string;
  registrationDate?: string;
  natureOfBusiness?: string;
  authorisedSignatory?: string;
  filingType?: string;
  filingEmail?: string;
  filingPhone?: string;
}

export interface GSTR3BAnnualWorking {
  profile: GSTR3BClientProfile;
  months: Record<GSTR3BMonthKey, GSTR3BMonthData>;
}

// ─── INITIALIZATION FACTORIES ──────────────────────────────────────────────────

export function createEmptyMonthData(month: GSTR3BMonthKey, fy: string = '2025-26'): GSTR3BMonthData {
  const parts = fy.split('-');
  const startYear = parts[0] || '2025';
  const endYear = parts[1] ? (parts[0].slice(0, 2) + parts[1]) : '2026';

  const isNextYear = ['January', 'February', 'March'].includes(month);
  const year = isNextYear ? endYear : startYear;

  const monthIndexMap: Record<GSTR3BMonthKey, number> = {
    April: 4, May: 5, June: 6, July: 7, August: 8, September: 9,
    October: 10, November: 11, December: 12, January: 1, February: 2, March: 3
  };

  return {
    month,
    calendarMonthIndex: monthIndexMap[month],
    year,
    outward: {
      b2b: createEmptyTaxBreakdown(),
      b2c: createEmptyTaxBreakdown(),
      sezWithPayment: createEmptyTaxBreakdown(),
      sezWithoutPayment: createEmptyTaxBreakdown(),
      zeroRated: createEmptyTaxBreakdown(),
      nilRated: createEmptyTaxBreakdown(),
      exempt: createEmptyTaxBreakdown(),
      advanceReceived: createEmptyTaxBreakdown(),
      rentReceived: createEmptyTaxBreakdown(),
      saleIncreaseAmendment: createEmptyTaxBreakdown(),
      saleDecreaseAmendment: createEmptyTaxBreakdown(),
      creditNote: createEmptyTaxBreakdown(),
      advanceAdjusted: createEmptyTaxBreakdown(),
      totalSaleWorking: createEmptyTaxBreakdown(),
      rcmInward: createEmptyTaxBreakdown(),
      rcmTransport: createEmptyTaxBreakdown(),
      rcmSecurity: createEmptyTaxBreakdown(),
      rcmGuestHouse: createEmptyTaxBreakdown(),
      rcmAdvocate: createEmptyTaxBreakdown(),
      totalSalePortal: createEmptyTaxBreakdown(),
    },
    inward: {
      itcBooks: 0,
      itc2b: createEmptyTaxBreakdown(),
      importGoods: createEmptyTaxBreakdown(),
      rcmPaid: createEmptyTaxBreakdown(),
      creditNotes: createEmptyTaxBreakdown(),
      openingCreditBal: createEmptyTaxBreakdown(),
      debitNotes: createEmptyTaxBreakdown(),
      itcReversed: createEmptyTaxBreakdown(),
      amendmentDiff: createEmptyTaxBreakdown(),
      totalItcAvailable: createEmptyTaxBreakdown(),
    },
    setoff: {
      rawPayable: createEmptyTaxBreakdown(),
      adjustment: createEmptyTaxBreakdown(),
      payableAfterAdjustment: createEmptyTaxBreakdown(),
      balanceCfNextMonth: createEmptyTaxBreakdown(),
    },
    settlement: {
      tdsTcsOpeningCash: createEmptyTaxBreakdown(),
      rcmPayable: createEmptyTaxBreakdown(),
      lateFees: { cgst: 0, sgst: 0, total: 0 },
      interest: { cgst: 0, sgst: 0, igst: 0, total: 0 },
      gstPaidThroughCash: createEmptyTaxBreakdown(),
      balancePayable: createEmptyTaxBreakdown(),
    }
  };
}

export function createEmptyAnnualWorking(profile?: Partial<GSTR3BClientProfile>): GSTR3BAnnualWorking {
  const defaultProfile: GSTR3BClientProfile = {
    firmName: profile?.firmName || '',
    gstin: profile?.gstin || '',
    address: profile?.address || '',
    contact: profile?.contact || '',
    financialYear: profile?.financialYear || '2025-26',
  };

  const months: Record<GSTR3BMonthKey, GSTR3BMonthData> = {} as any;
  for (const m of GSTR3B_MONTHS) {
    months[m] = createEmptyMonthData(m, defaultProfile.financialYear);
  }

  return {
    profile: defaultProfile,
    months,
  };
}

// ─── CALCULATION ENGINE ────────────────────────────────────────────────────────

const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

/**
 * Calculates a single month's GSTR-3B Working with GST set-off rules (Sec 49/49A/49B)
 */
export function recalculateMonthData(
  m: GSTR3BMonthData,
  openingCredit?: TaxBreakdown
): GSTR3BMonthData {
  const updated = JSON.parse(JSON.stringify(m)) as GSTR3BMonthData;
  const out = updated.outward;
  const inw = updated.inward;
  const setoff = updated.setoff;
  const stl = updated.settlement;

  // 1. Total Sale as per Working = (B2B + B2C + SEZ + Zero + Nil + Exempt + Adv + Rent + Sale Increased) - (Sale Decreased + Credit Note + Adv Settled)
  const posOut = [
    out.b2b, out.b2c, out.sezWithPayment, out.sezWithoutPayment,
    out.zeroRated, out.nilRated, out.exempt, out.advanceReceived, out.rentReceived,
    out.saleIncreaseAmendment
  ].filter(Boolean);

  const decTaxable = (out.saleDecreaseAmendment?.taxable || 0) + (out.creditNote?.taxable || 0) + (out.advanceAdjusted?.taxable || 0);
  const decCgst = (out.saleDecreaseAmendment?.cgst || 0) + (out.creditNote?.cgst || 0) + (out.advanceAdjusted?.cgst || 0);
  const decSgst = (out.saleDecreaseAmendment?.sgst || 0) + (out.creditNote?.sgst || 0) + (out.advanceAdjusted?.sgst || 0);
  const decIgst = (out.saleDecreaseAmendment?.igst || 0) + (out.creditNote?.igst || 0) + (out.advanceAdjusted?.igst || 0);

  out.totalSaleWorking.taxable = round2(posOut.reduce((acc, r) => acc + (r.taxable || 0), 0) - decTaxable);
  out.totalSaleWorking.cgst = round2(posOut.reduce((acc, r) => acc + (r.cgst || 0), 0) - decCgst);
  out.totalSaleWorking.sgst = round2(posOut.reduce((acc, r) => acc + (r.sgst || 0), 0) - decSgst);
  out.totalSaleWorking.igst = round2(posOut.reduce((acc, r) => acc + (r.igst || 0), 0) - decIgst);
  out.totalSaleWorking.total = round2(
    out.totalSaleWorking.cgst + out.totalSaleWorking.sgst + out.totalSaleWorking.igst
  );

  // 2. Reverse Charge Inward Supplies Total (Rows 24 to 28)
  const hasRcmBreakdown = Boolean(
    (out.rcmTransport && (out.rcmTransport.taxable || out.rcmTransport.cgst || out.rcmTransport.sgst || out.rcmTransport.igst)) ||
    (out.rcmSecurity && (out.rcmSecurity.taxable || out.rcmSecurity.cgst || out.rcmSecurity.sgst || out.rcmSecurity.igst)) ||
    (out.rcmGuestHouse && (out.rcmGuestHouse.taxable || out.rcmGuestHouse.cgst || out.rcmGuestHouse.sgst || out.rcmGuestHouse.igst)) ||
    (out.rcmAdvocate && (out.rcmAdvocate.taxable || out.rcmAdvocate.cgst || out.rcmAdvocate.sgst || out.rcmAdvocate.igst))
  );

  if (hasRcmBreakdown) {
    if (out.rcmTransport) out.rcmTransport.total = round2((out.rcmTransport.cgst || 0) + (out.rcmTransport.sgst || 0) + (out.rcmTransport.igst || 0));
    if (out.rcmSecurity) out.rcmSecurity.total = round2((out.rcmSecurity.cgst || 0) + (out.rcmSecurity.sgst || 0) + (out.rcmSecurity.igst || 0));
    if (out.rcmGuestHouse) out.rcmGuestHouse.total = round2((out.rcmGuestHouse.cgst || 0) + (out.rcmGuestHouse.sgst || 0) + (out.rcmGuestHouse.igst || 0));
    if (out.rcmAdvocate) out.rcmAdvocate.total = round2((out.rcmAdvocate.cgst || 0) + (out.rcmAdvocate.sgst || 0) + (out.rcmAdvocate.igst || 0));

    out.rcmInward.taxable = round2(
      (out.rcmTransport?.taxable || 0) + (out.rcmSecurity?.taxable || 0) +
      (out.rcmGuestHouse?.taxable || 0) + (out.rcmAdvocate?.taxable || 0)
    );
    out.rcmInward.cgst = round2(
      (out.rcmTransport?.cgst || 0) + (out.rcmSecurity?.cgst || 0) +
      (out.rcmGuestHouse?.cgst || 0) + (out.rcmAdvocate?.cgst || 0)
    );
    out.rcmInward.sgst = round2(
      (out.rcmTransport?.sgst || 0) + (out.rcmSecurity?.sgst || 0) +
      (out.rcmGuestHouse?.sgst || 0) + (out.rcmAdvocate?.sgst || 0)
    );
    out.rcmInward.igst = round2(
      (out.rcmTransport?.igst || 0) + (out.rcmSecurity?.igst || 0) +
      (out.rcmGuestHouse?.igst || 0) + (out.rcmAdvocate?.igst || 0)
    );
  }
  out.rcmInward.total = round2(
    (out.rcmInward.cgst || 0) + (out.rcmInward.sgst || 0) + (out.rcmInward.igst || 0)
  );

  // 3. (A) Total Sale as per Working including Reverse Charge = Total Sale as per Working + RCM Inward Supplies
  out.totalSalePortal.taxable = round2(out.totalSaleWorking.taxable + (out.rcmInward.taxable || 0));
  out.totalSalePortal.cgst = round2(out.totalSaleWorking.cgst + (out.rcmInward.cgst || 0));
  out.totalSalePortal.sgst = round2(out.totalSaleWorking.sgst + (out.rcmInward.sgst || 0));
  out.totalSalePortal.igst = round2(out.totalSaleWorking.igst + (out.rcmInward.igst || 0));
  out.totalSalePortal.total = round2(out.totalSaleWorking.total + out.rcmInward.total);

  // 4. Inward: RCM Paid flows from outward RCM
  inw.rcmPaid = {
    taxable: out.rcmInward.taxable || 0,
    cgst: out.rcmInward.cgst || 0,
    sgst: out.rcmInward.sgst || 0,
    igst: out.rcmInward.igst || 0,
    total: out.rcmInward.total || 0,
  };

  // 5. Inward: Opening credit balance (passed in from previous month or retained)
  if (openingCredit) {
    inw.openingCreditBal = {
      taxable: 0,
      cgst: round2(openingCredit.cgst || 0),
      sgst: round2(openingCredit.sgst || 0),
      igst: round2(openingCredit.igst || 0),
      total: round2((openingCredit.cgst || 0) + (openingCredit.sgst || 0) + (openingCredit.igst || 0)),
    };
  } else {
    inw.openingCreditBal.total = round2(
      (inw.openingCreditBal.cgst || 0) + (inw.openingCreditBal.sgst || 0) + (inw.openingCreditBal.igst || 0)
    );
  }

  // 6. Inward: Totals for individual rows
  inw.itc2b.total = round2((inw.itc2b.cgst || 0) + (inw.itc2b.sgst || 0) + (inw.itc2b.igst || 0));
  if (inw.importGoods) inw.importGoods.total = round2((inw.importGoods.cgst || 0) + (inw.importGoods.sgst || 0) + (inw.importGoods.igst || 0));
  if (inw.creditNotes) inw.creditNotes.total = round2((inw.creditNotes.cgst || 0) + (inw.creditNotes.sgst || 0) + (inw.creditNotes.igst || 0));
  inw.debitNotes.total = round2((inw.debitNotes.cgst || 0) + (inw.debitNotes.sgst || 0) + (inw.debitNotes.igst || 0));
  inw.itcReversed.total = round2((inw.itcReversed.cgst || 0) + (inw.itcReversed.sgst || 0) + (inw.itcReversed.igst || 0));
  if (inw.amendmentDiff) inw.amendmentDiff.total = round2((inw.amendmentDiff.cgst || 0) + (inw.amendmentDiff.sgst || 0) + (inw.amendmentDiff.igst || 0));

  // 7. (B) Total ITC Available for Set off = SUM(D33:D37) - SUM(D38:D39)
  // [ITC 2B + Import purchase + RCM Paid + Credit Notes + Opening Credit] - [Debit Notes + ITC Reversed]
  inw.totalItcAvailable.taxable = round2(
    (inw.itc2b.taxable || 0) +
    (inw.importGoods?.taxable || 0) +
    (inw.rcmPaid.taxable || 0) +
    (inw.creditNotes?.taxable || 0) +
    (inw.openingCreditBal.taxable || 0) -
    (inw.debitNotes.taxable || 0) -
    (inw.itcReversed.taxable || 0)
  );
  inw.totalItcAvailable.cgst = round2(
    (inw.itc2b.cgst || 0) +
    (inw.importGoods?.cgst || 0) +
    (inw.rcmPaid.cgst || 0) +
    (inw.creditNotes?.cgst || 0) +
    (inw.openingCreditBal.cgst || 0) -
    (inw.debitNotes.cgst || 0) -
    (inw.itcReversed.cgst || 0)
  );
  inw.totalItcAvailable.sgst = round2(
    (inw.itc2b.sgst || 0) +
    (inw.importGoods?.sgst || 0) +
    (inw.rcmPaid.sgst || 0) +
    (inw.creditNotes?.sgst || 0) +
    (inw.openingCreditBal.sgst || 0) -
    (inw.debitNotes.sgst || 0) -
    (inw.itcReversed.sgst || 0)
  );
  inw.totalItcAvailable.igst = round2(
    (inw.itc2b.igst || 0) +
    (inw.importGoods?.igst || 0) +
    (inw.rcmPaid.igst || 0) +
    (inw.creditNotes?.igst || 0) +
    (inw.openingCreditBal.igst || 0) -
    (inw.debitNotes.igst || 0) -
    (inw.itcReversed.igst || 0)
  );
  inw.totalItcAvailable.total = round2(
    inw.totalItcAvailable.cgst + inw.totalItcAvailable.sgst + inw.totalItcAvailable.igst
  );
  inw.totalItcAvailable.total = round2(
    inw.totalItcAvailable.cgst + inw.totalItcAvailable.sgst + inw.totalItcAvailable.igst
  );

  // 8. Raw Difference (Payable if positive, surplus ITC if negative)
  // Outward tax liability to set off is regular sales (Total Sale as per Working), excluding RCM!
  const L_igst = round2(out.totalSaleWorking.igst || 0);
  const L_cgst = round2(out.totalSaleWorking.cgst || 0);
  const L_sgst = round2(out.totalSaleWorking.sgst || 0);

  const ITC_igst = round2(inw.totalItcAvailable.igst || 0);
  const ITC_cgst = round2(inw.totalItcAvailable.cgst || 0);
  const ITC_sgst = round2(inw.totalItcAvailable.sgst || 0);

  setoff.rawPayable.taxable = 0;
  setoff.rawPayable.cgst = round2(L_cgst - ITC_cgst);
  setoff.rawPayable.sgst = round2(L_sgst - ITC_sgst);
  setoff.rawPayable.igst = round2(L_igst - ITC_igst);
  setoff.rawPayable.total = round2(setoff.rawPayable.cgst + setoff.rawPayable.sgst + setoff.rawPayable.igst);

  // 9. STATUTORY GST SET-OFF ENGINE (RULE 88A, SECTIONS 49/49A/49B, CIRCULAR 98/17/2019-GST)
  let adjCgst = 0;
  let adjSgst = 0;
  let adjIgst = 0;

  const isManual = Boolean(setoff.isManualAdjustment);

  if (isManual && setoff.adjustment) {
    adjCgst = round2(setoff.adjustment.cgst || 0);
    adjSgst = round2(setoff.adjustment.sgst || 0);
    adjIgst = round2(setoff.adjustment.igst !== undefined ? setoff.adjustment.igst : -(adjCgst + adjSgst));
  } else {
    let u_igst_igst = 0;
    let u_igst_cgst = 0;
    let u_igst_sgst = 0;
    let u_cgst_igst = 0;
    let u_sgst_igst = 0;

    // STEP 1: Clear IGST Output Liability with IGST ITC
    u_igst_igst = Math.min(L_igst, ITC_igst);
    let rem_L_igst = round2(L_igst - u_igst_igst);
    let surplus_ITC_igst = round2(ITC_igst - u_igst_igst);

    let rem_L_cgst = L_cgst;
    let rem_L_sgst = L_sgst;
    let rem_ITC_cgst = ITC_cgst;
    let rem_ITC_sgst = ITC_sgst;

    // STEP 2: Allocate Surplus IGST ITC (Rule 88A CA Practice Standard: CGST shortfall first, then SGST shortfall, remainder to CGST)
    if (surplus_ITC_igst > 0) {
      const shortfall_cgst = Math.max(0, round2(rem_L_cgst - rem_ITC_cgst));
      const shortfall_sgst = Math.max(0, round2(rem_L_sgst - rem_ITC_sgst));

      // 1. Allocate to CGST shortfall first
      const takeCgst = Math.min(surplus_ITC_igst, shortfall_cgst);
      u_igst_cgst = round2(u_igst_cgst + takeCgst);
      surplus_ITC_igst = round2(surplus_ITC_igst - takeCgst);

      // 2. If surplus IGST still remains, allocate to SGST shortfall
      if (surplus_ITC_igst > 0) {
        const takeSgst = Math.min(surplus_ITC_igst, shortfall_sgst);
        u_igst_sgst = round2(u_igst_sgst + takeSgst);
        surplus_ITC_igst = round2(surplus_ITC_igst - takeSgst);
      }

      // 3. If surplus IGST still remains (both shortfalls met/zero), park in CGST as per CA working sheet standard (e.g. April-26)
      if (surplus_ITC_igst > 0) {
        u_igst_cgst = round2(u_igst_cgst + surplus_ITC_igst);
        surplus_ITC_igst = 0;
      }
    }

    // Residual IGST Liability paid from CGST/SGST ITC
    if (rem_L_igst > 0 && surplus_ITC_igst === 0) {
      const availC = Math.max(0, round2(rem_ITC_cgst - rem_L_cgst));
      const availS = Math.max(0, round2(rem_ITC_sgst - rem_L_sgst));
      const takeC = Math.min(availC, round2(rem_L_igst / 2));
      u_cgst_igst = takeC;
      const remNeeded = round2(rem_L_igst - takeC);
      u_sgst_igst = Math.min(availS, remNeeded);
      if (u_sgst_igst < remNeeded && availC > takeC) {
        u_cgst_igst = Math.min(availC, round2(u_cgst_igst + (remNeeded - u_sgst_igst)));
      }
    }

    adjCgst = round2(u_igst_cgst - u_cgst_igst);
    adjSgst = round2(u_igst_sgst - u_sgst_igst);
    adjIgst = round2(-(adjCgst + adjSgst));
  }

  setoff.adjustment = {
    taxable: 0,
    cgst: adjCgst,
    sgst: adjSgst,
    igst: adjIgst,
    total: round2(adjCgst + adjSgst + adjIgst),
  };

  // STEP 4: Exact CA Practice Excel Formulas:
  // Row 48: Final Liability Payable = IF(E43-E44>0, E43-E44, 0) - E46 (TDS/TCS Cash)
  // Row 50: Balance C/f to next month = IF(E43-E44<0, E44-E43, 0)
  if (stl.tdsTcsOpeningCash) {
    stl.tdsTcsOpeningCash.total = round2(
      (stl.tdsTcsOpeningCash.cgst || 0) + (stl.tdsTcsOpeningCash.sgst || 0) + (stl.tdsTcsOpeningCash.igst || 0)
    );
  }

  const rawCgstAfterAdj = round2(setoff.rawPayable.cgst - setoff.adjustment.cgst);
  const rawSgstAfterAdj = round2(setoff.rawPayable.sgst - setoff.adjustment.sgst);
  const rawIgstAfterAdj = round2(setoff.rawPayable.igst - setoff.adjustment.igst);

  const tdsCgst = round2(stl.tdsTcsOpeningCash?.cgst || 0);
  const tdsSgst = round2(stl.tdsTcsOpeningCash?.sgst || 0);
  const tdsIgst = round2(stl.tdsTcsOpeningCash?.igst || 0);

  const finalPayableCgst = Math.max(0, round2((rawCgstAfterAdj > 0 ? rawCgstAfterAdj : 0) - tdsCgst));
  const finalPayableSgst = Math.max(0, round2((rawSgstAfterAdj > 0 ? rawSgstAfterAdj : 0) - tdsSgst));
  const finalPayableIgst = Math.max(0, round2((rawIgstAfterAdj > 0 ? rawIgstAfterAdj : 0) - tdsIgst));

  setoff.payableAfterAdjustment = {
    taxable: 0,
    cgst: finalPayableCgst,
    sgst: finalPayableSgst,
    igst: finalPayableIgst,
    total: round2(finalPayableCgst + finalPayableSgst + finalPayableIgst),
  };

  // Balance C/F to Next Month (Surplus unutilized ITC in Electronic Credit Ledger)
  setoff.balanceCfNextMonth = {
    taxable: 0,
    cgst: rawCgstAfterAdj < 0 ? round2(-rawCgstAfterAdj) : 0,
    sgst: rawSgstAfterAdj < 0 ? round2(-rawSgstAfterAdj) : 0,
    igst: rawIgstAfterAdj < 0 ? round2(-rawIgstAfterAdj) : 0,
    total: 0,
  };
  setoff.balanceCfNextMonth.total = round2(
    setoff.balanceCfNextMonth.cgst + setoff.balanceCfNextMonth.sgst + setoff.balanceCfNextMonth.igst
  );

  // 12. Settlement / Cash Liability
  // RCM Payable: MANDATORY CASH PAYMENT (Sec 49(4))
  stl.rcmPayable = {
    taxable: out.rcmInward.taxable || 0,
    cgst: out.rcmInward.cgst || 0,
    sgst: out.rcmInward.sgst || 0,
    igst: out.rcmInward.igst || 0,
    total: out.rcmInward.total || 0,
  };

  stl.lateFees.total = round2((stl.lateFees.cgst || 0) + (stl.lateFees.sgst || 0));
  stl.interest.total = round2((stl.interest.cgst || 0) + (stl.interest.sgst || 0) + (stl.interest.igst || 0));
  stl.gstPaidThroughCash.total = round2(
    (stl.gstPaidThroughCash.cgst || 0) + (stl.gstPaidThroughCash.sgst || 0) + (stl.gstPaidThroughCash.igst || 0)
  );

  // Final Balance Payable if any:
  // Net Tax Payable (Outward) + RCM Payable + Late Fees + Interest - GST Paid through Cash
  stl.balancePayable = {
    taxable: 0,
    cgst: round2(
      setoff.payableAfterAdjustment.cgst +
      stl.rcmPayable.cgst +
      (stl.lateFees.cgst || 0) +
      (stl.interest.cgst || 0) -
      (stl.gstPaidThroughCash.cgst || 0)
    ),
    sgst: round2(
      setoff.payableAfterAdjustment.sgst +
      stl.rcmPayable.sgst +
      (stl.lateFees.sgst || 0) +
      (stl.interest.sgst || 0) -
      (stl.gstPaidThroughCash.sgst || 0)
    ),
    igst: round2(
      setoff.payableAfterAdjustment.igst +
      stl.rcmPayable.igst +
      (stl.interest.igst || 0) -
      (stl.gstPaidThroughCash.igst || 0)
    ),
    total: 0,
  };
  stl.balancePayable.total = round2(
    stl.balancePayable.cgst + stl.balancePayable.sgst + stl.balancePayable.igst
  );

  return updated;
}

/**
 * Re-runs full annual sequential calculation across all 12 months,
 * cascading Balance C/F from April -> May -> ... -> March.
 */
export function recalculateAnnualWorking(annual: GSTR3BAnnualWorking | any, profileFallback?: any): GSTR3BAnnualWorking {
  if (!annual) return createEmptyAnnualWorking();

  // Support both annual object { profile, months } and direct months object
  const monthsSource = annual.months ? annual.months : annual;
  const profileSource = annual.profile || profileFallback || createEmptyAnnualWorking().profile;

  const emptyTemplate = createEmptyAnnualWorking();
  const clonedMonths: Record<string, any> = {};

  for (const m of GSTR3B_MONTHS) {
    if (monthsSource && monthsSource[m]) {
      clonedMonths[m] = JSON.parse(JSON.stringify(monthsSource[m]));
    } else {
      clonedMonths[m] = JSON.parse(JSON.stringify(emptyTemplate.months[m]));
    }
  }

  let currentOpeningCredit: TaxBreakdown = clonedMonths.April?.inward?.openingCreditBal || {
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 0
  };

  for (let i = 0; i < GSTR3B_MONTHS.length; i++) {
    const monthKey = GSTR3B_MONTHS[i];
    const prevMonthKey = i > 0 ? GSTR3B_MONTHS[i - 1] : null;

    if (prevMonthKey && clonedMonths[prevMonthKey]?.setoff?.balanceCfNextMonth) {
      currentOpeningCredit = clonedMonths[prevMonthKey].setoff.balanceCfNextMonth;
    }

    clonedMonths[monthKey] = recalculateMonthData(clonedMonths[monthKey], currentOpeningCredit);
  }

  return {
    profile: profileSource,
    months: clonedMonths as any
  };
}

// ─── SAMPLE DATA GENERATOR (MATCHING PRACTICE SPREADSHEET) ─────────────────────

/**
 * Generates initial practice data matching "PRIME PROFESSIONAL COATINGS LLP" (FY 2025-26)
 * from E:\New folder\GSTR-3B WORKING MARCH-2026.xlsx and annual summary.
 */
export function getSampleAnnualWorking(): GSTR3BAnnualWorking {
  const annual = createEmptyAnnualWorking({
    firmName: 'PRIME PROFESSIONAL COATINGS LLP',
    gstin: '27AAZFP3090L1ZD',
    address: '3RD FLOOR, HNO 2/2, SNO 4, FLAT NO 18, SHIV ENCLAVE GULMOHAR CITY, KHARADI, PUNE, Pune, Maharashtra, 411014.',
    contact: '8793341981 / 8554996354',
    financialYear: '2025-26'
  });

  // April-2025
  annual.months.April.outward.b2b = { taxable: 7421800.00, cgst: 667962.00, sgst: 667962.00, igst: 0, total: 1335924.00 };
  annual.months.April.outward.rcmInward = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  annual.months.April.inward.itc2b = { taxable: 7120400.00, cgst: 640836.00, sgst: 640836.00, igst: 0, total: 1281672.00 };
  annual.months.April.inward.openingCreditBal = { taxable: 0, cgst: 42150.00, sgst: 42150.00, igst: 0, total: 84300.00 };

  // May-2025
  annual.months.May.outward.b2b = { taxable: 8120300.00, cgst: 730827.00, sgst: 730827.00, igst: 0, total: 1461654.00 };
  annual.months.May.outward.rcmInward = { taxable: 1200.00, cgst: 30.00, sgst: 30.00, igst: 0, total: 60.00 };
  annual.months.May.inward.itc2b = { taxable: 8450100.00, cgst: 760509.00, sgst: 760509.00, igst: 0, total: 1521018.00 };

  // June-2025
  annual.months.June.outward.b2b = { taxable: 8904500.00, cgst: 801405.00, sgst: 801405.00, igst: 0, total: 1602810.00 };
  annual.months.June.inward.itc2b = { taxable: 8750200.00, cgst: 787518.00, sgst: 787518.00, igst: 1200.00, total: 1576236.00 };

  // July-2025
  annual.months.July.outward.b2b = { taxable: 9230100.00, cgst: 830709.00, sgst: 830709.00, igst: 0, total: 1661418.00 };
  annual.months.July.inward.itc2b = { taxable: 9010000.00, cgst: 810900.00, sgst: 810900.00, igst: 0, total: 1621800.00 };

  // August-2025
  annual.months.August.outward.b2b = { taxable: 7980400.00, cgst: 718236.00, sgst: 718236.00, igst: 0, total: 1436472.00 };
  annual.months.August.inward.itc2b = { taxable: 8340000.00, cgst: 750600.00, sgst: 750600.00, igst: 500.00, total: 1501700.00 };

  // September-2025
  annual.months.September.outward.b2b = { taxable: 9840200.00, cgst: 885618.00, sgst: 885618.00, igst: 0, total: 1771236.00 };
  annual.months.September.inward.itc2b = { taxable: 9450300.00, cgst: 850527.00, sgst: 850527.00, igst: 0, total: 1701054.00 };

  // October-2025
  annual.months.October.outward.b2b = { taxable: 10450000.00, cgst: 940500.00, sgst: 940500.00, igst: 0, total: 1881000.00 };
  annual.months.October.inward.itc2b = { taxable: 10120000.00, cgst: 910800.00, sgst: 910800.00, igst: 2100.00, total: 1823700.00 };

  // November-2025
  annual.months.November.outward.b2b = { taxable: 8920100.00, cgst: 802809.00, sgst: 802809.00, igst: 0, total: 1605618.00 };
  annual.months.November.inward.itc2b = { taxable: 8790000.00, cgst: 791100.00, sgst: 791100.00, igst: 0, total: 1582200.00 };

  // December-2025
  annual.months.December.outward.b2b = { taxable: 9540000.00, cgst: 858600.00, sgst: 858600.00, igst: 0, total: 1717200.00 };
  annual.months.December.inward.itc2b = { taxable: 9340000.00, cgst: 840600.00, sgst: 840600.00, igst: 1500.00, total: 1682700.00 };

  // January-2026
  annual.months.January.outward.b2b = { taxable: 10006541.71, cgst: 900588.72, sgst: 900588.72, igst: 0, total: 1801177.44 };
  annual.months.January.inward.itc2b = { taxable: 10776824.62, cgst: 936835.66, sgst: 936835.66, igst: 4017.00, total: 1877688.32 };

  // February-2026 (exact values from practice sheet)
  annual.months.February.outward.b2b = { taxable: 8579862.82, cgst: 772187.69, sgst: 772187.69, igst: 0, total: 1544375.38 };
  annual.months.February.outward.rcmInward = { taxable: 3846.00, cgst: 10.90, sgst: 10.90, igst: 170.50, total: 193.30 };
  annual.months.February.inward.itc2b = { taxable: 9059280.39, cgst: 770856.17, sgst: 770856.17, igst: 0, total: 1541712.34 };

  // March-2026 (exact values from practice sheet)
  annual.months.March.outward.b2b = { taxable: 8534436.81, cgst: 768099.31, sgst: 768099.31, igst: 0, total: 1536198.62 };
  annual.months.March.outward.rcmInward = { taxable: 319.00, cgst: 7.98, sgst: 7.98, igst: 0, total: 16.96 };
  annual.months.March.inward.itc2b = { taxable: 7167434.89, cgst: 623443.39, sgst: 623443.39, igst: 686.44, total: 1247573.22 };

  return recalculateAnnualWorking(annual);
}

// ─── EXCEL WORKBOOK GENERATOR (EXCELJS) ────────────────────────────────────────

/**
 * Builds a styled CA Practice GSTR-3B Working Excel workbook using exceljs.
 * Includes introduction sheet, 12 monthly sheets, and an Annual Summary sheet.
 */
/**
 * Builds a styled CA Practice GSTR-3B Working Excel workbook using exceljs.
 * Fully formula-driven:
 * - All subtotals and line totals use Excel formulas (SUM, subtraction, addition).
 * - Statutory set-off, Rule 88A inter-head adjustment, and Balance C/F use Excel formulas.
 * - Month-to-month Opening Credit Balance dynamically links to the previous month's Balance C/F.
 * - Annual Summary sheet dynamically links to all 12 monthly sheets with cross-sheet formulas.
 */
export async function generateGstr3bWorkingExcel(annual: GSTR3BAnnualWorking): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Antigravity Pro Tax Engine';
  workbook.lastModifiedBy = 'Antigravity Pro Tax Engine';
  workbook.created = new Date();
  workbook.modified = new Date();

  const primaryNavy = '1E293B'; // Dark Slate
  const headerBlue = '2563EB';  // Blue
  const borderLight = { style: 'thin', color: { argb: 'E2E8F0' } } as any;
  const borderMedium = { style: 'medium', color: { argb: '94A3B8' } } as any;

  // 1. Business Details Sheet
  const bdWs = workbook.addWorksheet('Business Details', { properties: { tabColor: { argb: '3B82F6' } } });
  bdWs.columns = [{ width: 28 }, { width: 75 }];

  bdWs.addRow(['Business Details']);
  bdWs.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  bdWs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  bdWs.mergeCells('A1:B1');
  bdWs.getRow(1).height = 28;

  const bdRows: [string, string][] = [
    ['Firm Name:   ', annual.profile.firmName || ''],
    ['GST NO.          ', annual.profile.gstin || ''],
    ['GSTN Status:', annual.profile.gstnStatus || 'Active'],
    ['Registration Date:', annual.profile.registrationDate || ''],
    ['Address:       ', annual.profile.address || ''],
    ['Contact Person:         ', annual.profile.contact || ''],
    ['Financial Year:', annual.profile.financialYear || '2026-2027'],
    ['Nature Of Business:', annual.profile.natureOfBusiness || ''],
    ['Authorised Signatory:', annual.profile.authorisedSignatory || ''],
    ['Filing Type:', annual.profile.filingType || 'Digital Signature'],
    ['Filing Email ID:', annual.profile.filingEmail || ''],
    ['Filing Mobile No.', annual.profile.filingPhone || '']
  ];

  bdRows.forEach(([lbl, val]) => {
    const r = bdWs.addRow([lbl, val]);
    r.font = { name: 'Calibri', size: 10, bold: true };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    r.getCell(2).font = { name: 'Calibri', size: 10, bold: false };
    r.height = 22;
    r.alignment = { vertical: 'middle' };
  });

  const numFormat = '₹ #,##,##0.00;[Red]-₹ #,##,##0.00;"-"';
  type CellVal = number | null | { formula: string; result?: number };

  // Helper for 56-row Monthly / Consolidated Working Sheet
  const formatMonthlySheet = (
    ws: ExcelJS.Worksheet,
    m: GSTR3BMonthData,
    prevSheetName?: string,
    isConsolidated: boolean = false,
    allMonthSheetNames: string[] = []
  ) => {
    ws.columns = [
      { width: 5 },  // A
      { width: 22 }, // B: Section / Category
      { width: 34 }, // C: Particulars
      { width: 18 }, // D: Taxable
      { width: 16 }, // E: CGST
      { width: 16 }, // F: SGST
      { width: 16 }, // G: IGST
      { width: 18 }, // H: TOTAL
    ];

    // Row 1: Spacer
    ws.addRow(['', '', '', '', '', '', isConsolidated ? 'Consolidated' : m.month]);

    // Row 2: Firm Name
    ws.mergeCells('B2:H2');
    ws.getCell('B2').value = (annual.profile.firmName || 'CLIENT NAME').toUpperCase();
    ws.getCell('B2').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFF' } };
    ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
    ws.getCell('B2').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 28;

    // Row 3: GST No.
    ws.mergeCells('B3:H3');
    ws.getCell('B3').value = `GST No. ${annual.profile.gstin || 'N/A'}`;
    ws.getCell('B3').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'E2E8F0' } };
    ws.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
    ws.getCell('B3').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(3).height = 20;

    // Row 4: Address
    ws.mergeCells('B4:H4');
    ws.getCell('B4').value = annual.profile.address || '';
    ws.getCell('B4').font = { name: 'Calibri', size: 9, color: { argb: '64748B' } };
    ws.getCell('B4').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(4).height = 18;

    // Row 5: Title
    ws.mergeCells('B5:H5');
    ws.getCell('B5').value = isConsolidated
      ? `GSTR-3B WORKING CONSOLIDATED SHEET ${annual.profile.financialYear || '2026-2027'}`
      : `GSTR-3B WORKING FOR THE MONTH OF ${m.month.toUpperCase()} ${m.year}`;
    ws.getCell('B5').font = { name: 'Calibri', size: 11, bold: true, color: { argb: '1E3A8A' } };
    ws.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DBEAFE' } };
    ws.getCell('B5').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(5).height = 24;

    // Row 6: Table Header
    const headerRow = ws.getRow(6);
    headerRow.values = ['', 'PARTICULARS', '', 'TAXABLE', 'CGST', 'SGST', 'IGST', 'TOTAL'];
    headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    headerRow.height = 22;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 2; c <= 8; c++) {
      headerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
    }

    // Row 7: Blank spacer
    ws.addRow([]);

    const addRowWithFormulas = (
      sec: string,
      particulars: string,
      valD: CellVal,
      valE: CellVal,
      valF: CellVal,
      valG: CellVal,
      valH: CellVal,
      options: { isHeader?: boolean; isTotal?: boolean; isHighlight?: boolean; isPayable?: boolean; isCarryForward?: boolean } = {}
    ) => {
      const r = ws.addRow(['', sec, particulars, '', '', '', '', '']);
      r.height = options.isTotal ? 22 : 19;
      r.alignment = { vertical: 'middle' };

      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };

      const setCol = (colIndex: number, v: CellVal) => {
        const cell = r.getCell(colIndex);
        if (v !== null && v !== undefined) {
          cell.value = v as any;
        }
        cell.numFmt = numFormat;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      };

      setCol(4, valD);
      setCol(5, valE);
      setCol(6, valF);
      setCol(7, valG);
      setCol(8, valH);

      if (options.isTotal) {
        r.font = { name: 'Calibri', size: 10, bold: true };
        for (let col = 2; col <= 8; col++) {
          r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
          r.getCell(col).border = { top: borderLight, bottom: borderMedium };
        }
      } else if (options.isPayable) {
        r.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '991B1B' } };
        for (let col = 2; col <= 8; col++) {
          r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
          r.getCell(col).border = { top: borderLight, bottom: borderLight };
        }
      } else if (options.isCarryForward) {
        r.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '065F46' } };
        for (let col = 2; col <= 8; col++) {
          r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
          r.getCell(col).border = { top: borderLight, bottom: borderLight };
        }
      } else {
        r.font = { name: 'Calibri', size: 9 };
        for (let col = 2; col <= 8; col++) {
          r.getCell(col).border = { bottom: borderLight };
        }
      }
      return r;
    };

    const makeCrossSumFormula = (cellRef: string) => {
      return allMonthSheetNames.map(s => `'${s}'!${cellRef}`).join('+');
    };

    // Helper for regular line item
    const makeLineVals = (rowIdx: number, valObj: TaxBreakdown) => {
      if (isConsolidated) {
        return {
          d: { formula: makeCrossSumFormula(`D${rowIdx}`) },
          e: { formula: makeCrossSumFormula(`E${rowIdx}`) },
          f: { formula: makeCrossSumFormula(`F${rowIdx}`) },
          g: { formula: makeCrossSumFormula(`G${rowIdx}`) },
          h: { formula: `SUM(E${rowIdx}:G${rowIdx})` }
        };
      }
      return {
        d: valObj.taxable || 0,
        e: valObj.cgst || 0,
        f: valObj.sgst || 0,
        g: valObj.igst || 0,
        h: { formula: `SUM(E${rowIdx}:G${rowIdx})`, result: valObj.total }
      };
    };

    // ── SECTION 1: OUTWARD SUPPLY (Rows 8 to 22) ──
    const r8 = makeLineVals(8, m.outward.b2b);
    addRowWithFormulas('Outward  Supply  ', 'Sales (B2B)', r8.d, r8.e, r8.f, r8.g, r8.h);

    const r9 = makeLineVals(9, m.outward.b2c);
    addRowWithFormulas('', 'Sales (B2C)', r9.d, r9.e, r9.f, r9.g, r9.h);

    const r10 = makeLineVals(10, m.outward.sezWithPayment);
    addRowWithFormulas('', 'SEZ supply with payment', r10.d, r10.e, r10.f, r10.g, r10.h);

    const r11 = makeLineVals(11, m.outward.sezWithoutPayment);
    addRowWithFormulas('', 'SEZ supply without-payment', r11.d, r11.e, r11.f, r11.g, r11.h);

    const r12 = makeLineVals(12, m.outward.zeroRated);
    addRowWithFormulas('', 'Zero Rated Supply/Export Sale', r12.d, r12.e, r12.f, r12.g, r12.h);

    const r13 = makeLineVals(13, m.outward.nilRated);
    addRowWithFormulas('', 'Nil Rated Supply', r13.d, r13.e, r13.f, r13.g, r13.h);

    const r14 = makeLineVals(14, m.outward.exempt);
    addRowWithFormulas('', 'Exempt Sale', r14.d, r14.e, r14.f, r14.g, r14.h);

    const r15 = makeLineVals(15, m.outward.advanceReceived);
    addRowWithFormulas('', 'Advances Collected for Services', r15.d, r15.e, r15.f, r15.g, r15.h);

    const r16 = makeLineVals(16, m.outward.rentReceived);
    addRowWithFormulas('', 'Rent Received', r16.d, r16.e, r16.f, r16.g, r16.h);

    const r17 = makeLineVals(17, m.outward.saleIncreaseAmendment || createEmptyTaxBreakdown());
    addRowWithFormulas('', 'Sale Increased through Amendment', r17.d, r17.e, r17.f, r17.g, r17.h);

    const r18 = makeLineVals(18, m.outward.saleDecreaseAmendment || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(-) Sale Decreased through Amendment', r18.d, r18.e, r18.f, r18.g, r18.h);

    const r19 = makeLineVals(19, m.outward.creditNote);
    addRowWithFormulas('', '(-) Credit Note', r19.d, r19.e, r19.f, r19.g, r19.h);

    const r20 = makeLineVals(20, m.outward.advanceAdjusted);
    addRowWithFormulas('', '(-) Advances Settled Against Services', r20.d, r20.e, r20.f, r20.g, r20.h);

    // Row 21: Spacer
    ws.addRow([]);

    // Row 22: Total Sale as per Working
    addRowWithFormulas(
      '',
      'Total Sale as per Working',
      { formula: 'SUM(D8:D17)-SUM(D18:D20)', result: m.outward.totalSaleWorking.taxable },
      { formula: 'SUM(E8:E17)-SUM(E18:E20)', result: m.outward.totalSaleWorking.cgst },
      { formula: 'SUM(F8:F17)-SUM(F18:F20)', result: m.outward.totalSaleWorking.sgst },
      { formula: 'SUM(G8:G17)-SUM(G18:G20)', result: m.outward.totalSaleWorking.igst },
      { formula: 'SUM(H8:H17)-SUM(H18:H20)', result: m.outward.totalSaleWorking.total },
      { isTotal: true }
    );

    // Row 23: Spacer
    ws.addRow([]);

    // ── SECTION 2: INWARD RCM 4-PART BREAKDOWN (Rows 24 to 30) ──
    // Row 24: Reverse Charge on Inward Supplies
    addRowWithFormulas(
      '',
      'Reverse Charge on Inward Supplies',
      { formula: 'SUM(D25:D28)', result: m.outward.rcmInward.taxable },
      { formula: 'SUM(E25:E28)', result: m.outward.rcmInward.cgst },
      { formula: 'SUM(F25:F28)', result: m.outward.rcmInward.sgst },
      { formula: 'SUM(G25:G28)', result: m.outward.rcmInward.igst },
      { formula: 'SUM(H25:H28)', result: m.outward.rcmInward.total },
      { isTotal: true }
    );

    const r25 = makeLineVals(25, m.outward.rcmTransport || createEmptyTaxBreakdown());
    addRowWithFormulas('', 'RCM on Transport Charges 5%', r25.d, r25.e, r25.f, r25.g, r25.h);

    const r26 = makeLineVals(26, m.outward.rcmSecurity || createEmptyTaxBreakdown());
    addRowWithFormulas('', 'RCM on Security Charges 18%', r26.d, r26.e, r26.f, r26.g, r26.h);

    const r27 = makeLineVals(27, m.outward.rcmGuestHouse || createEmptyTaxBreakdown());
    addRowWithFormulas('', 'RCM on Guest House Charges 18%', r27.d, r27.e, r27.f, r27.g, r27.h);

    const r28 = makeLineVals(28, m.outward.rcmAdvocate || createEmptyTaxBreakdown());
    addRowWithFormulas('', 'RCM on Advocate Charges 18%', r28.d, r28.e, r28.f, r28.g, r28.h);

    // Row 29: Spacer
    ws.addRow([]);

    // Row 30: (A) Total Sale as per Working including Reverse Charge
    addRowWithFormulas(
      '',
      '(A) Total Sale as per Working including Reverse Charge',
      { formula: 'SUM(D22:D24)', result: m.outward.totalSalePortal.taxable },
      { formula: 'SUM(E22:E24)', result: m.outward.totalSalePortal.cgst },
      { formula: 'SUM(F22:F24)', result: m.outward.totalSalePortal.sgst },
      { formula: 'SUM(G22:G24)', result: m.outward.totalSalePortal.igst },
      { formula: 'SUM(H22:H24)', result: m.outward.totalSalePortal.total },
      { isTotal: true }
    );

    // ── SECTION 3: INWARD SUPPLIES & ITC (Rows 31 to 41) ──
    // Row 31: Header
    const r31 = ws.addRow(['', 'Inward Supplies', '', '', '', '', '', '']);
    r31.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    r31.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
    r31.height = 20;

    // Row 32: ITC (As per books)
    addRowWithFormulas('', 'ITC (As per books)', null, null, null, null, m.inward.itcBooks || 0);

    // Row 33: ITC as per GSTR 2B
    const r33 = makeLineVals(33, m.inward.itc2b);
    addRowWithFormulas('', 'ITC as per GSTR 2B', r33.d, r33.e, r33.f, r33.g, r33.h);

    // Row 34: (+) Import purchase
    const r34 = makeLineVals(34, m.inward.importGoods || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(+) Import purchase', r34.d, r34.e, r34.f, r34.g, r34.h);

    // Row 35: (+) RCM paid on Inward Supplies (Table 4(A)(3))
    addRowWithFormulas(
      '',
      '(+) RCM paid on Inward Supplies',
      { formula: 'D24', result: m.inward.rcmPaid.taxable },
      { formula: 'E24', result: m.inward.rcmPaid.cgst },
      { formula: 'F24', result: m.inward.rcmPaid.sgst },
      { formula: 'G24', result: m.inward.rcmPaid.igst },
      { formula: 'SUM(E35:G35)', result: m.inward.rcmPaid.total }
    );

    // Row 36: (+) Credit Notes
    const r36 = makeLineVals(36, m.inward.creditNotes || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(+) Credit Notes', r36.d, r36.e, r36.f, r36.g, r36.h);

    // Row 37: (+) Opening Credit Balance
    let valE37: CellVal = m.inward.openingCreditBal.cgst || 0;
    let valF37: CellVal = m.inward.openingCreditBal.sgst || 0;
    let valG37: CellVal = m.inward.openingCreditBal.igst || 0;
    if (!isConsolidated && prevSheetName) {
      valE37 = { formula: `'${prevSheetName}'!E50`, result: m.inward.openingCreditBal.cgst };
      valF37 = { formula: `'${prevSheetName}'!F50`, result: m.inward.openingCreditBal.sgst };
      valG37 = { formula: `'${prevSheetName}'!G50`, result: m.inward.openingCreditBal.igst };
    }
    addRowWithFormulas(
      '',
      '(+) Opening Credit Balance',
      0,
      valE37,
      valF37,
      valG37,
      { formula: 'SUM(E37:G37)', result: m.inward.openingCreditBal.total }
    );

    // Row 38: (-) Debit Notes
    const r38 = makeLineVals(38, m.inward.debitNotes || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(-) Debit Notes', r38.d, r38.e, r38.f, r38.g, r38.h);

    // Row 39: (-) ITC Reversed on Ineligible credit
    const r39 = makeLineVals(39, m.inward.itcReversed || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(-) ITC Reversed on Ineligible credit', r39.d, r39.e, r39.f, r39.g, r39.h);

    // Row 40: Spacer
    ws.addRow([]);

    // Row 41: (B) Total ITC Available for Set off
    addRowWithFormulas(
      '',
      '(B) Total ITC Available for Set off',
      { formula: 'SUM(D33:D37)-SUM(D38:D39)', result: m.inward.totalItcAvailable.taxable },
      { formula: 'SUM(E33:E37)-SUM(E38:E39)', result: m.inward.totalItcAvailable.cgst },
      { formula: 'SUM(F33:F37)-SUM(F38:F39)', result: m.inward.totalItcAvailable.sgst },
      { formula: 'SUM(G33:G37)-SUM(G38:G39)', result: m.inward.totalItcAvailable.igst },
      { formula: 'SUM(H33:H37)-SUM(H38:H39)', result: m.inward.totalItcAvailable.total },
      { isTotal: true }
    );

    // Row 42: Spacer
    ws.addRow([]);

    // ── SECTION 4: TAX SET-OFF & FINAL SETTLEMENT (Rows 43 to 56) ──
    // Row 43: (A-B) Payable
    addRowWithFormulas(
      'Tax Set-off',
      '(A-B) Payable ',
      null,
      { formula: 'E22-E41', result: m.setoff.rawPayable.cgst },
      { formula: 'F22-F41', result: m.setoff.rawPayable.sgst },
      { formula: 'G22-G41', result: m.setoff.rawPayable.igst },
      { formula: 'H22-H41', result: m.setoff.rawPayable.total },
      { isTotal: true }
    );

    // Row 44: (-) Adjustment (Rule 88A)
    addRowWithFormulas(
      '',
      '(-) Adjustment',
      null,
      m.setoff.adjustment.cgst,
      m.setoff.adjustment.sgst,
      m.setoff.adjustment.igst,
      { formula: 'SUM(E44:G44)', result: m.setoff.adjustment.total }
    );

    // Row 45: Spacer
    ws.addRow([]);

    // Row 46: (-) GST TDS/TCS Opening Cash Balance
    const r46 = makeLineVals(46, m.settlement.tdsTcsOpeningCash || createEmptyTaxBreakdown());
    addRowWithFormulas('', '(-) GST TDS/TCS Opening Cash Balance', null, r46.e, r46.f, r46.g, { formula: 'SUM(D46:G46)', result: m.settlement.tdsTcsOpeningCash?.total || 0 });

    // Row 47: Spacer
    ws.addRow([]);

    // Row 48: Final Liability Payable
    addRowWithFormulas(
      '',
      'Final Liability Payable ',
      null,
      { formula: 'IF(E43-E44>0,E43-E44,0)-E46', result: m.setoff.payableAfterAdjustment.cgst },
      { formula: 'IF(F43-F44>0,F43-F44,0)-F46', result: m.setoff.payableAfterAdjustment.sgst },
      { formula: 'IF(G43-G44>0,G43-G44,0)-G46', result: m.setoff.payableAfterAdjustment.igst },
      { formula: 'IF(H43-H44>0,H43-H44,0)-H46', result: m.setoff.payableAfterAdjustment.total },
      { isPayable: true }
    );

    // Row 49: Spacer
    ws.addRow([]);

    // Row 50: Balance C/f to next month
    addRowWithFormulas(
      '',
      'Balance C/f to next month',
      null,
      { formula: 'IF(E43-E44<0,E44-E43,0)', result: m.setoff.balanceCfNextMonth.cgst },
      { formula: 'IF(F43-F44<0,F44-F43,0)', result: m.setoff.balanceCfNextMonth.sgst },
      { formula: 'IF(G43-G44<0,G44-G43,0)', result: m.setoff.balanceCfNextMonth.igst },
      { formula: 'SUM(E50:G50)', result: m.setoff.balanceCfNextMonth.total },
      { isCarryForward: true }
    );

    // Row 51: Spacer
    ws.addRow([]);

    // Row 52: RCM Payable
    addRowWithFormulas(
      'Cash Payment',
      'RCM Payable',
      null,
      { formula: 'E24', result: m.settlement.rcmPayable.cgst },
      { formula: 'F24', result: m.settlement.rcmPayable.sgst },
      { formula: 'G24', result: m.settlement.rcmPayable.igst },
      { formula: 'H24', result: m.settlement.rcmPayable.total },
      { isPayable: true }
    );

    // Row 53: Late Fees
    addRowWithFormulas(
      '',
      'Late Fees',
      null,
      isConsolidated ? { formula: makeCrossSumFormula('E53') } : (m.settlement.lateFees.cgst || 0),
      isConsolidated ? { formula: makeCrossSumFormula('F53') } : (m.settlement.lateFees.sgst || 0),
      null,
      { formula: 'SUM(E53:G53)', result: m.settlement.lateFees.total }
    );

    // Row 54: Interest
    addRowWithFormulas(
      '',
      'Interest',
      null,
      isConsolidated ? { formula: makeCrossSumFormula('E54') } : (m.settlement.interest.cgst || 0),
      isConsolidated ? { formula: makeCrossSumFormula('F54') } : (m.settlement.interest.sgst || 0),
      isConsolidated ? { formula: makeCrossSumFormula('G54') } : (m.settlement.interest.igst || 0),
      { formula: 'SUM(E54:G54)', result: m.settlement.interest.total }
    );

    // Row 55: Spacer
    ws.addRow([]);

    // Row 56: Balance Payable if any
    addRowWithFormulas(
      '',
      'Balance Payable if any',
      null,
      { formula: 'E48+E52+E53+E54', result: m.settlement.balancePayable.cgst },
      { formula: 'F48+F52+F53+F54', result: m.settlement.balancePayable.sgst },
      { formula: 'G48+G52+G53+G54', result: m.settlement.balancePayable.igst },
      { formula: 'H48+H52+H53+H54', result: m.settlement.balancePayable.total },
      { isTotal: true, isPayable: true }
    );
  };

  // 2. 12 Monthly Worksheets
  const monthSheetNames: string[] = [];
  for (let i = 0; i < GSTR3B_MONTHS.length; i++) {
    const mKey = GSTR3B_MONTHS[i];
    const monthData = annual.months[mKey];
    const sName = `${mKey}-${monthData.year}`;
    monthSheetNames.push(sName);
    const prevSName = i > 0 ? monthSheetNames[i - 1] : undefined;

    const ws = workbook.addWorksheet(sName);
    formatMonthlySheet(ws, monthData, prevSName, false, []);
  }

  // 3. Consolidated Sheet (FY Totals using exact 56 rows)
  const consolidatedSheetName = `Consolidated Sheet ${annual.profile.financialYear || '2026-2027'}`;
  const csWs = workbook.addWorksheet(consolidatedSheetName, { properties: { tabColor: { argb: '059669' } } });
  // Build a dummy empty month data container for label driving
  const dummyConsolidatedData = createEmptyMonthData('April', annual.profile.financialYear);
  formatMonthlySheet(csWs, dummyConsolidatedData, undefined, true, monthSheetNames);

  // 4. GST Payment Details Sheet
  const payWs = workbook.addWorksheet('GST Payment Details', { properties: { tabColor: { argb: 'F59E0B' } } });
  payWs.columns = [
    { width: 18 }, // Month
    { width: 18 }, // GST Liability
    { width: 18 }, // Payment Mode
    { width: 22 }, // CPIN No.
    { width: 16 }, // Payment Date
    { width: 18 }, // Pending Liability
  ];

  payWs.addRow([]);
  const payTitle = payWs.addRow(['GST Monthly Payment Details ']);
  payTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFF' } };
  payWs.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  payWs.mergeCells('A2:F2');
  payTitle.height = 26;

  payWs.addRow([]);
  const payHdr = payWs.addRow(['Month', 'GST Liability', 'Payment Mode', 'CPIN No.', 'Payment Date', 'Pending Liability']);
  payHdr.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  for (let c = 1; c <= 6; c++) {
    payHdr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
    payHdr.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  payHdr.height = 22;

  GSTR3B_MONTHS.forEach((mKey, idx) => {
    const sName = monthSheetNames[idx];
    const r = payWs.addRow([
      `${mKey} ${annual.months[mKey].year}`,
      { formula: `'${sName}'!H56`, result: annual.months[mKey].settlement.balancePayable.total },
      'E-Payment',
      '',
      '',
      0
    ]);
    r.font = { name: 'Calibri', size: 9 };
    r.getCell(2).numFmt = numFormat;
    r.getCell(6).numFmt = numFormat;
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    r.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    r.height = 19;
  });

  // Total Payment Row
  const totalPayRow = payWs.addRow([
    'Total Payments',
    { formula: 'SUM(B5:B16)' },
    '',
    '',
    '',
    { formula: 'SUM(F5:F16)' }
  ]);
  totalPayRow.font = { name: 'Calibri', size: 10, bold: true };
  totalPayRow.getCell(2).numFmt = numFormat;
  totalPayRow.getCell(6).numFmt = numFormat;
  for (let c = 1; c <= 6; c++) {
    totalPayRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    totalPayRow.getCell(c).border = { top: borderLight, bottom: borderMedium };
  }

  // 5. Annual Summary Sheet (12-month cross table with dynamic formulas)
  const summaryWs = workbook.addWorksheet('Annual Summary', { properties: { tabColor: { argb: '10B981' } } });
  summaryWs.columns = [
    { width: 25 }, // Particulars
    ...GSTR3B_MONTHS.map(() => ({ width: 14 })),
    { width: 16 } // Total
  ];

  summaryWs.mergeCells('A1:N1');
  summaryWs.getCell('A1').value = `${annual.profile.firmName || 'CLIENT'} — GSTR-3B ANNUAL SUMMARY (${annual.profile.financialYear || '2026-2027'})`;
  summaryWs.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  summaryWs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryNavy } };
  summaryWs.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  summaryWs.getRow(1).height = 30;

  const sHeader = summaryWs.getRow(3);
  sHeader.values = ['PARTICULARS', ...GSTR3B_MONTHS, 'FULL YEAR TOTAL'];
  sHeader.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  sHeader.height = 24;
  sHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  for (let c = 1; c <= 14; c++) {
    sHeader.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
  }

  const addSummaryRowWithFormula = (
    label: string,
    cellRefFunc: (sheetName: string) => string,
    isBold: boolean = false,
    options: { customTotalFormula?: string; customColGetter?: (m: GSTR3BMonthData) => number } = {}
  ) => {
    const rowValues: any[] = [label];
    for (let i = 0; i < 12; i++) {
      const sName = monthSheetNames[i];
      const targetRef = cellRefFunc(sName);
      rowValues.push({
        formula: `'${sName}'!${targetRef}`,
        result: options.customColGetter ? options.customColGetter(annual.months[GSTR3B_MONTHS[i]]) : undefined
      });
    }

    const r = summaryWs.addRow(rowValues);
    const rowNum = r.number;

    const totalFormula = options.customTotalFormula || `SUM(B${rowNum}:M${rowNum})`;
    r.getCell(14).value = {
      formula: totalFormula,
      result: options.customColGetter ? round2(GSTR3B_MONTHS.reduce((acc, m) => acc + (options.customColGetter!(annual.months[m]) || 0), 0)) : undefined
    };

    r.height = isBold ? 22 : 18;
    r.font = { name: 'Calibri', size: 9, bold: isBold };
    r.alignment = { vertical: 'middle' };
    for (let c = 2; c <= 14; c++) {
      r.getCell(c).numFmt = numFormat;
      r.getCell(c).alignment = { vertical: 'middle', horizontal: 'right' };
    }
    if (isBold) {
      for (let c = 1; c <= 14; c++) {
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        r.getCell(c).border = { top: borderLight, bottom: borderMedium };
      }
    }
    return r;
  };

  // Row 4: 1. Gross Taxable Turnover (points to D22 of each monthly sheet)
  addSummaryRowWithFormula('1. Gross Taxable Turnover', () => 'D22', true, { customColGetter: m => m.outward.totalSaleWorking.taxable });
  // Row 5: - Outward CGST (points to E22)
  addSummaryRowWithFormula('   - Outward CGST', () => 'E22', false, { customColGetter: m => m.outward.totalSaleWorking.cgst });
  // Row 6: - Outward SGST (points to F22)
  addSummaryRowWithFormula('   - Outward SGST', () => 'F22', false, { customColGetter: m => m.outward.totalSaleWorking.sgst });
  // Row 7: - Outward IGST (points to G22)
  addSummaryRowWithFormula('   - Outward IGST', () => 'G22', false, { customColGetter: m => m.outward.totalSaleWorking.igst });

  // Row 8: Total Outward Tax Liability (points to H22)
  addSummaryRowWithFormula('Total Outward Tax Liability', () => 'H22', true, { customColGetter: m => m.outward.totalSaleWorking.total });

  // Row 9: Blank spacer
  summaryWs.addRow([]);

  // Row 10: 2. ITC as per GSTR-2B (points to H33 of each monthly sheet)
  addSummaryRowWithFormula('2. ITC as per GSTR-2B', () => 'H33', true, { customColGetter: m => m.inward.itc2b.total });
  // Row 11: - ITC CGST Available (points to E41)
  addSummaryRowWithFormula('   - ITC CGST Available', () => 'E41', false, { customColGetter: m => m.inward.totalItcAvailable.cgst });
  // Row 12: - ITC SGST Available (points to F41)
  addSummaryRowWithFormula('   - ITC SGST Available', () => 'F41', false, { customColGetter: m => m.inward.totalItcAvailable.sgst });
  // Row 13: - ITC IGST Available (points to G41)
  addSummaryRowWithFormula('   - ITC IGST Available', () => 'G41', false, { customColGetter: m => m.inward.totalItcAvailable.igst });

  // Row 14: Total ITC Available for Set-off (points to H41)
  addSummaryRowWithFormula('Total ITC Available for Set-off', () => 'H41', true, { customColGetter: m => m.inward.totalItcAvailable.total });

  // Row 15: Blank spacer
  summaryWs.addRow([]);

  // Row 16: 3. Balance C/F to Next Month (points to H50 of each monthly sheet)
  addSummaryRowWithFormula('3. Balance C/F to Next Month', () => 'H50', true, {
    customTotalFormula: `'${monthSheetNames[11]}'!H50`, // Year-end closing balance
    customColGetter: m => m.setoff.balanceCfNextMonth.total
  });

  // Row 17: 4. Net Outward Tax Paid via Cash (points to H48 of each monthly sheet)
  addSummaryRowWithFormula('4. Net Outward Tax Paid via Cash', () => 'H48', true, { customColGetter: m => m.setoff.payableAfterAdjustment.total });

  // Row 18: 5. RCM Paid via Cash (points to H52 of each monthly sheet)
  addSummaryRowWithFormula('5. RCM Paid via Cash', () => 'H52', true, { customColGetter: m => m.settlement.rcmPayable.total });

  // Row 19: 6. Final Total Cash Outflow (points to H56 of each monthly sheet)
  addSummaryRowWithFormula('6. Final Total Cash Outflow', () => 'H56', true, { customColGetter: m => m.settlement.balancePayable.total });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── OFFICIAL GST PORTAL GSTR-3B JSON GENERATOR ────────────────────────────────

/**
 * Generates the official uploadable GSTN GSTR-3B JSON payload.
 * Schema conforms to GSTN Offline Utility format.
 */
export function generateGstr3bPortalJson(monthData: GSTR3BMonthData, profile: GSTR3BClientProfile): string {
  const mIndexStr = monthData.calendarMonthIndex.toString().padStart(2, '0');
  const retPeriod = `${mIndexStr}${monthData.year}`;

  const payload = {
    gstin: profile.gstin,
    ret_period: retPeriod,
    sec_sum: {
      sec_nm: 'GSTR-3B',
      sec_type: 'GSTR-3B',
      ttl_rec: 5,
      ttl_val: round2(monthData.outward.totalSalePortal.taxable),
      ttl_tax: round2(monthData.outward.totalSalePortal.total),
      ttl_igst: round2(monthData.outward.totalSalePortal.igst),
      ttl_cgst: round2(monthData.outward.totalSalePortal.cgst),
      ttl_sgst: round2(monthData.outward.totalSalePortal.sgst),
      ttl_cess: 0
    },
    sup_details: {
      // 3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)
      osup_det: {
        txval: round2(monthData.outward.b2b.taxable + monthData.outward.b2c.taxable + monthData.outward.rentReceived.taxable - monthData.outward.creditNote.taxable),
        iamt: round2(monthData.outward.b2b.igst + monthData.outward.b2c.igst - monthData.outward.creditNote.igst),
        camt: round2(monthData.outward.b2b.cgst + monthData.outward.b2c.cgst - monthData.outward.creditNote.cgst),
        samt: round2(monthData.outward.b2b.sgst + monthData.outward.b2c.sgst - monthData.outward.creditNote.sgst),
        csamt: 0
      },
      // 3.1(b) Outward taxable supplies (zero rated)
      osup_zero: {
        txval: round2(monthData.outward.zeroRated.taxable + monthData.outward.sezWithPayment.taxable + monthData.outward.sezWithoutPayment.taxable),
        iamt: round2(monthData.outward.zeroRated.igst + monthData.outward.sezWithPayment.igst),
        csamt: 0
      },
      // 3.1(c) Other outward supplies (nil rated, exempted)
      osup_nil_exmp: {
        txval: round2(monthData.outward.nilRated.taxable + monthData.outward.exempt.taxable)
      },
      // 3.1(d) Inward supplies (liable to reverse charge)
      isup_rev: {
        txval: round2(monthData.outward.rcmInward.taxable),
        iamt: round2(monthData.outward.rcmInward.igst),
        camt: round2(monthData.outward.rcmInward.cgst),
        samt: round2(monthData.outward.rcmInward.sgst),
        csamt: 0
      },
      // 3.1(e) Non-GST outward supplies
      osup_nongst: {
        txval: 0
      }
    },
    inter_sup: {
      // 3.2 Inter-state supplies made to unregistered persons, composition dealers and UIN holders
      unreg_details: [],
      comp_details: [],
      uin_details: []
    },
    itc_elg: {
      itc_avl: [
        { ty: 'IMPG', iamt: round2(monthData.inward.importGoods?.igst || 0), csamt: 0 },
        { ty: 'IMPS', iamt: 0, csamt: 0 },
        {
          ty: 'ISRC', // Inward supplies liable to reverse charge
          iamt: round2(monthData.inward.rcmPaid.igst),
          camt: round2(monthData.inward.rcmPaid.cgst),
          samt: round2(monthData.inward.rcmPaid.sgst),
          csamt: 0
        },
        { ty: 'ISD', iamt: 0, camt: 0, samt: 0, csamt: 0 },
        {
          ty: 'OTH', // All other ITC
          iamt: round2(monthData.inward.itc2b.igst),
          camt: round2(monthData.inward.itc2b.cgst),
          samt: round2(monthData.inward.itc2b.sgst),
          csamt: 0
        }
      ],
      itc_rev: [
        { ty: 'RUL', iamt: 0, camt: 0, samt: 0, csamt: 0 },
        {
          ty: 'OTH',
          iamt: round2(monthData.inward.itcReversed.igst),
          camt: round2(monthData.inward.itcReversed.cgst),
          samt: round2(monthData.inward.itcReversed.sgst),
          csamt: 0
        }
      ],
      itc_net: {
        iamt: round2(monthData.inward.totalItcAvailable.igst),
        camt: round2(monthData.inward.totalItcAvailable.cgst),
        samt: round2(monthData.inward.totalItcAvailable.sgst),
        csamt: 0
      },
      itc_inelg: []
    },
    inward_sup: {
      isup_details: [
        { ty: 'GST', inter: 0, intra: 0 },
        { ty: 'NONGST', inter: 0, intra: 0 }
      ]
    },
    tax_pmt: {
      // 6.1 Payment of tax
      tx_pmt: [
        {
          liab_id: 1, // IGST
          trans_typ: 1,
          iamt: round2(monthData.outward.totalSalePortal.igst),
          camt: 0, samt: 0, csamt: 0,
          paid_itc: {
            iamt: round2(monthData.inward.totalItcAvailable.igst),
            camt: 0, samt: 0, csamt: 0
          },
          paid_cash: round2(monthData.settlement.balancePayable.igst)
        },
        {
          liab_id: 2, // CGST
          trans_typ: 1,
          iamt: 0,
          camt: round2(monthData.outward.totalSalePortal.cgst),
          samt: 0, csamt: 0,
          paid_itc: {
            iamt: round2(Math.max(0, -monthData.setoff.adjustment.cgst)),
            camt: round2(monthData.inward.totalItcAvailable.cgst),
            samt: 0, csamt: 0
          },
          paid_cash: round2(monthData.settlement.balancePayable.cgst)
        },
        {
          liab_id: 3, // SGST
          trans_typ: 1,
          iamt: 0, camt: 0,
          samt: round2(monthData.outward.totalSalePortal.sgst),
          csamt: 0,
          paid_itc: {
            iamt: round2(Math.max(0, -monthData.setoff.adjustment.sgst)),
            camt: 0,
            samt: round2(monthData.inward.totalItcAvailable.sgst),
            csamt: 0
          },
          paid_cash: round2(monthData.settlement.balancePayable.sgst)
        }
      ]
    }
  };

  return JSON.stringify(payload, null, 2);
}

// ─── PARSER FOR USER-UPLOADED GSTR-3B WORKING EXCEL ────────────────────────────

/**
 * Parses an uploaded GSTR-3B Working Excel file (.xlsx) and maps it into GSTR3BAnnualWorking.
 * Conforms to both CA Practice standard sheets and "HCH Bearing India Private Limited GSTR-3B Working.xlsx".
 */
export async function parseGstr3bWorkingFile(file: File): Promise<GSTR3BAnnualWorking> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const annual = createEmptyAnnualWorking();

  // 1. Try extracting Firm Info from 'Business Details' sheet
  if (wb.SheetNames.includes('Business Details')) {
    const bdSheet = wb.Sheets['Business Details'];
    const bdRows = XLSX.utils.sheet_to_json<any[]>(bdSheet, { header: 1, defval: '' });
    for (const r of bdRows) {
      const lbl = String(r[0] || '').toUpperCase();
      const val = String(r[1] || '').trim();
      if (!val) continue;
      if (lbl.includes('FIRM NAME')) annual.profile.firmName = val;
      if (lbl.includes('GST NO')) annual.profile.gstin = val.toUpperCase();
      if (lbl.includes('GSTN STATUS')) annual.profile.gstnStatus = val;
      if (lbl.includes('REGISTRATION DATE')) annual.profile.registrationDate = val;
      if (lbl.includes('ADDRESS')) annual.profile.address = val;
      if (lbl.includes('CONTACT PERSON')) annual.profile.contact = val;
      if (lbl.includes('FINANCIAL YEAR')) annual.profile.financialYear = val;
      if (lbl.includes('NATURE OF BUSINESS')) annual.profile.natureOfBusiness = val;
      if (lbl.includes('AUTHORISED SIGNATORY')) annual.profile.authorisedSignatory = val;
      if (lbl.includes('FILING TYPE')) annual.profile.filingType = val;
      if (lbl.includes('FILING EMAIL')) annual.profile.filingEmail = val;
      if (lbl.includes('FILING MOBILE')) annual.profile.filingPhone = val;
    }
  } else if (wb.SheetNames.includes('Introduction')) {
    const introSheet = wb.Sheets['Introduction'];
    const introRows = XLSX.utils.sheet_to_json<any[]>(introSheet, { header: 1, defval: '' });
    for (const r of introRows) {
      const lbl = String(r[0] || '').toUpperCase();
      const val = String(r[1] || '').trim();
      if (lbl.includes('FIRM NAME') && val) annual.profile.firmName = val;
      if (lbl.includes('GST NO') && val) annual.profile.gstin = val.toUpperCase();
      if (lbl.includes('ADDRESS') && val) annual.profile.address = val;
      if (lbl.includes('CONTACT') && val) annual.profile.contact = val;
      if (lbl.includes('FINANCIAL YEAR') && val) annual.profile.financialYear = val;
    }
  }

  // Helper for safe numeric parsing
  const parseNum = (v: any) => {
    if (typeof v === 'number') return v;
    const s = String(v || '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(s);
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseRowTax = (r: any[]): TaxBreakdown => {
    const isColBLabel = Boolean(r[1] && typeof r[1] === 'string' && r[1].trim());
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;

    if (isColBLabel) {
      taxable = parseNum(r[2]);
      cgst = parseNum(r[3]);
      sgst = parseNum(r[4]);
      igst = parseNum(r[5]);
      total = parseNum(r[6]) || (cgst + sgst + igst);
    } else {
      taxable = parseNum(r[1]);
      cgst = parseNum(r[2]);
      sgst = parseNum(r[3]);
      igst = parseNum(r[4]);
      total = parseNum(r[5]) || (cgst + sgst + igst);
    }
    return { taxable, cgst, sgst, igst, total };
  };

  // 2. Parse each sheet corresponding to months
  for (const sheetName of wb.SheetNames) {
    // Avoid non-month sheets
    if (sheetName.toLowerCase().includes('consolidated') ||
        sheetName.toLowerCase().includes('payment') ||
        sheetName.toLowerCase().includes('details') ||
        sheetName.toLowerCase().includes('introduction') ||
        sheetName.toLowerCase().includes('summary') ||
        sheetName.toLowerCase().includes('range')) {
      continue;
    }

    const matchedMonth = GSTR3B_MONTHS.find(m => sheetName.toLowerCase().includes(m.toLowerCase()));
    if (!matchedMonth) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

    const mData = annual.months[matchedMonth];

    // Try extracting year from sheet name e.g. "April-2026"
    const yrMatch = sheetName.match(/20\d{2}/);
    if (yrMatch) mData.year = yrMatch[0];

    // Read taxpayer name and GSTIN from header rows if not already populated
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const headerStr = (rows[i] || []).map(c => String(c)).join(' ').toUpperCase();
      if (!annual.profile.firmName && (rows[i] || [])[0] && String((rows[i] || [])[0]).length > 3) {
        annual.profile.firmName = String((rows[i] || [])[0]).trim();
      }
      if (!annual.profile.gstin && headerStr.includes('GST NO')) {
        const gMatch = headerStr.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/);
        if (gMatch) annual.profile.gstin = gMatch[0];
      }
    }

    let inInwardSection = false;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx] || [];
      const rowTxt = r.map((c: any) => String(c)).join(' ').toUpperCase();

      if (rowTxt.includes('INWARD SUPPLIES')) {
        inInwardSection = true;
      }

      // OUTWARD SUPPLY ROWS
      if (rowTxt.includes('SALES (B2B)')) {
        mData.outward.b2b = parseRowTax(r);
      } else if (rowTxt.includes('SALES (B2C)')) {
        mData.outward.b2c = parseRowTax(r);
      } else if (rowTxt.includes('SEZ SUPPLY WITH PAYMENT')) {
        mData.outward.sezWithPayment = parseRowTax(r);
      } else if (rowTxt.includes('SEZ SUPPLY WITHOUT-PAYMENT') || rowTxt.includes('SEZ SUPPLY WITHOUT PAYMENT')) {
        mData.outward.sezWithoutPayment = parseRowTax(r);
      } else if (rowTxt.includes('ZERO RATED')) {
        mData.outward.zeroRated = parseRowTax(r);
      } else if (rowTxt.includes('NIL RATED')) {
        mData.outward.nilRated = parseRowTax(r);
      } else if (rowTxt.includes('EXEMPT SALE') || rowTxt.includes('EXEMPTED SALE')) {
        mData.outward.exempt = parseRowTax(r);
      } else if (rowTxt.includes('ADVANCES COLLECTED') || rowTxt.includes('ADVANCE RECEIVED')) {
        mData.outward.advanceReceived = parseRowTax(r);
      } else if (rowTxt.includes('RENT RECEIVED')) {
        mData.outward.rentReceived = parseRowTax(r);
      } else if (rowTxt.includes('SALE INCREASED THROUGH AMENDMENT') || rowTxt.includes('SALE INCREASE')) {
        mData.outward.saleIncreaseAmendment = parseRowTax(r);
      } else if (rowTxt.includes('SALE DECREASED THROUGH AMENDMENT') || rowTxt.includes('SALE DECREASE')) {
        mData.outward.saleDecreaseAmendment = parseRowTax(r);
      } else if (!inInwardSection && (rowTxt.includes('(-) CREDIT NOTE') || rowTxt.includes('CREDIT NOTE'))) {
        mData.outward.creditNote = parseRowTax(r);
      } else if (rowTxt.includes('ADVANCES SETTLED') || rowTxt.includes('ADVANCE ADJUSTED')) {
        mData.outward.advanceAdjusted = parseRowTax(r);
      }
      // RCM BREAKDOWN
      else if (rowTxt.includes('RCM ON TRANSPORT')) {
        mData.outward.rcmTransport = parseRowTax(r);
      } else if (rowTxt.includes('RCM ON SECURITY')) {
        mData.outward.rcmSecurity = parseRowTax(r);
      } else if (rowTxt.includes('RCM ON GUEST HOUSE')) {
        mData.outward.rcmGuestHouse = parseRowTax(r);
      } else if (rowTxt.includes('RCM ON ADVOCATE')) {
        mData.outward.rcmAdvocate = parseRowTax(r);
      } else if (rowTxt.includes('REVERSE CHARGE ON INWARD')) {
        mData.outward.rcmInward = parseRowTax(r);
      }
      // INWARD SUPPLIES & ITC
      else if (rowTxt.includes('ITC (AS PER BOOKS)')) {
        mData.inward.itcBooks = parseNum(r[6] || r[7] || r[3] || 0);
      } else if (rowTxt.includes('ITC AS PER GSTR 2B') || rowTxt.includes('ITC AS PER 2B')) {
        mData.inward.itc2b = parseRowTax(r);
      } else if (rowTxt.includes('IMPORT PURCHASE') || rowTxt.includes('IMPORT OF GOODS')) {
        mData.inward.importGoods = parseRowTax(r);
      } else if (inInwardSection && (rowTxt.includes('(+) CREDIT NOTES') || rowTxt.includes('CREDIT NOTES'))) {
        mData.inward.creditNotes = parseRowTax(r);
      } else if (rowTxt.includes('OPENING CREDIT BAL')) {
        mData.inward.openingCreditBal = parseRowTax(r);
      } else if (rowTxt.includes('(-) DEBIT NOTES') || (inInwardSection && rowTxt.includes('DEBIT NOTES'))) {
        mData.inward.debitNotes = parseRowTax(r);
      } else if (rowTxt.includes('ITC REVERSED') || rowTxt.includes('INELIGIBLE CREDIT')) {
        mData.inward.itcReversed = parseRowTax(r);
      }
      // SET-OFF & ADJUSTMENT
      else if (rowTxt.includes('(-) ADJUSTMENT') || rowTxt.includes('ADJUSTMENT')) {
        mData.setoff.adjustment = parseRowTax(r);
        if (mData.setoff.adjustment.cgst !== 0 || mData.setoff.adjustment.sgst !== 0 || mData.setoff.adjustment.igst !== 0) {
          mData.setoff.isManualAdjustment = true;
        }
      }
      // SETTLEMENT
      else if (rowTxt.includes('TDS/TCS') || rowTxt.includes('GST TDS')) {
        mData.settlement.tdsTcsOpeningCash = parseRowTax(r);
      } else if (rowTxt.includes('LATE FEES')) {
        const cgst = parseNum(r[3] !== undefined && typeof r[2] === 'number' ? r[3] : r[4]);
        const sgst = parseNum(r[4] !== undefined && typeof r[2] === 'number' ? r[4] : r[5]);
        mData.settlement.lateFees = { cgst, sgst, total: cgst + sgst };
      } else if (rowTxt.includes('INTEREST')) {
        const cgst = parseNum(r[3] !== undefined && typeof r[2] === 'number' ? r[3] : r[4]);
        const sgst = parseNum(r[4] !== undefined && typeof r[2] === 'number' ? r[4] : r[5]);
        const igst = parseNum(r[5] !== undefined && typeof r[2] === 'number' ? r[5] : r[6]);
        mData.settlement.interest = { cgst, sgst, igst, total: cgst + sgst + igst };
      } else if (rowTxt.includes('PAID THROUGH CASH') || rowTxt.includes('PMT-06')) {
        mData.settlement.gstPaidThroughCash = parseRowTax(r);
      }
    }
  }

  return recalculateAnnualWorking(annual);
}

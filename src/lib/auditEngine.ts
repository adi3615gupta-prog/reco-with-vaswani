import * as XLSX from 'xlsx-js-style';
import type { TallyFinalisationData, TallyFinalisationParty } from '@/lib/tallyApi';

export interface FinalisationScrutinyObservation {
  id: string;
  partyName: string;
  category:
    | 'Cash Payment / Sec 40A(3)'
    | 'TDS Deduction Mismatch'
    | 'Transporter Sec 194C(6) Declaration'
    | 'Purchase Sec 194Q (0.1% TDS)'
    | 'Hire Charges Sec 194I(a)'
    | 'Advance Pending Bill Booking'
    | 'Duplicate Invoice Risk'
    | 'Payment Only (No Expense Bill)'
    | 'Vehicle Repairs Outstanding'
    | 'Small Balance Write-Off (< ₹500)'
    | 'Reclassification to Expenditure'
    | 'Double Payment / Late Credit Note';
  severity: 'High' | 'Medium' | 'Low';
  amount?: number;
  queryDescription: string;
  suggestedAction: string;
  status: 'Pending' | 'Resolved' | 'Discussed with Client';
}

// ─── Types ──────────────────────────────────────────────────────────

export interface AuditParty {
  partyName: string;
  gstin: string;
  totalOutstanding: number;
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  days120_plus: number;
  avgPaymentDays: number; // Historical days to pay
  riskStatus: 'Low' | 'Medium' | 'High';
  parentGroup: 'Sundry Debtors' | 'Sundry Creditors' | 'Cash Account';
  email: string;
  phone: string;
  invoiceCount: number;
  bills?: {
    refNo: string;
    date: string;
    dueDate: string;
    amount: number;
    ageDays: number;
    isDebit?: boolean;
  }[];
  oldestInvoiceDate?: string;
  oldestInvoiceAge?: number;
  isAdvancePending?: boolean;
  netBalance?: number;
  periodTxCount?: number;
}

export interface CashAuditObservation {
  date: string;
  partyName: string;
  voucherType: string;
  voucherNumber: string;
  amount: number;
  type: 'Disallowed Payment (40A(3))' | 'Loan Violation (269SS/T)' | 'Negative Cash Balance';
  severity: 'High' | 'Medium' | 'Low';
  description: string;
  recommendation: string;
  runningBalance?: number;
}

export interface ForensicObservation {
  voucherNumber?: string;
  date?: string;
  partyName?: string;
  amount?: number;
  type: 'Voucher Gap' | 'Benford Anomaly' | 'Journal Anomaly';
  severity: 'High' | 'Medium' | 'Low';
  description: string;
  recommendation: string;
}

export interface BenfordAnalysisResult {
  digit: number;
  actualCount: number;
  actualPercentage: number;
  benfordPercentage: number;
  difference: number;
  isAnomaly: boolean;
}


export interface TallyVoucherEntry {
  date: string;
  voucherType: string;
  voucherNumber: string;
  amount: number;
  isDebit: boolean;
}

// ─── Calculations ───────────────────────────────────────────────────

export interface FIFOAgeingResult {
  totalOutstanding: number;
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  days120_plus: number;
  invoiceCount: number;
  openInvoices: {
    date: string;
    voucherType: string;
    voucherNumber: string;
    amount: number;
    remaining: number;
    ageDays: number;
  }[];
  netBalance: number;
  isAdvancePending: boolean;
}

/**
 * Computes FIFO ageing of outstanding balances.
 * For Sundry Debtors, debits are invoices, credits are receipts/payments.
 * For Sundry Creditors, credits are invoices, debits are receipts/payments.
 */
export function computeFifoAgeing(
  vouchers: TallyVoucherEntry[],
  ageingDateStr: string,
  isDebtor: boolean
): FIFOAgeingResult {
  const ageingDate = new Date(ageingDateStr);
  const evaluationTime = ageingDate.getTime();

  // Sort vouchers chronologically
  const sorted = [...vouchers].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    // Process charges first then applications/receipts
    const isChargeA = isDebtor ? a.isDebit : !a.isDebit;
    const isChargeB = isDebtor ? b.isDebit : !b.isDebit;
    if (isChargeA !== isChargeB) {
      return isChargeA ? -1 : 1;
    }
    return 0;
  });

  // Calculate Net Closing Balance and find latest voucher date
  let netBalance = 0;
  let latestDate = '2025-03-31';
  let latestVchNo = 'Pending Invoice';
  let latestVchType = isDebtor ? 'Advance Receipt' : 'Advance Payment';

  if (sorted.length > 0) {
    latestDate = sorted[sorted.length - 1].date;
    latestVchNo = sorted[sorted.length - 1].voucherNumber || 'Pending Invoice';
    latestVchType = sorted[sorted.length - 1].voucherType || (isDebtor ? 'Advance Receipt' : 'Advance Payment');
  }

  sorted.forEach(v => {
    // Debits increase debtors, credits decrease. Credits increase creditors, debits decrease.
    const change = isDebtor
      ? (v.isDebit ? v.amount : -v.amount)
      : (!v.isDebit ? v.amount : -v.amount);
    netBalance += change;
  });

  const isAdvancePending = netBalance < -0.01;

  interface ChargeItem {
    date: string;
    voucherType: string;
    voucherNumber: string;
    amount: number;
    remaining: number;
  }

  const openCharges: ChargeItem[] = [];
  let paymentPool = 0;

  for (const v of sorted) {
    const isCharge = isDebtor ? v.isDebit : !v.isDebit;
    const amount = v.amount;

    if (isCharge) {
      openCharges.push({
        date: v.date,
        voucherType: v.voucherType,
        voucherNumber: v.voucherNumber,
        amount: amount,
        remaining: amount
      });
    } else {
      paymentPool += amount;
    }

    // Apply payments FIFO
    while (paymentPool > 0.001 && openCharges.length > 0) {
      const earliest = openCharges[0];
      if (paymentPool >= earliest.remaining) {
        paymentPool -= earliest.remaining;
        openCharges.shift(); // paid off
      } else {
        earliest.remaining -= paymentPool;
        paymentPool = 0; // fully absorbed
      }
    }
  }

  let days0_30 = 0;
  let days31_60 = 0;
  let days61_90 = 0;
  let days91_120 = 0;
  let days120_plus = 0;
  let totalOutstanding = 0;

  let openInvoices: any[] = [];

  if (isAdvancePending) {
    const absOutstanding = Math.abs(netBalance);
    totalOutstanding = absOutstanding;

    const ageDays = Math.max(0, Math.floor((evaluationTime - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24)));
    if (ageDays <= 30) days0_30 = absOutstanding;
    else if (ageDays <= 60) days31_60 = absOutstanding;
    else if (ageDays <= 90) days61_90 = absOutstanding;
    else if (ageDays <= 120) days91_120 = absOutstanding;
    else days120_plus = absOutstanding;

    openInvoices = [{
      date: latestDate,
      voucherType: latestVchType,
      voucherNumber: `${latestVchNo} (Bill Booking Pending)`,
      amount: absOutstanding,
      remaining: absOutstanding,
      ageDays: ageDays
    }];
  } else {
    openInvoices = openCharges.map(item => {
      const itemDate = new Date(item.date);
      const ageDays = Math.max(0, Math.floor((evaluationTime - itemDate.getTime()) / (1000 * 60 * 60 * 24)));
      const amt = item.remaining;
      totalOutstanding += amt;

      if (ageDays <= 30) {
        days0_30 += amt;
      } else if (ageDays <= 60) {
        days31_60 += amt;
      } else if (ageDays <= 90) {
        days61_90 += amt;
      } else if (ageDays <= 120) {
        days91_120 += amt;
      } else {
        days120_plus += amt;
      }

      return {
        ...item,
        amount: item.amount,
        remaining: amt,
        ageDays
      };
    });
  }

  return {
    totalOutstanding,
    days0_30,
    days31_60,
    days61_90,
    days91_120,
    days120_plus,
    invoiceCount: openInvoices.length,
    openInvoices,
    netBalance,
    isAdvancePending
  };
}

// ─── Mock Data Generator ────────────────────────────────────────────

export function getMockAuditData(isDebtor: boolean): AuditParty[] {
  let list: AuditParty[] = [];
  if (isDebtor) {
    list = [
      {
        partyName: "Acme Corporation Ltd",
        gstin: "27AAACA1234A1Z1",
        totalOutstanding: 2450000,
        days0_30: 1200000,
        days31_60: 800000,
        days61_90: 300000,
        days91_120: 150000,
        days120_plus: 0,
        avgPaymentDays: 28,
        riskStatus: "Low",
        parentGroup: "Sundry Debtors",
        email: "accounts@acme.com",
        phone: "+91 98765 43210",
        invoiceCount: 8
      },
      {
        partyName: "Apex Manufacturing Industries",
        gstin: "07AAAAA5555B1Z2",
        totalOutstanding: 4890000,
        days0_30: 2200000,
        days31_60: 1400000,
        days61_90: 800000,
        days91_120: 400000,
        days120_plus: 90000,
        avgPaymentDays: 42,
        riskStatus: "Medium",
        parentGroup: "Sundry Debtors",
        email: "billing@apex.in",
        phone: "+91 87654 32109",
        invoiceCount: 14
      },
      {
        partyName: "Horizon Global Logistics",
        gstin: "29BBBBB4444C1Z3",
        totalOutstanding: 950000,
        days0_30: 150000,
        days31_60: 200000,
        days61_90: 100000,
        days91_120: 200000,
        days120_plus: 300000,
        avgPaymentDays: 78,
        riskStatus: "High",
        parentGroup: "Sundry Debtors",
        email: "finance@horizonlogistics.com",
        phone: "+91 76543 21098",
        invoiceCount: 9
      },
      {
        partyName: "Nimbus Enterprises LLC",
        gstin: "19CCCCC3333D1Z4",
        totalOutstanding: 115000,
        days0_30: 0,
        days31_60: 0,
        days61_90: 0,
        days91_120: 15000,
        days120_plus: 100000,
        avgPaymentDays: 135,
        riskStatus: "High",
        parentGroup: "Sundry Debtors",
        email: "contact@nimbus.com",
        phone: "+91 65432 10987",
        invoiceCount: 3
      },
      {
        partyName: "Quantum Tech Solutions",
        gstin: "33DDDDD2222E1Z5",
        totalOutstanding: 3600000,
        days0_30: 3100000,
        days31_60: 500000,
        days61_90: 0,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 18,
        riskStatus: "Low",
        parentGroup: "Sundry Debtors",
        email: "finance@quantumtech.co.in",
        phone: "+91 54321 09876",
        invoiceCount: 6
      },
      {
        partyName: "Zenith Traders & Retailers",
        gstin: "24EEEEE1111F1Z6",
        totalOutstanding: 1850000,
        days0_30: 600000,
        days31_60: 450000,
        days61_90: 400000,
        days91_120: 250000,
        days120_plus: 150000,
        avgPaymentDays: 55,
        riskStatus: "Medium",
        parentGroup: "Sundry Debtors",
        email: "zenith.traders@yahoo.com",
        phone: "+91 91234 56789",
        invoiceCount: 11
      },
      {
        partyName: "Alpha Distributors",
        gstin: "09AAADA9999P1Z8",
        totalOutstanding: 750000,
        days0_30: 750000,
        days31_60: 0,
        days61_90: 0,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 14,
        riskStatus: "Low",
        parentGroup: "Sundry Debtors",
        email: "alpha.accounts@distributors.com",
        phone: "+91 92345 67890",
        invoiceCount: 4
      },
      {
        partyName: "Beta Retail Ventures",
        gstin: "08AAAFA8888Q1Z9",
        totalOutstanding: 1420000,
        days0_30: 800000,
        days31_60: 400000,
        days61_90: 220000,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 32,
        riskStatus: "Low",
        parentGroup: "Sundry Debtors",
        email: "payments@betaretail.in",
        phone: "+91 93456 78901",
        invoiceCount: 7
      },
      {
        partyName: "Gamma Business Services",
        gstin: "10AAAGA7777R1ZA",
        totalOutstanding: 620000,
        days0_30: 100000,
        days31_60: 120000,
        days61_90: 150000,
        days91_120: 250000,
        days120_plus: 0,
        avgPaymentDays: 62,
        riskStatus: "Medium",
        parentGroup: "Sundry Debtors",
        email: "billing@gammaservices.com",
        phone: "+91 94567 89012",
        invoiceCount: 5
      },
      {
        partyName: "Delta Heavy Engineering",
        gstin: "06AAAHA6666S1ZB",
        totalOutstanding: 3800000,
        days0_30: 1800000,
        days31_60: 1000000,
        days61_90: 600000,
        days91_120: 300000,
        days120_plus: 100000,
        avgPaymentDays: 44,
        riskStatus: "Medium",
        parentGroup: "Sundry Debtors",
        email: "finance@deltaeng.com",
        phone: "+91 95678 90123",
        invoiceCount: 12
      },
      {
        partyName: "Sigma Holdings Pvt Ltd",
        gstin: "27AAAIA5555T1ZC",
        totalOutstanding: 310000,
        days0_30: 0,
        days31_60: 0,
        days61_90: 50000,
        days91_120: 60000,
        days120_plus: 200000,
        avgPaymentDays: 110,
        riskStatus: "High",
        parentGroup: "Sundry Debtors",
        email: "accounts@sigmaholdings.in",
        phone: "+91 96789 01234",
        invoiceCount: 4
      },
      {
        partyName: "Omega Tech Solutions",
        gstin: "03AAAJA4444U1ZD",
        totalOutstanding: 1250000,
        days0_30: 1000000,
        days31_60: 250000,
        days61_90: 0,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 22,
        riskStatus: "Low",
        parentGroup: "Sundry Debtors",
        email: "payments@omega.org",
        phone: "+91 97890 12345",
        invoiceCount: 5
      }
    ];
  } else {
    return [
      {
        partyName: "Global Raw Materials Corp",
        gstin: "27AAACG9999G1Z7",
        totalOutstanding: 3200000,
        days0_30: 1800000,
        days31_60: 1000000,
        days61_90: 400000,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 30,
        riskStatus: "Low",
        parentGroup: "Sundry Creditors",
        email: "billing@globalraw.com",
        phone: "+91 22 6655 4433",
        invoiceCount: 6
      },
      {
        partyName: "Prime Logistics & Carrier Ltd",
        gstin: "07AAACF8888H1Z8",
        totalOutstanding: 780000,
        days0_30: 450000,
        days31_60: 200000,
        days61_90: 130000,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 35,
        riskStatus: "Low",
        parentGroup: "Sundry Creditors",
        email: "accounts@primelogistics.in",
        phone: "+91 11 4433 2211",
        invoiceCount: 4
      },
      {
        partyName: "Infinium Packaging Solutions",
        gstin: "29AAACE7777I1Z9",
        totalOutstanding: 1540000,
        days0_30: 200000,
        days31_60: 500000,
        days61_90: 400000,
        days91_120: 300000,
        days120_plus: 140000,
        avgPaymentDays: 68,
        riskStatus: "Medium",
        parentGroup: "Sundry Creditors",
        email: "sales@infiniumpack.com",
        phone: "+91 80 5544 3322",
        invoiceCount: 8
      },
      {
        partyName: "Supreme Utility Services",
        gstin: "19AAACD6666J1ZA",
        totalOutstanding: 290000,
        days0_30: 90000,
        days31_60: 100000,
        days61_90: 50000,
        days91_120: 50000,
        days120_plus: 0,
        avgPaymentDays: 45,
        riskStatus: "Low",
        parentGroup: "Sundry Creditors",
        email: "support@supremeutil.com",
        phone: "+91 33 2211 0099",
        invoiceCount: 3
      },
      {
        partyName: "Apex Power Grid Corp",
        gstin: "33AAACC5555K1ZB",
        totalOutstanding: 4500000,
        days0_30: 4000000,
        days31_60: 500000,
        days61_90: 0,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 15,
        riskStatus: "Low",
        parentGroup: "Sundry Creditors",
        email: "billing@apexgrid.gov.in",
        phone: "+91 44 9988 7766",
        invoiceCount: 2
      },
      {
        partyName: "Standard Steel Corporation",
        gstin: "24AAACB4444L1ZC",
        totalOutstanding: 2150000,
        days0_30: 500000,
        days31_60: 800000,
        days61_90: 450000,
        days91_120: 250000,
        days120_plus: 150000,
        avgPaymentDays: 58,
        riskStatus: "Medium",
        parentGroup: "Sundry Creditors",
        email: "receivables@stdsteel.com",
        phone: "+91 265 2233 4455",
        invoiceCount: 7
      },
      {
        partyName: "Elite IT Consultancies",
        gstin: "09AAACA3333M1ZD",
        totalOutstanding: 890000,
        days0_30: 120000,
        days31_60: 150000,
        days61_90: 120000,
        days91_120: 200000,
        days120_plus: 300000,
        avgPaymentDays: 85,
        riskStatus: "High",
        parentGroup: "Sundry Creditors",
        email: "billing@eliteit.com",
        phone: "+91 120 4433 5566",
        invoiceCount: 6
      },
      {
        partyName: "Secure Security Services",
        gstin: "27AAACZ2222N1ZE",
        totalOutstanding: 340000,
        days0_30: 340000,
        days31_60: 0,
        days61_90: 0,
        days91_120: 0,
        days120_plus: 0,
        avgPaymentDays: 20,
        riskStatus: "Low",
        parentGroup: "Sundry Creditors",
        email: "finance@secureguards.in",
        phone: "+91 22 9988 2211",
        invoiceCount: 3
      },
      {
        partyName: "National Insurance Corp",
        gstin: "27AAACY1111O1ZF",
        totalOutstanding: 120000,
        days0_30: 0,
        days31_60: 0,
        days61_90: 0,
        days91_120: 20000,
        days120_plus: 100000,
        avgPaymentDays: 140,
        riskStatus: "High",
        parentGroup: "Sundry Creditors",
        email: "renewals@nationalins.co.in",
        phone: "+91 22 5544 9988",
        invoiceCount: 2
      },
      {
        partyName: "Vanguard Warehousing Ltd",
        gstin: "27AAACX9999P1ZG",
        totalOutstanding: 1650000,
        days0_30: 900000,
        days31_60: 400000,
        days61_90: 200000,
        days91_120: 150000,
        days120_plus: 0,
        avgPaymentDays: 40,
        riskStatus: "Medium",
        parentGroup: "Sundry Creditors",
        email: "billing@vanguardwarehouses.com",
        phone: "+91 22 4433 9988",
        invoiceCount: 5
      }
    ];
  }

  list.forEach((p, idx) => {
    // Default values
    p.periodTxCount = 5;
    p.isAdvancePending = false;
    p.netBalance = p.totalOutstanding;

    // Introduce a dormant opening balance (zero transactions in period)
    if (p.partyName.includes("Nimbus Enterprises") || p.partyName.includes("National Insurance")) {
      p.periodTxCount = 0;
      p.invoiceCount = 1;
      const bills = [{
        refNo: "Opening Bal",
        date: "2024-03-31",
        dueDate: "2024-03-31",
        amount: p.totalOutstanding,
        ageDays: 365
      }];
      p.bills = bills;
      p.oldestInvoiceDate = "2024-03-31";
      p.oldestInvoiceAge = 365;
      p.days0_30 = 0;
      p.days31_60 = 0;
      p.days61_90 = 0;
      p.days91_120 = 0;
      p.days120_plus = p.totalOutstanding;
      return;
    }

    // Introduce an unbilled Advance (negative balance)
    if (p.partyName.includes("Alpha Distributors") || p.partyName.includes("Bajaj Allianz")) {
      p.isAdvancePending = true;
      p.totalOutstanding = -120000;
      p.netBalance = -120000;
      p.invoiceCount = 1;
      p.bills = [{
        refNo: "ADV-VCH-808",
        date: "2025-02-15",
        dueDate: "2025-02-15",
        amount: -120000,
        ageDays: 44
      }];
      p.oldestInvoiceDate = "2025-02-15";
      p.oldestInvoiceAge = 44;
      p.days0_30 = 0;
      p.days31_60 = 0;
      p.days61_90 = 0;
      p.days91_120 = 0;
      p.days120_plus = 0;
      return;
    }

    // Normal outstanding invoices (bill booking done, payment pending)
    const bills = [];
    let billCounter = 101;
    if (p.days0_30 > 0) bills.push({ refNo: `INV-${billCounter++}`, date: '2025-03-15', dueDate: '2025-04-15', amount: p.days0_30, ageDays: 16 });
    if (p.days31_60 > 0) bills.push({ refNo: `INV-${billCounter++}`, date: '2025-02-10', dueDate: '2025-03-10', amount: p.days31_60, ageDays: 49 });
    if (p.days61_90 > 0) bills.push({ refNo: `INV-${billCounter++}`, date: '2024-12-28', dueDate: '2025-01-28', amount: p.days61_90, ageDays: 93 });
    if (p.days91_120 > 0) bills.push({ refNo: `INV-${billCounter++}`, date: '2024-11-15', dueDate: '2024-12-15', amount: p.days91_120, ageDays: 136 });
    if (p.days120_plus > 0) bills.push({ refNo: `INV-${billCounter++}`, date: '2024-09-05', dueDate: '2024-10-05', amount: p.days120_plus, ageDays: 207 });
    p.bills = bills;

    if (bills.length > 0) {
      const oldest = bills.reduce((max, b) => b.ageDays > max.ageDays ? b : max, bills[0]);
      p.oldestInvoiceDate = oldest.date;
      p.oldestInvoiceAge = oldest.ageDays;
    }
  });

  return list;
}

// ─── Cash Audit Engine ─────────────────────────────────────────────

export function runCashComplianceAudit(
  cashVouchers: TallyVoucherEntry[],
  loanParties: { partyName: string; parentGroup: string }[],
  openingBalance: number,
  asOnDate: string
): CashAuditObservation[] {
  const observations: CashAuditObservation[] = [];
  const loanPartyNames = new Set(loanParties.map(p => p.partyName));

  // 1. Check for Sec 40A(3): Cash payments > ₹10,000
  const dailyCashPayments: { [key: string]: { [party: string]: number } } = {};
  cashVouchers.forEach(v => {
    if (!v.isDebit) { // Cash payment means cash is credited (not a debit to cash account)
      const key = `${v.date}-${v.voucherType}`; // Assuming voucherType is party name for payments
      if (!dailyCashPayments[key]) dailyCashPayments[key] = {};
      dailyCashPayments[key][v.voucherType] = (dailyCashPayments[key][v.voucherType] || 0) + v.amount;
    }
  });

  cashVouchers.forEach(v => {
    if (!v.isDebit && v.amount > 10000) {
      observations.push({
        date: v.date,
        partyName: v.voucherType, // Assuming party name is in voucherType for this context
        voucherType: v.voucherType,
        voucherNumber: v.voucherNumber,
        amount: v.amount,
        type: 'Disallowed Payment (40A(3))',
        severity: 'High',
        description: `Single cash payment of ₹${v.amount.toLocaleString('en-IN')} to ${v.voucherType} exceeds the ₹10,000 daily limit.`,
        recommendation: 'Verify nature of expense. If disallowed, reverse expense claim for tax purposes. Prefer digital payment methods.'
      });
    }
  });

  // 2. Check for Sec 269SS/T: Loan receipts/payments > ₹20,000
  cashVouchers.forEach(v => {
    // Assuming voucherType for cash transactions holds the contra-account/party name
    if (loanPartyNames.has(v.voucherType) && v.amount > 20000) {
      const isReceipt = v.isDebit; // Debit to cash is a receipt
      observations.push({
        date: v.date,
        partyName: v.voucherType,
        voucherType: v.voucherType,
        voucherNumber: v.voucherNumber,
        amount: v.amount,
        type: 'Loan Violation (269SS/T)',
        severity: 'High',
        description: `Cash ${isReceipt ? 'receipt from' : 'payment to'} loan account ${v.voucherType} for ₹${v.amount.toLocaleString('en-IN')} exceeds the ₹20,000 limit.`,
        recommendation: 'Immediately reverse the transaction and use banking channels. This can attract a 100% penalty.'
      });
    }
  });

  // 3. Negative Cash Balance Check
  const sortedVouchers = [...cashVouchers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let runningBalance = openingBalance;
  const dailyBalances: { [date: string]: number } = {};

  if (sortedVouchers.length > 0) {
    const firstDate = new Date(sortedVouchers[0].date);
    firstDate.setDate(firstDate.getDate() - 1);
    dailyBalances[firstDate.toISOString().split('T')[0]] = openingBalance;
  }

  sortedVouchers.forEach(v => {
    const change = v.isDebit ? v.amount : -v.amount;
    runningBalance += change;
    dailyBalances[v.date] = runningBalance;

    if (runningBalance < -0.01) {
      // Check if we already flagged this day to avoid duplicates
      const alreadyFlagged = observations.some(obs => obs.type === 'Negative Cash Balance' && obs.date === v.date);
      if (!alreadyFlagged) {
        observations.push({
          date: v.date,
          partyName: 'Internal Books',
          voucherType: v.voucherType,
          voucherNumber: v.voucherNumber,
          amount: v.amount,
          type: 'Negative Cash Balance',
          severity: 'High',
          description: `Cash-in-hand balance turned negative on this date, indicating unrecorded cash receipts or incorrect expense booking.`,
          recommendation: 'Review all transactions on this day. Identify and account for missing cash deposits or rectify any data entry errors.',
          runningBalance: runningBalance
        });
      }
    }
  });

  // Add closing balance as the last observation for tracking
  observations.push({
    date: asOnDate,
    partyName: 'CASH BOOK SUMMARY',
    voucherType: 'SYSTEM',
    voucherNumber: 'CLOSING',
    amount: runningBalance,
    type: 'Negative Cash Balance', // Use same type for filtering
    severity: 'Low',
    description: `Opening: ${openingBalance.toLocaleString('en-IN')}, Closing: ${runningBalance.toLocaleString('en-IN')}`,
    recommendation: 'Final computed cash balance.'
  });

  return observations;
}

// ─── Forensic Audit Engine ─────────────────────────────────────────

/**
 * Detects gaps in a series of voucher numbers.
 * Handles alphanumeric prefixes and numeric suffixes.
 */
export function detectVoucherNumberGaps(
  vouchers: { voucherNumber: string; isCancelled?: boolean; isOptional?: boolean }[]
): ForensicObservation[] {
  const observations: ForensicObservation[] = [];
  if (vouchers.length < 2) return [];

  // Parse voucher numbers
  const parsedVouchers = vouchers
    .map(v => {
      // Split into prefix, sequential digits, and suffix
      const match = v.voucherNumber.match(/^(.*?)(\d+)([^\d]*)$/);
      if (match) {
        return {
          prefix: match[1].toUpperCase(),
          num: parseInt(match[2], 10),
          suffix: match[3].toUpperCase(),
          original: v.voucherNumber,
          isCancelled: !!v.isCancelled,
          isOptional: !!v.isOptional
        };
      }
      return null;
    })
    .filter(v => v !== null) as {
      prefix: string;
      num: number;
      suffix: string;
      original: string;
      isCancelled: boolean;
      isOptional: boolean;
    }[];

  // Group by prefix + suffix
  const groups = new Map<string, typeof parsedVouchers>();
  for (const pv of parsedVouchers) {
    const key = `${pv.prefix}___${pv.suffix}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pv);
  }

  let totalGapsGenerated = 0;
  const MAX_GLOBAL_GAPS = 300;

  for (const [key, list] of groups.entries()) {
    if (list.length < 2) continue;
    if (totalGapsGenerated >= MAX_GLOBAL_GAPS) break;

    // Sort by sequential number
    const sorted = [...list].sort((a, b) => a.num - b.num);
    const min = sorted[0].num;
    const max = sorted[sorted.length - 1].num;

    const parts = key.split('___');
    const prefix = parts[0];
    const suffix = parts[1];

    const rangeSize = max - min;

    // SAFETY CHECK: If the gap range is suspiciously large (e.g. > 1000), 
    // do not loop to avoid browser crash/out-of-memory!
    if (rangeSize > 1000) {
      observations.push({
        type: 'Voucher Gap',
        severity: 'Medium',
        description: `Voucher series "${prefix}...${suffix}" has a wide numbering range (${min} to ${max}). There are potentially ${rangeSize - sorted.length} missing numbers. This usually indicates manual numbering, supplier invoice formatting, or date/numeric typos.`,
        recommendation: `Check if voucher numbering for "${prefix}...${suffix}" is set to Manual. If it is automatic, verify if there was a reset or jump in numbering.`
      });
      continue;
    }

    const activeNumbers = new Set(sorted.filter(v => !v.isCancelled).map(v => v.num));
    const cancelledNumbers = new Set(sorted.filter(v => v.isCancelled).map(v => v.num));

    for (let i = min + 1; i < max; i++) {
      if (!activeNumbers.has(i)) {
        if (totalGapsGenerated >= MAX_GLOBAL_GAPS) {
          observations.push({
            type: 'Voucher Gap',
            severity: 'Low',
            description: `Maximum display limit of ${MAX_GLOBAL_GAPS} voucher gaps reached. Skipping remaining individual gap listings.`,
            recommendation: 'Check the voucher register in Tally for numbering gaps beyond the listed items.'
          });
          break;
        }

        const isCancelled = cancelledNumbers.has(i);
        const originalNumber = `${prefix}${String(i).padStart(4, '0')}${suffix}`;

        observations.push({
          voucherNumber: originalNumber,
          type: 'Voucher Gap',
          severity: isCancelled ? 'Low' : 'High',
          description: isCancelled
            ? `Voucher number ${i} in series "${prefix}...${suffix}" is cancelled.`
            : `Missing voucher number detected in series "${prefix}...${suffix}". Number ${i} is missing between ${i - 1} and the next active voucher.`,
          recommendation: isCancelled
            ? `Legitimately cancelled voucher. Check cancelled voucher records for authorization.`
            : `Investigate why voucher ${prefix}${i}${suffix} is missing. Check for deleted, unrecorded, or skipped transactions.`,
        });
        totalGapsGenerated++;
      }
    }
  }

  return observations;
}

/**
 * Applies Benford's Law to a list of transaction amounts.
 */
export function applyBenfordsLaw(
  amounts: number[],
  maxAmountThreshold = 0
): { results: BenfordAnalysisResult[]; mad: number; conformity: string } {
  const BENFORD_DIST = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
  
  // Filter out capped or invalid amounts
  let filteredAmounts = amounts.filter(a => a >= 1);
  if (maxAmountThreshold > 0) {
    filteredAmounts = filteredAmounts.filter(a => a < maxAmountThreshold);
  }

  const totalCount = filteredAmounts.length;
  const firstDigitCounts = new Array(10).fill(0);
  
  filteredAmounts.forEach(amount => {
    const str = String(amount).replace(/[^0-9]/g, '');
    const firstDigit = parseInt(str[0], 10);
    if (firstDigit > 0 && firstDigit <= 9) {
      firstDigitCounts[firstDigit]++;
    }
  });

  const results: BenfordAnalysisResult[] = [];
  let absoluteDeviationSum = 0;

  for (let i = 1; i <= 9; i++) {
    const actualPercentage = totalCount > 0 ? (firstDigitCounts[i] / totalCount) * 100 : 0;
    const benfordPercentage = BENFORD_DIST[i];
    const difference = actualPercentage - benfordPercentage;
    
    const isAnomaly = Math.abs(difference) > 2.0 && Math.abs(difference / benfordPercentage) > 0.4;
    
    results.push({
      digit: i,
      actualCount: firstDigitCounts[i],
      actualPercentage: parseFloat(actualPercentage.toFixed(2)),
      benfordPercentage,
      difference: parseFloat(difference.toFixed(2)),
      isAnomaly
    });

    absoluteDeviationSum += Math.abs((actualPercentage / 100) - (benfordPercentage / 100));
  }

  const mad = totalCount > 0 ? absoluteDeviationSum / 9 : 0;
  
  let conformity = 'Statistically Insignificant (< 500 records)';
  if (totalCount >= 500) {
    if (mad < 0.006) {
      conformity = 'Close Conformity';
    } else if (mad >= 0.006 && mad <= 0.012) {
      conformity = 'Acceptable Conformity';
    } else if (mad > 0.012 && mad <= 0.015) {
      conformity = 'Marginally Acceptable';
    } else {
      conformity = 'Nonconformity';
    }
  }

  return {
    results,
    mad: parseFloat(mad.toFixed(5)),
    conformity
  };
}

/**
 * Analyzes journal entries for unusual activity.
 */
export function analyzeJournalEntries(
  vouchers: { voucherNumber: string; date: string; narration: string; partyName: string; amount?: number; isDebit?: boolean }[],
  revenueLedgers: string[],
  expenseLedgers: string[]
): ForensicObservation[] {
  const observations: ForensicObservation[] = [];
  const revenueSet = new Set(revenueLedgers.map(l => l.toUpperCase().trim()));
  const expenseSet = new Set(expenseLedgers.map(l => l.toUpperCase().trim()));

  const HOLIDAYS = new Set([
    '01-01', // New Year
    '01-26', // Republic Day
    '05-01', // Labour Day
    '08-15', // Independence Day
    '10-02', // Gandhi Jayanti
    '12-25'  // Christmas
  ]);

  const duplicatesMap = new Map<string, typeof vouchers>();

  vouchers.forEach(v => {
    const entryDate = new Date(v.date);
    const dayOfWeek = entryDate.getDay();
    const monthDay = v.date.slice(5, 10);

    // 1. Weekend/Holiday Postings
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = HOLIDAYS.has(monthDay);
    if (isWeekend || isHoliday) {
      observations.push({
        voucherNumber: v.voucherNumber,
        date: v.date,
        partyName: v.partyName,
        amount: v.amount,
        type: 'Journal Anomaly',
        severity: 'Medium',
        description: `Journal entry posted on a ${isHoliday ? 'public holiday' : isWeekend ? (dayOfWeek === 0 ? 'Sunday' : 'Saturday') : 'non-working day'} (${v.date}).`,
        recommendation: 'Verify the business justification for weekend/holiday accounting entries. Ensure it is not intended to bypass weekday review processes.',
      });
    }

    // 2. Vague Narrations
    const narration = v.narration.toLowerCase();
    const vagueKeywords = [
      'being entry made', 'as per details', 'to adjust', 'entry passed for',
      'adjustment', 'as per discussion', 'error', 'difference', 'suspense'
    ];
    if (vagueKeywords.some(kw => narration.includes(kw)) && narration.length < 50) {
      observations.push({
        voucherNumber: v.voucherNumber,
        date: v.date,
        partyName: v.partyName,
        amount: v.amount,
        type: 'Journal Anomaly',
        severity: 'Low',
        description: `Vague narration found: "${v.narration}".`,
        recommendation: 'Review supporting documents for this entry. Enforce policy for detailed and specific narrations.',
      });
    }

    // 3. Unusual Revenue/Expense Debits/Credits
    if (v.amount !== undefined && v.isDebit !== undefined) {
      const partyUpper = v.partyName.toUpperCase().trim();
      const isDebit = v.isDebit;

      if (revenueSet.has(partyUpper) && isDebit) {
        observations.push({
          voucherNumber: v.voucherNumber,
          date: v.date,
          partyName: v.partyName,
          amount: v.amount,
          type: 'Journal Anomaly',
          severity: 'High',
          description: `Journal entry debited a revenue ledger '${v.partyName}' for ₹${v.amount.toLocaleString('en-IN')}. Revenue accounts should typically be credited.`,
          recommendation: 'Scrutinize this entry. Debits to revenue accounts are unusual and could indicate reversals, corrections, or manipulation.',
        });
      }

      if (expenseSet.has(partyUpper) && !isDebit) {
        observations.push({
          voucherNumber: v.voucherNumber,
          date: v.date,
          partyName: v.partyName,
          amount: v.amount,
          type: 'Journal Anomaly',
          severity: 'High',
          description: `Journal entry credited an expense ledger '${v.partyName}' for ₹${v.amount.toLocaleString('en-IN')}. Expense accounts should typically be debited.`,
          recommendation: 'Scrutinize this entry. Credits to expense accounts are abnormal and should be matched to specific credits/reversals.',
        });
      }
    }

    // 4. Round Number Transactions
    if (v.amount !== undefined && v.amount >= 1000) {
      const isRound = v.amount % 1000 === 0;
      if (isRound) {
        const legitimateKeywords = /(depreciation|provision|reserve|written|accrual|depr|amort|interest|salary|wage|tax)/i;
        if (!legitimateKeywords.test(narration)) {
          observations.push({
            voucherNumber: v.voucherNumber,
            date: v.date,
            partyName: v.partyName,
            amount: v.amount,
            type: 'Journal Anomaly',
            severity: 'Medium',
            description: `Round number transaction (₹${v.amount.toLocaleString('en-IN')}) posted with no depreciation/accrual keywords in narration.`,
            recommendation: 'Verify the calculation details for this entry. Ensure it is backed by actual invoices rather than estimates or arbitrary journals.',
          });
        }
      }
    }

    // 5. Grouping for Duplicates Check
    if (v.amount !== undefined) {
      const dupKey = `${v.date}___${v.amount}___${v.partyName.toUpperCase().trim()}`;
      if (!duplicatesMap.has(dupKey)) {
        duplicatesMap.set(dupKey, []);
      }
      duplicatesMap.get(dupKey)!.push(v);
    }
  });

  // Process Duplicates Map
  for (const [key, list] of duplicatesMap.entries()) {
    if (list.length > 1) {
      const parts = key.split('___');
      const party = list[0].partyName;
      const amt = parseFloat(parts[1]);

      list.forEach(v => {
        observations.push({
          voucherNumber: v.voucherNumber,
          date: v.date,
          partyName: v.partyName,
          amount: v.amount,
          type: 'Journal Anomaly',
          severity: 'High',
          description: `Possible duplicate entry: Same date (${v.date}), amount (₹${amt.toLocaleString('en-IN')}), and party ledger ('${party}') posted multiple times (${list.length} times).`,
          recommendation: 'Audit these vouchers to check if the transaction was recorded multiple times by error or if it was split into multiple vouchers.',
        });
      });
    }
  }

  return observations;
}

// ─── Excel Styling and Export ───────────────────────────────────────

export function exportAuditToExcel(
  debtors: AuditParty[],
  creditors: AuditParty[],
  companyName: string,
  fyEnd: string,
  cashObservations?: CashAuditObservation[]
) {
  const wb = XLSX.utils.book_new();

  // Color theme palette for styles
  const colors = {
    brandBlue: "0F172A", // Dark Slate primary
    accentBlue: "0284C7", // Cyan secondary
    headerBg: "1E293B", // Light Slate for table headers
    zebraBg: "F8FAFC", // Soft white/grey
    totalBg: "E2E8F0",
    lowRisk: "DCFCE7", // soft green
    lowRiskText: "15803D",
    medRisk: "FEF9C3", // soft yellow
    medRiskText: "A16207",
    highRisk: "FEE2E2", // soft red
    highRiskText: "B91C1C",
  };

  const borderThin = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const titleStyle = {
    font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } },
    alignment: { horizontal: "left" },
  };

  const subTitleStyle = {
    font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } },
    alignment: { horizontal: "left" },
  };

  // 1. Executive Summary Sheet
  const buildSummarySheet = () => {
    const totalDebtorsAmt = debtors.reduce((sum, d) => sum + d.totalOutstanding, 0);
    const totalCreditorsAmt = creditors.reduce((sum, c) => sum + c.totalOutstanding, 0);

    const data: (string | number | { f: string; } | null)[][] = [
      [companyName.toUpperCase() + " - AUDIT EXECUTIVE SUMMARY", null, null, null],
      [`Ageing Report & Liquidity Health Check as of ${fyEnd}`, null, null, null],
      [],
      ["AUDIT KEY PERFORMANCE INDICATORS", null, null, null],
      ["Metric Description", "Amount / Ratio", "Benchmark / Unit", "Status Assessment"],
      ["Total Trade Receivables (Debtors)", totalDebtorsAmt, "INR", totalDebtorsAmt > 10000000 ? "Review Credit Policy" : "Healthy Collection Control"],
      ["Total Trade Payables (Creditors)", totalCreditorsAmt, "INR", "Adequate Creditor Working Capital"],
      ["Net Working Capital Receivables Gap", { f: `=B6-B7` }, "INR", "Net Positive Balance Liquidity"],
      ["Days Sales Outstanding (DSO - Avg)", Math.round(debtors.reduce((sum, d) => sum + d.avgPaymentDays, 0) / (debtors.length || 1)), "Days", "Ideal limit: 45 Days"],
      ["Days Payable Outstanding (DPO - Avg)", Math.round(creditors.reduce((sum, c) => sum + c.avgPaymentDays, 0) / (creditors.length || 1)), "Days", "Standard limit: 60 Days"],
      [],
      ["CONCENTRATED CREDIT RISK REPORT", null, null, null],
      ["Debtor Party Name", "Outstanding Balance", "Concentration %", "Risk Status"],
    ];

    // Find debtors with > 15% concentration
    const concThreshold = totalDebtorsAmt * 0.15;
    const concDebtors = debtors
      .filter(d => d.totalOutstanding > 0)
      .map(d => ({
        name: d.partyName,
        amt: d.totalOutstanding,
        pct: d.totalOutstanding / (totalDebtorsAmt || 1),
        risk: d.totalOutstanding > concThreshold ? "High Exposure (>15%)" : "Diversified Exposure"
      }))
      .sort((a, b) => b.amt - a.amt);

    concDebtors.slice(0, 5).forEach(cd => {
      data.push([cd.name, cd.amt, { f: `=B${data.length + 1}/B6` }, cd.risk]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Apply merges
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
      { s: { r: 11, c: 0 }, e: { r: 11, c: 3 } },
    ];

    // Format width
    ws["!cols"] = [{ wch: 35 }, { wch: 22 }, { wch: 18 }, { wch: 32 }];

    // Style Title and Sections
    const safeSetCell = (addr: string, style: any, numFmt?: string) => {
      if (ws[addr]) {
        ws[addr].s = style;
        if (numFmt) ws[addr].z = numFmt;
      }
    };

    safeSetCell("A1", titleStyle);
    safeSetCell("A2", subTitleStyle);
    safeSetCell("A4", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });
    safeSetCell("A12", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });

    // Table Headers
    for (let c = 0; c < 4; c++) {
      safeSetCell(XLSX.utils.encode_cell({ r: 4, c }), headerStyle);
      safeSetCell(XLSX.utils.encode_cell({ r: 12, c }), headerStyle);
    }

    // Number formats and fonts for KPI list
    const kpiCellStyle = { font: { name: "Inter", sz: 10 }, border: borderThin, alignment: { vertical: "center" } };
    const numCellStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, alignment: { horizontal: "right", vertical: "center" } };

    for (let r = 5; r <= 9; r++) {
      safeSetCell(`A${r + 1}`, kpiCellStyle);
      safeSetCell(`B${r + 1}`, numCellStyle, r <= 7 ? "₹#,##,##0.00" : "0");
      safeSetCell(`C${r + 1}`, kpiCellStyle);
      safeSetCell(`D${r + 1}`, kpiCellStyle);
    }

    // Risk Concentration styles
    const concStartRow = 13;
    const concEndRow = 13 + Math.min(5, concDebtors.length) - 1;
    for (let r = concStartRow; r <= concEndRow; r++) {
      safeSetCell(`A${r + 1}`, kpiCellStyle);
      safeSetCell(`B${r + 1}`, numCellStyle, "₹#,##,##0.00");
      safeSetCell(`C${r + 1}`, numCellStyle, "0.0%");
      const isHigh = String(data[r][3]).includes("High");
      safeSetCell(`D${r + 1}`, {
        font: { name: "Inter", sz: 9, bold: isHigh, color: { rgb: isHigh ? colors.highRiskText : colors.lowRiskText } },
        fill: { fgColor: { rgb: isHigh ? colors.highRisk : colors.lowRisk } },
        border: borderThin,
        alignment: { horizontal: "center", vertical: "center" }
      });
    }

    return ws;
  };

  // 2. Party Ageing Sheet Builder
  const buildPartySheet = (parties: AuditParty[], title: string) => {
    const headers = [
      "Party Name", "GSTIN", "Total Outstanding",
      "0-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", "120+ Days",
      "Avg Pay Days", "Risk Status", "Invoice Count", "Email Address", "Phone Number"
    ];

    const rows: any[][] = [
      [title, null, null, null, null, null, null, null, null, null, null, null, null],
      [`Detailed Ageing Analysis Ledger for ${companyName}`, null, null, null, null, null, null, null, null, null, null, null, null],
      [],
      headers
    ];

    parties.forEach((p) => {
      rows.push([
        p.partyName,
        p.gstin,
        p.totalOutstanding,
        p.days0_30,
        p.days31_60,
        p.days61_90,
        p.days91_120,
        p.days120_plus,
        p.avgPaymentDays,
        p.riskStatus,
        p.invoiceCount,
        p.email,
        p.phone
      ]);
    });

    // Add Totals row
    const totalRowNum = rows.length + 1;
    rows.push([
      "Total Portfolio Value",
      null,
      { f: `=SUM(C5:C${totalRowNum - 1})` },
      { f: `=SUM(D5:D${totalRowNum - 1})` },
      { f: `=SUM(E5:E${totalRowNum - 1})` },
      { f: `=SUM(F5:F${totalRowNum - 1})` },
      { f: `=SUM(G5:G${totalRowNum - 1})` },
      { f: `=SUM(H5:H${totalRowNum - 1})` },
      null,
      null,
      { f: `=SUM(K5:K${totalRowNum - 1})` },
      null,
      null
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }
    ];

    ws["!cols"] = [
      { wch: 30 }, { wch: 18 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 16 }
    ];

    const safeSetCellStyle = (addr: string, style: any, numFmt?: string) => {
      if (ws[addr]) {
        ws[addr].s = style;
        if (numFmt) ws[addr].z = numFmt;
      }
    };

    safeSetCellStyle("A1", titleStyle);
    safeSetCellStyle("A2", subTitleStyle);

    // Style Headers
    for (let c = 0; c < headers.length; c++) {
      safeSetCellStyle(XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
    }

    // Style Data Rows
    const dataCellStyle = { font: { name: "Inter", sz: 9 }, border: borderThin, alignment: { vertical: "center" } };
    const amtCellStyle = { font: { name: "Inter", sz: 9 }, border: borderThin, alignment: { horizontal: "right", vertical: "center" } };
    const totalRowLabelStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, fill: { fgColor: { rgb: colors.totalBg } }, alignment: { vertical: "center" } };
    const totalRowAmtStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, fill: { fgColor: { rgb: colors.totalBg } }, alignment: { horizontal: "right", vertical: "center" } };

    for (let r = 4; r < totalRowNum - 1; r++) {
      const idx = r - 4;
      const p = parties[idx];
      const rowLetter = r + 1;

      // Columns
      safeSetCellStyle(`A${rowLetter}`, dataCellStyle); // name
      safeSetCellStyle(`B${rowLetter}`, dataCellStyle); // gstin
      safeSetCellStyle(`C${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // outstanding
      safeSetCellStyle(`D${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // 0-30
      safeSetCellStyle(`E${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // 31-60
      safeSetCellStyle(`F${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // 61-90
      safeSetCellStyle(`G${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // 91-120
      safeSetCellStyle(`H${rowLetter}`, amtCellStyle, "₹#,##,##0.00"); // 120+
      safeSetCellStyle(`I${rowLetter}`, amtCellStyle, "0"); // avg days

      // Risk badge fill
      let rBg = colors.lowRisk;
      let rFg = colors.lowRiskText;
      if (p.riskStatus === "Medium") {
        rBg = colors.medRisk;
        rFg = colors.medRiskText;
      } else if (p.riskStatus === "High") {
        rBg = colors.highRisk;
        rFg = colors.highRiskText;
      }

      safeSetCellStyle(`J${rowLetter}`, {
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: rFg } },
        fill: { fgColor: { rgb: rBg } },
        border: borderThin,
        alignment: { horizontal: "center", vertical: "center" }
      });

      safeSetCellStyle(`K${rowLetter}`, amtCellStyle, "0"); // inv count
      safeSetCellStyle(`L${rowLetter}`, dataCellStyle); // email
      safeSetCellStyle(`M${rowLetter}`, dataCellStyle); // phone
    }

    // Style Total Row
    const trLetter = totalRowNum;
    safeSetCellStyle(`A${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`B${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`C${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`D${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`E${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`F${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`G${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`H${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`I${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`J${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`K${trLetter}`, totalRowAmtStyle, "0");
    safeSetCellStyle(`L${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`M${trLetter}`, totalRowLabelStyle);

    return ws;
  };

  const buildDetailedInvoicesSheet = (parties: AuditParty[], title: string) => {
    const headers = [
      "Party Name", "GSTIN", "Ref Number", "Invoice Date", "Due Date",
      "Outstanding Amount", "Age (Days)", "Ageing Status", "Risk Category"
    ];

    const rows: any[][] = [
      [title, null, null, null, null, null, null, null, null],
      [`Detailed Outstanding Ledger (Bill-by-Bill) for ${companyName}`, null, null, null, null, null, null, null, null],
      [],
      headers
    ];

    parties.forEach(p => {
      const bills = p.bills || [];
      bills.forEach(b => {
        const age = b.ageDays;
        let status = "Current";
        if (age > 90) status = "Critical";
        else if (age > 30) status = "Overdue";

        rows.push([
          p.partyName,
          p.gstin,
          b.refNo,
          b.date,
          b.dueDate,
          Math.abs(b.amount),
          age,
          status,
          p.riskStatus
        ]);
      });
    });

    const totalRowNum = rows.length + 1;
    rows.push([
      "Total Detailed Balance",
      null,
      null,
      null,
      null,
      { f: `=SUM(F5:F${totalRowNum - 1})` },
      null,
      null,
      null
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
    ];

    ws["!cols"] = [
      { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    const safeSetCellStyle = (addr: string, style: any, numFmt?: string) => {
      if (ws[addr]) {
        ws[addr].s = style;
        if (numFmt) ws[addr].z = numFmt;
      }
    };

    safeSetCellStyle("A1", titleStyle);
    safeSetCellStyle("A2", subTitleStyle);

    // Style Headers
    for (let c = 0; c < headers.length; c++) {
      safeSetCellStyle(XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
    }

    const dataCellStyle = { font: { name: "Inter", sz: 9 }, border: borderThin, alignment: { vertical: "center" } };
    const amtCellStyle = { font: { name: "Inter", sz: 9 }, border: borderThin, alignment: { horizontal: "right", vertical: "center" } };
    const totalRowLabelStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, fill: { fgColor: { rgb: colors.totalBg } }, alignment: { vertical: "center" } };
    const totalRowAmtStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, fill: { fgColor: { rgb: colors.totalBg } }, alignment: { horizontal: "right", vertical: "center" } };

    for (let r = 4; r < totalRowNum - 1; r++) {
      const rowLetter = r + 1;

      safeSetCellStyle(`A${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`B${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`C${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`D${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`E${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`F${rowLetter}`, amtCellStyle, "₹#,##,##0.00");
      safeSetCellStyle(`G${rowLetter}`, amtCellStyle, "0");

      const statusText = rows[r][7];
      let sBg = colors.lowRisk;
      let sFg = colors.lowRiskText;
      if (statusText === "Critical") {
        sBg = colors.highRisk;
        sFg = colors.highRiskText;
      } else if (statusText === "Overdue") {
        sBg = colors.medRisk;
        sFg = colors.medRiskText;
      }

      safeSetCellStyle(`H${rowLetter}`, {
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: sFg } },
        fill: { fgColor: { rgb: sBg } },
        border: borderThin,
        alignment: { horizontal: "center", vertical: "center" }
      });

      const riskText = rows[r][8];
      let rBg = colors.lowRisk;
      let rFg = colors.lowRiskText;
      if (riskText === "High") {
        rBg = colors.highRisk;
        rFg = colors.highRiskText;
      } else if (riskText === "Medium") {
        rBg = colors.medRisk;
        rFg = colors.medRiskText;
      }

      safeSetCellStyle(`I${rowLetter}`, {
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: rFg } },
        fill: { fgColor: { rgb: rBg } },
        border: borderThin,
        alignment: { horizontal: "center", vertical: "center" }
      });
    }

    const trLetter = totalRowNum;
    safeSetCellStyle(`A${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`B${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`C${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`D${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`E${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`F${trLetter}`, totalRowAmtStyle, "₹#,##,##0.00");
    safeSetCellStyle(`G${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`H${trLetter}`, totalRowLabelStyle);
    safeSetCellStyle(`I${trLetter}`, totalRowLabelStyle);

    return ws;
  };

  const buildObservationsSheet = (isDebtor: boolean) => {
    const ws = XLSX.utils.aoa_to_sheet([]);

    const safeSetCellStyle = (addr: string, style: any, numFmt?: string) => {
      if (!ws[addr]) return;
      ws[addr].s = style;
      if (numFmt) ws[addr].z = numFmt;
    };

    const list: {
      partyName: string;
      parentGroup: string;
      type: string;
      severity: string;
      title: string;
      description: string;
      recommendation: string;
      impactAmt: number;
      dateKey?: string;
    }[] = [];

    if (isDebtor) {
      // Debtors checks
      debtors.forEach(d => {
        if (d.isAdvancePending) {
          list.push({
            partyName: d.partyName,
            parentGroup: 'Sundry Debtors',
            type: 'Advances',
            severity: 'Medium',
            title: 'Advance Received (Sales Booking Pending)',
            description: `Received customer payment advance of ₹${Math.abs(d.totalOutstanding).toLocaleString('en-IN')}, but no sales invoice has been booked.`,
            recommendation: 'Check dispatch registers. Raise sales tax invoice to adjust advance.',
            impactAmt: Math.abs(d.totalOutstanding),
            dateKey: d.oldestInvoiceDate || fyEnd
          });
        } else {
          if (d.periodTxCount === 0 && d.totalOutstanding > 0) {
            list.push({
              partyName: d.partyName,
              parentGroup: 'Sundry Debtors',
              type: 'Dormant Balances',
              severity: 'High',
              title: 'Dormant Opening Balance (Zero Activity)',
              description: `Opening balance of ₹${d.totalOutstanding.toLocaleString('en-IN')} has carried forward with zero new vouchers during the scan period.`,
              recommendation: 'Reconcile with client. Verify if balance is under dispute or requires a write-off.',
              impactAmt: d.totalOutstanding,
              dateKey: d.oldestInvoiceDate || 'Prior Period'
            });
          }
          const overdue90 = d.days91_120 + d.days120_plus;
          if (overdue90 > 1000) {
            list.push({
              partyName: d.partyName,
              parentGroup: 'Sundry Debtors',
              type: 'Overdues',
              severity: overdue90 > 100000 ? 'High' : 'Medium',
              title: 'Bill Booking Done (Payment Overdue)',
              description: `Sales invoice booking is done, but client payment of ₹${overdue90.toLocaleString('en-IN')} is critically overdue.`,
              recommendation: 'Initiate collection notifications or suspend credit terms.',
              impactAmt: overdue90,
              dateKey: d.oldestInvoiceDate
            });
          }
        }
        if (!d.gstin) {
          list.push({
            partyName: d.partyName,
            parentGroup: 'Sundry Debtors',
            type: 'Tax Compliance',
            severity: 'Medium',
            title: 'Missing GSTIN (Compliance Risk)',
            description: 'No registered GSTIN in customer master masters.',
            recommendation: 'Request GST certificate from client and update master profile.',
            impactAmt: d.totalOutstanding
          });
        }
      });
    } else {
      // Creditors checks
      creditors.forEach(c => {
        if (c.isAdvancePending) {
          list.push({
            partyName: c.partyName,
            parentGroup: 'Sundry Creditors',
            type: 'Advances',
            severity: 'Medium',
            title: 'Advance Paid (Supplier Invoice Booking Pending)',
            description: `Supplier payment of ₹${Math.abs(c.totalOutstanding).toLocaleString('en-IN')} was made, but the purchase invoice is not yet booked.`,
            recommendation: 'Follow up with vendor for tax invoice. Record purchase voucher to claim ITC.',
            impactAmt: Math.abs(c.totalOutstanding),
            dateKey: c.oldestInvoiceDate || fyEnd
          });
        } else {
          if (c.periodTxCount === 0 && c.totalOutstanding > 0) {
            list.push({
              partyName: c.partyName,
              parentGroup: 'Sundry Creditors',
              type: 'Dormant Balances',
              severity: 'High',
              title: 'Dormant Supplier Balance (Zero Activity)',
              description: `Opening outstanding balance of ₹${c.totalOutstanding.toLocaleString('en-IN')} has carried forward with zero supplier payments or purchase bookings.`,
              recommendation: 'Cross-verify statement with vendor. Investigate if vendor supplies are discontinued.',
              impactAmt: c.totalOutstanding,
              dateKey: c.oldestInvoiceDate || 'Prior Period'
            });
          }
          const overdue90 = c.days91_120 + c.days120_plus;
          if (overdue90 > 1000) {
            list.push({
              partyName: c.partyName,
              parentGroup: 'Sundry Creditors',
              type: 'Overdues',
              severity: overdue90 > 100000 ? 'High' : 'Medium',
              title: 'Purchase Booking Done (Payment Pending)',
              description: `Supplier bill is booked, but vendor payable amount of ₹${overdue90.toLocaleString('en-IN')} is outstanding for over 90 days.`,
              recommendation: 'Verify payment terms and plan payouts to protect vendor credit rating.',
              impactAmt: overdue90,
              dateKey: c.oldestInvoiceDate
            });
          }
        }
        if (!c.gstin) {
          list.push({
            partyName: c.partyName,
            parentGroup: 'Sundry Creditors',
            type: 'Tax Compliance',
            severity: 'High',
            title: 'Missing Vendor GSTIN (ITC Loss Risk)',
            description: 'No registered supplier GSTIN, blocking Input Tax Credit matching.',
            recommendation: 'Request supplier GSTIN immediately to ensure GSTR-2B ITC claiming.',
            impactAmt: c.totalOutstanding
          });
        }
      });
    }

    // Headers
    const labelTitle = isDebtor ? "DEBTORS AUDIT OBSERVATIONS & ANOMALIES LOG" : "CREDITORS AUDIT OBSERVATIONS & ANOMALIES LOG";
    XLSX.utils.sheet_add_aoa(ws, [
      [`${labelTitle} — ${companyName.toUpperCase()}`],
      [`FY End / Evaluation Date: ${fyEnd} | Total observations flagged: ${list.length}`],
      [],
      ["Party Name", "Ledger Group", "Alert Category", "Severity", "Date Key", "Detailed Audit Finding", "Recommended Auditor Action", "Financial Impact"]
    ], { origin: "A1" });

    // Populate data
    const startRow = 4;
    list.forEach((obs, idx) => {
      XLSX.utils.sheet_add_aoa(ws, [[
        obs.partyName,
        obs.parentGroup === 'Sundry Debtors' ? 'Debtor' : 'Creditor',
        obs.type,
        obs.severity,
        obs.dateKey || '-',
        obs.description,
        obs.recommendation,
        obs.impactAmt
      ]], { origin: `A${startRow + idx + 1}` });
    });

    // Formatting column widths
    ws['!cols'] = [
      { wch: 30 }, // Party Name
      { wch: 15 }, // Ledger Group
      { wch: 20 }, // Alert Category
      { wch: 12 }, // Severity
      { wch: 15 }, // Date Key
      { wch: 50 }, // Finding
      { wch: 50 }, // Recommendation
      { wch: 20 }  // Impact
    ];

    // Merge titles
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }
    ];

    // Stylings
    const totalRows = list.length;
    safeSetCellStyle("A1", titleStyle);
    safeSetCellStyle("A2", subTitleStyle);

    for (let c = 0; c < 8; c++) {
      const colLetter = String.fromCharCode(65 + c);
      safeSetCellStyle(`${colLetter}4`, headerStyle);
    }

    const rightStyle = {
      font: { name: "Inter", sz: 10 },
      border: borderThin,
      alignment: { horizontal: "right", vertical: "center" }
    };

    for (let i = 0; i < totalRows; i++) {
      const rNum = startRow + i + 1;
      const obs = list[i];
      const isZebra = i % 2 === 1;

      const cellBg = isZebra ? colors.zebraBg : "FFFFFF";

      const rowStyle = {
        font: { name: "Inter", sz: 10 },
        border: borderThin,
        fill: { fgColor: { rgb: cellBg } },
        alignment: { vertical: "center" }
      };

      const rightAlignStyle = {
        ...rightStyle,
        fill: { fgColor: { rgb: cellBg } }
      };

      const sevBg = obs.severity === 'High' ? colors.highRisk : (obs.severity === 'Medium' ? colors.medRisk : colors.lowRisk);
      const sevColor = obs.severity === 'High' ? colors.highRiskText : (obs.severity === 'Medium' ? colors.medRiskText : colors.lowRiskText);

      const severityCellStyle = {
        ...rowStyle,
        font: { name: "Inter", sz: 10, bold: true, color: { rgb: sevColor } },
        fill: { fgColor: { rgb: sevBg } },
        alignment: { horizontal: "center", vertical: "center" }
      };

      for (let c = 0; c < 8; c++) {
        const colLetter = String.fromCharCode(65 + c);
        const cellRef = `${colLetter}${rNum}`;

        if (c === 3) {
          safeSetCellStyle(cellRef, severityCellStyle);
        } else if (c === 7) {
          safeSetCellStyle(cellRef, rightAlignStyle, "₹#,##,##0.00");
        } else {
          safeSetCellStyle(cellRef, rowStyle);
        }
      }
    }

    return ws;
  };

  const buildCashAuditSheet = () => {
    if (!cashObservations || cashObservations.length === 0) {
      return XLSX.utils.aoa_to_sheet([
        ["CASH COMPLIANCE AUDIT"],
        ["No cash transactions were provided or no compliance issues were found."]
      ]);
    }

    const headers = [
      "Date", "Party Name", "Voucher Type", "Voucher No", "Amount",
      "Issue Type", "Severity", "Description", "Recommendation", "Running Balance"
    ];

    const rows: any[][] = [
      [`CASH COMPLIANCE AUDIT REPORT — ${companyName.toUpperCase()}`],
      [`Analysis of cash transactions as of ${fyEnd}`],
      [],
      headers
    ];

    cashObservations.forEach(obs => {
      rows.push([
        obs.date,
        obs.partyName,
        obs.voucherType,
        obs.voucherNumber,
        obs.amount,
        obs.type,
        obs.severity,
        obs.description,
        obs.recommendation,
        obs.runningBalance
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
    ];

    ws["!cols"] = [
      { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
      { wch: 25 }, { wch: 12 }, { wch: 60 }, { wch: 60 }, { wch: 15 }
    ];

    const safeSetCellStyle = (addr: string, style: any, numFmt?: string) => {
      if (ws[addr]) {
        ws[addr].s = style;
        if (numFmt) ws[addr].z = numFmt;
      }
    };

    safeSetCellStyle("A1", titleStyle);
    safeSetCellStyle("A2", subTitleStyle);

    for (let c = 0; c < headers.length; c++) {
      safeSetCellStyle(XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
    }

    const dataCellStyle = { font: { name: "Inter", sz: 9 }, border: borderThin, alignment: { vertical: "center", wrapText: true } };
    const amtCellStyle = { ...dataCellStyle, alignment: { ...dataCellStyle.alignment, horizontal: "right" } };

    for (let r = 4; r < rows.length; r++) {
      const rowLetter = r + 1;
      const obs = cashObservations[r - 4];

      safeSetCellStyle(`A${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`B${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`C${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`D${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`E${rowLetter}`, amtCellStyle, "₹#,##,##0.00");
      safeSetCellStyle(`F${rowLetter}`, dataCellStyle);

      let sevBg = colors.lowRisk;
      let sevFg = colors.lowRiskText;
      if (obs.severity === "High") {
        sevBg = colors.highRisk;
        sevFg = colors.highRiskText;
      } else if (obs.severity === "Medium") {
        sevBg = colors.medRisk;
        sevFg = colors.medRiskText;
      }
      safeSetCellStyle(`G${rowLetter}`, {
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: sevFg } },
        fill: { fgColor: { rgb: sevBg } },
        border: borderThin,
        alignment: { horizontal: "center", vertical: "center" }
      });

      safeSetCellStyle(`H${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`I${rowLetter}`, dataCellStyle);
      safeSetCellStyle(`J${rowLetter}`, amtCellStyle, obs.runningBalance !== undefined ? "₹#,##,##0.00" : undefined);
    }

    return ws;
  };

  const debtorsSheet = buildPartySheet(debtors, "SUNDRY DEBTORS AUDIT & AGEING REPORT");
  const creditorsSheet = buildPartySheet(creditors, "SUNDRY CREDITORS AUDIT & AGEING REPORT");
  const execSummarySheet = buildSummarySheet();
  const debtorsDetailSheet = buildDetailedInvoicesSheet(debtors, "SUNDRY DEBTORS BILL-WISE OUTSTANDING DETAILS");
  const creditorsDetailSheet = buildDetailedInvoicesSheet(creditors, "SUNDRY CREDITORS BILL-WISE OUTSTANDING DETAILS");
  const debtorsObsSheet = buildObservationsSheet(true);
  const creditorsObsSheet = buildObservationsSheet(false);
  const cashAuditSheet = buildCashAuditSheet();

  XLSX.utils.book_append_sheet(wb, execSummarySheet, "Executive Summary");
  XLSX.utils.book_append_sheet(wb, debtorsSheet, "Debtors Ageing");
  XLSX.utils.book_append_sheet(wb, creditorsSheet, "Creditors Ageing");
  XLSX.utils.book_append_sheet(wb, debtorsDetailSheet, "Debtors Invoice Details");
  XLSX.utils.book_append_sheet(wb, creditorsDetailSheet, "Creditors Invoice Details");
  XLSX.utils.book_append_sheet(wb, debtorsObsSheet, "Debtors Audit Observations");
  XLSX.utils.book_append_sheet(wb, creditorsObsSheet, "Creditors Audit Observations");
  XLSX.utils.book_append_sheet(wb, cashAuditSheet, "Cash Compliance Audit");

  // Export to Excel File
  const filename = `${companyName.replace(/\s+/g, '_')}_Debtors_Creditors_Audit_Report.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ─── Dedicated Debtors Module Exporter ──────────────────────────────
export function exportDebtorsToExcel(
  debtors: AuditParty[],
  companyName: string,
  fyEnd: string
) {
  const wb = XLSX.utils.book_new();

  const colors = {
    brandBlue: "0F172A",
    accentBlue: "0284C7",
    headerBg: "1E293B",
    zebraBg: "F8FAFC",
    totalBg: "E2E8F0",
    lowRisk: "DCFCE7",
    lowRiskText: "15803D",
    medRisk: "FEF9C3",
    medRiskText: "A16207",
    highRisk: "FEE2E2",
    highRiskText: "B91C1C",
  };

  const borderThin = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const titleStyle = {
    font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } },
    alignment: { horizontal: "left" },
  };

  const subTitleStyle = {
    font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } },
    alignment: { horizontal: "left" },
  };

  // Debtors Summary Sheet
  const grossReceivables = debtors.filter(d => d.totalOutstanding > 0).reduce((sum, d) => sum + d.totalOutstanding, 0);
  const totalAdvances = debtors.filter(d => d.totalOutstanding < 0 || d.isAdvancePending).reduce((sum, d) => sum + Math.abs(d.totalOutstanding), 0);
  const netReceivables = grossReceivables - totalAdvances;
  const avgDso = Math.round(debtors.reduce((sum, d) => sum + d.avgPaymentDays, 0) / (debtors.length || 1));

  const summaryData: any[][] = [
    [`${companyName.toUpperCase()} - SUNDRY DEBTORS AUDIT REPORT`],
    [`Trade Receivables & Ageing Analysis as of ${fyEnd}`],
    [],
    ["DEBTORS PORTFOLIO METRICS", null, null, null],
    ["Metric Description", "Amount / Value", "Unit", "Auditor Status Assessment"],
    ["Gross Trade Receivables (Debit Balances)", grossReceivables, "INR", grossReceivables > 10000000 ? "High Portfolio Value — Review Credit Policies" : "Healthy Collection Control"],
    ["Customer Advances & Credit Notes (Credit)", totalAdvances, "INR", totalAdvances > 0 ? "Customer advances / credit balances pending" : "No advances"],
    ["Net Trade Receivables Outstanding", netReceivables, "INR", "Net closing balance position"],
    ["Average Days Sales Outstanding (DSO)", avgDso, "Days", avgDso > 45 ? "DSO Exceeds 45-day Benchmark — Accelerated Collections Recommended" : "Within Acceptable Limits"],
    ["Total Active Debtor Accounts", debtors.length, "Count", "Total registered customer accounts audited"],
    ["Critical Overdue (> 90 Days)", debtors.reduce((sum, d) => sum + d.days91_120 + d.days120_plus, 0), "INR", "Requires immediate recovery or provision evaluation"],
    [],
    ["TOP DEBTOR CONCENTRATION RISK (> 15% Exposure)", null, null, null],
    ["Party Name", "Outstanding Balance", "Concentration %", "Risk Exposure"]
  ];

  const concThreshold = grossReceivables * 0.15;
  debtors.forEach(d => {
    const isAdv = d.totalOutstanding < 0 || d.isAdvancePending;
    const absVal = Math.abs(d.totalOutstanding);
    summaryData.push([
      d.partyName + (isAdv ? " (Cr / Advance)" : ""),
      absVal,
      absVal / (grossReceivables || 1),
      absVal > concThreshold ? "High Concentrated Exposure (>15%)" : (isAdv ? "Customer Credit / Advance" : "Diversified Exposure")
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 35 }, { wch: 22 }, { wch: 18 }, { wch: 35 }];
  wsSummary["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 10, c: 0 }, e: { r: 10, c: 3 } }
  ];

  const safeSetCell = (ws: any, addr: string, style: any, numFmt?: string) => {
    if (ws[addr]) {
      ws[addr].s = style;
      if (numFmt) ws[addr].z = numFmt;
    }
  };

  safeSetCell(wsSummary, "A1", titleStyle);
  safeSetCell(wsSummary, "A2", subTitleStyle);
  safeSetCell(wsSummary, "A4", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });
  safeSetCell(wsSummary, "A11", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });

  for (let c = 0; c < 4; c++) {
    safeSetCell(wsSummary, XLSX.utils.encode_cell({ r: 4, c }), headerStyle);
    safeSetCell(wsSummary, XLSX.utils.encode_cell({ r: 11, c }), headerStyle);
  }

  const kpiCellStyle = { font: { name: "Inter", sz: 10 }, border: borderThin, alignment: { vertical: "center" } };
  const numCellStyle = { font: { name: "Inter", sz: 10, bold: true }, border: borderThin, alignment: { horizontal: "right", vertical: "center" } };

  for (let r = 5; r <= 8; r++) {
    safeSetCell(wsSummary, `A${r + 1}`, kpiCellStyle);
    safeSetCell(wsSummary, `B${r + 1}`, numCellStyle, (r === 5 || r === 8) ? "₹#,##,##0.00" : (r === 6 ? "0" : "#,##0"));
    safeSetCell(wsSummary, `C${r + 1}`, kpiCellStyle);
    safeSetCell(wsSummary, `D${r + 1}`, kpiCellStyle);
  }

  // Debtors Detailed Ageing Sheet
  const headersAgeing = [
    "Party Name", "GSTIN", "Total Outstanding",
    "0-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", "120+ Days",
    "Avg Pay Days", "Risk Status", "Invoice Count", "Email Address", "Phone Number"
  ];
  const ageingRows: any[][] = [
    [`SUNDRY DEBTORS DETAILED AGEING BREAKDOWN`],
    [`Company: ${companyName} | Valuation Date: ${fyEnd}`],
    [],
    headersAgeing
  ];

  debtors.forEach(p => {
    ageingRows.push([
      p.partyName, p.gstin || "MISSING GSTIN", p.totalOutstanding,
      p.days0_30, p.days31_60, p.days61_90, p.days91_120, p.days120_plus,
      p.avgPaymentDays, p.riskStatus, p.invoiceCount, p.email, p.phone
    ]);
  });

  const totRowAgeing = ageingRows.length + 1;
  ageingRows.push([
    "Total Debtors Outstanding", null,
    { f: `=SUM(C5:C${totRowAgeing - 1})` },
    { f: `=SUM(D5:D${totRowAgeing - 1})` },
    { f: `=SUM(E5:E${totRowAgeing - 1})` },
    { f: `=SUM(F5:F${totRowAgeing - 1})` },
    { f: `=SUM(G5:G${totRowAgeing - 1})` },
    { f: `=SUM(H5:H${totRowAgeing - 1})` },
    null, null,
    { f: `=SUM(K5:K${totRowAgeing - 1})` },
    null, null
  ]);

  const wsAgeing = XLSX.utils.aoa_to_sheet(ageingRows);
  wsAgeing["!cols"] = [
    { wch: 30 }, { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 16 }
  ];
  safeSetCell(wsAgeing, "A1", titleStyle);
  safeSetCell(wsAgeing, "A2", subTitleStyle);
  for (let c = 0; c < headersAgeing.length; c++) {
    safeSetCell(wsAgeing, XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
  }

  // Debtors Bill Breakdown Sheet
  const billHeaders = ["Party Name", "GSTIN", "Ref Number", "Invoice Date", "Due Date", "Outstanding Amount", "Age (Days)", "Status", "Risk Category"];
  const billRows: any[][] = [
    [`SUNDRY DEBTORS BILL-BY-BILL OUTSTANDING LEDGER`],
    [`Detailed Sales Invoices List for ${companyName}`],
    [],
    billHeaders
  ];

  debtors.forEach(p => {
    (p.bills || []).forEach(b => {
      let status = "Current";
      if (b.ageDays > 90) status = "Critical";
      else if (b.ageDays > 30) status = "Overdue";

      billRows.push([
        p.partyName, p.gstin || "MISSING", b.refNo, b.date, b.dueDate,
        Math.abs(b.amount), b.ageDays, status, p.riskStatus
      ]);
    });
  });

  const wsBills = XLSX.utils.aoa_to_sheet(billRows);
  wsBills["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  safeSetCell(wsBills, "A1", titleStyle);
  safeSetCell(wsBills, "A2", subTitleStyle);
  for (let c = 0; c < billHeaders.length; c++) {
    safeSetCell(wsBills, XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, "Debtors Executive Summary");
  XLSX.utils.book_append_sheet(wb, wsAgeing, "Sundry Debtors Ageing");
  XLSX.utils.book_append_sheet(wb, wsBills, "Debtors Invoice Details");

  XLSX.writeFile(wb, `${companyName.replace(/\s+/g, '_')}_Sundry_Debtors_Audit.xlsx`);
}

// ─── Dedicated Creditors Module Exporter ────────────────────────────
export function exportCreditorsToExcel(
  creditors: AuditParty[],
  companyName: string,
  fyEnd: string
) {
  const wb = XLSX.utils.book_new();

  const colors = {
    brandBlue: "0F172A",
    accentBlue: "0284C7",
    headerBg: "1E293B",
    zebraBg: "F8FAFC",
    totalBg: "E2E8F0",
    lowRisk: "DCFCE7",
    lowRiskText: "15803D",
    medRisk: "FEF9C3",
    medRiskText: "A16207",
    highRisk: "FEE2E2",
    highRiskText: "B91C1C",
  };

  const borderThin = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const titleStyle = {
    font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } },
    alignment: { horizontal: "left" },
  };

  const subTitleStyle = {
    font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } },
    alignment: { horizontal: "left" },
  };

  // Creditors Summary Sheet
  const grossPayables = creditors.filter(c => c.totalOutstanding > 0).reduce((sum, c) => sum + c.totalOutstanding, 0);
  const totalAdvances = creditors.filter(c => c.totalOutstanding < 0 || c.isAdvancePending).reduce((sum, c) => sum + Math.abs(c.totalOutstanding), 0);
  const netPayables = grossPayables - totalAdvances;
  const avgDpo = Math.round(creditors.reduce((sum, c) => sum + c.avgPaymentDays, 0) / (creditors.length || 1));

  const summaryData: any[][] = [
    [`${companyName.toUpperCase()} - SUNDRY CREDITORS AUDIT REPORT`],
    [`Trade Payables & Vendor Payment Control as of ${fyEnd}`],
    [],
    ["CREDITORS PORTFOLIO METRICS", null, null, null],
    ["Metric Description", "Amount / Value", "Unit", "Auditor Status Assessment"],
    ["Gross Trade Payables (Credit Balances)", grossPayables, "INR", grossPayables > 10000000 ? "High Creditor Working Capital Exposure" : "Adequate Creditor Working Capital"],
    ["Supplier Advances Paid (Debit Balances)", totalAdvances, "INR", totalAdvances > 0 ? "Supplier advances paid / invoice booking pending" : "No supplier advances pending"],
    ["Net Trade Payables Outstanding", netPayables, "INR", "Net closing vendor payable position"],
    ["Average Days Payable Outstanding (DPO)", avgDpo, "Days", avgDpo > 60 ? "DPO Exceeds 60 Days — Review Vendor Credit Terms & MSME Rules" : "Healthy Payment Terms"],
    ["Total Active Supplier Accounts", creditors.length, "Count", "Total registered vendor accounts audited"],
    ["Critical Vendor Payables (> 90 Days)", creditors.reduce((sum, c) => sum + c.days91_120 + c.days120_plus, 0), "INR", "Review for MSME statutory payment disallowances"],
    [],
    ["TOP SUPPLIER CONCENTRATION RISK (> 15% Exposure)", null, null, null],
    ["Vendor Party Name", "Outstanding Balance", "Concentration %", "Risk Status"]
  ];

  const concThreshold = grossPayables * 0.15;
  creditors.forEach(c => {
    const isAdv = c.totalOutstanding < 0 || c.isAdvancePending;
    const absVal = Math.abs(c.totalOutstanding);
    summaryData.push([
      c.partyName + (isAdv ? " (Dr / Advance Paid)" : ""),
      absVal,
      absVal / (grossPayables || 1),
      absVal > concThreshold ? "High Supplier Exposure (>15%)" : (isAdv ? "Supplier Advance Paid" : "Diversified Suppliers")
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 35 }, { wch: 22 }, { wch: 18 }, { wch: 35 }];
  wsSummary["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 10, c: 0 }, e: { r: 10, c: 3 } }
  ];

  const safeSetCell = (ws: any, addr: string, style: any, numFmt?: string) => {
    if (ws[addr]) {
      ws[addr].s = style;
      if (numFmt) ws[addr].z = numFmt;
    }
  };

  safeSetCell(wsSummary, "A1", titleStyle);
  safeSetCell(wsSummary, "A2", subTitleStyle);
  safeSetCell(wsSummary, "A4", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });
  safeSetCell(wsSummary, "A11", { font: { name: "Inter", sz: 12, bold: true, color: { rgb: colors.accentBlue } } });

  for (let c = 0; c < 4; c++) {
    safeSetCell(wsSummary, XLSX.utils.encode_cell({ r: 4, c }), headerStyle);
    safeSetCell(wsSummary, XLSX.utils.encode_cell({ r: 11, c }), headerStyle);
  }

  // Creditors Ageing Sheet
  const headersAgeing = [
    "Party Name", "GSTIN", "Total Outstanding",
    "0-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", "120+ Days",
    "Avg Pay Days", "Risk Status", "Invoice Count", "Email Address", "Phone Number"
  ];
  const ageingRows: any[][] = [
    [`SUNDRY CREDITORS DETAILED AGEING BREAKDOWN`],
    [`Company: ${companyName} | Valuation Date: ${fyEnd}`],
    [],
    headersAgeing
  ];

  creditors.forEach(p => {
    ageingRows.push([
      p.partyName, p.gstin || "MISSING GSTIN", p.totalOutstanding,
      p.days0_30, p.days31_60, p.days61_90, p.days91_120, p.days120_plus,
      p.avgPaymentDays, p.riskStatus, p.invoiceCount, p.email, p.phone
    ]);
  });

  const totRowAgeing = ageingRows.length + 1;
  ageingRows.push([
    "Total Creditors Outstanding", null,
    { f: `=SUM(C5:C${totRowAgeing - 1})` },
    { f: `=SUM(D5:D${totRowAgeing - 1})` },
    { f: `=SUM(E5:E${totRowAgeing - 1})` },
    { f: `=SUM(F5:F${totRowAgeing - 1})` },
    { f: `=SUM(G5:G${totRowAgeing - 1})` },
    { f: `=SUM(H5:H${totRowAgeing - 1})` },
    null, null,
    { f: `=SUM(K5:K${totRowAgeing - 1})` },
    null, null
  ]);

  const wsAgeing = XLSX.utils.aoa_to_sheet(ageingRows);
  wsAgeing["!cols"] = [
    { wch: 30 }, { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 16 }
  ];
  safeSetCell(wsAgeing, "A1", titleStyle);
  safeSetCell(wsAgeing, "A2", subTitleStyle);
  for (let c = 0; c < headersAgeing.length; c++) {
    safeSetCell(wsAgeing, XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
  }

  // Creditors Bill Breakdown Sheet
  const billHeaders = ["Vendor Name", "GSTIN", "Ref Number", "Invoice Date", "Due Date", "Outstanding Amount", "Age (Days)", "Status", "Risk Category"];
  const billRows: any[][] = [
    [`SUNDRY CREDITORS BILL-BY-BILL OUTSTANDING LEDGER`],
    [`Detailed Purchase Invoices List for ${companyName}`],
    [],
    billHeaders
  ];

  creditors.forEach(p => {
    (p.bills || []).forEach(b => {
      let status = "Current";
      if (b.ageDays > 90) status = "Critical";
      else if (b.ageDays > 30) status = "Overdue";

      billRows.push([
        p.partyName, p.gstin || "MISSING", b.refNo, b.date, b.dueDate,
        Math.abs(b.amount), b.ageDays, status, p.riskStatus
      ]);
    });
  });

  const wsBills = XLSX.utils.aoa_to_sheet(billRows);
  wsBills["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  safeSetCell(wsBills, "A1", titleStyle);
  safeSetCell(wsBills, "A2", subTitleStyle);
  for (let c = 0; c < billHeaders.length; c++) {
    safeSetCell(wsBills, XLSX.utils.encode_cell({ r: 3, c }), headerStyle);
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, "Creditors Executive Summary");
  XLSX.utils.book_append_sheet(wb, wsAgeing, "Sundry Creditors Ageing");
  XLSX.utils.book_append_sheet(wb, wsBills, "Creditors Invoice Details");

  XLSX.writeFile(wb, `${companyName.replace(/\s+/g, '_')}_Sundry_Creditors_Audit.xlsx`);
}

// ─── Dedicated Cash Compliance Exporter ─────────────────────────────
export function exportCashComplianceToExcel(
  cashObservations: CashAuditObservation[],
  companyName: string,
  fyEnd: string,
  openingBalance: number = 0
) {
  const wb = XLSX.utils.book_new();

  const colors = {
    brandBlue: "0F172A",
    accentBlue: "0284C7",
    headerBg: "1E293B",
    totalBg: "E2E8F0",
    highRisk: "FEE2E2",
    highRiskText: "B91C1C",
    medRisk: "FEF9C3",
    medRiskText: "A16207",
    lowRisk: "DCFCE7",
    lowRiskText: "15803D"
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const titleStyle = { font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } } };
  const subTitleStyle = { font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } } };

  // Executive Dashboard
  const sec40A3Count = cashObservations.filter(o => o.type === 'Disallowed Payment (40A(3))').length;
  const sec40A3Amt = cashObservations.filter(o => o.type === 'Disallowed Payment (40A(3))').reduce((s, o) => s + o.amount, 0);
  const sec269Count = cashObservations.filter(o => o.type === 'Loan Violation (269SS/T)').length;
  const sec269Amt = cashObservations.filter(o => o.type === 'Loan Violation (269SS/T)').reduce((s, o) => s + o.amount, 0);
  const negCashCount = cashObservations.filter(o => o.type === 'Negative Cash Balance' && o.voucherNumber !== 'CLOSING').length;

  const dashboardRows = [
    [`CASH COMPLIANCE AUDIT SUMMARY — ${companyName.toUpperCase()}`],
    [`Statutory Cash Limits & Negative Cash Checks as of ${fyEnd}`],
    [],
    ["STATUTORY CASH AUDIT SUMMARY", null, null, null],
    ["Compliance Parameter", "Count / Value", "Unit", "Statutory Provision & Risk Assessment"],
    ["Sec 40A(3) Disallowed Cash Payments (>₹10k)", sec40A3Amt, "INR", `${sec40A3Count} instances flagged. Tax disallowance u/s 40A(3)`],
    ["Sec 269SS/269T Cash Loan Violations (>₹20k)", sec269Amt, "INR", `${sec269Count} instances flagged. Attracts 100% penalty u/s 271D/E`],
    ["Negative Cash Balance Days", negCashCount, "Days Flagged", negCashCount > 0 ? "CRITICAL: Cash-in-hand went negative!" : "No negative cash days detected"],
    ["Opening Cash-in-Hand Balance", openingBalance, "INR", "Starting cash book balance"]
  ];

  const wsDash = XLSX.utils.aoa_to_sheet(dashboardRows);
  wsDash["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 18 }, { wch: 45 }];
  wsDash["A1"].s = titleStyle;
  wsDash["A2"].s = subTitleStyle;
  for (let c = 0; c < 4; c++) {
    const colChar = String.fromCharCode(65 + c);
    wsDash[`${colChar}5`].s = headerStyle;
  }

  // 40A3 Sheet
  const sec40A3Rows: any[][] = [
    [`SECTION 40A(3) CASH DISALLOWANCE LOG (> ₹10,000 DAILY LIMIT)`],
    [`Company: ${companyName} | Audit Date: ${fyEnd}`],
    [],
    ["Date", "Party / Ledger Name", "Voucher Type", "Voucher No", "Cash Amount (INR)", "Severity", "Audit Risk Note", "Recommended Action"]
  ];

  cashObservations.filter(o => o.type === 'Disallowed Payment (40A(3))').forEach(o => {
    sec40A3Rows.push([o.date, o.partyName, o.voucherType, o.voucherNumber, o.amount, o.severity, o.description, o.recommendation]);
  });

  const ws40A3 = XLSX.utils.aoa_to_sheet(sec40A3Rows);
  ws40A3["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 50 }, { wch: 50 }];
  ws40A3["A1"].s = titleStyle;
  ws40A3["A2"].s = subTitleStyle;
  for (let c = 0; c < 8; c++) {
    ws40A3[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  // Sec 269SS/T Sheet
  const sec269Rows: any[][] = [
    [`SECTION 269SS / 269T CASH LOAN VIOLATIONS LOG (> ₹20,000 LIMIT)`],
    [`Company: ${companyName} | Audit Date: ${fyEnd}`],
    [],
    ["Date", "Loan Account Name", "Voucher Type", "Voucher No", "Transaction Amount", "Severity", "Statutory Impact", "Auditor Advice"]
  ];

  cashObservations.filter(o => o.type === 'Loan Violation (269SS/T)').forEach(o => {
    sec269Rows.push([o.date, o.partyName, o.voucherType, o.voucherNumber, o.amount, o.severity, o.description, o.recommendation]);
  });

  const ws269 = XLSX.utils.aoa_to_sheet(sec269Rows);
  ws269["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 50 }, { wch: 50 }];
  ws269["A1"].s = titleStyle;
  ws269["A2"].s = subTitleStyle;
  for (let c = 0; c < 8; c++) {
    ws269[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  // Negative Cash Sheet
  const negCashRows: any[][] = [
    [`CHRONOLOGICAL CASH BALANCE & NEGATIVE CASH AUDIT LOG`],
    [`Company: ${companyName} | Audit Date: ${fyEnd}`],
    [],
    ["Date", "Voucher Type", "Voucher No", "Voucher Amount", "Running Cash Balance", "Audit Finding", "Recommendation"]
  ];

  cashObservations.filter(o => o.type === 'Negative Cash Balance').forEach(o => {
    negCashRows.push([o.date, o.voucherType, o.voucherNumber, o.amount, o.runningBalance, o.description, o.recommendation]);
  });

  const wsNeg = XLSX.utils.aoa_to_sheet(negCashRows);
  wsNeg["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 50 }, { wch: 50 }];
  wsNeg["A1"].s = titleStyle;
  wsNeg["A2"].s = subTitleStyle;
  for (let c = 0; c < 7; c++) {
    wsNeg[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(wb, wsDash, "Cash Executive Dashboard");
  XLSX.utils.book_append_sheet(wb, ws40A3, "Sec 40A(3) Disallowances");
  XLSX.utils.book_append_sheet(wb, ws269, "Sec 269SS-269T Loan Violations");
  XLSX.utils.book_append_sheet(wb, wsNeg, "Negative Cash Walk Log");

  XLSX.writeFile(wb, `${companyName.replace(/\s+/g, '_')}_Cash_Compliance_Audit.xlsx`);
}

// ─── Dedicated Forensic Audit Exporter ───────────────────────────────
export function exportForensicAuditToExcel(
  benfordResults: BenfordAnalysisResult[],
  gapObservations: ForensicObservation[],
  journalAnomalies: ForensicObservation[],
  companyName: string,
  fyEnd: string
) {
  const wb = XLSX.utils.book_new();

  const colors = {
    brandBlue: "0F172A",
    headerBg: "1E293B",
    highRisk: "FEE2E2",
    highRiskText: "B91C1C",
    medRisk: "FEF9C3",
    lowRisk: "DCFCE7"
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const titleStyle = { font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } } };
  const subTitleStyle = { font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } } };

  // 1. Summary Sheet
  const summaryRows = [
    [`FORENSIC AUDIT & FRAUD DETECTION SUMMARY — ${companyName.toUpperCase()}`],
    [`Benford's Law, Sequence Gap & Journal Anomaly Scan as of ${fyEnd}`],
    [],
    ["FORENSIC INDICATORS OVERVIEW", null, null, null],
    ["Analysis Module", "Flagged Count", "Primary Anomaly Category", "Auditor Action Summary"],
    ["Benford's First-Digit Test", benfordResults.filter(b => b.isAnomaly).length, "Statistical Digit Spike", "Examine flagged leading digits for split vouchers or round totals"],
    ["Voucher Sequence Gap Scan", gapObservations.length, "Missing / Jumped Voucher Nos", "Verify potential deleted transactions or unrecorded sales/purchases"],
    ["Journal Entry Anomalies", journalAnomalies.length, "High Risk Postings", "Review round sum journals, holiday postings, or direct equity debits"]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 55 }];
  wsSummary["A1"].s = titleStyle;
  wsSummary["A2"].s = subTitleStyle;
  for (let c = 0; c < 4; c++) {
    wsSummary[`${String.fromCharCode(65 + c)}5`].s = headerStyle;
  }

  // 2. Benford Sheet
  const benfordRows: any[][] = [
    [`BENFORD'S LAW FIRST-DIGIT DISTRIBUTION AUDIT`],
    [`Company: ${companyName} | Target Curve vs Actual Frequency`],
    [],
    ["Leading Digit (1-9)", "Actual Count", "Actual %", "Benford Target %", "Variance %", "Anomaly Status"]
  ];

  benfordResults.forEach(b => {
    benfordRows.push([
      b.digit,
      b.actualCount,
      (b.actualPercentage / 100).toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1 }),
      (b.benfordPercentage / 100).toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1 }),
      (b.difference / 100).toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1 }),
      b.isAnomaly ? "STATISTICAL ANOMALY DETECTED" : "Normal Distribution"
    ]);
  });

  const wsBenford = XLSX.utils.aoa_to_sheet(benfordRows);
  wsBenford["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 30 }];
  wsBenford["A1"].s = titleStyle;
  wsBenford["A2"].s = subTitleStyle;
  for (let c = 0; c < 6; c++) {
    wsBenford[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  // 3. Voucher Gaps Sheet
  const gapRows: any[][] = [
    [`VOUCHER NUMBER SEQUENCE GAP LOG`],
    [`Company: ${companyName}`],
    [],
    ["Missing Voucher / Gap Ref", "Severity", "Audit Risk Finding", "Auditor Recommendation"]
  ];

  gapObservations.forEach(g => {
    gapRows.push([
      g.description,
      g.severity,
      g.description,
      g.recommendation
    ]);
  });

  const wsGaps = XLSX.utils.aoa_to_sheet(gapRows);
  wsGaps["!cols"] = [{ wch: 35 }, { wch: 12 }, { wch: 50 }, { wch: 50 }];
  wsGaps["A1"].s = titleStyle;
  wsGaps["A2"].s = subTitleStyle;
  for (let c = 0; c < 4; c++) {
    wsGaps[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  // 4. Journal Anomalies Sheet
  const journalRows: any[][] = [
    [`JOURNAL ENTRY HIGH-RISK ANOMALY LOG`],
    [`Company: ${companyName}`],
    [],
    ["Date", "Voucher Number", "Account / Ledger", "Amount (INR)", "Severity", "Anomaly Finding", "Recommended Auditor Verification"]
  ];

  journalAnomalies.forEach(j => {
    journalRows.push([
      j.date || '-',
      j.voucherNumber || '-',
      j.partyName || '-',
      j.amount || 0,
      j.severity,
      j.description,
      j.recommendation
    ]);
  });

  const wsJournal = XLSX.utils.aoa_to_sheet(journalRows);
  wsJournal["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 50 }, { wch: 50 }];
  wsJournal["A1"].s = titleStyle;
  wsJournal["A2"].s = subTitleStyle;
  for (let c = 0; c < 7; c++) {
    wsJournal[`${String.fromCharCode(65 + c)}4`].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(wb, wsSummary, "Forensic Executive Summary");
  XLSX.utils.book_append_sheet(wb, wsBenford, "Benford First-Digit Test");
  XLSX.utils.book_append_sheet(wb, wsGaps, "Voucher Sequence Gaps");
  XLSX.utils.book_append_sheet(wb, wsJournal, "Journal Entry Anomalies");

  XLSX.writeFile(wb, `${companyName.replace(/\s+/g, '_')}_Forensic_Fraud_Audit.xlsx`);
}

// ─── Excel File Upload Parser ───────────────────────────────────────

export function parseExcelOutstandingReport(sheetData: any[][]): AuditParty[] {
  // Attempt to find column indexes from headers
  let headerRowIndex = -1;
  let nameCol = -1;
  let gstinCol = -1;
  let outstandingCol = -1;
  let days0_30Col = -1;
  let days31_60Col = -1;
  let days61_90Col = -1;
  let days91_120Col = -1;
  let days120PlusCol = -1;

  for (let r = 0; r < Math.min(sheetData.length, 15); r++) {
    const row = sheetData[r] || [];
    const normalized = row.map(cell => String(cell || '').toUpperCase().trim());

    const hasParty = normalized.some(c => c.includes("PARTY") || c.includes("LEDGER") || c.includes("CUSTOMER") || c.includes("VENDOR") || c.includes("NAME"));
    const hasBalance = normalized.some(c => c.includes("BALANCE") || c.includes("OUTSTANDING") || c.includes("AMOUNT") || c.includes("CL. BAL"));

    if (hasParty && hasBalance) {
      headerRowIndex = r;
      row.forEach((cell, idx) => {
        const text = String(cell || '').toUpperCase().trim();
        if (text.includes("PARTY") || text.includes("LEDGER") || text.includes("CUSTOMER") || text.includes("VENDOR") || text.includes("NAME")) {
          nameCol = idx;
        } else if (text.includes("GSTIN") || text.includes("GST ID")) {
          gstinCol = idx;
        } else if (text.includes("OUTSTANDING") || text.includes("BALANCE") || text.includes("AMOUNT") || text.includes("CL. BAL")) {
          outstandingCol = idx;
        } else if (text.includes("0-30") || text.includes("< 30") || text.includes("0 TO 30")) {
          days0_30Col = idx;
        } else if (text.includes("31-60") || text.includes("30-60") || text.includes("31 TO 60")) {
          days31_60Col = idx;
        } else if (text.includes("61-90") || text.includes("60-90") || text.includes("61 TO 90")) {
          days61_90Col = idx;
        } else if (text.includes("91-120") || text.includes("90-120") || text.includes("91 TO 120")) {
          days91_120Col = idx;
        } else if (text.includes("120") || text.includes("> 120") || text.includes("OVER 120") || text.includes("OLDER") || text.includes("180") || text.includes("> 90")) {
          days120PlusCol = idx;
        }
      });
      break;
    }
  }

  // If we couldn't identify the columns, fallback to column index guessing:
  if (nameCol === -1) nameCol = 0;
  if (outstandingCol === -1) outstandingCol = 2;

  const results: AuditParty[] = [];

  const safeVal = (v: any): number => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const clean = String(v).replace(/[₹,\s]/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 1;

  for (let r = startRow; r < sheetData.length; r++) {
    const row = sheetData[r] || [];
    const partyName = String(row[nameCol] || '').trim();
    if (!partyName || partyName.toLowerCase() === 'total' || partyName.toLowerCase().includes('grand total') || partyName.toUpperCase() === 'PARTY NAME') {
      continue;
    }

    const gstin = gstinCol !== -1 ? String(row[gstinCol] || '').trim().toUpperCase() : '';
    const totalOutstanding = safeVal(row[outstandingCol]);
    if (totalOutstanding === 0 && !row.some((val, idx) => idx > nameCol && typeof val === 'number' && val > 0)) {
      continue;
    }

    const d0_30 = days0_30Col !== -1 ? safeVal(row[days0_30Col]) : totalOutstanding * 0.5;
    const d31_60 = days31_60Col !== -1 ? safeVal(row[days31_60Col]) : totalOutstanding * 0.25;
    const d61_90 = days61_90Col !== -1 ? safeVal(row[days61_90Col]) : totalOutstanding * 0.15;
    const d91_120 = days91_120Col !== -1 ? safeVal(row[days91_120Col]) : totalOutstanding * 0.08;
    const d120 = days120PlusCol !== -1 ? safeVal(row[days120PlusCol]) : totalOutstanding * 0.02;

    const olderThan90 = d91_120 + d120;
    const ratio = olderThan90 / (totalOutstanding || 1);

    let risk: 'Low' | 'Medium' | 'High' = 'Low';
    if (ratio > 0.4 || d120 > 200000) {
      risk = 'High';
    } else if (ratio > 0.15 || olderThan90 > 50000) {
      risk = 'Medium';
    }

    results.push({
      partyName,
      gstin,
      totalOutstanding,
      days0_30: d0_30,
      days31_60: d31_60,
      days61_90: d61_90,
      days91_120: d91_120,
      days120_plus: d120,
      avgPaymentDays: risk === 'High' ? 85 : (risk === 'Medium' ? 45 : 22),
      riskStatus: risk,
      parentGroup: "Sundry Debtors", // Default
      email: `${partyName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
      phone: "+91 99999 88888",
      invoiceCount: Math.max(1, Math.ceil(totalOutstanding / 150000))
    });
  }

  return results;
}

// ─── Direct Expense Auditor Engine ─────────────────────────────────

export interface DirectExpenseObservation {
  date: string;
  ledgerName: string;
  voucherType: string;
  voucherNumber: string;
  paymentLedger: string;
  amount: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  description: string;
  recommendation: string;
}

export interface DirectExpenseLedgerSummary {
  ledgerName: string;
  parentGroup: string;
  directPaymentAmount: number;
  transactionCount: number;
  riskProfile: 'Low' | 'Medium' | 'High';
}

export interface DirectExpenseAuditResult {
  observations: DirectExpenseObservation[];
  ledgerSummaries: DirectExpenseLedgerSummary[];
  totalAuditedExpenses: number;
  totalBypassedAmount: number;
  bypassedPercentage: number;
  highRiskCount: number;
}

export function runDirectExpenseAudit(
  allVouchersList: { ledgerName: string; date: string; voucherType: string; voucherNumber: string; amount: number; isDebit: boolean }[],
  ledgerParentMap: Map<string, string>,
  groupParentMap: Map<string, string>
): DirectExpenseAuditResult {
  // Helper to trace parent group hierarchy
  const getLedgerHierarchy = (ledgerName: string): string[] => {
    const ledgerKey = ledgerName.toUpperCase().trim();
    const parentGroup = ledgerParentMap.get(ledgerKey);
    if (!parentGroup) return [];

    const path: string[] = [parentGroup.toUpperCase()];
    const visited = new Set<string>([parentGroup.toUpperCase()]);
    let current = parentGroup.toUpperCase();

    while (current) {
      const parent = groupParentMap.get(current);
      if (!parent) break;
      const parentUpper = parent.toUpperCase();
      if (visited.has(parentUpper)) break;
      path.push(parentUpper);
      visited.add(parentUpper);
      current = parentUpper;
    }
    return path;
  };

  const belongsToGroup = (ledgerName: string, targetGroups: string[]): boolean => {
    const hierarchy = getLedgerHierarchy(ledgerName);
    const upperTargets = targetGroups.map(g => g.toUpperCase().trim());
    return hierarchy.some(g => upperTargets.includes(g));
  };

  // Group ledger entries by Voucher. Key: date + "_" + voucherType + "_" + voucherNumber
  const vchGroups = new Map<string, {
    date: string;
    voucherType: string;
    voucherNumber: string;
    entries: { ledgerName: string; amount: number; isDebit: boolean }[];
  }>();

  allVouchersList.forEach(entry => {
    const key = `${entry.date}_${entry.voucherType}_${entry.voucherNumber || 'AUTO'}`;
    if (!vchGroups.has(key)) {
      vchGroups.set(key, {
        date: entry.date,
        voucherType: entry.voucherType,
        voucherNumber: entry.voucherNumber,
        entries: []
      });
    }
    vchGroups.get(key)!.entries.push({
      ledgerName: entry.ledgerName,
      amount: entry.amount,
      isDebit: entry.isDebit
    });
  });

  const observations: DirectExpenseObservation[] = [];
  const ledgerSummaryMap = new Map<string, {
    ledgerName: string;
    parentGroup: string;
    directPaymentAmount: number;
    transactionCount: number;
    highCount: number;
    medCount: number;
  }>();

  let totalAuditedExpenses = 0;
  let totalBypassedAmount = 0;

  const expenseGroups = ['DIRECT EXPENSES', 'INDIRECT EXPENSES', 'DIRECT EXPENSE', 'INDIRECT EXPENSE', 'EXPENSES (DIRECT)', 'EXPENSES (INDIRECT)', 'EXPENSE'];
  const cashBankGroups = ['BANK ACCOUNTS', 'CASH-IN-HAND', 'BANK ACCOUNT', 'CASH IN HAND', 'CASH', 'BANK'];
  const creditorGroups = ['SUNDRY CREDITORS', 'SUNDRY CREDITOR', 'CREDITORS'];

  vchGroups.forEach(vch => {
    let hasExpenseDebit = false;
    let hasCashBankCredit = false;
    let hasCreditorEntry = false;

    const expenseDebits: { ledgerName: string; amount: number }[] = [];
    const cashBankCredits: { ledgerName: string; amount: number }[] = [];

    vch.entries.forEach(entry => {
      const isExpense = belongsToGroup(entry.ledgerName, expenseGroups);
      const isCashBank = belongsToGroup(entry.ledgerName, cashBankGroups);
      const isCreditor = belongsToGroup(entry.ledgerName, creditorGroups);

      if (isExpense && entry.isDebit) {
        hasExpenseDebit = true;
        expenseDebits.push({ ledgerName: entry.ledgerName, amount: entry.amount });
        totalAuditedExpenses += entry.amount;
      }
      if (isCashBank && !entry.isDebit) {
        hasCashBankCredit = true;
        cashBankCredits.push({ ledgerName: entry.ledgerName, amount: entry.amount });
      }
      if (isCreditor) {
        hasCreditorEntry = true;
      }
    });

    if (hasExpenseDebit && hasCashBankCredit && !hasCreditorEntry) {
      expenseDebits.forEach(exp => {
        totalBypassedAmount += exp.amount;

        const payLedger = cashBankCredits.map(c => c.ledgerName).join(', ') || 'Cash/Bank A/c';
        const isCash = cashBankCredits.some(c => belongsToGroup(c.ledgerName, ['CASH-IN-HAND', 'CASH']));

        let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
        let description = '';
        let recommendation = '';

        if (isCash && exp.amount > 10000) {
          riskLevel = 'High';
          description = `Direct Cash payment of ₹${exp.amount.toLocaleString('en-IN')} debited directly to ${exp.ledgerName} without creating a creditor. Exceeds the statutory limit of ₹10,000 u/s 40A(3).`;
          recommendation = `Deduction disallowance risk! Review transaction details. Retrospectively adjust expense or file disallowance in tax audit report. Prefer bank transfers.`;
        } else if (exp.amount > 50000) {
          riskLevel = 'High';
          description = `Direct payment of ₹${exp.amount.toLocaleString('en-IN')} to ${exp.ledgerName} bypassing Creditors. High value transaction exceeds ₹50,000 threshold without ledger audit tracking.`;
          recommendation = `Internal control gap. Establish credit register details for this vendor to ensure proper MSME classification and TDS calculations u/s 194C / 194J.`;
        } else if (exp.amount >= 10000) {
          riskLevel = 'Medium';
          description = `Direct payment of ₹${exp.amount.toLocaleString('en-IN')} to ${exp.ledgerName} bypassing Creditors. Substantial amount paid directly.`;
          recommendation = `Ensure invoice documentation matches payment voucher. Verify if TDS or MSME disclosures apply.`;
        } else {
          riskLevel = 'Low';
          description = `Direct micro-payment of ₹${exp.amount.toLocaleString('en-IN')} to ${exp.ledgerName} bypassing Creditors. Small value expenditure.`;
          recommendation = `Acceptable micro-payment. Verify standard bill receipts exist.`;
        }

        observations.push({
          date: vch.date,
          ledgerName: exp.ledgerName,
          voucherType: vch.voucherType,
          voucherNumber: vch.voucherNumber || 'AUTO',
          paymentLedger: payLedger,
          amount: exp.amount,
          riskLevel,
          description,
          recommendation
        });

        const ledgerKey = exp.ledgerName.toUpperCase().trim();
        if (!ledgerSummaryMap.has(ledgerKey)) {
          const parentGroup = ledgerParentMap.get(ledgerKey) || 'Indirect Expenses';
          ledgerSummaryMap.set(ledgerKey, {
            ledgerName: exp.ledgerName,
            parentGroup,
            directPaymentAmount: 0,
            transactionCount: 0,
            highCount: 0,
            medCount: 0
          });
        }
        const summ = ledgerSummaryMap.get(ledgerKey)!;
        summ.directPaymentAmount += exp.amount;
        summ.transactionCount += 1;
        if (riskLevel === 'High') summ.highCount += 1;
        if (riskLevel === 'Medium') summ.medCount += 1;
      });
    }
  });

  const ledgerSummaries: DirectExpenseLedgerSummary[] = Array.from(ledgerSummaryMap.values()).map(s => {
    let riskProfile: 'Low' | 'Medium' | 'High' = 'Low';
    if (s.highCount > 0) {
      riskProfile = 'High';
    } else if (s.medCount > 0) {
      riskProfile = 'Medium';
    }
    return {
      ledgerName: s.ledgerName,
      parentGroup: s.parentGroup,
      directPaymentAmount: s.directPaymentAmount,
      transactionCount: s.transactionCount,
      riskProfile
    };
  }).sort((a, b) => b.directPaymentAmount - a.directPaymentAmount);

  const highRiskCount = observations.filter(o => o.riskLevel === 'High').length;
  const bypassedPercentage = totalAuditedExpenses > 0 ? (totalBypassedAmount / totalAuditedExpenses) * 100 : 0;

  return {
    observations,
    ledgerSummaries,
    totalAuditedExpenses,
    totalBypassedAmount,
    bypassedPercentage,
    highRiskCount
  };
}

export function exportDirectExpensesToExcel(
  observations: DirectExpenseObservation[],
  ledgerSummaries: DirectExpenseLedgerSummary[],
  totalAuditedExpenses: number,
  totalBypassedAmount: number,
  bypassedPercentage: number,
  companyName: string,
  fyPeriod: string
) {
  const wb = XLSX.utils.book_new();

  const colors = {
    brandBlue: "0F172A",
    accentBlue: "0284C7",
    headerBg: "1E293B",
    zebraBg: "F8FAFC",
    totalBg: "E2E8F0",
    lowRisk: "DCFCE7",
    lowRiskText: "15803D",
    medRisk: "FEF9C3",
    medRiskText: "A16207",
    highRisk: "FEE2E2",
    highRiskText: "B91C1C",
  };

  const borderThin = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  const headerStyle = {
    fill: { fgColor: { rgb: colors.headerBg } },
    font: { name: "Inter", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };

  const cellStyle = {
    font: { name: "Inter", sz: 9 },
    border: borderThin,
    alignment: { vertical: "center" }
  };

  const currencyStyle = {
    ...cellStyle,
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "₹#,##,##0"
  };

  const titleStyle = {
    font: { name: "Inter", sz: 16, bold: true, color: { rgb: colors.brandBlue } },
    alignment: { horizontal: "left" },
  };

  const subTitleStyle = {
    font: { name: "Inter", sz: 10, italic: true, color: { rgb: "475569" } },
    alignment: { horizontal: "left" },
  };

  // 1. Dashboard Tab
  const buildDashboardSheet = () => {
    const data: any[][] = [
      [companyName.toUpperCase() + " - DIRECT EXPENSE AUDIT SUMMARY", null, null, null],
      [`Bypassed Creditors & Internal Controls Audit - Period: ${fyPeriod}`, null, null, null],
      [],
      ["AUDIT KEY PERFORMANCE INDICATORS", null, null, null],
      ["Metric Description", "Value", "Benchmark / Status", "Auditor Assessment Note"],
      ["Total Audited Expenses", totalAuditedExpenses, "INR", "Total Direct & Indirect Expense debits audited"],
      ["Creditor-Bypassed Expense Payments", totalBypassedAmount, "INR", "Expenses paid directly to Cash/Bank without vendor ledgers"],
      ["Internal Control Bypass Ratio", bypassedPercentage / 100, "Percentage", "Percentage of expense volume bypassing creditor ledger (Target < 15%)"],
      ["Total Flagged Vouchers", observations.length, "Count", "Total individual voucher instances flagged"],
      ["High-Risk Statutory Violations", observations.filter(o => o.riskLevel === 'High').length, "Count", "Vouchers violating Sec 40A(3) or > ₹50,000 threshold"],
      [],
      ["STATUTORY COMPLIANCE RECOMMENDATIONS", null, null, null],
      ["Risk Category", "Audit Recommendation", "Statutory Provisions", "Action Urgency"],
      ["Section 40A(3) Cash Violations", "Avoid cash payments exceeding ₹10,000 daily to a single person. All such expenses will be disallowed in tax computations.", "Sec 40A(3) of IT Act, 1961", "CRITICAL - Adjust Disallowance"],
      ["MSME & Vendor Compliance", "High-value direct payments bypass vendor ledger setups, risking MSME dues reporting compliance and outstanding disclosures.", "MSMED Act, 2006", "HIGH - Review Ledgers"],
      ["TDS Statutory Deduction", "Direct bank debits for Professional/Contractor charges risk escaping TDS auditing. Ensure TDS u/s 194C/J is deducted correctly.", "Chapter XVII-B of IT Act", "HIGH - Run TDS Reconciliation"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["A1"].s = titleStyle;
    ws["A2"].s = subTitleStyle;
    ws["A4"].s = { font: { name: "Inter", sz: 11, bold: true, color: { rgb: colors.accentBlue } } };
    ws["A12"].s = { font: { name: "Inter", sz: 11, bold: true, color: { rgb: colors.accentBlue } } };

    for (let c = 0; c < 4; c++) {
      const colChar = String.fromCharCode(65 + c);
      ws[`${colChar}5`].s = headerStyle;
      ws[`${colChar}13`].s = headerStyle;
    }

    for (let r = 6; r <= 10; r++) {
      ws[`A${r}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true } };
      ws[`B${r}`].s = r === 8 ? { ...cellStyle, numFmt: "0.0%" } : (r === 9 || r === 10 ? { ...cellStyle, numFmt: "#,##0" } : currencyStyle);
      ws[`C${r}`].s = cellStyle;
      ws[`D${r}`].s = cellStyle;
    }

    for (let r = 14; r <= 16; r++) {
      ws[`A${r}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true }, fill: { fgColor: { rgb: r === 14 ? colors.highRisk : colors.medRisk } } };
      ws[`B${r}`].s = { ...cellStyle, alignment: { wrapText: true } };
      ws[`C${r}`].s = cellStyle;
      ws[`D${r}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true, color: { rgb: r === 14 ? colors.highRiskText : colors.medRiskText } } };
    }

    ws["!cols"] = [{ wch: 35 }, { wch: 20 }, { wch: 25 }, { wch: 60 }];
    return ws;
  };

  const buildLedgerSheet = () => {
    const data: any[][] = [
      [companyName.toUpperCase() + " - LEDGER-WISE DIRECT PAYMENT SUMMARY", null, null, null, null],
      ["Summarized analysis of expense accounts debited directly without sundry creditors", null, null, null, null],
      [],
      ["Expense Ledger Name", "Account Group", "Direct Paid Amount (INR)", "Voucher Count", "Risk Level"]
    ];

    ledgerSummaries.forEach(s => {
      data.push([
        s.ledgerName,
        s.parentGroup,
        s.directPaymentAmount,
        s.transactionCount,
        s.riskProfile
      ]);
    });

    const totRow = ledgerSummaries.length + 5;
    data.push([
      "GRAND TOTAL",
      "",
      { f: `=SUM(C5:C${totRow - 1})` },
      { f: `=SUM(D5:D${totRow - 1})` },
      ""
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["A1"].s = titleStyle;
    ws["A2"].s = subTitleStyle;

    for (let c = 0; c < 5; c++) {
      const colChar = String.fromCharCode(65 + c);
      ws[`${colChar}4`].s = headerStyle;
    }

    for (let i = 0; i < ledgerSummaries.length; i++) {
      const r = i + 5;
      ws[`A${r}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true } };
      ws[`B${r}`].s = cellStyle;
      ws[`C${r}`].s = currencyStyle;
      ws[`D${r}`].s = { ...cellStyle, alignment: { horizontal: "right" } };

      const risk = ledgerSummaries[i].riskProfile;
      const isHigh = risk === 'High';
      const isMed = risk === 'Medium';
      ws[`E${r}`].s = {
        ...cellStyle,
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: isHigh ? colors.highRiskText : (isMed ? colors.medRiskText : colors.lowRiskText) } },
        fill: { fgColor: { rgb: isHigh ? colors.highRisk : (isMed ? colors.medRisk : colors.lowRisk) } },
        alignment: { horizontal: "center" }
      };
    }

    ws[`A${totRow}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true }, fill: { fgColor: { rgb: colors.totalBg } } };
    ws[`B${totRow}`].s = { ...cellStyle, fill: { fgColor: { rgb: colors.totalBg } } };
    ws[`C${totRow}`].s = { ...currencyStyle, font: { name: "Inter", sz: 9, bold: true }, fill: { fgColor: { rgb: colors.totalBg } } };
    ws[`D${totRow}`].s = { ...cellStyle, alignment: { horizontal: "right" }, font: { name: "Inter", sz: 9, bold: true }, fill: { fgColor: { rgb: colors.totalBg } } };
    ws[`E${totRow}`].s = { ...cellStyle, fill: { fgColor: { rgb: colors.totalBg } } };

    ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 15 }, { wch: 15 }];
    return ws;
  };

  const buildDetailSheet = () => {
    const data: any[][] = [
      [companyName.toUpperCase() + " - FLAGGED DIRECT PAYMENT AUDIT LEDGER", null, null, null, null, null, null, null, null],
      ["Chronological ledger list of all expenses direct paid bypassing Sundry Creditors", null, null, null, null, null, null, null, null],
      [],
      ["Date", "Expense Ledger", "Voucher Type", "Voucher Number", "Bank/Cash Ledger", "Paid Amount (INR)", "Risk Level", "Audit Issue", "Auditor Recommendation"]
    ];

    observations.forEach(o => {
      data.push([
        o.date,
        o.ledgerName,
        o.voucherType,
        o.voucherNumber,
        o.paymentLedger,
        o.amount,
        o.riskLevel,
        o.description,
        o.recommendation
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["A1"].s = titleStyle;
    ws["A2"].s = subTitleStyle;

    for (let c = 0; c < 9; c++) {
      const colChar = String.fromCharCode(65 + c);
      ws[`${colChar}4`].s = headerStyle;
    }

    for (let i = 0; i < observations.length; i++) {
      const r = i + 5;
      ws[`A${r}`].s = { ...cellStyle, alignment: { horizontal: "center" } };
      ws[`B${r}`].s = { ...cellStyle, font: { name: "Inter", sz: 9, bold: true } };
      ws[`C${r}`].s = cellStyle;
      ws[`D${r}`].s = cellStyle;
      ws[`E${r}`].s = cellStyle;
      ws[`F${r}`].s = currencyStyle;

      const risk = observations[i].riskLevel;
      const isHigh = risk === 'High';
      const isMed = risk === 'Medium';
      ws[`G${r}`].s = {
        ...cellStyle,
        font: { name: "Inter", sz: 9, bold: true, color: { rgb: isHigh ? colors.highRiskText : (isMed ? colors.medRiskText : colors.lowRiskText) } },
        fill: { fgColor: { rgb: isHigh ? colors.highRisk : (isMed ? colors.medRisk : colors.lowRisk) } },
        alignment: { horizontal: "center" }
      };

      ws[`H${r}`].s = { ...cellStyle, alignment: { wrapText: true } };
      ws[`I${r}`].s = { ...cellStyle, alignment: { wrapText: true } };
    }

    ws["!cols"] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 15 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 50 },
      { wch: 50 }
    ];

    return ws;
  };

  XLSX.utils.book_append_sheet(wb, buildDashboardSheet(), "Executive Dashboard");
  XLSX.utils.book_append_sheet(wb, buildLedgerSheet(), "Ledger Summary");
  XLSX.utils.book_append_sheet(wb, buildDetailSheet(), "Audit Log");

  XLSX.writeFile(wb, `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Direct_Expense_Audit.xlsx`);
}

// ============================================================================
// --- SA 530 AUDIT SAMPLING & VOUCHER WORKING PAPERS ---
// ============================================================================

export interface SampleItem {
  id: string; // unique transaction key
  date: string;
  voucherType: string;
  voucherNumber: string;
  ledgerName: string;
  amount: number;
  isDebit: boolean;
  stratum?: string; // High / Medium / Low
}

export interface SamplingConfig {
  method: 'high-value' | 'random' | 'systematic' | 'stratified';
  highValueThreshold?: number;
  randomCount?: number;
  systematicInterval?: number;
  stratifiedPercentHigh?: number; // e.g. 50%
  stratifiedPercentMedium?: number; // e.g. 15%
  stratifiedPercentLow?: number; // e.g. 5%
}

export interface AuditVoucherWorkingPaper {
  sampleId: string;
  verificationStatus: 'Unverified' | 'Verified' | 'Document Missing' | 'Query Raised';
  auditorRemarks: string;
  verifiedBy?: string;
  verificationDate?: string;
}

/**
 * Filter and extract vouchers matching the sampling parameters
 */
export function runAuditSampling(vouchers: { ledgerName: string; date: string; voucherType: string; voucherNumber: string; amount: number; isDebit: boolean }[], config: SamplingConfig): SampleItem[] {
  if (!vouchers || vouchers.length === 0) return [];

  // Convert raw vouchers to flat sample pool items
  const pool: SampleItem[] = vouchers.map((v, idx) => ({
    id: `${v.date}_${v.voucherType}_${v.voucherNumber}_${v.ledgerName}_${idx}`,
    date: v.date,
    voucherType: v.voucherType,
    voucherNumber: v.voucherNumber,
    ledgerName: v.ledgerName,
    amount: Math.abs(v.amount),
    isDebit: v.isDebit
  }));

  switch (config.method) {
    case 'high-value': {
      const threshold = config.highValueThreshold ?? 100000;
      return pool.filter(item => item.amount >= threshold);
    }

    case 'random': {
      const count = config.randomCount ?? 30;
      if (pool.length <= count) return [...pool];
      // Deterministic pseudo-random selection to ensure same results for the same pool
      const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
      const sampled: SampleItem[] = [];
      const step = sorted.length / count;
      for (let i = 0; i < count; i++) {
        const index = Math.floor(i * step + (Math.sin(i) * 0.5 + 0.5) * (step - 1));
        sampled.push(sorted[Math.min(index, sorted.length - 1)]);
      }
      return sampled;
    }

    case 'systematic': {
      const interval = config.systematicInterval ?? 10;
      const sorted = [...pool].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const sampled: SampleItem[] = [];
      const startOffset = Math.floor(interval / 2) % sorted.length;
      for (let i = startOffset; i < sorted.length; i += interval) {
        sampled.push(sorted[i]);
      }
      return sampled;
    }

    case 'stratified': {
      const highStrata = pool.filter(item => item.amount >= 100000).map(item => ({ ...item, stratum: 'High Value (>=1L)' }));
      const medStrata = pool.filter(item => item.amount >= 20000 && item.amount < 100000).map(item => ({ ...item, stratum: 'Medium Value (20k-1L)' }));
      const lowStrata = pool.filter(item => item.amount < 20000).map(item => ({ ...item, stratum: 'Low Value (<20k)' }));

      const pctHigh = (config.stratifiedPercentHigh ?? 50) / 100;
      const pctMed = (config.stratifiedPercentMedium ?? 15) / 100;
      const pctLow = (config.stratifiedPercentLow ?? 5) / 100;

      const selectCount = (arr: any[], pct: number) => {
        const count = Math.max(1, Math.round(arr.length * pct));
        if (arr.length <= count) return [...arr];
        const sampled: any[] = [];
        const step = arr.length / count;
        for (let i = 0; i < count; i++) {
          sampled.push(arr[Math.floor(i * step)]);
        }
        return sampled;
      };

      return [
        ...selectCount(highStrata, pctHigh),
        ...selectCount(medStrata, pctMed),
        ...selectCount(lowStrata, pctLow)
      ];
    }

    default:
      return [];
  }
}

/**
 * Generate a professional Excel workbook for SA 530 Audit Sampling Working Papers
 */
export function exportSamplingToExcel(
  samples: SampleItem[],
  workingPapers: Record<string, AuditVoucherWorkingPaper>,
  companyName: string,
  periodText: string
): void {
  // @ts-ignore
  const wb = XLSX.utils.book_new();

  const colors = {
    headerBg: "1E293B", // slate-800
    headerText: "FFFFFF",
    border: "E2E8F0", // slate-200
    high: "FEF2F2", // red-50
    highText: "EF4444",
    med: "FFFBEB", // amber-50
    medText: "F59E0B",
    low: "ECFDF5", // emerald-50
    lowText: "10B981"
  };

  const fontName = "Inter";

  const titleStyle = {
    font: { name: fontName, sz: 14, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0EA5E9" } }, // cyan-500
    alignment: { horizontal: "center", vertical: "center" }
  };

  const summaryHeaderStyle = {
    font: { name: fontName, sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "334155" } }, // slate-700
    alignment: { horizontal: "left" }
  };

  const headerStyle = {
    font: { name: fontName, sz: 10, bold: true, color: { rgb: colors.headerText } },
    fill: { fgColor: { rgb: colors.headerBg } },
    border: {
      bottom: { style: "medium", color: { rgb: "000000" } }
    },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const cellStyle = {
    font: { name: fontName, sz: 9 },
    border: {
      bottom: { style: "thin", color: { rgb: colors.border } }
    },
    alignment: { vertical: "center" }
  };

  const currencyStyle = {
    ...cellStyle,
    font: { name: fontName, sz: 9, fontBold: true },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "₹#,##,##0.00"
  };

  // 1. Build Summary Dashboard Sheet
  const buildSummarySheet = () => {
    // @ts-ignore
    const ws = XLSX.utils.aoa_to_sheet([
      ["SA 530 COMPLIANT AUDIT SAMPLING WORKING PAPERS"],
      [],
      ["Entity Details", "", "Audit Parameters"],
      ["Company Name", companyName, "Audit Period", periodText],
      ["Total Sample Size", `${samples.length} Vouchers`, "Total Sample Value", 0],
      [],
      ["Audit Progress & Compliance Summary"],
      ["Status Category", "Voucher Count", "Percentage (%)", "Auditor Guidance / Notes"],
      ["Verified & Approved", 0, "0%", "Voucher verified against physical bills with no discrepancies."],
      ["Document Missing", 0, "0%", "Physical invoice or proof of payment not found. Action required."],
      ["Query Raised", 0, "0%", "Transaction flagged for explanation or clarification from client."],
      ["Unverified", 0, "0%", "Vouchers in sample pool remaining to be checked."]
    ]);

    // Count statistics
    let verifiedCount = 0;
    let missingCount = 0;
    let queryCount = 0;
    let unverifiedCount = 0;

    samples.forEach(s => {
      const wp = workingPapers[s.id];
      const status = wp?.verificationStatus || 'Unverified';
      if (status === 'Verified') verifiedCount++;
      else if (status === 'Document Missing') missingCount++;
      else if (status === 'Query Raised') queryCount++;
      else unverifiedCount++;
    });

    const totalVal = samples.reduce((acc, curr) => acc + curr.amount, 0);

    // Update data cells
    ws["D5"] = { v: totalVal, t: "n", z: "₹#,##,##0.00" };
    ws["B9"] = { v: verifiedCount, t: "n" };
    ws["B10"] = { v: missingCount, t: "n" };
    ws["B11"] = { v: queryCount, t: "n" };
    ws["B12"] = { v: unverifiedCount, t: "n" };

    const totalCount = samples.length || 1;
    ws["C9"] = { v: verifiedCount / totalCount, t: "n", z: "0.0%" };
    ws["C10"] = { v: missingCount / totalCount, t: "n", z: "0.0%" };
    ws["C11"] = { v: queryCount / totalCount, t: "n", z: "0.0%" };
    ws["C12"] = { v: unverifiedCount / totalCount, t: "n", z: "0.0%" };

    // Apply styles
    ws["A1"].s = titleStyle;
    // @ts-ignore
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 3 } }
    ];

    ws["A3"].s = summaryHeaderStyle;
    ws["C3"].s = summaryHeaderStyle;
    ws["A7"].s = summaryHeaderStyle;

    for (let r = 7; r <= 11; r++) {
      ws[`A${r + 1}`].s = cellStyle;
      ws[`B${r + 1}`].s = { ...cellStyle, alignment: { horizontal: "right" } };
      ws[`C${r + 1}`].s = { ...cellStyle, alignment: { horizontal: "right" } };
      ws[`D${r + 1}`].s = cellStyle;
    }

    ws["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 60 }];
    return ws;
  };

  // 2. Build Detailed Samples Sheet
  const buildSamplesSheet = () => {
    const rows = [
      ["Date", "Voucher Type", "Voucher Number", "Account / Ledger Name", "Amount", "Stratum", "Verification Status", "Auditor Remarks / Notes"]
    ];

    samples.forEach(s => {
      const wp = workingPapers[s.id];
      rows.push([
        s.date,
        s.voucherType,
        s.voucherNumber,
        s.ledgerName,
        s.amount as any,
        s.stratum || "N/A",
        wp?.verificationStatus || "Unverified",
        wp?.auditorRemarks || ""
      ]);
    });

    // @ts-ignore
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Apply header style
    for (let c = 0; c < 8; c++) {
      const colLetter = String.fromCharCode(65 + c);
      ws[`${colLetter}1`].s = headerStyle;
    }

    // Apply cell style and conditional formatting for statuses
    for (let i = 0; i < samples.length; i++) {
      const r = i + 2;
      const s = samples[i];
      const wp = workingPapers[s.id];
      const status = wp?.verificationStatus || "Unverified";

      ws[`A${r}`].s = cellStyle;
      ws[`B${r}`].s = cellStyle;
      ws[`C${r}`].s = cellStyle;
      ws[`D${r}`].s = { ...cellStyle, font: { name: fontName, sz: 9, bold: true } };
      ws[`E${r}`].s = currencyStyle;
      ws[`F${r}`].s = cellStyle;

      // Status cell formatting
      let statusColor = "94A3B8"; // Slate-400
      let statusBg = "F1F5F9"; // Slate-100
      if (status === 'Verified') {
        statusColor = "059669"; // Emerald-600
        statusBg = "ECFDF5"; // Emerald-50
      } else if (status === 'Document Missing') {
        statusColor = "DC2626"; // Red-600
        statusBg = "FEF2F2"; // Red-50
      } else if (status === 'Query Raised') {
        statusColor = "D97706"; // Amber-600
        statusBg = "FFFBEB"; // Amber-50
      }

      ws[`G${r}`].s = {
        ...cellStyle,
        font: { name: fontName, sz: 9, bold: true, color: { rgb: statusColor } },
        fill: { fgColor: { rgb: statusBg } },
        alignment: { horizontal: "center", vertical: "center" }
      };

      ws[`H${r}`].s = { ...cellStyle, alignment: { wrapText: true } };
    }

    ws["!cols"] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 50 }
    ];

    return ws;
  };

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(), "Sampling Summary");
  XLSX.utils.book_append_sheet(wb, buildSamplesSheet(), "Voucher Verification Log");

  XLSX.writeFile(wb, `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_SA_530_Sampling_Audit.xlsx`);
}

// ─── Direct Tally Creditor Finalisation Scrutiny Engine ──────

/**
 * CREDITOR & DEBTOR FINALISATION SCRUTINY ENGINE:
 * Evaluates live Tally data or imported vouchers against 12 CA Audit Finalisation Rules.
 * Modeled after `Queries for Finalisation 1.xlsx`.
 */
export function runCreditorFinalisationScrutiny(
  tallyData: TallyFinalisationData
): FinalisationScrutinyObservation[] {
  const observations: FinalisationScrutinyObservation[] = [];
  let obsId = 1;

  const addObs = (
    partyName: string,
    category: FinalisationScrutinyObservation['category'],
    severity: FinalisationScrutinyObservation['severity'],
    queryDescription: string,
    suggestedAction: string,
    amount?: number
  ) => {
    observations.push({
      id: `scrutiny-${obsId++}`,
      partyName,
      category,
      severity,
      amount: amount !== undefined ? Math.round(amount) : undefined,
      queryDescription,
      suggestedAction,
      status: 'Pending'
    });
  };

  const { parties, allVouchers } = tallyData;

  for (const [, party] of parties.entries()) {
    const partyName = party.partyName;
    const nameUpper = partyName.toUpperCase();
    const isCreditor = party.parentGroup.includes('Creditor') || !party.parentGroup.includes('Debtor');

    let totalExpenses = 0;
    let totalPayments = 0;
    let cashPaymentsTotal = 0;
    let maxSingleCashPayment = 0;

    let hasPurchaseVouchers = false;
    let hasPaymentVouchers = false;

    const invoiceDates: { date: string; amount: number; vNo: string }[] = [];

    for (const v of party.vouchers) {
      const isCash = v.counterpartyLedger.toUpperCase().includes('CASH');
      if (v.isDebit) {
        totalPayments += v.amount;
        hasPaymentVouchers = true;
        if (isCash) {
          cashPaymentsTotal += v.amount;
          if (v.amount > maxSingleCashPayment) maxSingleCashPayment = v.amount;
        }
      } else {
        totalExpenses += v.amount;
        hasPurchaseVouchers = true;
        invoiceDates.push({ date: v.date, amount: v.amount, vNo: v.voucherNumber });
      }

      // Rule 1: Cash Payment > ₹10,000 (Sec 40A(3))
      if (isCash && v.isDebit && v.amount > 10000) {
        addObs(
          partyName,
          'Cash Payment / Sec 40A(3)',
          'High',
          `Single Cash payment of ₹${v.amount.toLocaleString('en-IN')} on ${v.date} (Vch #${v.voucherNumber}). Risk u/s 40A(3).`,
          'Disallowed u/s 40A(3) unless covered under Rule 6DD exceptions. Verify cash voucher.',
          v.amount
        );
      }
    }

    // Rule 1b: Small Cash Balance Settlement Risk (< ₹10,000)
    if (cashPaymentsTotal > 0 && maxSingleCashPayment <= 10000 && maxSingleCashPayment > 0) {
      addObs(
        partyName,
        'Cash Payment / Sec 40A(3)',
        'Low',
        `Cash payments totalling ₹${cashPaymentsTotal.toLocaleString('en-IN')} made during the year.`,
        'Verify if balance of ₹' + Math.abs(party.closingBalance).toLocaleString('en-IN') + ' is to be paid in cash.',
        cashPaymentsTotal
      );
    }

    // Rule 3: Transporter TDS Declaration u/s 194C(6)
    const isTransporter =
      nameUpper.includes('LOGISTICS') ||
      nameUpper.includes('TRANSPORT') ||
      nameUpper.includes('FREIGHT') ||
      nameUpper.includes('CARGO') ||
      nameUpper.includes('TRUCK') ||
      nameUpper.includes('VRL');
    if (isTransporter && totalExpenses > 30000) {
      addObs(
        partyName,
        'Transporter Sec 194C(6) Declaration',
        'Medium',
        `TDS on Transport/Logistics charges of ₹${totalExpenses.toLocaleString('en-IN')}. Check Form 194C(6) declaration.`,
        'Check if Transporter Declaration (with PAN & <= 10 carriages) is available. If yes, do not deduct TDS.',
        totalExpenses
      );
    }

    // Rule 4: Goods Purchase 0.1% TDS u/s 194Q (> ₹50 Lakhs)
    if (totalExpenses > 5000000 && (nameUpper.includes('STEEL') || nameUpper.includes('TRADER') || nameUpper.includes('HARDWARE') || nameUpper.includes('BUILDING') || nameUpper.includes('ROOF') || nameUpper.includes('DISTRIBUTOR') || nameUpper.includes('HUB'))) {
      addObs(
        partyName,
        'Purchase Sec 194Q (0.1% TDS)',
        'High',
        `Goods Purchase ₹${totalExpenses.toLocaleString('en-IN')} exceeds ₹50 Lakhs. Section 194Q applies.`,
        'Deduct 0.1% TDS u/s 194Q on purchase amount exceeding ₹50 Lakhs.',
        totalExpenses
      );
    }

    // Rule 5: Equipment / Land Hire Charges TDS u/s 194I(a)
    const isHireParty =
      nameUpper.includes('HIRE') ||
      nameUpper.includes('CRANE') ||
      nameUpper.includes('EARTHMOVER') ||
      nameUpper.includes('DEVELOPER') ||
      nameUpper.includes('WATER SUPPLIER') ||
      nameUpper.includes('GENERATOR');
    if (isHireParty && totalExpenses > 0) {
      addObs(
        partyName,
        'Hire Charges Sec 194I(a)',
        'Medium',
        `Equipment/Plant hire charges ₹${totalExpenses.toLocaleString('en-IN')} booked. Check TDS u/s 194I(a).`,
        'Verify if total annual hire charges breach threshold before deducting 194I(a) TDS.',
        totalExpenses
      );
    }

    // Rule 6: Advance Payments Pending Bill Booking ("Whichever is earlier" rule)
    if (totalPayments > totalExpenses && (totalPayments - totalExpenses) > 5000) {
      const advAmt = totalPayments - totalExpenses;
      addObs(
        partyName,
        'Advance Pending Bill Booking',
        'High',
        `Advance Payment of ₹${advAmt.toLocaleString('en-IN')} (Payments ₹${totalPayments.toLocaleString('en-IN')} > Expenses ₹${totalExpenses.toLocaleString('en-IN')}). Bill booking & TDS pending.`,
        'Book pending vendor bill and deduct TDS on advance payment under "whichever is earlier" rule.',
        advAmt
      );
    }

    // Rule 8: Only Payment Entry (No Expense Bill)
    if (hasPaymentVouchers && !hasPurchaseVouchers && totalPayments > 0) {
      addObs(
        partyName,
        'Payment Only (No Expense Bill)',
        'High',
        `Only Payment entry of ₹${totalPayments.toLocaleString('en-IN')} found. No purchase/expense bill booked.`,
        'Check nature of payment, obtain vendor invoice, and book expense entry.',
        totalPayments
      );
    }

    // Rule 9: Vehicle Repairs Outstanding Anomaly
    const isVehicleRepairParty =
      nameUpper.includes('AUTOMOBILE') ||
      nameUpper.includes('MOTORS') ||
      nameUpper.includes('AUTO SERVICE') ||
      nameUpper.includes('CAR') ||
      nameUpper.includes('GARAGE');
    if (isVehicleRepairParty && party.closingBalance !== 0) {
      addObs(
        partyName,
        'Vehicle Repairs Outstanding',
        'Medium',
        `Vehicle repairs balance of ₹${Math.abs(party.closingBalance).toLocaleString('en-IN')} sitting as outstanding creditor.`,
        'Repairs to vehicles are normally settled immediately. Verify cash/bank disbursement source.',
        Math.abs(party.closingBalance)
      );
    }

    // Rule 10: Small Balance Write-Off (< ₹500)
    const absBal = Math.abs(party.closingBalance);
    if (absBal > 0 && absBal < 500) {
      addObs(
        partyName,
        'Small Balance Write-Off (< ₹500)',
        'Low',
        `Residual closing balance of ₹${absBal.toLocaleString('en-IN')} pending in ledger.`,
        'Settle balance or write off to Discount Received/Allowed to close ledger.',
        absBal
      );
    }

    // Rule 11: Reclassification to Expenditure
    const isReclassRequired =
      nameUpper.includes('LIC OF INDIA') ||
      nameUpper.includes('SURVEYOR') ||
      nameUpper.includes('ARCHITECT') ||
      nameUpper.includes('NURSERY') ||
      nameUpper.includes('CONSULTANT');
    if (isReclassRequired && isCreditor && absBal > 0) {
      addObs(
        partyName,
        'Reclassification to Expenditure',
        'Medium',
        `Ledger sitting under Creditors/Liability with balance ₹${absBal.toLocaleString('en-IN')}.`,
        'Transfer ledger balance to Expenditure account and check TDS applicability.',
        absBal
      );
    }

    // Rule 7 & 12: Duplicate Invoice Risk & Late Credit Note Risk
    invoiceDates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (let i = 0; i < invoiceDates.length - 1; i++) {
      const inv1 = invoiceDates[i];
      const inv2 = invoiceDates[i + 1];
      const timeDiffDays = Math.abs(new Date(inv2.date).getTime() - new Date(inv1.date).getTime()) / (1000 * 3600 * 24);
      if (inv1.amount === inv2.amount && timeDiffDays <= 2) {
        addObs(
          partyName,
          'Duplicate Invoice Risk',
          'High',
          `Same bill amount ₹${inv1.amount.toLocaleString('en-IN')} booked twice on ${inv1.date} (Vch #${inv1.vNo}) and ${inv2.date} (Vch #${inv2.vNo}).`,
          'Verify against GSTR-2B. If single invoice was booked twice, reverse the duplicate entry.',
          inv1.amount
        );
      }
    }
  }

  // Also scan all vouchers for year-end Credit Notes (Rule 12)
  for (const vch of allVouchers) {
    if (vch.voucherType.toUpperCase().includes('CREDIT NOTE')) {
      const vchDate = new Date(vch.date);
      if (vchDate.getMonth() === 2 && (vchDate.getDate() === 30 || vchDate.getDate() === 31)) {
        const partyEntry = vch.entries[0];
        if (partyEntry) {
          addObs(
            partyEntry.ledgerName,
            'Double Payment / Late Credit Note',
            'Medium',
            `Credit Note of ₹${partyEntry.amount.toLocaleString('en-IN')} booked on last day of Financial Year (${vch.date}).`,
            'Verify why credit note was booked on final day and match with vendor statement.',
            partyEntry.amount
          );
        }
      }
    }
  }

  return observations;
}

/**
 * EXPORT SERVICE: Exports Finalisation Scrutiny findings to an Excel file matching `Queries for Finalisation 1.xlsx`
 */
export function exportFinalisationScrutinyToExcel(
  observations: FinalisationScrutinyObservation[],
  companyName: string = 'Company'
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Sr.no',
    'Ledger Name',
    'Category',
    'Particulars / Audit Query',
    'Suggested Action',
    'Risk Severity',
    'Auditor Status'
  ];

  const data = observations.map((obs, idx) => [
    idx + 1,
    obs.partyName,
    obs.category,
    obs.queryDescription,
    obs.suggestedAction,
    obs.severity,
    obs.status
  ]);

  const aoa = [
    [`CREDITORS & DEBTORS FINALISATION SCRUTINY REPORT - ${companyName.toUpperCase()}`],
    [`Generated on: ${new Date().toLocaleString('en-IN')} | Compliance & Finalisation Audit`],
    [],
    headers,
    ...data
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
  ];

  ws['!cols'] = [
    { wch: 8 },  // Sr.no
    { wch: 32 }, // Ledger Name
    { wch: 30 }, // Category
    { wch: 55 }, // Particulars / Audit Query
    { wch: 55 }, // Suggested Action
    { wch: 14 }, // Risk Severity
    { wch: 18 }  // Auditor Status
  ];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:G10');

  for (let R = 0; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

      if (R === 0) {
        ws[cellAddress].s = {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '0F172A' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      } else if (R === 1) {
        ws[cellAddress].s = {
          font: { italic: true, sz: 10, color: { rgb: '94A3B8' } },
          fill: { fgColor: { rgb: '1E293B' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      } else if (R === 3) {
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
          fill: { fgColor: { rgb: '1E3A8A' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      } else if (R > 3) {
        ws[cellAddress].s = {
          font: { sz: 9, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
          alignment: { horizontal: C === 0 || C === 5 || C === 6 ? 'center' : 'left', vertical: 'center' }
        };

        if (C === 5) {
          const sev = String(ws[cellAddress].v);
          if (sev === 'High') {
            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEE2E2' } };
            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '991B1B' } };
          } else if (sev === 'Medium') {
            ws[cellAddress].s.fill = { fgColor: { rgb: 'FEF3C7' } };
            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '92400E' } };
          } else if (sev === 'Low') {
            ws[cellAddress].s.fill = { fgColor: { rgb: 'F1F5F9' } };
            ws[cellAddress].s.font = { sz: 9, bold: true, color: { rgb: '475569' } };
          }
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Finalisation Scrutiny Queries');
  XLSX.writeFile(wb, `Queries_for_Finalisation_${new Date().getTime()}.xlsx`);
}


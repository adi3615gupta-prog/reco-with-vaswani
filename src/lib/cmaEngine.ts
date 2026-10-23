/**
 * cmaEngine.ts — Tally to CMA Credit Appraisal & Ratio Analysis Engine
 * 
 * Normalizes raw Tally accounting data into banking credit standards,
 * calculates underwriter-grade financial ratios, and generates
 * qualitative risk insights & warnings.
 */

import ExcelJS from 'exceljs';
import type { TallyCmaRawLedger, TallyCmaExtractionResult } from './tallyCmaApi';

// ─── Standard CMA Categories List ─────────────────────────────

export const CMA_CATEGORIES = [
  'Gross Sales / Revenue from Operations',
  'Raw Material Purchases',
  'Direct Manufacturing Expenses',
  'Depreciation & Amortization',
  'Finance Costs & Interest',
  'Indirect Incomes / Other Income',
  'Operating & Indirect Expenses',
  'Profit After Tax (PAT)',
  'Inventory (Stock-in-Hand)',
  'Sundry Debtors (Receivables Total)',
  'Sister Concern Loans & Advances',
  'Cash & Bank Balances',
  'Other Current Assets',
  'Intangible Assets & Deferred Losses',
  'Tangible Fixed Assets',
  'Share Capital + General Reserves',
  'Promoter Unsecured Loans',
  'Long-Term Bank Term Loans',
  'Working Capital CC / OD Limits',
  'Sundry Creditors (Trade Payables)',
  'Other Current Liabilities',
  'Other Assets / Expenses',
] as const;

export type CmaCategoryType = typeof CMA_CATEGORIES[number];

export const LEGACY_CATEGORY_ALIAS_MAP: Record<string, CmaCategoryType> = {
  'Gross Sales / Turnover': 'Gross Sales / Revenue from Operations',
  'Gross Sales': 'Gross Sales / Revenue from Operations',
  'Turnover': 'Gross Sales / Revenue from Operations',
  'Revenue from Operations': 'Gross Sales / Revenue from Operations',

  'Stock-in-Hand / Inventory': 'Inventory (Stock-in-Hand)',
  'Stock-in-Hand': 'Inventory (Stock-in-Hand)',
  'Inventory': 'Inventory (Stock-in-Hand)',

  'Sundry Debtors (Receivables)': 'Sundry Debtors (Receivables Total)',
  'Sundry Debtors': 'Sundry Debtors (Receivables Total)',

  'Sundry Creditors': 'Sundry Creditors (Trade Payables)',
  'Sundry Creditors (Trade Payables Total)': 'Sundry Creditors (Trade Payables)',

  'Other Current Assets (GST/Taxes)': 'Other Current Assets',
  'Other Current Assets (GST Netting)': 'Other Current Assets',

  'Intangibles & Deferred Losses': 'Intangible Assets & Deferred Losses',
  'Intangible Assets': 'Intangible Assets & Deferred Losses',

  'Fixed Assets': 'Tangible Fixed Assets',
  'Tangible Assets': 'Tangible Fixed Assets',

  'Share Capital & Reserves': 'Share Capital + General Reserves',
  'Share Capital + Reserves': 'Share Capital + General Reserves',

  'Working Capital CC/OD': 'Working Capital CC / OD Limits',
  'Working Capital Bank Borrowings': 'Working Capital CC / OD Limits',

  'Long-Term Borrowings': 'Long-Term Bank Term Loans',

  'Promoter / Director Loans': 'Promoter Unsecured Loans',
};

export function normalizeCmaCategoryName(catName: string): CmaCategoryType {
  if (!catName) return 'Other Assets / Expenses';
  const trimmed = catName.trim();
  if (LEGACY_CATEGORY_ALIAS_MAP[trimmed]) {
    return LEGACY_CATEGORY_ALIAS_MAP[trimmed];
  }
  return trimmed as CmaCategoryType;
}

// ─── Interfaces & Options ──────────────────────────────────────

export interface CmaOptions {
  reclassifyPromoterLoansAsQuasiEquity: boolean; // default: true
  excludeAgedDebtorsThresholdDays: number; // default: 180
  excludeSisterConcernAdvances: boolean; // default: true
  deductIntangiblesFromTNW: boolean; // default: true
  customQuasiEquityAmount?: number;
  customAgedDebtorsAmount?: number;
  customLedgerCategoryMap?: Record<string, string>; // Map of ledgerName -> cmaCategory
}

export const DEFAULT_CMA_OPTIONS: CmaOptions = {
  reclassifyPromoterLoansAsQuasiEquity: true,
  excludeAgedDebtorsThresholdDays: 180,
  excludeSisterConcernAdvances: true,
  deductIntangiblesFromTNW: true,
};

export interface CmaMappedLedgerDetail {
  ledgerName: string;
  parentGroup: string;
  primaryGroup: string;
  closingBalance: number;
  cmaCategory: string; // e.g. "Gross Sales", "Sundry Debtors"
  mappingRule: string; // e.g. "Matched parent 'Sales Accounts'"
}

export interface CmaLedgerMappingAudit {
  categoryName: string; // e.g. "Gross Sales / Turnover"
  cmaHead: string; // e.g. "grossSales"
  totalAmount: number;
  ledgerCount: number;
  ledgers: CmaMappedLedgerDetail[];
}

export interface CmaNormalizedData {
  // P&L Metrics
  grossSales: number;
  cogs: number;
  purchases: number;
  pat: number; // Profit After Tax
  depreciation: number;
  termInterest: number;
  workingCapitalInterest: number;
  termPrincipalRepayment: number;
  operatingCashFlow: number;

  // Raw Tally Amounts (in Rupees)
  rawCurrentAssets: number;
  rawCurrentLiabilities: number;
  rawFixedAssets: number;
  rawTotalOutsideLiabilities: number;
  rawTangibleNetWorth: number;

  // Specific Breakdowns
  inventory: number;
  sundryDebtorsTotal: number;
  sundryDebtorsAgedOver180: number; // Aged > 180 days
  sundryDebtorsEligibleCurrent: number; // Eligible Current Debtors
  sisterConcernAdvances: number; // Loans to related parties
  cashAndBank: number;
  otherCurrentAssets: number;

  sundryCreditors: number;
  workingCapitalBankBorrowings: number; // CC / OD limits
  otherCurrentLiabilities: number;

  netFixedAssets: number;
  totalTermLiabilities: number; // Long-term borrowings

  promoterUnsecuredLoans: number; // Unsecured loans from promoters
  intangibleAssets: number; // Goodwill, patents, accumulated P&L losses
  shareCapital: number;
  reservesSurplus: number;

  // Normalized CMA Calculated Figures
  quasiEquity: number;
  normalizedCurrentAssets: number; // CA after removing aged debtors & sister concern advances
  nonCurrentAssetsReclassified: number; // Aged debtors + sister concern advances
  normalizedCurrentLiabilities: number;
  normalizedTotalOutsideLiabilities: number; // Raw TOL - Promoter Loans (if Quasi-Equity)
  tangibleNetWorth: number; // (Share Capital + Reserves + QuasiEquity) - Intangibles
  netWorkingCapital: number; // Normalized CA - Normalized CL

  // Ratios Context
  fixedAssetsYoYGrowthPercent: number;
  netProfitMarginPercent: number;

  // Track Record & Audit Mapping
  allMappedLedgers: CmaMappedLedgerDetail[];
  ledgerAudit: CmaLedgerMappingAudit[];
}

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface CmaUnderwriterAlert {
  id: string;
  code: string;
  title: string;
  severity: AlertSeverity;
  message: string;
  impact: string;
  recommendation: string;
}

export interface CmaRatioResult {
  id: string;
  name: string;
  category: 'Solvency' | 'Liquidity' | 'Turnover' | 'Coverage' | 'Profitability' | 'Drawing Power';
  value: number;
  formattedValue: string;
  unit: 'x' | '%' | 'Days' | '₹ Lakhs';
  benchmark: string;
  status: 'healthy' | 'warning' | 'danger';
  description: string;
  underwriterNote: string;
}

export interface CmaAppraisalReport {
  companyName: string;
  financialYear: string;
  options: CmaOptions;
  normalizedData: CmaNormalizedData;
  ratios: CmaRatioResult[];
  alerts: CmaUnderwriterAlert[];
  mpbfMethodII: {
    currentAssets: number;
    currentLiabilities: number;
    workingCapitalGap: number;
    minimumStipulatedNWC: number; // 25% of CA
    maxPermissibleBankFinance: number; // 75% of (CA - CL)
    actualNWCProvided: number;
    shortfallInNWC: number;
  };
  generatedAt: string;
}

// ─── Data Normalization Layer (Tally-to-CMA Map) ───────────────

export function normalizeTallyToCma(
  extraction: TallyCmaExtractionResult,
  options: CmaOptions = DEFAULT_CMA_OPTIONS
): CmaNormalizedData {
  const { ledgers } = extraction;

  let grossSales = 0;
  let cogs = 0;
  let purchases = 0;
  let directExpenses = 0;
  let indirectExpenses = 0;
  let indirectIncomes = 0;
  let financeCost = 0;
  let pat = 0;
  let depreciation = 0;
  let termInterest = 0;
  let workingCapitalInterest = 0;

  let rawCurrentAssets = 0;
  let rawCurrentLiabilities = 0;
  let netFixedAssets = 0;
  let rawTotalOutsideLiabilities = 0;

  let openingStock = 0;
  let closingStock = 0;
  let inventory = 0;
  let sundryDebtorsTotal = 0;
  let sundryDebtorsAgedOver180 = 0;
  let sisterConcernAdvances = 0;
  let cashAndBank = 0;
  let otherCurrentAssets = 0;

  let sundryCreditors = 0;
  let workingCapitalBankBorrowings = 0;
  let otherCurrentLiabilities = 0;

  let totalTermLiabilities = 0;
  let promoterUnsecuredLoans = 0;
  let intangibleAssets = 0;
  let shareCapital = 0;
  let reservesSurplus = 0;

  // Pre-calculate Duties & Taxes Net GST Balance to determine if Net ITC Asset or Net Liability
  let gstNetBalance = 0;
  for (const l of ledgers) {
    if (l.closingBalance === 0 && l.openingBalance === 0) continue;
    const pGroup = (l.parentGroup || '').toUpperCase();
    const primGroup = (l.primaryGroup || '').toUpperCase();
    const lName = (l.name || '').toUpperCase();
    
    // Exclude Sales, Purchases, Expenses, Incomes from GST pre-calculation
    if (
      pGroup.includes('SALES') || primGroup.includes('SALES') ||
      pGroup.includes('PURCHASE') || primGroup.includes('PURCHASE') ||
      pGroup.includes('EXPENSE') || primGroup.includes('EXPENSE') ||
      pGroup.includes('LABOUR') || pGroup.includes('INCOME')
    ) {
      continue;
    }

    if (
      pGroup.includes('DUTIES') ||
      primGroup.includes('DUTIES') ||
      pGroup.includes('INPUT') || pGroup.includes('OUTPUT') ||
      (pGroup.includes('TAX') && !pGroup.includes('PROFIT')) ||
      (primGroup.includes('TAX') && !primGroup.includes('PROFIT')) ||
      lName === 'GST PAID' || lName === 'GST PAYABLE' ||
      ((lName.includes('INPUT') || lName.includes('OUTPUT')) && !lName.includes('SALE') && !lName.includes('PURCHASE'))
    ) {
      gstNetBalance += l.closingBalance;
    }
  }
  const isGstNetAsset = gstNetBalance >= 0;

  const allMappedLedgers: CmaMappedLedgerDetail[] = [];

  for (const l of ledgers) {
    const pGroup = (l.parentGroup || '').toUpperCase();
    const primGroup = (l.primaryGroup || '').toUpperCase();
    const lName = (l.name || '').toUpperCase();
    const cb = Math.abs(l.closingBalance);
    const ob = Math.abs(l.openingBalance);

    if (cb === 0 && ob === 0) continue;

    let cmaCategory = 'Other Assets / Expenses';
    let mappingRule = `Parent: ${l.parentGroup || 'Primary'}`;

    // Priority 0: Explicit User Custom Mapping Override from UI
    if (options.customLedgerCategoryMap && options.customLedgerCategoryMap[l.name]) {
      cmaCategory = options.customLedgerCategoryMap[l.name];
      mappingRule = 'User Confirmed Reclassification Override';
    }
    // 1. Revenue / Gross Sales (Must precede Duties & Taxes so ledgers like "GST Sales 18%" stay in Sales)
    else if (
      pGroup.includes('SALES ACCOUNTS') ||
      pGroup.includes('SALES EXPORT') ||
      pGroup === 'SALES' ||
      primGroup.includes('SALES ACCOUNTS') ||
      primGroup.includes('SALES EXPORT')
    ) {
      cmaCategory = 'Gross Sales / Revenue from Operations';
      mappingRule = `Matched Sales Group '${l.parentGroup}'`;
    }
    // 2. Purchases
    else if (
      pGroup.includes('PURCHASE ACCOUNTS') ||
      pGroup === 'PURCHASE' ||
      primGroup.includes('PURCHASE ACCOUNTS')
    ) {
      cmaCategory = 'Raw Material Purchases';
      mappingRule = `Matched Purchase Group '${l.parentGroup}'`;
    }
    // 3. Direct Expenses
    else if (
      pGroup.includes('DIRECT EXPENSES') ||
      pGroup.includes('LABOUR') ||
      pGroup.includes('LOADING') ||
      pGroup.includes('PACKING') ||
      pGroup.includes('MANUFACTURING') ||
      primGroup.includes('DIRECT EXPENSES')
    ) {
      cmaCategory = 'Direct Manufacturing Expenses';
      mappingRule = `Matched Direct Cost Group '${l.parentGroup}'`;
    }
    // 4. Bank Charges, Commission, Processing Fees -> Reclassify to Operating & Indirect Expenses
    else if (
      lName.includes('BANK CHARGE') ||
      lName.includes('BANK CHARGES') ||
      lName.includes('PROCESSING FEE') ||
      lName.includes('BANK COMMISSION') ||
      lName.includes('LC CHARGE') ||
      lName.includes('BG CHARGE')
    ) {
      cmaCategory = 'Operating & Indirect Expenses';
      mappingRule = 'Reclassified Bank Charges to Indirect Expenses';
    }
    // 5. Depreciation & Amortization
    else if (lName.includes('DEPRECIATION') || lName.includes('AMORTISATION') || lName.includes('DEP.')) {
      cmaCategory = 'Depreciation & Amortization';
      mappingRule = `Matched Ledger Keyword '${l.name}'`;
    }
    // 6. Duties & Taxes / GST Netting
    else if (
      pGroup.includes('DUTIES') ||
      primGroup.includes('DUTIES') ||
      pGroup.includes('INPUT') || pGroup.includes('OUTPUT') ||
      (pGroup.includes('TAX') && !pGroup.includes('PROFIT')) ||
      (primGroup.includes('TAX') && !primGroup.includes('PROFIT')) ||
      lName === 'GST PAID' || lName === 'GST PAYABLE' ||
      ((lName.includes('INPUT') || lName.includes('OUTPUT')) && (lName.includes('CGST') || lName.includes('SGST') || lName.includes('IGST') || lName.includes('TAX')))
    ) {
      if (isGstNetAsset) {
        cmaCategory = 'Other Current Assets';
        mappingRule = 'Duties & Taxes Net ITC Asset';
      } else {
        cmaCategory = 'Other Current Liabilities';
        mappingRule = 'Duties & Taxes Net Tax Liability';
      }
    }
      // 7. Finance Costs & Interest (Strictly interest, excluding bank charges)
      else if (
        pGroup.includes('FINANCE COST') ||
        primGroup.includes('FINANCE COST') ||
        lName.includes('INTEREST') ||
        lName.includes('FINANCE CHARGES')
      ) {
        cmaCategory = 'Finance Costs & Interest';
        mappingRule = `Matched Finance Cost Group '${l.parentGroup}'`;
      }
      // 8. Stock-in-Hand / Inventory
      else if (
        pGroup.includes('STOCK-IN-HAND') ||
        pGroup.includes('STOCK') ||
        primGroup.includes('STOCK') ||
        lName.includes('INVENTORY')
      ) {
        cmaCategory = 'Inventory (Stock-in-Hand)';
        mappingRule = `Matched Stock Group '${l.parentGroup}'`;
      }
      // 9. Sundry Debtors
      else if (pGroup.includes('SUNDRY DEBTORS') || primGroup.includes('SUNDRY DEBTORS') || lName.includes('SUNDRY DEBTORS')) {
        cmaCategory = 'Sundry Debtors (Receivables Total)';
        mappingRule = `Matched Trade Receivables '${l.parentGroup}'`;
      }
      // 10. Sister Concern Advances
      else if (
        lName.includes('SISTER CONCERN') ||
        lName.includes('RELATED PARTY') ||
        (pGroup.includes('LOANS & ADVANCES') && (lName.includes('ADVANCE') || lName.includes('SISTER')))
      ) {
        cmaCategory = 'Sister Concern Loans & Advances';
        mappingRule = `Matched Related Party Keyword '${l.name}'`;
      }
      // 11. Cash & Bank Balances
      else if (
        pGroup.includes('BANK ACCOUNTS') ||
        pGroup.includes('CASH-IN-HAND') ||
        pGroup === 'CASH' ||
        primGroup.includes('BANK ACCOUNTS') ||
        primGroup.includes('CASH-IN-HAND')
      ) {
        cmaCategory = 'Cash & Bank Balances';
        mappingRule = `Matched Liquid Bank/Cash Group '${l.parentGroup}'`;
      }
      // 12. Other Current Assets
      else if (
        pGroup.includes('LOANS & ADVANCES') ||
        pGroup.includes('OTHER CURRENT ASSETS')
      ) {
        cmaCategory = 'Other Current Assets';
        mappingRule = `Matched Current Asset Group '${l.parentGroup}'`;
      }
      // 13. Fixed Assets & Intangibles
      else if (pGroup.includes('FIXED ASSETS') || primGroup.includes('FIXED ASSETS')) {
        if (
          lName.includes('GOODWILL') ||
          lName.includes('PATENT') ||
          lName.includes('TRADEMARK') ||
          lName.includes('INTANGIBLE')
        ) {
          cmaCategory = 'Intangible Assets & Deferred Losses';
          mappingRule = `Matched Intangible Keyword '${l.name}'`;
        } else {
          cmaCategory = 'Tangible Fixed Assets';
          mappingRule = `Matched Fixed Asset Group '${l.parentGroup}'`;
        }
      }
      // 14. Share Capital & Reserves
      else if (
        pGroup.includes('SHARE CAPITAL') ||
        pGroup.includes('CAPITAL ACCOUNT') ||
        primGroup.includes('CAPITAL ACCOUNT') ||
        pGroup.includes('RESERVES') ||
        primGroup.includes('RESERVES') ||
        lName.includes('SURPLUS')
      ) {
        cmaCategory = 'Share Capital + General Reserves';
        mappingRule = `Matched Capital/Reserve Group '${l.parentGroup}'`;
      }
      // 15. Unsecured Loans / Promoter Loans
      else if (
        pGroup.includes('UNSECURED LOANS') ||
        primGroup.includes('UNSECURED LOANS') ||
        lName.includes('PROMOTER') ||
        lName.includes('DIRECTOR LOAN')
      ) {
        cmaCategory = 'Promoter Unsecured Loans';
        mappingRule = `Matched Unsecured Loan Group '${l.parentGroup}'`;
      } else if (
        pGroup.includes('SECURED LOANS') ||
        primGroup.includes('SECURED LOANS') ||
        lName.includes('TERM LOAN')
      ) {
        cmaCategory = 'Long-Term Bank Term Loans';
        mappingRule = `Matched Term Loan Group '${l.parentGroup}'`;
      } else if (
        /\bCC\b|\bOD\b|CASH CREDIT|OVERDRAFT|BANK OD/i.test(pGroup)
      ) {
        cmaCategory = 'Working Capital CC / OD Limits';
        mappingRule = `Matched Bank OD/CC Group '${l.parentGroup}'`;
      } else if (pGroup.includes('SUNDRY CREDITORS') || primGroup.includes('SUNDRY CREDITORS')) {
        cmaCategory = 'Sundry Creditors (Trade Payables)';
        mappingRule = `Matched Trade Payables Group '${l.parentGroup}'`;
      } else if (
        pGroup.includes('INDIRECT INCOMES') ||
        pGroup.includes('DIRECT INCOMES') ||
        primGroup.includes('INDIRECT INCOMES')
      ) {
        cmaCategory = 'Indirect Incomes / Other Income';
        mappingRule = `Matched Income Group '${l.parentGroup}'`;
      } else if (
        pGroup.includes('INDIRECT EXPENSES') ||
        pGroup.includes('OTHER EXPENSE') ||
        pGroup.includes('EMPLOYEE') ||
        pGroup.includes('REPAIR') ||
        pGroup.includes('WRITE OFF') ||
        pGroup.includes('ADMINISTRATIVE') ||
        pGroup.includes('SELLING') ||
        primGroup.includes('INDIRECT EXPENSES')
      ) {
        cmaCategory = 'Operating & Indirect Expenses';
        mappingRule = `Matched Operating Group '${l.parentGroup}'`;
      } else if (
        pGroup.includes('PROVISIONS') ||
        pGroup.includes('CURRENT LIABILITIES') ||
        primGroup.includes('CURRENT LIABILITIES')
      ) {
        cmaCategory = 'Other Current Liabilities';
        mappingRule = `Matched Current Liability Group '${l.parentGroup}'`;
      } else if (lName.includes('PROFIT AFTER TAX') || lName.includes('PAT') || lName.includes('NET PROFIT')) {
        cmaCategory = 'Profit After Tax (PAT)';
        mappingRule = 'Explicit Net Profit Ledger';
      }

    // Always normalize cmaCategory so legacy aliases map to exact canonical CMA_CATEGORIES
    cmaCategory = normalizeCmaCategoryName(cmaCategory);

    // Now accumulate totals based on determined cmaCategory
    switch (cmaCategory) {
      case 'Gross Sales / Revenue from Operations':
      case 'Gross Sales / Turnover':
      case 'Gross Sales':
        grossSales += cb;
        break;
      case 'Raw Material Purchases':
        purchases += cb;
        break;
      case 'Direct Manufacturing Expenses':
        directExpenses += cb;
        break;
      case 'Depreciation & Amortization':
        depreciation += cb;
        indirectExpenses += cb;
        break;
      case 'Finance Costs & Interest':
        financeCost += cb;
        indirectExpenses += cb;
        if (lName.includes('TERM') || lName.includes('TL')) {
          termInterest += cb;
        } else {
          workingCapitalInterest += cb;
        }
        break;
      case 'Indirect Incomes / Other Income':
        indirectIncomes += cb;
        break;
      case 'Operating & Indirect Expenses':
        indirectExpenses += cb;
        break;
      case 'Profit After Tax (PAT)':
        pat += cb;
        break;
      case 'Inventory (Stock-in-Hand)':
      case 'Stock-in-Hand / Inventory':
      case 'Inventory':
        openingStock += ob;
        closingStock += cb;
        inventory += cb;
        rawCurrentAssets += cb;
        break;
      case 'Sundry Debtors (Receivables Total)':
      case 'Sundry Debtors (Receivables)':
      case 'Sundry Debtors':
        // Signed summation (Debit + / Credit -) so customer credit balances reduce net trade debtors
        sundryDebtorsTotal += l.closingBalance;
        rawCurrentAssets += l.closingBalance;
        if (l.agedOver180Days > 0) {
          sundryDebtorsAgedOver180 += l.agedOver180Days;
        }
        break;
      case 'Sister Concern Loans & Advances':
        sisterConcernAdvances += cb;
        rawCurrentAssets += cb;
        break;
      case 'Cash & Bank Balances':
        cashAndBank += cb;
        rawCurrentAssets += cb;
        break;
      case 'Other Current Assets':
      case 'Other Current Assets (GST/Taxes)':
        // Signed summation for Duties & Taxes GST Netting & Current Advances
        otherCurrentAssets += l.closingBalance;
        rawCurrentAssets += l.closingBalance;
        break;
      case 'Intangible Assets & Deferred Losses':
        intangibleAssets += cb;
        break;
      case 'Tangible Fixed Assets':
        netFixedAssets += cb;
        break;
      case 'Share Capital + General Reserves':
        shareCapital += cb;
        break;
      case 'Promoter Unsecured Loans':
        promoterUnsecuredLoans += cb;
        rawTotalOutsideLiabilities += cb;
        break;
      case 'Long-Term Bank Term Loans':
        totalTermLiabilities += cb;
        rawTotalOutsideLiabilities += cb;
        break;
      case 'Working Capital CC / OD Limits':
        workingCapitalBankBorrowings += cb;
        rawCurrentLiabilities += cb;
        rawTotalOutsideLiabilities += cb;
        break;
      case 'Sundry Creditors (Trade Payables)':
      case 'Sundry Creditors':
        sundryCreditors += Math.abs(l.closingBalance);
        rawCurrentLiabilities += Math.abs(l.closingBalance);
        rawTotalOutsideLiabilities += Math.abs(l.closingBalance);
        break;
      case 'Other Current Liabilities':
        otherCurrentLiabilities += Math.abs(l.closingBalance);
        rawCurrentLiabilities += Math.abs(l.closingBalance);
        rawTotalOutsideLiabilities += Math.abs(l.closingBalance);
        break;
      default:
        indirectExpenses += cb;
        break;
    }

    const isSignedCat = cmaCategory === 'Sundry Debtors (Receivables Total)' || cmaCategory === 'Other Current Assets';

    allMappedLedgers.push({
      ledgerName: l.name,
      parentGroup: l.parentGroup || 'Primary',
      primaryGroup: l.primaryGroup || l.parentGroup || 'Primary',
      closingBalance: isSignedCat ? l.closingBalance : Math.abs(l.closingBalance),
      cmaCategory,
      mappingRule,
    });
  }

  // Calculate COGS: Opening Stock + Purchases + Direct Expenses - Closing Stock
  cogs = (openingStock + purchases + directExpenses) > closingStock
    ? (openingStock + purchases + directExpenses) - closingStock
    : purchases + directExpenses;

  // Calculate Net Profit After Tax if not explicitly tagged
  if (pat === 0 && grossSales > 0) {
    const netOperatingProfit = (grossSales + indirectIncomes) - cogs - indirectExpenses;
    pat = Math.max(0, netOperatingProfit);
  }

  const termPrincipalRepayment = totalTermLiabilities > 0 ? Math.round(totalTermLiabilities * 0.15) : 0;
  const operatingCashFlow = pat + depreciation;

  // Custom overrides from options if specified
  if (options.customAgedDebtorsAmount !== undefined) {
    sundryDebtorsAgedOver180 = options.customAgedDebtorsAmount;
  }
  if (options.customQuasiEquityAmount !== undefined) {
    promoterUnsecuredLoans = options.customQuasiEquityAmount;
  }

  // Mandatory Underwriter Reclassifications
  const agedDebtorsDeducted = options.excludeAgedDebtorsThresholdDays > 0 ? sundryDebtorsAgedOver180 : 0;
  const sisterAdvancesDeducted = options.excludeSisterConcernAdvances ? sisterConcernAdvances : 0;

  const normalizedCurrentAssets = Math.max(0, rawCurrentAssets - agedDebtorsDeducted - sisterAdvancesDeducted);
  const nonCurrentAssetsReclassified = agedDebtorsDeducted + sisterAdvancesDeducted;
  const sundryDebtorsEligibleCurrent = Math.max(0, sundryDebtorsTotal - agedDebtorsDeducted);

  const quasiEquity = options.reclassifyPromoterLoansAsQuasiEquity ? promoterUnsecuredLoans : 0;
  const normalizedTotalOutsideLiabilities = Math.max(0, rawTotalOutsideLiabilities - quasiEquity);

  const intangibleDeduction = options.deductIntangiblesFromTNW ? intangibleAssets : 0;
  const tangibleNetWorth = (shareCapital + reservesSurplus + quasiEquity) - intangibleDeduction;

  const normalizedCurrentLiabilities = rawCurrentLiabilities;
  const netWorkingCapital = normalizedCurrentAssets - normalizedCurrentLiabilities;

  const netProfitMarginPercent = grossSales > 0 ? (pat / grossSales) * 100 : 0;

  // Build grouped audit breakdown
  const auditCategoryMap = new Map<string, CmaMappedLedgerDetail[]>();
  for (const mItem of allMappedLedgers) {
    const list = auditCategoryMap.get(mItem.cmaCategory) || [];
    list.push(mItem);
    auditCategoryMap.set(mItem.cmaCategory, list);
  }

  const ledgerAudit: CmaLedgerMappingAudit[] = [];
  for (const [catName, itemLedgers] of auditCategoryMap.entries()) {
    const totalAmount = itemLedgers.reduce((sum, item) => sum + Math.abs(item.closingBalance), 0);
    ledgerAudit.push({
      categoryName: catName,
      cmaHead: catName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      totalAmount,
      ledgerCount: itemLedgers.length,
      ledgers: itemLedgers,
    });
  }

  return {
    grossSales,
    cogs,
    purchases: purchases || cogs,
    pat,
    depreciation,
    termInterest: termInterest || Math.round(financeCost * 0.5),
    workingCapitalInterest: workingCapitalInterest || Math.round(financeCost * 0.5),
    termPrincipalRepayment,
    operatingCashFlow,

    rawCurrentAssets,
    rawCurrentLiabilities,
    rawFixedAssets: netFixedAssets + intangibleAssets,
    rawTotalOutsideLiabilities,
    rawTangibleNetWorth: (shareCapital + reservesSurplus) - intangibleAssets,

    inventory,
    sundryDebtorsTotal,
    sundryDebtorsAgedOver180,
    sundryDebtorsEligibleCurrent,
    sisterConcernAdvances,
    cashAndBank,
    otherCurrentAssets,

    sundryCreditors,
    workingCapitalBankBorrowings,
    otherCurrentLiabilities,

    netFixedAssets,
    totalTermLiabilities,

    promoterUnsecuredLoans,
    intangibleAssets,
    shareCapital,
    reservesSurplus,

    quasiEquity,
    normalizedCurrentAssets,
    nonCurrentAssetsReclassified,
    normalizedCurrentLiabilities,
    normalizedTotalOutsideLiabilities,
    tangibleNetWorth: Math.max(0, tangibleNetWorth),
    netWorkingCapital,

    fixedAssetsYoYGrowthPercent: 0,
    netProfitMarginPercent: Math.round(netProfitMarginPercent * 10) / 10,

    allMappedLedgers,
    ledgerAudit,
  };
}

// ─── Ratio Engine ─────────────────────────────────────────────

export function calculateCmaRatios(data: CmaNormalizedData): CmaRatioResult[] {
  const {
    grossSales, cogs, purchases, pat, depreciation, termInterest, workingCapitalInterest, termPrincipalRepayment,
    normalizedCurrentAssets, normalizedCurrentLiabilities, rawCurrentAssets, rawCurrentLiabilities, inventory,
    sundryDebtorsTotal, sundryDebtorsAgedOver180, sundryDebtorsEligibleCurrent, sundryCreditors, netFixedAssets, totalTermLiabilities,
    workingCapitalBankBorrowings, normalizedTotalOutsideLiabilities, tangibleNetWorth, cashAndBank, netWorkingCapital
  } = data;

  const totalDebt = totalTermLiabilities + workingCapitalBankBorrowings;
  const totalInterest = termInterest + workingCapitalInterest;
  const ebitda = pat + depreciation + totalInterest;
  const ebit = pat + totalInterest;

  // Drawing Power (DP) calculations
  const paidStock = Math.max(0, inventory - sundryCreditors);
  const netStockDrawingPower = paidStock * 0.75; // 25% margin
  const netDebtorDrawingPower = sundryDebtorsEligibleCurrent * 0.60; // 40% margin
  const netDrawingPower = netStockDrawingPower + netDebtorDrawingPower;
  const dpCoverageRatio = workingCapitalBankBorrowings > 0
    ? (netDrawingPower / workingCapitalBankBorrowings) * 100
    : 100;
  const dpCoverageStatus: CmaRatioResult['status'] = dpCoverageRatio >= 100 ? 'healthy' : dpCoverageRatio >= 80 ? 'warning' : 'danger';

  // Paid Stock Ratio
  const paidStockRatioPercent = inventory > 0 ? (paidStock / inventory) * 100 : 0;
  const paidStockStatus: CmaRatioResult['status'] = paidStockRatioPercent >= 30 ? 'healthy' : paidStockRatioPercent >= 15 ? 'warning' : 'danger';

  // Eligible Debtor Ratio
  const eligibleDebtorRatioPercent = sundryDebtorsTotal > 0 ? (sundryDebtorsEligibleCurrent / sundryDebtorsTotal) * 100 : 100;
  const eligibleDebtorStatus: CmaRatioResult['status'] = eligibleDebtorRatioPercent >= 90 ? 'healthy' : eligibleDebtorRatioPercent >= 75 ? 'warning' : 'danger';

  // 1. Drawing Power: DP Coverage Ratio
  const dpLakhs = (netDrawingPower / 100000).toFixed(2);

  // 2. Solvency: TOL / TNW
  const tolTnw = normalizedTotalOutsideLiabilities / Math.max(1, tangibleNetWorth);
  const tolTnwStatus: CmaRatioResult['status'] = tolTnw <= 2.5 ? 'healthy' : tolTnw <= 3.5 ? 'warning' : 'danger';

  // 3. Solvency: Term Debt / Equity
  const termDebtToEquity = totalTermLiabilities / Math.max(1, tangibleNetWorth);
  const tdeStatus: CmaRatioResult['status'] = termDebtToEquity <= 1.5 ? 'healthy' : termDebtToEquity <= 2.0 ? 'warning' : 'danger';

  // 4. Solvency: Total Interest-Bearing Debt / TNW
  const totalDebtToEquity = totalDebt / Math.max(1, tangibleNetWorth);
  const totalDeStatus: CmaRatioResult['status'] = totalDebtToEquity <= 2.0 ? 'healthy' : totalDebtToEquity <= 3.0 ? 'warning' : 'danger';

  // 5. Solvency: FACR (Fixed Asset Coverage Ratio)
  const facr = totalTermLiabilities > 0 ? netFixedAssets / totalTermLiabilities : 0;
  const facrStatus: CmaRatioResult['status'] = facr >= 1.25 ? 'healthy' : facr >= 1.0 ? 'warning' : 'danger';

  // 6. Coverage: Gross DSCR
  const dscrNumerator = pat + depreciation + termInterest;
  const dscrDenominator = termPrincipalRepayment + termInterest;
  const grossDscr = dscrDenominator > 0 ? dscrNumerator / dscrDenominator : 0;
  const dscrStatus: CmaRatioResult['status'] = grossDscr >= 1.33 ? 'healthy' : grossDscr >= 1.15 ? 'warning' : 'danger';

  // 7. Coverage: Interest Coverage Ratio (ISCR / ICR)
  const iscr = totalInterest > 0 ? (pat + depreciation + totalInterest) / totalInterest : 0;
  const iscrStatus: CmaRatioResult['status'] = iscr >= 2.5 ? 'healthy' : iscr >= 1.5 ? 'warning' : 'danger';

  // 8. Liquidity: Adjusted Current Ratio (Tandon Committee Method II)
  const adjustedCurrentRatio = normalizedCurrentLiabilities > 0 ? normalizedCurrentAssets / normalizedCurrentLiabilities : 0;
  const crStatus: CmaRatioResult['status'] = adjustedCurrentRatio >= 1.33 ? 'healthy' : adjustedCurrentRatio >= 1.0 ? 'warning' : 'danger';

  // 9. Liquidity: Raw Current Ratio (Pre-Adjustment)
  const rawCurrentRatio = rawCurrentLiabilities > 0 ? rawCurrentAssets / rawCurrentLiabilities : 0;
  const rawCrStatus: CmaRatioResult['status'] = rawCurrentRatio >= 1.33 ? 'healthy' : rawCurrentRatio >= 1.0 ? 'warning' : 'danger';

  // 10. Liquidity: Quick Ratio (Acid Test)
  const quickAssets = normalizedCurrentAssets - inventory;
  const quickRatio = normalizedCurrentLiabilities > 0 ? quickAssets / normalizedCurrentLiabilities : 0;
  const qrStatus: CmaRatioResult['status'] = quickRatio >= 1.0 ? 'healthy' : quickRatio >= 0.8 ? 'warning' : 'danger';

  // 11. Liquidity: Cash Ratio (Absolute Liquidity)
  const cashRatio = normalizedCurrentLiabilities > 0 ? cashAndBank / normalizedCurrentLiabilities : 0;
  const cashRatioStatus: CmaRatioResult['status'] = cashRatio >= 0.20 ? 'healthy' : cashRatio >= 0.10 ? 'warning' : 'danger';

  // 12. Liquidity: Net Working Capital to Sales (%)
  const nwcToSalesPercent = grossSales > 0 ? (netWorkingCapital / grossSales) * 100 : 0;
  const nwcSalesStatus: CmaRatioResult['status'] = nwcToSalesPercent >= 15 ? 'healthy' : nwcToSalesPercent >= 5 ? 'warning' : 'danger';

  // 13. Turnover: Debtor Days
  const debtorDays = grossSales > 0 ? Math.round((sundryDebtorsTotal / grossSales) * 365) : 0;
  const ddStatus: CmaRatioResult['status'] = debtorDays <= 90 ? 'healthy' : debtorDays <= 120 ? 'warning' : 'danger';

  // 14. Turnover: Inventory Days
  const inventoryDays = cogs > 0 ? Math.round((inventory / cogs) * 365) : 0;
  const idStatus: CmaRatioResult['status'] = inventoryDays <= 60 ? 'healthy' : inventoryDays <= 90 ? 'warning' : 'danger';

  // 15. Turnover: Creditor Days
  const creditorDays = purchases > 0 ? Math.round((sundryCreditors / purchases) * 365) : 0;
  const cdStatus: CmaRatioResult['status'] = creditorDays <= 90 ? 'healthy' : creditorDays <= 120 ? 'warning' : 'danger';

  // 16. Turnover: Cash Conversion Cycle (CCC in Days)
  const cashConversionCycle = debtorDays + inventoryDays - creditorDays;
  const cccStatus: CmaRatioResult['status'] = cashConversionCycle <= 90 ? 'healthy' : cashConversionCycle <= 120 ? 'warning' : 'danger';

  // 17. Turnover: Working Capital Turnover Velocity
  const wcTurnover = netWorkingCapital > 0 ? grossSales / netWorkingCapital : 0;
  const wcTurnoverStatus: CmaRatioResult['status'] = (wcTurnover >= 3 && wcTurnover <= 8) ? 'healthy' : wcTurnover > 0 ? 'warning' : 'danger';

  // 18. Profitability: Gross Profit Margin (%)
  const grossProfit = grossSales - cogs;
  const gpMarginPercent = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;
  const gpStatus: CmaRatioResult['status'] = gpMarginPercent >= 20 ? 'healthy' : gpMarginPercent >= 10 ? 'warning' : 'danger';

  // 19. Profitability: Net Profit Margin (PAT %)
  const npMarginPercent = grossSales > 0 ? (pat / grossSales) * 100 : 0;
  const npStatus: CmaRatioResult['status'] = npMarginPercent >= 5 ? 'healthy' : npMarginPercent >= 2 ? 'warning' : 'danger';

  // 20. Profitability: EBITDA Margin (%)
  const ebitdaMarginPercent = grossSales > 0 ? (ebitda / grossSales) * 100 : 0;
  const ebitdaStatus: CmaRatioResult['status'] = ebitdaMarginPercent >= 10 ? 'healthy' : ebitdaMarginPercent >= 5 ? 'warning' : 'danger';

  // 21. Profitability: Return on Capital Employed (ROCE)
  const capitalEmployed = tangibleNetWorth + normalizedTotalOutsideLiabilities;
  const rocePercent = capitalEmployed > 0 ? (ebit / capitalEmployed) * 100 : 0;
  const roceStatus: CmaRatioResult['status'] = rocePercent >= 12 ? 'healthy' : rocePercent >= 8 ? 'warning' : 'danger';

  // 22. Profitability: Return on Net Worth (RONW / ROE)
  const ronwPercent = tangibleNetWorth > 0 ? (pat / tangibleNetWorth) * 100 : 0;
  const ronwStatus: CmaRatioResult['status'] = ronwPercent >= 15 ? 'healthy' : ronwPercent >= 8 ? 'warning' : 'danger';

  return [
    {
      id: 'dp_coverage_ratio',
      name: 'Drawing Power (DP) Coverage Ratio',
      category: 'Drawing Power',
      value: dpCoverageRatio,
      formattedValue: `${dpCoverageRatio.toFixed(1)}% (₹${dpLakhs}L DP)`,
      unit: '%',
      benchmark: '≥ 100.0%',
      status: dpCoverageStatus,
      description: 'Net Drawing Power calculated from Paid Stock (75%) + Eligible Receivables <=180d (60%) over CC/OD Bank borrowings.',
      underwriterNote: dpCoverageRatio >= 100
        ? 'Working capital borrowings are fully covered by net eligible security drawing power.'
        : 'DP Deficit Alert! Drawing power is insufficient to back full CC borrowings.',
    },
    {
      id: 'paid_stock_ratio',
      name: 'Paid Stock Ratio (%)',
      category: 'Drawing Power',
      value: paidStockRatioPercent,
      formattedValue: `${paidStockRatioPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 30.0%',
      status: paidStockStatus,
      description: '% of total stock unencumbered by raw material vendor payables.',
      underwriterNote: paidStockRatioPercent >= 30
        ? 'Healthy stock paid ratio. Company has invested own working capital in inventory.'
        : 'Low paid stock. Inventory is heavily vendor-financed, increasing supplier default risk.',
    },
    {
      id: 'eligible_debtor_ratio',
      name: 'Eligible Debtor Ratio (<=180 Days %)',
      category: 'Drawing Power',
      value: eligibleDebtorRatioPercent,
      formattedValue: `${eligibleDebtorRatioPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 90.0%',
      status: eligibleDebtorStatus,
      description: '% of customer trade receivables eligible for bank Drawing Power.',
      underwriterNote: eligibleDebtorRatioPercent >= 90
        ? 'Fresh trade receivable portfolio with high bank margin eligibility.'
        : 'High aged debtors (>180d). Bank will strip non-eligible portion from Drawing Power.',
    },
    {
      id: 'tol_tnw',
      name: 'TOL / TNW (Debt Leverage)',
      category: 'Solvency',
      value: tolTnw,
      formattedValue: `${tolTnw.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≤ 3.00x',
      status: tolTnwStatus,
      description: 'Total Outside Liabilities relative to Tangible Net Worth.',
      underwriterNote: tolTnw <= 3.0
        ? 'Satisfies bank capital structure norm. Low financial leverage risk.'
        : 'High leverage! Subordinate promoter loans to Quasi-Equity to pass credit committee.',
    },
    {
      id: 'term_debt_equity',
      name: 'Term Debt / Equity Ratio',
      category: 'Solvency',
      value: termDebtToEquity,
      formattedValue: `${termDebtToEquity.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≤ 1.50x',
      status: tdeStatus,
      description: 'Long-term bank term loans backing Tangible Net Worth base.',
      underwriterNote: termDebtToEquity <= 1.5
        ? 'Term debt leverage is within acceptable bank sanction limits.'
        : 'High long-term term loan burden relative to base equity.',
    },
    {
      id: 'facr',
      name: 'FACR (Fixed Asset Coverage Ratio)',
      category: 'Solvency',
      value: facr,
      formattedValue: `${facr.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 1.25x',
      status: facrStatus,
      description: 'Net Fixed Assets backing long-term bank term loans.',
      underwriterNote: facr >= 1.25
        ? 'Primary security asset cover is adequate to secure term debt.'
        : 'Fixed asset cover is tight. Additional collateral security may be insisted by bank.',
    },
    {
      id: 'gross_dscr',
      name: 'Gross DSCR (Debt Coverage)',
      category: 'Coverage',
      value: grossDscr,
      formattedValue: `${grossDscr.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 1.33x',
      status: dscrStatus,
      description: 'Cash available to service term loan principal and interest obligations.',
      underwriterNote: grossDscr >= 1.33
        ? 'Healthy debt service buffer. High probability of timely term loan repayment.'
        : 'Below banking benchmark (1.33x). High risk of debt servicing bottleneck or rejection.',
    },
    {
      id: 'iscr',
      name: 'ISCR / ICR (Interest Coverage)',
      category: 'Coverage',
      value: iscr,
      formattedValue: `${iscr.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 2.50x',
      status: iscrStatus,
      description: 'Operating cash profit available to service total interest expenses.',
      underwriterNote: iscr >= 2.5
        ? 'Strong interest servicing capacity across term and working capital loans.'
        : 'Tight interest coverage. Higher vulnerability to interest rate hikes.',
    },
    {
      id: 'adjusted_current_ratio',
      name: 'Adjusted Current Ratio (Tandon II)',
      category: 'Liquidity',
      value: adjustedCurrentRatio,
      formattedValue: `${adjustedCurrentRatio.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 1.33x',
      status: crStatus,
      description: 'Normalized Current Assets (excl. aged debtors >180d & sister advances) over Current Liabilities.',
      underwriterNote: adjustedCurrentRatio >= 1.33
        ? 'Meets Tandon Committee Method II working capital benchmark.'
        : 'Fails Tandon Committee Method II norm (1.33x). Liquidity is strained by non-current assets.',
    },
    {
      id: 'quick_ratio',
      name: 'Quick Ratio (Acid Test)',
      category: 'Liquidity',
      value: quickRatio,
      formattedValue: `${quickRatio.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 1.00x',
      status: qrStatus,
      description: 'Liquid current assets (excluding inventory) available for immediate obligations.',
      underwriterNote: quickRatio >= 1.0
        ? 'Adequate immediate liquidity buffer to cover short-term liabilities.'
        : 'Liquidity is heavily reliant on inventory liquidation.',
    },
    {
      id: 'cash_ratio',
      name: 'Cash Ratio (Absolute Liquidity)',
      category: 'Liquidity',
      value: cashRatio,
      formattedValue: `${cashRatio.toFixed(2)}x`,
      unit: 'x',
      benchmark: '≥ 0.20x',
      status: cashRatioStatus,
      description: 'Cash and bank balances available for immediate cash obligations.',
      underwriterNote: cashRatio >= 0.2
        ? 'Excellent immediate cash liquidity cushion.'
        : 'Low cash balance cushion relative to short-term liabilities.',
    },
    {
      id: 'nwc_sales',
      name: 'NWC to Sales Ratio (%)',
      category: 'Liquidity',
      value: nwcToSalesPercent,
      formattedValue: `${nwcToSalesPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 15.0%',
      status: nwcSalesStatus,
      description: 'Net Working Capital cushion relative to gross turnover.',
      underwriterNote: nwcToSalesPercent >= 15
        ? 'Borrower provides sufficient long-term margin for working capital.'
        : 'Low working capital margin provided by borrower relative to turnover.',
    },
    {
      id: 'debtor_days',
      name: 'Debtor Collection Days',
      category: 'Turnover',
      value: debtorDays,
      formattedValue: `${debtorDays} Days`,
      unit: 'Days',
      benchmark: '≤ 90 Days',
      status: ddStatus,
      description: 'Average collection period for trade receivables.',
      underwriterNote: debtorDays <= 90
        ? 'Receivables collection cycle is within acceptable credit limits.'
        : 'Extended receivables collection period. Requires age-wise debtor scrubbing.',
    },
    {
      id: 'inventory_days',
      name: 'Inventory Holding Days',
      category: 'Turnover',
      value: inventoryDays,
      formattedValue: `${inventoryDays} Days`,
      unit: 'Days',
      benchmark: '≤ 60 Days',
      status: idStatus,
      description: 'Average duration raw materials & finished goods sit in stock.',
      underwriterNote: inventoryDays <= 60
        ? 'Efficient stock rotation with minimal holding costs.'
        : 'Sluggish stock movement. Working capital is blocked in inventory.',
    },
    {
      id: 'creditor_days',
      name: 'Creditor Payment Days',
      category: 'Turnover',
      value: creditorDays,
      formattedValue: `${creditorDays} Days`,
      unit: 'Days',
      benchmark: '≤ 90 Days',
      status: cdStatus,
      description: 'Average payment period to trade raw material suppliers.',
      underwriterNote: creditorDays <= 90
        ? 'Trade payables are settled smoothly without vendor strain.'
        : 'High dependence on trade creditor credit to fund operations.',
    },
    {
      id: 'wc_turnover',
      name: 'Working Capital Turnover Velocity',
      category: 'Turnover',
      value: wcTurnover,
      formattedValue: `${wcTurnover.toFixed(2)}x`,
      unit: 'x',
      benchmark: '3.0x - 8.0x',
      status: wcTurnoverStatus,
      description: 'Turns generated by Net Working Capital in supporting turnover.',
      underwriterNote: wcTurnover >= 3 && wcTurnover <= 8
        ? 'Optimal working capital turnover velocity.'
        : 'Sub-optimal working capital velocity or tight working capital base.',
    },
    {
      id: 'gp_margin',
      name: 'Gross Profit Margin (%)',
      category: 'Profitability',
      value: gpMarginPercent,
      formattedValue: `${gpMarginPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 20.0%',
      status: gpStatus,
      description: 'Gross operating profit margin before indirect overheads.',
      underwriterNote: gpMarginPercent >= 20
        ? 'Strong gross profit buffer to absorb operational and overhead costs.'
        : 'Tight gross profit margin. Vulnerable to raw material price volatility.',
    },
    {
      id: 'np_margin',
      name: 'Net Profit Margin (PAT %)',
      category: 'Profitability',
      value: npMarginPercent,
      formattedValue: `${npMarginPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 5.0%',
      status: npStatus,
      description: 'Net bottom-line profit margin after all taxes and expenses.',
      underwriterNote: npMarginPercent >= 5
        ? 'Healthy net profit margin available for plow-back into reserves.'
        : 'Low net profit margin. Limited capacity to build equity reserves.',
    },
    {
      id: 'roce',
      name: 'Return on Capital Employed (ROCE)',
      category: 'Profitability',
      value: rocePercent,
      formattedValue: `${rocePercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 12.0%',
      status: roceStatus,
      description: 'Earnings generated on total capital (Equity + Debt) deployed.',
      underwriterNote: rocePercent >= 12
        ? 'Earning power exceeds cost of capital.'
        : 'Low capital productivity relative to total debt and equity deployed.',
    },
    {
      id: 'ronw',
      name: 'Return on Net Worth (RONW / ROE)',
      category: 'Profitability',
      value: ronwPercent,
      formattedValue: `${ronwPercent.toFixed(1)}%`,
      unit: '%',
      benchmark: '≥ 15.0%',
      status: ronwStatus,
      description: 'Net profit return generated on Tangible Net Worth (Equity Base).',
      underwriterNote: ronwPercent >= 15
        ? 'Excellent return generated for equity holders.'
        : 'Moderate return on promoter equity base.',
    },
  ];
}

// ─── Automated Insight & Alert System (Rules Engine) ───────────

export function runCmaRulesEngine(
  data: CmaNormalizedData,
  ratios: CmaRatioResult[]
): CmaUnderwriterAlert[] {
  const alerts: CmaUnderwriterAlert[] = [];

  const currentRatio = data.normalizedCurrentLiabilities > 0
    ? data.normalizedCurrentAssets / data.normalizedCurrentLiabilities
    : 0;

  // 1. Diversion of Funds Alert
  if (currentRatio < 1.0 && data.fixedAssetsYoYGrowthPercent > 10) {
    alerts.push({
      id: 'alert_diversion_funds',
      code: 'ALERT-01',
      title: 'Diversion of Short-Term Funds for Long-Term Asset Creation',
      severity: 'CRITICAL',
      message: `Warning: Potential diversion of short-term working capital for long-term asset creation. Current Ratio is ${currentRatio.toFixed(2)}x (<1.0x) while Fixed Assets grew by ${data.fixedAssetsYoYGrowthPercent}% YoY.`,
      impact: 'Short-term bank borrowings or trade creditors are being diverted to purchase fixed assets, creating liquidity distress.',
      recommendation: 'Bank should stipulate strict monitoring of cash flows & mandate promoter equity infusion to restore Current Ratio to >1.33x.',
    });
  }

  // 2. Drawing Power (DP) Squeeze Alert
  if (data.sundryDebtorsAgedOver180 > 0) {
    const lakhs = (data.sundryDebtorsAgedOver180 / 100000).toFixed(2);
    alerts.push({
      id: 'alert_dp_squeeze',
      code: 'ALERT-02',
      title: 'Drawing Power (DP) Receivable Squeeze',
      severity: 'HIGH',
      message: `₹${lakhs} Lakhs of aged receivables (>180 days) detected. These will be excluded by the bank from Drawing Power calculations.`,
      impact: 'Will reduce CC/OD limit availability during quarterly bank DP stock statement audits.',
      recommendation: 'Examine debtor aging list and fast-track recovery or write-off non-realizable accounts.',
    });
  }

  // 3. Window Dressing / Earnings Quality Alert
  if (data.operatingCashFlow < 0 && data.netProfitMarginPercent > 5) {
    alerts.push({
      id: 'alert_window_dressing',
      code: 'ALERT-03',
      title: 'Earnings Quality & Operating Cash Flow Mismatch (Window Dressing Risk)',
      severity: 'HIGH',
      message: `Poor earnings quality. Reported Net Profit Margin is ${data.netProfitMarginPercent}%, but Operating Cash Flow is negative (-₹${(Math.abs(data.operatingCashFlow) / 100000).toFixed(2)} Lakhs).`,
      impact: 'Profits are paper-based and blocked in rising working capital (uncollected receivables / inventory).',
      recommendation: 'Conduct forensic scrutiny of revenue recognition & trade receivable realizations.',
    });
  }

  // 4. Leverage Alert
  const rawTolTnw = data.rawTotalOutsideLiabilities / Math.max(1, data.rawTangibleNetWorth);
  const normTolTnw = data.normalizedTotalOutsideLiabilities / Math.max(1, data.tangibleNetWorth);

  if (rawTolTnw > 3.0 || normTolTnw > 3.0) {
    const promoterLakhs = (data.promoterUnsecuredLoans / 100000).toFixed(2);
    alerts.push({
      id: 'alert_leverage',
      code: 'ALERT-04',
      title: 'High Capital Structure Leverage',
      severity: 'HIGH',
      message: `High leverage detected (Raw TOL/TNW = ${rawTolTnw.toFixed(2)}x). Suggest subordinating promoter unsecured loans of ₹${promoterLakhs} Lakhs to Quasi-Equity to bring normalized TOL/TNW to ${normTolTnw.toFixed(2)}x.`,
      impact: 'Exceeds standard banking leverage ceiling of 3.0x.',
      recommendation: 'Obtain a formal legally enforceable subordination agreement and Auditor Certificate for promoter loans.',
    });
  }

  // 5. Sister Concern Advances Alert
  if (data.sisterConcernAdvances > 0) {
    const sisterLakhs = (data.sisterConcernAdvances / 100000).toFixed(2);
    alerts.push({
      id: 'alert_sister_advances',
      code: 'ALERT-05',
      title: 'Inter-Corporate Advances to Related Entities',
      severity: 'MEDIUM',
      message: `₹${sisterLakhs} Lakhs of loans & advances to sister concerns detected. Stripped from Current Assets and treated as Non-Current.`,
      impact: 'Bank credit policy prohibits utilizing working capital bank limits to fund sister entities.',
      recommendation: 'Ensure inter-corporate deposits are recalled or backed by board resolution.',
    });
  }

  // 6. DSCR Rejection Risk Alert
  const grossDscr = ratios.find(r => r.id === 'gross_dscr')?.value || 0;
  if (grossDscr < 1.2) {
    alerts.push({
      id: 'alert_dscr_risk',
      code: 'ALERT-06',
      title: 'Debt Service Coverage Ratio (DSCR) Failure Risk',
      severity: 'CRITICAL',
      message: `Gross DSCR is ${grossDscr.toFixed(2)}x, which is below the mandatory banking threshold of 1.20x-1.33x. High risk of term loan proposal rejection.`,
      impact: 'Inadequate cash flow generation to service term loan principal & interest.',
      recommendation: 'Extend term loan tenure or request interest-only moratorium period from credit sanctioning authority.',
    });
  }

  return alerts;
}

// ─── Complete Report Generator ─────────────────────────────────

export function generateCmaAppraisalReport(
  extraction: TallyCmaExtractionResult,
  options: CmaOptions = DEFAULT_CMA_OPTIONS
): CmaAppraisalReport {
  const normalizedData = normalizeTallyToCma(extraction, options);
  const ratios = calculateCmaRatios(normalizedData);
  const alerts = runCmaRulesEngine(normalizedData, ratios);

  // Calculate Tandon Committee Method II MPBF
  const ca = normalizedData.normalizedCurrentAssets;
  const cl = normalizedData.normalizedCurrentLiabilities;
  const workingCapitalGap = Math.max(0, ca - cl);
  const minimumStipulatedNWC = 0.25 * ca; // 25% of Current Assets
  const maxPermissibleBankFinance = Math.max(0, workingCapitalGap - minimumStipulatedNWC);
  const actualNWCProvided = Math.max(0, normalizedData.netWorkingCapital);
  const shortfallInNWC = Math.max(0, minimumStipulatedNWC - actualNWCProvided);

  return {
    companyName: extraction.companyInfo.name || 'Company',
    financialYear: extraction.companyInfo.financialYear || '2025-26',
    options,
    normalizedData,
    ratios,
    alerts,
    mpbfMethodII: {
      currentAssets: ca,
      currentLiabilities: cl,
      workingCapitalGap,
      minimumStipulatedNWC,
      maxPermissibleBankFinance,
      actualNWCProvided,
      shortfallInNWC,
    },
    generatedAt: new Date().toLocaleString('en-IN'),
  };
}

// ─── Excel Exporter (`ExcelJS` Britannia Industries Level Styling) ───

export async function exportCmaReportToExcel(report: CmaAppraisalReport): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GST Consolidator - CMA Credit Appraisal Engine';
  workbook.created = new Date();

  // Color Constants (Britannia Financial Model Palette)
  const COLOR_HEADER_BG = 'FF0F172A'; // Dark Navy
  const COLOR_SUBHEADER_BG = 'FF1E293B'; // Dark Slate
  const COLOR_SECTION_BG = 'FFE2E8F0'; // Light Slate
  const COLOR_HIGHLIGHT_BG = 'FFF1F5F9'; // Soft Slate
  const COLOR_TEXT_WHITE = 'FFFFFFFF';
  const COLOR_BORDER_LIGHT = 'FFCBD5E1';
  const COLOR_BORDER_DARK = 'FF0F172A';

  const fontTitle: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 13, bold: true, color: { argb: COLOR_TEXT_WHITE } };
  const fontSubTitle: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, italic: true, color: { argb: COLOR_TEXT_WHITE } };
  const fontHeader: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLOR_TEXT_WHITE } };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLOR_BORDER_DARK } };
  const fontRegular: Partial<ExcelJS.Font> = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };

  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    left: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    right: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
  };

  const borderTotal: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: COLOR_BORDER_DARK } },
    bottom: { style: 'double', color: { argb: COLOR_BORDER_DARK } },
    left: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
    right: { style: 'thin', color: { argb: COLOR_BORDER_LIGHT } },
  };

  const numFmtCurrency = '"₹"#,##0.00;("₹"#,##0.00);"-"';

  // --- SHEET 3: TALLY LEDGER AUDIT MAPPING ---
  const wsAudit = workbook.addWorksheet('Tally Ledger Audit Mapping');
  wsAudit.views = [{ showGridLines: true }];

  // Title Rows
  wsAudit.mergeCells('A1:F1');
  const titleCell3 = wsAudit.getCell('A1');
  titleCell3.value = `TALLY TO CMA ITEMISED LEDGER MAPPING TRACK RECORD — ${report.companyName.toUpperCase()}`;
  titleCell3.font = fontTitle;
  titleCell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  titleCell3.alignment = { vertical: 'middle', horizontal: 'left' };
  wsAudit.getRow(1).height = 30;

  wsAudit.mergeCells('A2:F2');
  const subCell3 = wsAudit.getCell('A2');
  subCell3.value = `Total Mapped Ledgers: ${report.normalizedData.allMappedLedgers.length} | FY: ${report.financialYear}`;
  subCell3.font = fontSubTitle;
  subCell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
  subCell3.alignment = { vertical: 'middle', horizontal: 'left' };
  wsAudit.getRow(2).height = 20;

  // Header Row (Row 4)
  const auditHeaders = ['TALLY LEDGER NAME', 'TALLY PARENT GROUP', 'PRIMARY GROUP', 'CLOSING BALANCE (₹)', 'MAPPED CMA CATEGORY', 'MAPPING RULE / REASON'];
  const rowAuditHead = wsAudit.getRow(4);
  rowAuditHead.height = 24;
  auditHeaders.forEach((h, colIdx) => {
    const cell = rowAuditHead.getCell(colIdx + 1);
    cell.value = h;
    cell.font = fontHeader;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: colIdx === 3 ? 'right' : 'left' };
    cell.border = borderThin;
  });

  // Data Rows (Row 5+)
  report.normalizedData.allMappedLedgers.forEach((l, idx) => {
    const rowIdx = 5 + idx;
    const r = wsAudit.getRow(rowIdx);
    r.height = 20;
    r.getCell(1).value = l.ledgerName;
    r.getCell(2).value = l.parentGroup;
    r.getCell(3).value = l.primaryGroup;
    
    const cbCell = r.getCell(4);
    cbCell.value = l.closingBalance;
    cbCell.numFmt = numFmtCurrency;
    cbCell.alignment = { horizontal: 'right' };

    r.getCell(5).value = l.cmaCategory;
    r.getCell(6).value = l.mappingRule;

    for (let c = 1; c <= 6; c++) {
      const cell = r.getCell(c);
      cell.font = fontRegular;
      cell.border = borderThin;
    }
  });

  const lastLedgerRow = 4 + report.normalizedData.allMappedLedgers.length;
  const totRowAuditIdx = lastLedgerRow + 1;
  const totRowAudit = wsAudit.getRow(totRowAuditIdx);
  totRowAudit.height = 24;
  totRowAudit.getCell(1).value = 'TOTAL BALANCE SUM';
  totRowAudit.getCell(1).font = fontBold;
  
  const totCbCell = totRowAudit.getCell(4);
  totCbCell.value = { formula: `SUM(D5:D${lastLedgerRow})`, result: report.normalizedData.allMappedLedgers.reduce((a, b) => a + Math.abs(b.closingBalance), 0) };
  totCbCell.numFmt = numFmtCurrency;
  totCbCell.font = fontBold;
  totCbCell.alignment = { horizontal: 'right' };

  for (let c = 1; c <= 6; c++) {
    const cell = totRowAudit.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION_BG } };
    cell.border = borderTotal;
  }

  wsAudit.columns = [
    { width: 40 },
    { width: 30 },
    { width: 28 },
    { width: 22 },
    { width: 35 },
    { width: 38 },
  ];

  // --- SHEET 2: CMA NORMALIZED FINANCIALS ---
  const wsCma = workbook.addWorksheet('CMA Normalized Financials');
  wsCma.views = [{ showGridLines: true }];

  wsCma.mergeCells('A1:E1');
  const titleCell2 = wsCma.getCell('A1');
  titleCell2.value = `NORMALIZED CMA BALANCE SHEET & P&L STATEMENT (Tally vs Banking CMA Standard)`;
  titleCell2.font = fontTitle;
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  titleCell2.alignment = { vertical: 'middle', horizontal: 'left' };
  wsCma.getRow(1).height = 30;

  wsCma.mergeCells('A2:E2');
  const subCell2 = wsCma.getCell('A2');
  subCell2.value = `Company: ${report.companyName} | FY: ${report.financialYear}`;
  subCell2.font = fontSubTitle;
  subCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
  subCell2.alignment = { vertical: 'middle', horizontal: 'left' };
  wsCma.getRow(2).height = 20;

  const cmaHeaders = ['FINANCIAL HEAD / BUCKET', 'RAW TALLY AMOUNT (₹)', 'CMA RECLASSIFICATION / ADJUSTMENT', 'NORMALIZED CMA AMOUNT (₹)', 'BANK CREDIT REMARKS'];
  const rowCmaHead = wsCma.getRow(4);
  rowCmaHead.height = 24;
  cmaHeaders.forEach((h, colIdx) => {
    const cell = rowCmaHead.getCell(colIdx + 1);
    cell.value = h;
    cell.font = fontHeader;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: (colIdx >= 1 && colIdx <= 3) ? 'right' : 'left' };
    cell.border = borderThin;
  });

  const d = report.normalizedData;
  const cmaDataDefinitions: Array<{
    row: number;
    head: string;
    rawFormula?: string;
    rawValue?: number;
    adjValue?: number | { formula: string; result: number };
    normFormula?: string;
    normValue?: number;
    remarks: string;
    isHeader?: boolean;
    isTotal?: boolean;
  }> = [
    // Rows 5-15: P&L
    { row: 5, head: 'Gross Sales / Revenue from Operations', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Gross Sales / Revenue from Operations", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.grossSales, adjValue: 0, normFormula: 'B5+C5', normValue: d.grossSales, remarks: 'Verified Gross Revenue' },
    { row: 6, head: 'Cost of Goods Sold (COGS)', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Raw Material Purchases", 'Tally Ledger Audit Mapping'!D:D)+SUMIF('Tally Ledger Audit Mapping'!E:E, "Direct Manufacturing Expenses", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.cogs, adjValue: 0, normFormula: 'B6+C6', normValue: d.cogs, remarks: 'Direct Manufacturing / Trading Cost' },
    { row: 7, head: 'Raw Material Purchases', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Raw Material Purchases", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.purchases, adjValue: 0, normFormula: 'B7+C7', normValue: d.purchases, remarks: 'Material Purchases' },
    { row: 8, head: 'Gross Profit', rawFormula: 'B5-B6', rawValue: d.grossSales - d.cogs, adjValue: 0, normFormula: 'D5-D6', normValue: d.grossSales - d.cogs, remarks: 'Gross Trading Profit', isTotal: true },
    { row: 9, head: 'Profit After Tax (PAT)', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Profit After Tax (PAT)", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.pat, adjValue: 0, normFormula: 'B9+C9', normValue: d.pat, remarks: 'Net Earnings After Tax' },
    { row: 10, head: 'Depreciation & Amortization', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Depreciation & Amortization", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.depreciation, adjValue: 0, normFormula: 'B10+C10', normValue: d.depreciation, remarks: 'Non-cash add-back' },
    { row: 11, head: 'Term Loan Interest', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Finance Costs & Interest", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.termInterest, adjValue: 0, normFormula: 'B11+C11', normValue: d.termInterest, remarks: 'Term Loan Debt Servicing' },
    { row: 12, head: 'Working Capital Interest', rawValue: d.workingCapitalInterest, adjValue: 0, normValue: d.workingCapitalInterest, remarks: 'CC/OD Finance Cost' },
    { row: 13, head: 'Total Interest & Finance Costs', rawFormula: 'B11+B12', rawValue: d.termInterest + d.workingCapitalInterest, adjValue: 0, normFormula: 'D11+D12', normValue: d.termInterest + d.workingCapitalInterest, remarks: 'Total Interest Expense', isTotal: true },
    { row: 14, head: 'EBITDA', rawFormula: 'B9+B10+B13', rawValue: d.pat + d.depreciation + d.termInterest + d.workingCapitalInterest, adjValue: 0, normFormula: 'D9+D10+D13', normValue: d.pat + d.depreciation + d.termInterest + d.workingCapitalInterest, remarks: 'Operating Cash Earnings', isTotal: true },
    { row: 15, head: 'EBIT (Operating Profit)', rawFormula: 'B9+B13', rawValue: d.pat + d.termInterest + d.workingCapitalInterest, adjValue: 0, normFormula: 'D9+D13', normValue: d.pat + d.termInterest + d.workingCapitalInterest, remarks: 'Operating Profit before Interest', isTotal: true },

    // Rows 17-24: Current Assets
    { row: 17, head: 'Inventory (Stock-in-Hand)', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Inventory (Stock-in-Hand)", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.inventory, adjValue: 0, normFormula: 'B17+C17', normValue: d.inventory, remarks: 'Stock Security Base' },
    { row: 18, head: 'Sundry Debtors (Receivables Total)', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Sundry Debtors (Receivables Total)", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.sundryDebtorsTotal, adjValue: 0, normFormula: 'B18+C18', normValue: d.sundryDebtorsTotal, remarks: 'Trade Receivables Base' },
    { row: 19, head: 'Sundry Debtors (>180 Days Aged)', rawValue: d.sundryDebtorsAgedOver180, adjValue: -d.sundryDebtorsAgedOver180, normFormula: 'B19+C19', normValue: 0, remarks: 'Reclassified to Non-Current Asset' },
    { row: 20, head: 'Sister Concern Loans & Advances', rawValue: d.sisterConcernAdvances, adjValue: -d.sisterConcernAdvances, normFormula: 'B20+C20', normValue: 0, remarks: 'Reclassified to Non-Current Asset' },
    { row: 21, head: 'Cash & Bank Balances', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Cash & Bank Balances", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.cashAndBank, adjValue: 0, normFormula: 'B21+C21', normValue: d.cashAndBank, remarks: 'Liquid Cash Base' },
    { row: 22, head: 'Other Current Assets', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Other Current Assets", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.otherCurrentAssets, adjValue: 0, normFormula: 'B22+C22', normValue: d.otherCurrentAssets, remarks: 'GST & Advance Taxes' },
    { row: 23, head: 'RAW CURRENT ASSETS TOTAL', rawFormula: 'B17+B18+B21+B22', rawValue: d.rawCurrentAssets, adjValue: 0, normFormula: 'D17+D18+D21+D22', normValue: d.rawCurrentAssets, remarks: 'As per Tally Books', isTotal: true },
    { row: 24, head: 'NORMALIZED CURRENT ASSETS (CMA Base)', rawFormula: 'B23', rawValue: d.rawCurrentAssets, adjValue: { formula: 'C19+C20', result: -d.nonCurrentAssetsReclassified }, normFormula: 'D23+C19+C20', normValue: d.normalizedCurrentAssets, remarks: 'Tandon Committee Method II CA Base', isTotal: true },

    // Rows 26-29: Current Liabilities
    { row: 26, head: 'Sundry Creditors (Trade Payables)', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Sundry Creditors (Trade Payables)", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.sundryCreditors, adjValue: 0, normFormula: 'B26+C26', normValue: d.sundryCreditors, remarks: 'Trade Supplier Payables' },
    { row: 27, head: 'Working Capital CC / OD Limits', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Working Capital CC / OD Limits", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.workingCapitalBankBorrowings, adjValue: 0, normFormula: 'B27+C27', normValue: d.workingCapitalBankBorrowings, remarks: 'Short-term Bank Borrowings' },
    { row: 28, head: 'Other Current Liabilities', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Other Current Liabilities", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.otherCurrentLiabilities, adjValue: 0, normFormula: 'B28+C28', normValue: d.otherCurrentLiabilities, remarks: 'Statutory & Short-term Provisions' },
    { row: 29, head: 'NORMALIZED CURRENT LIABILITIES TOTAL', rawFormula: 'B26+B27+B28', rawValue: d.rawCurrentLiabilities, adjValue: 0, normFormula: 'D26+D27+D28', normValue: d.normalizedCurrentLiabilities, remarks: 'Total Short-term Obligations', isTotal: true },

    // Rows 31-32: Long-Term Debt & Fixed Assets
    { row: 31, head: 'Tangible Fixed Assets', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Tangible Fixed Assets", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.netFixedAssets, adjValue: 0, normFormula: 'B31+C31', normValue: d.netFixedAssets, remarks: 'Net Block Assets' },
    { row: 32, head: 'Long-Term Bank Term Loans', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Long-Term Bank Term Loans", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.totalTermLiabilities, adjValue: 0, normFormula: 'B32+C32', normValue: d.totalTermLiabilities, remarks: 'Long-Term Funded Debt' },

    // Rows 34-39: Net Worth & Capital
    { row: 34, head: 'Share Capital + General Reserves', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Share Capital + General Reserves", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.shareCapital + d.reservesSurplus, adjValue: 0, normFormula: 'B34+C34', normValue: d.shareCapital + d.reservesSurplus, remarks: 'Base Equity & Reserves' },
    { row: 35, head: 'Promoter Unsecured Loans', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Promoter Unsecured Loans", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.promoterUnsecuredLoans, adjValue: report.options.reclassifyPromoterLoansAsQuasiEquity ? -d.promoterUnsecuredLoans : 0, normFormula: 'B35+C35', normValue: d.promoterUnsecuredLoans - d.quasiEquity, remarks: report.options.reclassifyPromoterLoansAsQuasiEquity ? 'Subordinated to Quasi-Equity' : 'Outside Liability' },
    { row: 36, head: 'Quasi-Equity Addition to TNW', rawValue: 0, adjValue: report.options.reclassifyPromoterLoansAsQuasiEquity ? d.promoterUnsecuredLoans : 0, normFormula: 'C36', normValue: d.quasiEquity, remarks: 'Added to Promoter Equity Base' },
    { row: 37, head: 'Intangible Assets & Deferred Losses', rawFormula: `SUMIF('Tally Ledger Audit Mapping'!E:E, "Intangible Assets & Deferred Losses", 'Tally Ledger Audit Mapping'!D:D)`, rawValue: d.intangibleAssets, adjValue: -d.intangibleAssets, normFormula: 'B37+C37', normValue: 0, remarks: 'Deducted to calculate TNW' },
    { row: 38, head: 'TANGIBLE NET WORTH (TNW)', rawFormula: 'B34+B35-B37', rawValue: d.rawTangibleNetWorth, adjValue: { formula: 'C36+C37', result: d.quasiEquity - d.intangibleAssets }, normFormula: 'D34+D36+C37', normValue: d.tangibleNetWorth, remarks: 'Final Bank Tangible Net Worth', isTotal: true },
    { row: 39, head: 'TOTAL OUTSIDE LIABILITIES (TOL)', rawFormula: 'B29+B32+B35', rawValue: d.rawTotalOutsideLiabilities, adjValue: { formula: 'C35', result: -d.quasiEquity }, normFormula: 'D29+D32+D35', normValue: d.normalizedTotalOutsideLiabilities, remarks: 'Outside Borrowings & Creditors', isTotal: true },

    // Rows 41-44: Drawing Power (DP)
    { row: 41, head: 'DRAWING POWER (DP) ASSESSMENT & MARGIN BREAKDOWN', remarks: '', isHeader: true },
    { row: 42, head: 'Paid Stock Net of Margin (75% of Stock - Creditors)', rawFormula: 'MAX(0, D17-D26)', rawValue: Math.max(0, d.inventory - d.sundryCreditors), adjValue: 0.75, normFormula: 'MAX(0, D17-D26)*0.75', normValue: Math.max(0, d.inventory - d.sundryCreditors) * 0.75, remarks: '25% Borrower Stock Margin' },
    { row: 43, head: 'Eligible Receivables Net of Margin (60% of Debtors <=180d)', rawFormula: 'D18+C19', rawValue: d.sundryDebtorsEligibleCurrent, adjValue: 0.60, normFormula: '(D18+C19)*0.60', normValue: d.sundryDebtorsEligibleCurrent * 0.60, remarks: '40% Borrower Debtor Margin' },
    { row: 44, head: 'NET DRAWING POWER (DP) CEILING', rawFormula: 'B42+B43', rawValue: Math.max(0, d.inventory - d.sundryCreditors) + d.sundryDebtorsEligibleCurrent, adjValue: 0, normFormula: 'D42+D43', normValue: (Math.max(0, d.inventory - d.sundryCreditors) * 0.75) + (d.sundryDebtorsEligibleCurrent * 0.60), remarks: 'Maximum Allowable Bank Drawing Power', isTotal: true },

    // Rows 46-49: MPBF
    { row: 46, head: 'TANDON COMMITTEE METHOD II MPBF CALCULATION', remarks: '', isHeader: true },
    { row: 47, head: 'Working Capital Gap (Normalized CA - CL)', rawValue: 0, adjValue: 0, normFormula: 'D24-D29', normValue: Math.max(0, d.normalizedCurrentAssets - d.normalizedCurrentLiabilities), remarks: 'Assessed Working Capital Gap' },
    { row: 48, head: 'Minimum Stipulated NWC Margin (25% of CA)', rawValue: 0, adjValue: 0, normFormula: '0.25*D24', normValue: report.mpbfMethodII.minimumStipulatedNWC, remarks: 'Mandatory Borrower Margin Contribution' },
    { row: 49, head: 'MAXIMUM PERMISSIBLE BANK FINANCE (MPBF)', rawValue: 0, adjValue: 0, normFormula: 'MAX(0, D47-D48)', normValue: report.mpbfMethodII.maxPermissibleBankFinance, remarks: 'Maximum Bank CC Limit Ceiling', isTotal: true },
  ];

  cmaDataDefinitions.forEach(item => {
    const row = wsCma.getRow(item.row);
    row.height = item.isHeader ? 22 : item.isTotal ? 24 : 20;

    if (item.isHeader) {
      wsCma.mergeCells(`A${item.row}:E${item.row}`);
      const cell = wsCma.getCell(`A${item.row}`);
      cell.value = item.head;
      cell.font = fontHeader;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      return;
    }

    const cellHead = row.getCell(1);
    cellHead.value = item.head;
    cellHead.font = item.isTotal ? fontBold : fontRegular;
    cellHead.border = item.isTotal ? borderTotal : borderThin;
    if (item.isTotal) cellHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HIGHLIGHT_BG } };

    // Col B: Raw Tally Amount
    const cellRaw = row.getCell(2);
    if (item.rawFormula) {
      cellRaw.value = { formula: item.rawFormula, result: item.rawValue ?? 0 };
    } else {
      cellRaw.value = item.rawValue ?? 0;
    }
    cellRaw.numFmt = numFmtCurrency;
    cellRaw.font = item.isTotal ? fontBold : fontRegular;
    cellRaw.alignment = { horizontal: 'right' };
    cellRaw.border = item.isTotal ? borderTotal : borderThin;
    if (item.isTotal) cellRaw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HIGHLIGHT_BG } };

    // Col C: Reclassification Adjustment
    const cellAdj = row.getCell(3);
    if (typeof item.adjValue === 'object' && item.adjValue !== null) {
      cellAdj.value = { formula: item.adjValue.formula, result: item.adjValue.result };
      cellAdj.numFmt = numFmtCurrency;
    } else if (typeof item.adjValue === 'number') {
      cellAdj.value = item.adjValue;
      if (item.row === 42 || item.row === 43) {
        cellAdj.numFmt = '0.0%';
      } else {
        cellAdj.numFmt = numFmtCurrency;
      }
    } else {
      cellAdj.value = 0;
      cellAdj.numFmt = numFmtCurrency;
    }
    cellAdj.font = item.isTotal ? fontBold : fontRegular;
    cellAdj.alignment = { horizontal: 'right' };
    cellAdj.border = item.isTotal ? borderTotal : borderThin;
    if (item.isTotal) cellAdj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HIGHLIGHT_BG } };

    // Col D: Normalized Amount
    const cellNorm = row.getCell(4);
    if (item.normFormula) {
      cellNorm.value = { formula: item.normFormula, result: item.normValue ?? 0 };
    } else {
      cellNorm.value = item.normValue ?? 0;
    }
    cellNorm.numFmt = numFmtCurrency;
    cellNorm.font = item.isTotal ? fontBold : fontRegular;
    cellNorm.alignment = { horizontal: 'right' };
    cellNorm.border = item.isTotal ? borderTotal : borderThin;
    if (item.isTotal) cellNorm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION_BG } };

    // Col E: Remarks
    const cellRem = row.getCell(5);
    cellRem.value = item.remarks;
    cellRem.font = item.isTotal ? fontBold : fontRegular;
    cellRem.border = item.isTotal ? borderTotal : borderThin;
    if (item.isTotal) cellRem.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HIGHLIGHT_BG } };
  });

  wsCma.columns = [
    { width: 55 },
    { width: 28 },
    { width: 34 },
    { width: 30 },
    { width: 48 },
  ];

  // --- SHEET 1: BANK RATIO SCORECARD ---
  const wsRatios = workbook.addWorksheet('Bank Ratio Scorecard');
  wsRatios.views = [{ showGridLines: true }];

  wsRatios.mergeCells('A1:F1');
  const titleCell1 = wsRatios.getCell('A1');
  titleCell1.value = `CMA CREDIT APPRAISAL & FINANCIAL RATIO ANALYSIS — ${report.companyName.toUpperCase()}`;
  titleCell1.font = fontTitle;
  titleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  titleCell1.alignment = { vertical: 'middle', horizontal: 'left' };
  wsRatios.getRow(1).height = 30;

  wsRatios.mergeCells('A2:F2');
  const subCell1 = wsRatios.getCell('A2');
  subCell1.value = `Financial Year: ${report.financialYear} | Generated: ${report.generatedAt}`;
  subCell1.font = fontSubTitle;
  subCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
  subCell1.alignment = { vertical: 'middle', horizontal: 'left' };
  wsRatios.getRow(2).height = 20;

  const ratioHeaders = ['RATIO NAME', 'CATEGORY', 'LIVE EXCEL FORMULA (LINKED TO SHEET 2)', 'BANK BENCHMARK', 'STATUS', 'UNDERWRITER AUDIT NOTE'];
  const rowRatioHead = wsRatios.getRow(4);
  rowRatioHead.height = 24;
  ratioHeaders.forEach((h, colIdx) => {
    const cell = rowRatioHead.getCell(colIdx + 1);
    cell.value = h;
    cell.font = fontHeader;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: colIdx === 4 ? 'center' : 'left' };
    cell.border = borderThin;
  });

  const formulaMap: Record<string, { formula: string; result: any; numFmt: string }> = {
    'dp_coverage_ratio': { formula: `IF('CMA Normalized Financials'!D27>0, ('CMA Normalized Financials'!D44 / 'CMA Normalized Financials'!D27)*100, 100)`, result: (d.workingCapitalBankBorrowings > 0 ? (((Math.max(0, d.inventory - d.sundryCreditors) * 0.75) + (d.sundryDebtorsEligibleCurrent * 0.60)) / d.workingCapitalBankBorrowings) * 100 : 100) / 100, numFmt: '0.0%' },
    'paid_stock_ratio': { formula: `IF('CMA Normalized Financials'!D17>0, (MAX(0, 'CMA Normalized Financials'!D17 - 'CMA Normalized Financials'!D26) / 'CMA Normalized Financials'!D17)*100, 0)`, result: (d.inventory > 0 ? (Math.max(0, d.inventory - d.sundryCreditors) / d.inventory) * 100 : 0) / 100, numFmt: '0.0%' },
    'eligible_debtor_ratio': { formula: `IF('CMA Normalized Financials'!D18>0, (('CMA Normalized Financials'!D18 + 'CMA Normalized Financials'!C19) / 'CMA Normalized Financials'!D18)*100, 100)`, result: (d.sundryDebtorsTotal > 0 ? (d.sundryDebtorsEligibleCurrent / d.sundryDebtorsTotal) * 100 : 100) / 100, numFmt: '0.0%' },
    'tol_tnw': { formula: `'CMA Normalized Financials'!D39 / MAX(1, 'CMA Normalized Financials'!D38)`, result: d.normalizedTotalOutsideLiabilities / Math.max(1, d.tangibleNetWorth), numFmt: '0.00"x"' },
    'term_debt_equity': { formula: `'CMA Normalized Financials'!D32 / MAX(1, 'CMA Normalized Financials'!D38)`, result: d.totalTermLiabilities / Math.max(1, d.tangibleNetWorth), numFmt: '0.00"x"' },
    'total_debt_equity': { formula: `('CMA Normalized Financials'!D32 + 'CMA Normalized Financials'!D27) / MAX(1, 'CMA Normalized Financials'!D38)`, result: (d.totalTermLiabilities + d.workingCapitalBankBorrowings) / Math.max(1, d.tangibleNetWorth), numFmt: '0.00"x"' },
    'facr': { formula: `'CMA Normalized Financials'!D31 / MAX(1, 'CMA Normalized Financials'!D32)`, result: d.totalTermLiabilities > 0 ? d.netFixedAssets / d.totalTermLiabilities : 0, numFmt: '0.00"x"' },
    'gross_dscr': { formula: `('CMA Normalized Financials'!D9 + 'CMA Normalized Financials'!D10 + 'CMA Normalized Financials'!D11) / MAX(1, ('CMA Normalized Financials'!D32 * 0.15) + 'CMA Normalized Financials'!D11)`, result: report.ratios.find(r => r.id === 'gross_dscr')?.value || 0, numFmt: '0.00"x"' },
    'iscr': { formula: `('CMA Normalized Financials'!D15 + 'CMA Normalized Financials'!D10) / MAX(1, 'CMA Normalized Financials'!D13)`, result: report.ratios.find(r => r.id === 'iscr')?.value || 0, numFmt: '0.00"x"' },
    'adjusted_current_ratio': { formula: `'CMA Normalized Financials'!D24 / MAX(1, 'CMA Normalized Financials'!D29)`, result: d.normalizedCurrentLiabilities > 0 ? d.normalizedCurrentAssets / d.normalizedCurrentLiabilities : 0, numFmt: '0.00"x"' },
    'raw_current_ratio': { formula: `'CMA Normalized Financials'!D23 / MAX(1, 'CMA Normalized Financials'!D29)`, result: d.rawCurrentLiabilities > 0 ? d.rawCurrentAssets / d.rawCurrentLiabilities : 0, numFmt: '0.00"x"' },
    'quick_ratio': { formula: `('CMA Normalized Financials'!D24 - 'CMA Normalized Financials'!D17) / MAX(1, 'CMA Normalized Financials'!D29)`, result: d.normalizedCurrentLiabilities > 0 ? (d.normalizedCurrentAssets - d.inventory) / d.normalizedCurrentLiabilities : 0, numFmt: '0.00"x"' },
    'cash_ratio': { formula: `'CMA Normalized Financials'!D21 / MAX(1, 'CMA Normalized Financials'!D29)`, result: d.normalizedCurrentLiabilities > 0 ? d.cashAndBank / d.normalizedCurrentLiabilities : 0, numFmt: '0.00"x"' },
    'nwc_sales': { formula: `(('CMA Normalized Financials'!D24 - 'CMA Normalized Financials'!D29) / MAX(1, 'CMA Normalized Financials'!D5)) * 100`, result: (d.grossSales > 0 ? (d.netWorkingCapital / d.grossSales) * 100 : 0) / 100, numFmt: '0.0%' },
    'debtor_days': { formula: `ROUND(('CMA Normalized Financials'!D18 / MAX(1, 'CMA Normalized Financials'!D5)) * 365, 0)`, result: d.grossSales > 0 ? Math.round((d.sundryDebtorsTotal / d.grossSales) * 365) : 0, numFmt: '0" Days"' },
    'inventory_days': { formula: `ROUND(('CMA Normalized Financials'!D17 / MAX(1, 'CMA Normalized Financials'!D6)) * 365, 0)`, result: d.cogs > 0 ? Math.round((d.inventory / d.cogs) * 365) : 0, numFmt: '0" Days"' },
    'creditor_days': { formula: `ROUND(('CMA Normalized Financials'!D26 / MAX(1, 'CMA Normalized Financials'!D7)) * 365, 0)`, result: d.purchases > 0 ? Math.round((d.sundryCreditors / d.purchases) * 365) : 0, numFmt: '0" Days"' },
    'cash_conversion_cycle': { formula: `ROUND(('CMA Normalized Financials'!D18 / MAX(1, 'CMA Normalized Financials'!D5)) * 365, 0) + ROUND(('CMA Normalized Financials'!D17 / MAX(1, 'CMA Normalized Financials'!D6)) * 365, 0) - ROUND(('CMA Normalized Financials'!D26 / MAX(1, 'CMA Normalized Financials'!D7)) * 365, 0)`, result: (d.grossSales > 0 ? Math.round((d.sundryDebtorsTotal / d.grossSales) * 365) : 0) + (d.cogs > 0 ? Math.round((d.inventory / d.cogs) * 365) : 0) - (d.purchases > 0 ? Math.round((d.sundryCreditors / d.purchases) * 365) : 0), numFmt: '0" Days"' },
    'wc_turnover': { formula: `'CMA Normalized Financials'!D5 / MAX(1, 'CMA Normalized Financials'!D24 - 'CMA Normalized Financials'!D29)`, result: d.netWorkingCapital > 0 ? d.grossSales / d.netWorkingCapital : 0, numFmt: '0.00"x"' },
    'gp_margin': { formula: `(('CMA Normalized Financials'!D5 - 'CMA Normalized Financials'!D6) / MAX(1, 'CMA Normalized Financials'!D5)) * 100`, result: (d.grossSales > 0 ? ((d.grossSales - d.cogs) / d.grossSales) * 100 : 0) / 100, numFmt: '0.0%' },
    'np_margin': { formula: `('CMA Normalized Financials'!D9 / MAX(1, 'CMA Normalized Financials'!D5)) * 100`, result: (d.grossSales > 0 ? (d.pat / d.grossSales) * 100 : 0) / 100, numFmt: '0.0%' },
    'ebitda_margin': { formula: `('CMA Normalized Financials'!D14 / MAX(1, 'CMA Normalized Financials'!D5)) * 100`, result: (d.grossSales > 0 ? ((d.pat + d.depreciation + d.termInterest + d.workingCapitalInterest) / d.grossSales) * 100 : 0) / 100, numFmt: '0.0%' },
    'roce': { formula: `('CMA Normalized Financials'!D15 / MAX(1, 'CMA Normalized Financials'!D38 + 'CMA Normalized Financials'!D39)) * 100`, result: ((d.tangibleNetWorth + d.normalizedTotalOutsideLiabilities) > 0 ? ((d.pat + d.termInterest + d.workingCapitalInterest) / (d.tangibleNetWorth + d.normalizedTotalOutsideLiabilities)) * 100 : 0) / 100, numFmt: '0.0%' },
    'ronw': { formula: `('CMA Normalized Financials'!D9 / MAX(1, 'CMA Normalized Financials'!D38)) * 100`, result: (d.tangibleNetWorth > 0 ? (d.pat / d.tangibleNetWorth) * 100 : 0) / 100, numFmt: '0.0%' },
  };

  report.ratios.forEach((r, idx) => {
    const rowIdx = 5 + idx;
    const row = wsRatios.getRow(rowIdx);
    row.height = 20;

    row.getCell(1).value = r.name;
    row.getCell(2).value = r.category;

    const cellForm = row.getCell(3);
    const fObj = formulaMap[r.id];
    if (fObj) {
      cellForm.value = { formula: fObj.formula, result: fObj.result };
      cellForm.numFmt = fObj.numFmt;
    } else {
      cellForm.value = r.formattedValue;
    }
    cellForm.alignment = { horizontal: 'right' };

    row.getCell(4).value = r.benchmark;

    const cellStatus = row.getCell(5);
    cellStatus.value = r.status.toUpperCase();
    cellStatus.alignment = { horizontal: 'center' };
    if (r.status === 'healthy') {
      cellStatus.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF16A34A' } };
    } else if (r.status === 'warning') {
      cellStatus.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'D97706' } };
    } else {
      cellStatus.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
    }

    row.getCell(6).value = r.underwriterNote;

    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      if (c !== 5) cell.font = fontRegular;
      cell.border = borderThin;
    }
  });

  // Alerts section below ratios
  const alertStartRow = 5 + report.ratios.length + 2;
  wsRatios.mergeCells(`A${alertStartRow}:F${alertStartRow}`);
  const cellAlertHeader = wsRatios.getCell(`A${alertStartRow}`);
  cellAlertHeader.value = 'QUALITATIVE RISK ALERTS & UNDERWRITER DIAGNOSTICS';
  cellAlertHeader.font = fontHeader;
  cellAlertHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
  wsRatios.getRow(alertStartRow).height = 22;

  const alertTableHeaderRow = alertStartRow + 1;
  const alertHeaders = ['CODE', 'SEVERITY', 'ALERT TITLE', 'DETAILED WARNING MESSAGE', 'BANK CREDIT RECOMMENDATION'];
  const rAlertHead = wsRatios.getRow(alertTableHeaderRow);
  rAlertHead.height = 22;
  alertHeaders.forEach((h, colIdx) => {
    const cell = rAlertHead.getCell(colIdx + 1);
    cell.value = h;
    cell.font = fontHeader;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.border = borderThin;
  });

  report.alerts.forEach((a, idx) => {
    const rIdx = alertTableHeaderRow + 1 + idx;
    const row = wsRatios.getRow(rIdx);
    row.height = 24;

    row.getCell(1).value = a.code;
    
    const cSev = row.getCell(2);
    cSev.value = a.severity;
    cSev.alignment = { horizontal: 'center' };
    if (a.severity === 'CRITICAL') {
      cSev.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
    } else if (a.severity === 'HIGH') {
      cSev.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'D97706' } };
    } else {
      cSev.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2563EB' } };
    }

    row.getCell(3).value = a.title;
    row.getCell(4).value = a.message;
    row.getCell(5).value = a.recommendation;

    for (let c = 1; c <= 5; c++) {
      const cell = row.getCell(c);
      if (c !== 2) cell.font = fontRegular;
      cell.border = borderThin;
    }
  });

  wsRatios.columns = [
    { width: 38 },
    { width: 18 },
    { width: 48 },
    { width: 18 },
    { width: 14 },
    { width: 68 },
  ];

  // Write and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CMA_Bank_Credit_Appraisal_${report.companyName.replace(/[^A-Za-z0-9]/g, '_')}_${report.financialYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

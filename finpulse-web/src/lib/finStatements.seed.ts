// ============================================================
// Financial Statements Module — Master Group Codes Seed Data
// Schedule III (Companies Act 2013) & Non-Corporate (ICAI June 2022)
// Official 4-Digit Taxonomy (1001 to 4902)
// ============================================================

import type { MasterGroupCode } from './finStatements.types';

export const MASTER_GROUP_CODES_SEED: MasterGroupCode[] = [
  // =========================================================================
  // I. EQUITY AND LIABILITIES (1000s)
  // =========================================================================

  // ---- (1) Shareholders' Funds / Proprietor / Partner Funds ----
  // (a) Share Capital / Partner Capital
  { id: 1, group_code: 1001, particulars: 'Issued Equity Share Capital / Partner Capital', note_reference: 1, statement_category: 'Share Capital', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.1' },
  { id: 2, group_code: 1002, particulars: 'Preference Share Capital', note_reference: 1, statement_category: 'Share Capital', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.1' },

  // (b) Reserves and Surplus
  { id: 3, group_code: 1101, particulars: 'Capital Reserves', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.2' },
  { id: 4, group_code: 1102, particulars: 'Capital Reserve on Consolidation', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2' },
  { id: 5, group_code: 1103, particulars: 'Capital Redemption Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.3' },
  { id: 6, group_code: 1104, particulars: 'Securities Premium', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.4' },
  { id: 7, group_code: 1105, particulars: 'Debenture Redemption Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.5' },
  { id: 8, group_code: 1106, particulars: 'General Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2' },
  { id: 9, group_code: 1107, particulars: 'Revaluation Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.6' },
  { id: 10, group_code: 1108, particulars: 'Share Options Outstanding Account', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.7' },
  { id: 11, group_code: 1109, particulars: 'MAT Credit Entitlement Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2' },
  { id: 12, group_code: 1110, particulars: 'Surplus / (Deficit) as per Profit & Loss', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.2.12' },
  { id: 13, group_code: 1111, particulars: 'Transfer to General Reserve', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true },
  { id: 14, group_code: 1112, particulars: 'Dividend on Equity Shares', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true },
  { id: 15, group_code: 1113, particulars: 'Dividend on Preference Shares', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true },
  { id: 16, group_code: 1116, particulars: 'Other Reserves', note_reference: 2, statement_category: 'Reserves and Surplus', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true },

  // (c) Money received against share warrants & application money
  { id: 17, group_code: 1201, particulars: 'Money received against share warrants', note_reference: 2, statement_category: 'Share Warrants', statement_type: 'BS', sched_iii_head: 'Shareholders’ funds', is_liability: true, guidance_note: 'GN 8.1.3' },
  { id: 18, group_code: 1251, particulars: 'Share application money pending allotment', note_reference: 2, statement_category: 'Share Application Money', statement_type: 'BS', sched_iii_head: 'Share Application Money', is_liability: true, guidance_note: 'GN 8.2.1' },
  { id: 19, group_code: 1281, particulars: 'Minority Interest', note_reference: 2, statement_category: 'Minority Interest', statement_type: 'BS', sched_iii_head: 'Minority Interest', is_liability: true },

  // ---- (2) Non-Current Liabilities ----
  // (a) Long-term borrowings
  { id: 20, group_code: 1301, particulars: 'Secured Bonds / Debentures', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 21, group_code: 1302, particulars: 'Secured Term loans from banks', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 22, group_code: 1303, particulars: 'Secured Term loans from other parties', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 23, group_code: 1304, particulars: 'Secured Deferred payment liabilities', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 24, group_code: 1305, particulars: 'Secured Deposits', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 25, group_code: 1306, particulars: 'Secured Loans and advances from related parties', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 26, group_code: 1307, particulars: 'Secured Long term maturities of finance lease obligations', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 27, group_code: 1308, particulars: 'Secured Other loans and advances', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 28, group_code: 1309, particulars: 'Unsecured Bonds / Debentures', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 29, group_code: 1310, particulars: 'Unsecured Term loans from banks', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 30, group_code: 1311, particulars: 'Unsecured Term loans from other parties', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 31, group_code: 1313, particulars: 'Unsecured Deposits', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 32, group_code: 1314, particulars: 'Unsecured Loans and advances from related parties', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 33, group_code: 1316, particulars: 'Unsecured Other loans and advances', note_reference: 3, statement_category: 'Long-term Borrowings', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },

  // (b) Deferred Tax Liabilities Net
  { id: 34, group_code: 1401, particulars: 'Deferred Tax Liabilities (Net)', note_reference: 4, statement_category: 'Deferred Tax Liabilities (Net)', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true, guidance_note: 'GN 9.8' },

  // (c) Other Long term liabilities
  { id: 35, group_code: 1501, particulars: 'Trade payables (Non-Current)', note_reference: 5, statement_category: 'Other Long Term Liabilities', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 36, group_code: 1502, particulars: 'Other Long-term Liabilities', note_reference: 5, statement_category: 'Other Long Term Liabilities', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },

  // (d) Long-term provisions
  { id: 37, group_code: 1551, particulars: 'Provision for employee benefits (Gratuity/Leave)', note_reference: 6, statement_category: 'Long-term Provisions', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },
  { id: 38, group_code: 1552, particulars: 'Other Long-term Provisions', note_reference: 6, statement_category: 'Long-term Provisions', statement_type: 'BS', sched_iii_head: 'Non-current liabilities', is_liability: true },

  // ---- (3) Current Liabilities ----
  // (a) Short-term borrowings
  { id: 39, group_code: 1601, particulars: 'Secured Loans repayable on demand from banks (CC/OD)', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 40, group_code: 1602, particulars: 'Secured Loans repayable on demand from other parties', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 41, group_code: 1603, particulars: 'Secured Loans from related parties (Demand)', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 42, group_code: 1606, particulars: 'Unsecured Loans repayable on demand from banks', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 43, group_code: 1608, particulars: 'Unsecured Loans from related parties (Demand)', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 44, group_code: 1610, particulars: 'Unsecured Other short-term loans and advances', note_reference: 7, statement_category: 'Short-term Borrowings', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },

  // (b) Trade payables
  { id: 45, group_code: 1701, particulars: 'Trade payables due to Micro and Small Enterprises (MSME)', note_reference: 8, statement_category: 'Trade Payables', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 46, group_code: 1702, particulars: 'Trade payables due to others', note_reference: 8, statement_category: 'Trade Payables', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },

  // (c) Other current liabilities
  { id: 47, group_code: 1801, particulars: 'Current maturities of long-term debt', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 48, group_code: 1802, particulars: 'Current maturities of finance lease obligations', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 49, group_code: 1803, particulars: 'Interest accrued but not due on borrowings', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 50, group_code: 1804, particulars: 'Interest accrued and due on borrowings', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 51, group_code: 1805, particulars: 'Income received in advance', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 52, group_code: 1806, particulars: 'Unpaid dividends', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 53, group_code: 1810, particulars: 'Other payables / Statutory Dues (GST, TDS, PF, ESI)', note_reference: 9, statement_category: 'Other Current Liabilities', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },

  // (d) Short-term provisions
  { id: 54, group_code: 1901, particulars: 'Provision for employee benefits (Short-term)', note_reference: 10, statement_category: 'Short-term Provisions', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },
  { id: 55, group_code: 1902, particulars: 'Provision for Income Tax and Other Provisions', note_reference: 10, statement_category: 'Short-term Provisions', statement_type: 'BS', sched_iii_head: 'Current liabilities', is_liability: true },

  // =========================================================================
  // II. ASSETS (2000s)
  // =========================================================================

  // ---- (1) Non-Current Assets ----
  // (a) Property, Plant and Equipment (PPE) & Intangibles
  { id: 56, group_code: 2001, particulars: 'Property, Plant and Equipment (Tangible Assets)', note_reference: 11, statement_category: 'Property, Plant and Equipment', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 57, group_code: 2002, particulars: 'Intangible Assets', note_reference: 12, statement_category: 'Intangible Assets', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 58, group_code: 2003, particulars: 'Capital work-in-progress (CWIP)', note_reference: 13, statement_category: 'Capital Work-in-Progress', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 59, group_code: 2004, particulars: 'Intangible assets under development', note_reference: 14, statement_category: 'Intangible Assets Under Development', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 60, group_code: 2005, particulars: 'Goodwill on Consolidation', note_reference: 12, statement_category: 'Intangible Assets', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },

  // (b) Non-current investments
  { id: 61, group_code: 2101, particulars: 'Investment property', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 62, group_code: 2102, particulars: 'Quoted Trade Investments in Equity Instruments', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 63, group_code: 2106, particulars: 'Quoted Trade Investments in Mutual Funds', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 64, group_code: 2107, particulars: 'Unquoted Trade Investments in Equity Instruments', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 65, group_code: 2122, particulars: 'Investments in Partnership Firms', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 66, group_code: 2123, particulars: 'Other Non-current Investments', note_reference: 15, statement_category: 'Non-current Investments', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },

  // (c) Deferred tax assets net
  { id: 67, group_code: 2201, particulars: 'Deferred Tax Assets (Net)', note_reference: 16, statement_category: 'Deferred Tax Assets (Net)', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },

  // (d) Long-term loans and advances
  { id: 68, group_code: 2301, particulars: 'Capital Advances', note_reference: 17, statement_category: 'Long-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 69, group_code: 2303, particulars: 'Loans and advances to related parties (Long-term)', note_reference: 17, statement_category: 'Long-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 70, group_code: 2304, particulars: 'Advance Income Tax & TDS (Net of provision)', note_reference: 17, statement_category: 'Long-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 71, group_code: 2305, particulars: 'Balances with Government Authorities (GST/Customs)', note_reference: 17, statement_category: 'Long-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 72, group_code: 2306, particulars: 'Other Loans and Advances (Secured, considered good)', note_reference: 17, statement_category: 'Long-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },

  // (e) Other non-current assets
  { id: 73, group_code: 2401, particulars: 'Long-term Trade Receivables (Secured)', note_reference: 18, statement_category: 'Other Non-current Assets', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 74, group_code: 2405, particulars: 'Bank Deposit having maturity > 12 months', note_reference: 18, statement_category: 'Other Non-current Assets', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },
  { id: 75, group_code: 2406, particulars: 'Security Deposits (Electricity, Rent, Telephone)', note_reference: 18, statement_category: 'Other Non-current Assets', statement_type: 'BS', sched_iii_head: 'Non-current assets', is_liability: false },

  // ---- (2) Current Assets ----
  // (a) Current investments
  { id: 76, group_code: 2502, particulars: 'Current Investments in Mutual Funds / Quoted Securities', note_reference: 19, statement_category: 'Current Investments', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // (b) Inventories
  { id: 77, group_code: 2601, particulars: 'Inventories (Raw Material, WIP, Finished Goods, Spares)', note_reference: 20, statement_category: 'Inventories', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // (c) Trade receivables
  { id: 78, group_code: 2701, particulars: 'Trade Receivables > 6 months (Considered good)', note_reference: 21, statement_category: 'Trade Receivables', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 79, group_code: 2702, particulars: 'Trade Receivables > 6 months (Unsecured)', note_reference: 21, statement_category: 'Trade Receivables', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 80, group_code: 2704, particulars: 'Trade Receivables Others (Considered good)', note_reference: 21, statement_category: 'Trade Receivables', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 81, group_code: 2705, particulars: 'Trade Receivables Others (Unsecured)', note_reference: 21, statement_category: 'Trade Receivables', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 82, group_code: 2707, particulars: 'Less: Provision for doubtful trade receivables', note_reference: 21, statement_category: 'Trade Receivables', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // (d) Cash and cash equivalents
  { id: 83, group_code: 2801, particulars: 'Cash on hand', note_reference: 22, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 84, group_code: 2802, particulars: 'Cheques, drafts on hand', note_reference: 22, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 85, group_code: 2803, particulars: 'Balances with banks in current accounts', note_reference: 22, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 86, group_code: 2804, particulars: 'Bank Deposit having maturity < 3 months', note_reference: 22, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 87, group_code: 2805, particulars: 'Bank Deposit having maturity 3 to 12 months', note_reference: 22, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // (e) Short-term loans and advances
  { id: 88, group_code: 2901, particulars: 'Short-term Loans and advances to related parties', note_reference: 23, statement_category: 'Short-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 89, group_code: 2902, particulars: 'Security Deposits (Current)', note_reference: 23, statement_category: 'Short-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 90, group_code: 2903, particulars: 'Advance Income Tax and TDS (Current)', note_reference: 23, statement_category: 'Short-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 91, group_code: 2904, particulars: 'Balances with Government Authorities (GST Input Credit)', note_reference: 23, statement_category: 'Short-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },
  { id: 92, group_code: 2906, particulars: 'Other short-term loans and advances', note_reference: 23, statement_category: 'Short-term Loans and Advances', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // (f) Other current assets
  { id: 93, group_code: 2951, particulars: 'Other Current Assets (Prepaid Expenses, Accrued Income)', note_reference: 24, statement_category: 'Other Current Assets', statement_type: 'BS', sched_iii_head: 'Current assets', is_liability: false },

  // =========================================================================
  // III. STATEMENT OF PROFIT AND LOSS (3000s & 4000s)
  // =========================================================================

  // ---- Revenue ----
  { id: 94, group_code: 3001, particulars: 'Sale of products', note_reference: 25, statement_category: 'Revenue from Operations', statement_type: 'PL' },
  { id: 95, group_code: 3002, particulars: 'Sale of services', note_reference: 25, statement_category: 'Revenue from Operations', statement_type: 'PL' },
  { id: 96, group_code: 3003, particulars: 'Other operating revenues', note_reference: 25, statement_category: 'Revenue from Operations', statement_type: 'PL' },

  // ---- Other Income ----
  { id: 97, group_code: 3101, particulars: 'Interest Income', note_reference: 26, statement_category: 'Other Income', statement_type: 'PL' },
  { id: 98, group_code: 3102, particulars: 'Dividend Income', note_reference: 26, statement_category: 'Other Income', statement_type: 'PL' },
  { id: 99, group_code: 3103, particulars: 'Net gain/loss on sale of investments', note_reference: 26, statement_category: 'Other Income', statement_type: 'PL' },
  { id: 100, group_code: 3104, particulars: 'Other non-operating income (net of expenses)', note_reference: 26, statement_category: 'Other Income', statement_type: 'PL' },

  // ---- Expenses ----
  { id: 101, group_code: 4001, particulars: 'Cost of material consumed', note_reference: 27, statement_category: 'Cost of Materials Consumed', statement_type: 'PL' },
  { id: 102, group_code: 4101, particulars: 'Purchases of stock in trade', note_reference: 28, statement_category: 'Purchases of Stock-in-Trade', statement_type: 'PL' },
  { id: 103, group_code: 4201, particulars: 'Change in Inventories of WIP, Finished Goods & Stock-in-Trade', note_reference: 29, statement_category: 'Changes in Inventories', statement_type: 'PL' },

  // Employee benefit expenses
  { id: 104, group_code: 4301, particulars: 'Salaries and wages', note_reference: 30, statement_category: 'Employee Benefit Expenses', statement_type: 'PL' },
  { id: 105, group_code: 4302, particulars: 'Contribution to provident and other funds', note_reference: 30, statement_category: 'Employee Benefit Expenses', statement_type: 'PL' },
  { id: 106, group_code: 4303, particulars: 'Expense on ESOP and ESPP', note_reference: 30, statement_category: 'Employee Benefit Expenses', statement_type: 'PL' },
  { id: 107, group_code: 4304, particulars: 'Staff welfare expenses', note_reference: 30, statement_category: 'Employee Benefit Expenses', statement_type: 'PL' },

  // Finance costs
  { id: 108, group_code: 4401, particulars: 'Interest expense', note_reference: 31, statement_category: 'Finance Costs', statement_type: 'PL' },
  { id: 109, group_code: 4402, particulars: 'Other borrowing costs / Bank charges', note_reference: 31, statement_category: 'Finance Costs', statement_type: 'PL' },
  { id: 110, group_code: 4403, particulars: 'Applicable net gain/loss on foreign currency transactions', note_reference: 31, statement_category: 'Finance Costs', statement_type: 'PL' },

  // Depreciation and amortization
  { id: 111, group_code: 4501, particulars: 'Depreciation and amortization expenses', note_reference: 32, statement_category: 'Depreciation and Amortization', statement_type: 'PL' },

  // Other expenses
  { id: 112, group_code: 4601, particulars: 'Auditors\' Remuneration', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 113, group_code: 4602, particulars: 'Manufacturing Expenses', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 114, group_code: 4604, particulars: 'Power and fuel', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 115, group_code: 4605, particulars: 'Rent', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 116, group_code: 4606, particulars: 'Repairs to buildings', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 117, group_code: 4607, particulars: 'Repairs to machinery', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 118, group_code: 4609, particulars: 'Insurance', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 119, group_code: 4610, particulars: 'Rates and taxes', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 120, group_code: 4611, particulars: 'Selling & Distribution Expenses', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 121, group_code: 4612, particulars: 'Other Business Administrative Expenses', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 122, group_code: 4613, particulars: 'Travelling Expenses', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },
  { id: 123, group_code: 4614, particulars: 'Miscellaneous expenses', note_reference: 33, statement_category: 'Other Expenses', statement_type: 'PL' },

  // Exceptional & Extraordinary
  { id: 124, group_code: 4701, particulars: 'Exceptional items', note_reference: 34, statement_category: 'Exceptional Items', statement_type: 'PL' },
  { id: 125, group_code: 4751, particulars: 'Extraordinary items', note_reference: 34, statement_category: 'Extraordinary Items', statement_type: 'PL' },

  // Tax Expense
  { id: 126, group_code: 4801, particulars: 'Current Tax', note_reference: 35, statement_category: 'Tax Expense', statement_type: 'PL' },
  { id: 127, group_code: 4802, particulars: 'Deferred Tax', note_reference: 35, statement_category: 'Tax Expense', statement_type: 'PL' },
  { id: 128, group_code: 4803, particulars: 'Prior Period Tax Adjustments', note_reference: 35, statement_category: 'Tax Expense', statement_type: 'PL' },
  { id: 129, group_code: 4804, particulars: 'Excess/Short Provision Written back/off', note_reference: 35, statement_category: 'Tax Expense', statement_type: 'PL' },

  // Discontinuing operations
  { id: 130, group_code: 4901, particulars: 'Profit/Loss from discontinuing operations before tax', note_reference: 36, statement_category: 'Discontinuing Operations', statement_type: 'PL' },
  { id: 131, group_code: 4902, particulars: 'Tax expense of discontinuing operations', note_reference: 36, statement_category: 'Discontinuing Operations', statement_type: 'PL' },
];

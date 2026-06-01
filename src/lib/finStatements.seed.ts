// ============================================================
// Financial Statements Module — Master Group Codes Seed Data
// Based on Schedule III of the Indian Companies Act, 2013
// ============================================================

import type { MasterGroupCode } from './finStatements.types';

/**
 * Immutable dictionary of Schedule III line items.
 * Code convention:
 *   1XXX → Balance Sheet – Assets
 *   2XXX → Balance Sheet – Equity & Liabilities
 *   3XXX → Profit & Loss – Income
 *   4XXX → Profit & Loss – Expenses
 */
export const MASTER_GROUP_CODES_SEED: MasterGroupCode[] = [
  // ========================================================
  // BALANCE SHEET — ASSETS
  // ========================================================

  // ---- Note 1: Property, Plant and Equipment ----
  { id: 1,  group_code: 1001, particulars: 'Land',                                   note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 2,  group_code: 1002, particulars: 'Buildings',                               note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 3,  group_code: 1003, particulars: 'Plant and Equipment',                     note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 4,  group_code: 1004, particulars: 'Furniture and Fixtures',                  note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 5,  group_code: 1005, particulars: 'Vehicles',                                note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 6,  group_code: 1006, particulars: 'Office Equipment',                        note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 7,  group_code: 1007, particulars: 'Computers and Data Processing Units',     note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },
  { id: 8,  group_code: 1008, particulars: 'Leasehold Improvements',                  note_reference: 1,  statement_category: 'Property, Plant and Equipment',        statement_type: 'BS' },

  // ---- Note 2: Intangible Assets ----
  { id: 9,  group_code: 1011, particulars: 'Goodwill',                                note_reference: 2,  statement_category: 'Intangible Assets',                    statement_type: 'BS' },
  { id: 10, group_code: 1012, particulars: 'Software',                                note_reference: 2,  statement_category: 'Intangible Assets',                    statement_type: 'BS' },
  { id: 11, group_code: 1013, particulars: 'Patents and Copyrights',                  note_reference: 2,  statement_category: 'Intangible Assets',                    statement_type: 'BS' },
  { id: 12, group_code: 1014, particulars: 'Trademarks and Licences',                 note_reference: 2,  statement_category: 'Intangible Assets',                    statement_type: 'BS' },

  // ---- Note 3: Capital Work-in-Progress ----
  { id: 13, group_code: 1021, particulars: 'Capital Work-in-Progress',                note_reference: 3,  statement_category: 'Capital Work-in-Progress',             statement_type: 'BS' },

  // ---- Note 4: Intangible Assets under Development ----
  { id: 14, group_code: 1031, particulars: 'Intangible Assets under Development',     note_reference: 4,  statement_category: 'Intangible Assets under Development',  statement_type: 'BS' },

  // ---- Note 5: Non-Current Investments ----
  { id: 15, group_code: 1041, particulars: 'Investments in Equity Instruments',       note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },
  { id: 16, group_code: 1042, particulars: 'Investments in Preference Shares',        note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },
  { id: 17, group_code: 1043, particulars: 'Investments in Government Securities',    note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },
  { id: 18, group_code: 1044, particulars: 'Investments in Debentures or Bonds',      note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },
  { id: 19, group_code: 1045, particulars: 'Investments in Mutual Funds',             note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },
  { id: 20, group_code: 1046, particulars: 'Investments in Partnership Firms',        note_reference: 5,  statement_category: 'Non-Current Investments',              statement_type: 'BS' },

  // ---- Note 6: Non-Current Loans ----
  { id: 21, group_code: 1051, particulars: 'Security Deposits',                       note_reference: 6,  statement_category: 'Long-term Loans and Advances',         statement_type: 'BS' },
  { id: 22, group_code: 1052, particulars: 'Loans to Related Parties',                note_reference: 6,  statement_category: 'Long-term Loans and Advances',         statement_type: 'BS' },
  { id: 23, group_code: 1053, particulars: 'Loans to Employees (Non-Current)',        note_reference: 6,  statement_category: 'Long-term Loans and Advances',         statement_type: 'BS' },

  // ---- Note 7: Other Non-Current Financial Assets ----
  { id: 24, group_code: 1061, particulars: 'Bank Deposits (maturity > 12 months)',    note_reference: 7,  statement_category: 'Other Non-Current Financial Assets',   statement_type: 'BS' },
  { id: 25, group_code: 1062, particulars: 'Earnest Money Deposits',                  note_reference: 7,  statement_category: 'Other Non-Current Financial Assets',   statement_type: 'BS' },

  // ---- Note 8: Deferred Tax Assets (Net) ----
  { id: 26, group_code: 1071, particulars: 'Deferred Tax Assets (Net)',               note_reference: 8,  statement_category: 'Deferred Tax Assets (Net)',            statement_type: 'BS' },

  // ---- Note 9: Other Non-Current Assets ----
  { id: 27, group_code: 1081, particulars: 'Capital Advances',                        note_reference: 9,  statement_category: 'Other Non-Current Assets',             statement_type: 'BS' },
  { id: 28, group_code: 1082, particulars: 'Prepaid Expenses (Non-Current)',          note_reference: 9,  statement_category: 'Other Non-Current Assets',             statement_type: 'BS' },

  // ---- Note 10: Inventories ----
  { id: 29, group_code: 1101, particulars: 'Raw Materials',                           note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },
  { id: 30, group_code: 1102, particulars: 'Work-in-Progress',                        note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },
  { id: 31, group_code: 1103, particulars: 'Finished Goods',                          note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },
  { id: 32, group_code: 1104, particulars: 'Stock-in-Trade (Traded Goods)',            note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },
  { id: 33, group_code: 1105, particulars: 'Stores and Spares',                       note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },
  { id: 34, group_code: 1106, particulars: 'Loose Tools',                             note_reference: 10, statement_category: 'Inventories',                          statement_type: 'BS' },

  // ---- Note 11: Trade Receivables ----
  { id: 35, group_code: 1111, particulars: 'Trade Receivables – Considered Good (Secured)',   note_reference: 11, statement_category: 'Trade Receivables',            statement_type: 'BS' },
  { id: 36, group_code: 1112, particulars: 'Trade Receivables – Considered Good (Unsecured)', note_reference: 11, statement_category: 'Trade Receivables',           statement_type: 'BS' },
  { id: 37, group_code: 1113, particulars: 'Trade Receivables – Credit Impaired',            note_reference: 11, statement_category: 'Trade Receivables',            statement_type: 'BS' },
  { id: 38, group_code: 1114, particulars: 'Less: Allowance for Doubtful Debts',              note_reference: 11, statement_category: 'Trade Receivables',            statement_type: 'BS' },

  // ---- Note 12: Cash and Cash Equivalents ----
  { id: 39, group_code: 1121, particulars: 'Cash on Hand',                            note_reference: 12, statement_category: 'Cash and Cash Equivalents',            statement_type: 'BS' },
  { id: 40, group_code: 1122, particulars: 'Balances with Banks – Current Accounts',  note_reference: 12, statement_category: 'Cash and Cash Equivalents',            statement_type: 'BS' },
  { id: 41, group_code: 1123, particulars: 'Balances with Banks – Deposit Accounts (< 3 months)', note_reference: 12, statement_category: 'Cash and Cash Equivalents', statement_type: 'BS' },
  { id: 42, group_code: 1124, particulars: 'Cheques / Drafts on Hand',                note_reference: 12, statement_category: 'Cash and Cash Equivalents',            statement_type: 'BS' },

  // ---- Note 13: Bank Balances other than Cash Equivalents ----
  { id: 43, group_code: 1131, particulars: 'Fixed Deposits (maturity 3-12 months)',    note_reference: 13, statement_category: 'Bank Balances other than Cash Equivalents', statement_type: 'BS' },
  { id: 44, group_code: 1132, particulars: 'Earmarked Balances with Banks',           note_reference: 13, statement_category: 'Bank Balances other than Cash Equivalents', statement_type: 'BS' },

  // ---- Note 14: Current Loans ----
  { id: 45, group_code: 1141, particulars: 'Loans to Employees (Current)',            note_reference: 14, statement_category: 'Current Loans',                        statement_type: 'BS' },
  { id: 46, group_code: 1142, particulars: 'Loans to Related Parties (Current)',      note_reference: 14, statement_category: 'Current Loans',                        statement_type: 'BS' },

  // ---- Note 15: Other Current Financial Assets ----
  { id: 47, group_code: 1151, particulars: 'Interest Accrued on Deposits',            note_reference: 15, statement_category: 'Other Current Financial Assets',       statement_type: 'BS' },
  { id: 48, group_code: 1152, particulars: 'Other Receivables',                       note_reference: 15, statement_category: 'Other Current Financial Assets',       statement_type: 'BS' },

  // ---- Note 16: Current Tax Assets ----
  { id: 49, group_code: 1161, particulars: 'Advance Income Tax and TDS Receivable',   note_reference: 16, statement_category: 'Current Tax Assets (Net)',             statement_type: 'BS' },
  { id: 50, group_code: 1162, particulars: 'GST Input Credit Receivable',             note_reference: 16, statement_category: 'Current Tax Assets (Net)',             statement_type: 'BS' },

  // ---- Note 17: Other Current Assets ----
  { id: 51, group_code: 1171, particulars: 'Prepaid Expenses (Current)',              note_reference: 17, statement_category: 'Other Current Assets',                 statement_type: 'BS' },
  { id: 52, group_code: 1172, particulars: 'Advances to Suppliers',                   note_reference: 17, statement_category: 'Other Current Assets',                 statement_type: 'BS' },
  { id: 53, group_code: 1173, particulars: 'Balance with Government Authorities',     note_reference: 17, statement_category: 'Other Current Assets',                 statement_type: 'BS' },

  // ========================================================
  // BALANCE SHEET — EQUITY & LIABILITIES
  // ========================================================

  // ---- Note 18: Share Capital ----
  { id: 54, group_code: 2001, particulars: 'Authorised Share Capital',                note_reference: 18, statement_category: 'Share Capital',                        statement_type: 'BS' },
  { id: 55, group_code: 2002, particulars: 'Issued, Subscribed and Paid-up Capital',  note_reference: 18, statement_category: 'Share Capital',                        statement_type: 'BS' },

  // ---- Note 19: Reserves and Surplus ----
  { id: 56, group_code: 2011, particulars: 'Securities Premium',                      note_reference: 19, statement_category: 'Reserves and Surplus',                 statement_type: 'BS' },
  { id: 57, group_code: 2012, particulars: 'General Reserve',                         note_reference: 19, statement_category: 'Reserves and Surplus',                 statement_type: 'BS' },
  { id: 58, group_code: 2013, particulars: 'Retained Earnings (Surplus in P&L)',      note_reference: 19, statement_category: 'Reserves and Surplus',                 statement_type: 'BS' },

  // ---- Note 20: Other Equity ----
  { id: 59, group_code: 2021, particulars: 'Other Comprehensive Income',              note_reference: 20, statement_category: 'Other Equity',                         statement_type: 'BS' },

  // ---- Note 21: Long-term Borrowings ----
  { id: 60, group_code: 2101, particulars: 'Term Loans from Banks (Secured)',         note_reference: 21, statement_category: 'Long-term Borrowings',                 statement_type: 'BS' },
  { id: 61, group_code: 2102, particulars: 'Term Loans from Banks (Unsecured)',       note_reference: 21, statement_category: 'Long-term Borrowings',                 statement_type: 'BS' },
  { id: 62, group_code: 2103, particulars: 'Loans from Related Parties',              note_reference: 21, statement_category: 'Long-term Borrowings',                 statement_type: 'BS' },
  { id: 63, group_code: 2104, particulars: 'Debentures / Bonds',                      note_reference: 21, statement_category: 'Long-term Borrowings',                 statement_type: 'BS' },

  // ---- Note 22: Deferred Tax Liabilities (Net) ----
  { id: 64, group_code: 2111, particulars: 'Deferred Tax Liabilities (Net)',          note_reference: 22, statement_category: 'Deferred Tax Liabilities (Net)',       statement_type: 'BS' },

  // ---- Note 23: Other Non-Current Liabilities ----
  { id: 65, group_code: 2121, particulars: 'Other Non-Current Liabilities',           note_reference: 23, statement_category: 'Other Non-Current Liabilities',        statement_type: 'BS' },

  // ---- Note 24: Non-Current Provisions ----
  { id: 66, group_code: 2131, particulars: 'Provision for Employee Benefits (Non-Current)', note_reference: 24, statement_category: 'Non-Current Provisions',         statement_type: 'BS' },
  { id: 67, group_code: 2132, particulars: 'Other Non-Current Provisions',            note_reference: 24, statement_category: 'Non-Current Provisions',               statement_type: 'BS' },

  // ---- Note 25: Short-term Borrowings ----
  { id: 68, group_code: 2201, particulars: 'Secured Loans repayable on demand from Banks', note_reference: 25, statement_category: 'Short-term Borrowings',          statement_type: 'BS' },
  { id: 69, group_code: 2202, particulars: 'Unsecured Loans from Directors / Others', note_reference: 25, statement_category: 'Short-term Borrowings',               statement_type: 'BS' },
  { id: 70, group_code: 2203, particulars: 'Working Capital Loans from Banks',        note_reference: 25, statement_category: 'Short-term Borrowings',               statement_type: 'BS' },

  // ---- Note 26: Trade Payables ----
  { id: 71, group_code: 2211, particulars: 'Trade Payables – Micro & Small Enterprises',     note_reference: 26, statement_category: 'Trade Payables',               statement_type: 'BS' },
  { id: 72, group_code: 2212, particulars: 'Trade Payables – Other than Micro & Small',      note_reference: 26, statement_category: 'Trade Payables',               statement_type: 'BS' },

  // ---- Note 27: Other Current Financial Liabilities ----
  { id: 73, group_code: 2221, particulars: 'Current Maturities of Long-term Debt',    note_reference: 27, statement_category: 'Other Current Financial Liabilities',  statement_type: 'BS' },
  { id: 74, group_code: 2222, particulars: 'Interest Accrued but not Due',            note_reference: 27, statement_category: 'Other Current Financial Liabilities',  statement_type: 'BS' },
  { id: 75, group_code: 2223, particulars: 'Unpaid Dividends',                        note_reference: 27, statement_category: 'Other Current Financial Liabilities',  statement_type: 'BS' },
  { id: 76, group_code: 2224, particulars: 'Other Payables (Statutory Dues)',         note_reference: 27, statement_category: 'Other Current Financial Liabilities',  statement_type: 'BS' },

  // ---- Note 28: Other Current Liabilities ----
  { id: 77, group_code: 2231, particulars: 'Advances from Customers',                 note_reference: 28, statement_category: 'Other Current Liabilities',            statement_type: 'BS' },
  { id: 78, group_code: 2232, particulars: 'Statutory Dues Payable (GST, TDS, PF, ESI)', note_reference: 28, statement_category: 'Other Current Liabilities',       statement_type: 'BS' },
  { id: 79, group_code: 2233, particulars: 'Other Current Liabilities',               note_reference: 28, statement_category: 'Other Current Liabilities',            statement_type: 'BS' },

  // ---- Note 29: Current Provisions ----
  { id: 80, group_code: 2241, particulars: 'Provision for Employee Benefits (Current)', note_reference: 29, statement_category: 'Current Provisions',                statement_type: 'BS' },
  { id: 81, group_code: 2242, particulars: 'Provision for Income Tax',                note_reference: 29, statement_category: 'Current Provisions',                   statement_type: 'BS' },
  { id: 82, group_code: 2243, particulars: 'Other Current Provisions',                note_reference: 29, statement_category: 'Current Provisions',                   statement_type: 'BS' },

  // ========================================================
  // PROFIT & LOSS — INCOME
  // ========================================================

  // ---- Note 30: Revenue from Operations ----
  { id: 83, group_code: 3001, particulars: 'Sale of Products',                        note_reference: 30, statement_category: 'Revenue from Operations',              statement_type: 'PL' },
  { id: 84, group_code: 3002, particulars: 'Sale of Services',                        note_reference: 30, statement_category: 'Revenue from Operations',              statement_type: 'PL' },
  { id: 85, group_code: 3003, particulars: 'Other Operating Revenue',                 note_reference: 30, statement_category: 'Revenue from Operations',              statement_type: 'PL' },

  // ---- Note 31: Other Income ----
  { id: 86, group_code: 3011, particulars: 'Interest Income',                         note_reference: 31, statement_category: 'Other Income',                         statement_type: 'PL' },
  { id: 87, group_code: 3012, particulars: 'Dividend Income',                         note_reference: 31, statement_category: 'Other Income',                         statement_type: 'PL' },
  { id: 88, group_code: 3013, particulars: 'Rental Income',                           note_reference: 31, statement_category: 'Other Income',                         statement_type: 'PL' },
  { id: 89, group_code: 3014, particulars: 'Net Gain on Sale of Assets',              note_reference: 31, statement_category: 'Other Income',                         statement_type: 'PL' },
  { id: 90, group_code: 3015, particulars: 'Miscellaneous Income',                    note_reference: 31, statement_category: 'Other Income',                         statement_type: 'PL' },

  // ========================================================
  // PROFIT & LOSS — EXPENSES
  // ========================================================

  // ---- Note 32: Cost of Materials Consumed ----
  { id: 91,  group_code: 4001, particulars: 'Cost of Materials Consumed',              note_reference: 32, statement_category: 'Cost of Materials Consumed',          statement_type: 'PL' },

  // ---- Note 33: Purchases of Stock-in-Trade ----
  { id: 92,  group_code: 4011, particulars: 'Purchases of Stock-in-Trade',             note_reference: 33, statement_category: 'Purchases of Stock-in-Trade',         statement_type: 'PL' },

  // ---- Note 34: Changes in Inventories ----
  { id: 93,  group_code: 4021, particulars: 'Changes in Inventories of FG, WIP and Stock-in-Trade', note_reference: 34, statement_category: 'Changes in Inventories', statement_type: 'PL' },

  // ---- Note 35: Employee Benefits Expense ----
  { id: 94,  group_code: 4031, particulars: 'Salaries and Wages',                      note_reference: 35, statement_category: 'Employee Benefits Expense',           statement_type: 'PL' },
  { id: 95,  group_code: 4032, particulars: 'Contribution to Provident and Other Funds', note_reference: 35, statement_category: 'Employee Benefits Expense',        statement_type: 'PL' },
  { id: 96,  group_code: 4033, particulars: 'Staff Welfare Expenses',                  note_reference: 35, statement_category: 'Employee Benefits Expense',           statement_type: 'PL' },
  { id: 97,  group_code: 4034, particulars: 'Bonus and Ex-gratia',                     note_reference: 35, statement_category: 'Employee Benefits Expense',           statement_type: 'PL' },

  // ---- Note 36: Finance Costs ----
  { id: 98,  group_code: 4041, particulars: 'Interest on Term Loans',                  note_reference: 36, statement_category: 'Finance Costs',                       statement_type: 'PL' },
  { id: 99,  group_code: 4042, particulars: 'Interest on Working Capital',             note_reference: 36, statement_category: 'Finance Costs',                       statement_type: 'PL' },
  { id: 100, group_code: 4043, particulars: 'Bank Charges',                            note_reference: 36, statement_category: 'Finance Costs',                       statement_type: 'PL' },
  { id: 101, group_code: 4044, particulars: 'Other Borrowing Costs',                   note_reference: 36, statement_category: 'Finance Costs',                       statement_type: 'PL' },

  // ---- Note 37: Depreciation and Amortisation ----
  { id: 102, group_code: 4051, particulars: 'Depreciation on Tangible Assets',         note_reference: 37, statement_category: 'Depreciation and Amortisation',       statement_type: 'PL' },
  { id: 103, group_code: 4052, particulars: 'Amortisation on Intangible Assets',       note_reference: 37, statement_category: 'Depreciation and Amortisation',       statement_type: 'PL' },

  // ---- Note 38: Other Expenses ----
  { id: 104, group_code: 4101, particulars: 'Rent',                                    note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 105, group_code: 4102, particulars: 'Rates and Taxes',                         note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 106, group_code: 4103, particulars: 'Repairs and Maintenance – Building',      note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 107, group_code: 4104, particulars: 'Repairs and Maintenance – Plant & Machinery', note_reference: 38, statement_category: 'Other Expenses',                 statement_type: 'PL' },
  { id: 108, group_code: 4105, particulars: 'Repairs and Maintenance – Others',        note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 109, group_code: 4106, particulars: 'Insurance',                               note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 110, group_code: 4107, particulars: 'Travelling and Conveyance',               note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 111, group_code: 4108, particulars: 'Communication Expenses',                  note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 112, group_code: 4109, particulars: 'Printing and Stationery',                 note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 113, group_code: 4110, particulars: 'Legal and Professional Fees',             note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 114, group_code: 4111, particulars: 'Auditor Remuneration',                    note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 115, group_code: 4112, particulars: 'Electricity and Power',                   note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 116, group_code: 4113, particulars: 'Freight and Forwarding',                  note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 117, group_code: 4114, particulars: 'Advertisement and Business Promotion',    note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 118, group_code: 4115, particulars: 'Bad Debts Written Off',                   note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 119, group_code: 4116, particulars: 'Loss on Sale / Discard of Assets',        note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 120, group_code: 4117, particulars: 'Corporate Social Responsibility (CSR)',   note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },
  { id: 121, group_code: 4118, particulars: 'Miscellaneous Expenses',                  note_reference: 38, statement_category: 'Other Expenses',                      statement_type: 'PL' },

  // ---- Note 39: Tax Expense ----
  { id: 122, group_code: 4201, particulars: 'Current Tax',                             note_reference: 39, statement_category: 'Tax Expense',                         statement_type: 'PL' },
  { id: 123, group_code: 4202, particulars: 'Deferred Tax',                            note_reference: 39, statement_category: 'Tax Expense',                         statement_type: 'PL' },
  { id: 124, group_code: 4203, particulars: 'Tax Adjustment of Earlier Years',         note_reference: 39, statement_category: 'Tax Expense',                         statement_type: 'PL' },
];

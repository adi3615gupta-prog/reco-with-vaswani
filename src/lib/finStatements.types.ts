// ============================================================
// Financial Statements Module — Data Models
// Schedule III, Indian Companies Act Compliance
// ============================================================

/**
 * Table 1: master_group_codes
 * Immutable system dictionary. Each row maps a 4-digit code to a
 * Schedule III line-item, its parent note reference, the statement
 * category label, and which statement it belongs to.
 *
 * Code ranges:
 *   1XXX → Balance Sheet (Assets)
 *   2XXX → Balance Sheet (Equity + Liabilities)
 *   3XXX → Profit & Loss (Income)
 *   4XXX → Profit & Loss (Expenses)
 */
export interface MasterGroupCode {
  id: number;
  group_code: number;
  particulars: string;
  note_reference: number;
  statement_category: string;
  statement_type: 'BS' | 'PL';
}

/**
 * Table 2: client_setup
 * Stores company identity, auditor credentials, and signatory
 * details used on every exported page header/footer.
 */
export interface ClientSetup {
  client_id: string;
  company_name: string;
  cin_number: string;
  registered_address: string;
  audit_firm_name: string;
  firm_reg_no: string;
  partner_name: string;
  membership_no: string;
  udin: string;
  director_1_name: string;
  director_2_name: string;
}

/**
 * Table 3: trial_balance_data
 * Each row is a single ledger imported from a raw Trial Balance CSV.
 * The `mapped_group_code` is set by the user via the mapping UI and
 * links this ledger to a MasterGroupCode entry.
 */
export interface TrialBalanceEntry {
  id: string;
  client_id: string;
  ledger_name: string;
  cy_balance: number;
  py_balance: number;
  mapped_group_code: number | null;
  tally_parent_group?: string;
  tally_primary_group?: string;
  suggested_group_code?: number;
  suggestion_confidence?: number;
}

/**
 * Table 4: fixed_assets_register
 * Stores the Fixed-Asset block data required by Note 2 / Note 3
 * (Tangible & Intangible assets). Depreciation values feed the
 * Cash-Flow indirect-method calculation.
 */
export interface FixedAssetEntry {
  id: string;
  client_id: string;
  asset_class: string;
  gross_block_opening: number;
  additions: number;
  deductions: number;
  depreciation_opening: number;
  depreciation_for_year: number;
}

// ----- Derived / helper types -----

/** Summary row after aggregating TB entries into a single Note. */
export interface NoteAggregate {
  note_reference: number;
  note_title: string;
  statement_type: 'BS' | 'PL';
  line_items: {
    group_code: number;
    particulars: string;
    cy_total: number;
    py_total: number;
  }[];
  cy_grand_total: number;
  py_grand_total: number;
}

/** Balance-check result for the Control Dashboard banner. */
export interface BalanceCheck {
  total_assets: number;
  total_equity_liabilities: number;
  difference: number;
  is_balanced: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onDownloadProgress: (callback: (info: any) => void) => void;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      restartApp: () => Promise<void>;
      fetchTallyData: (port: number, xmlPayload: string) => Promise<string>;
    };
  }
}

/** Mapping validation warning. */
export interface MappingWarning {
  ledger_name: string;
  mapped_code: number;
  warning_type: 'DEBIT_ON_INCOME' | 'CREDIT_ON_EXPENSE' | 'BS_PL_MISMATCH';
  message: string;
}

// ============================================================
// Financial Statements Module — Data Models
// Schedule III (Companies Act 2013) & Non-Corporate (ICAI June 2022)
// ============================================================

export type EntityClassificationMode = 'corporate' | 'non_corporate';
export type CorporateSubType = 'pvt_ltd' | 'ltd' | 'opc' | 'sec8';
export type NonCorporateSubType = 'proprietorship' | 'partnership' | 'llp' | 'trust';
export type NonCorporateLevel = 'Level I' | 'Level II' | 'Level III' | 'Level IV';
export type DenominationUnit = 'in_rupees' | 'hundreds' | 'thousands' | 'lacs' | 'crores';
export type PresentationFormat = 'vertical' | 'horizontal';

/**
 * Table 1: master_group_codes
 * Standard 4-digit code mapping from Schedule 3 & Non-Corporate taxonomies.
 *
 * Official Schedule III Code Ranges:
 *   1001–1902 → Balance Sheet: Equity & Liabilities
 *   2001–2951 → Balance Sheet: Assets
 *   3001–3105 → Statement of Profit & Loss: Revenue & Other Income
 *   4001–4902 → Statement of Profit & Loss: Expenses & Taxes
 */
export interface MasterGroupCode {
  id: number;
  group_code: number;
  particulars: string;
  note_reference: number;
  statement_category: string;
  statement_type: 'BS' | 'PL';
  sub_category?: string;
  is_liability?: boolean;
  guidance_note?: string; // e.g. "GN 8.1.3", "GN 8.2.1", "GN 9.8"
  sched_iii_head?: string;
}

/**
 * Table 2: client_setup
 * Stores company identity, auditor credentials, entity type, and presentation preferences.
 */
export interface ClientSetup {
  client_id: string;
  company_name: string;
  cin_number: string;
  registered_address: string;
  entity_type: EntityClassificationMode;
  corporate_sub_type?: CorporateSubType;
  non_corporate_sub_type?: NonCorporateSubType;
  financial_year: string; // e.g. "2024-25"
  assessment_year: string; // e.g. "2025-26"
  turnover_preceding_year: number; // in Rupees
  borrowings_preceding_year: number; // in Rupees
  denomination: DenominationUnit;
  presentation_format: PresentationFormat;
  
  // Statutory / Audit details
  audit_firm_name: string;
  firm_reg_no: string;
  partner_name: string;
  membership_no: string;
  udin: string;
  place_of_signature: string;
  date_of_signature: string;
  
  // Signatories
  director_1_name: string;
  director_1_din?: string;
  director_2_name: string;
  director_2_din?: string;
}

/**
 * Accounting Standards (AS) Applicability for Non-Corporate Entities (ICAI June 2022 TG)
 */
export interface AsApplicabilityItem {
  as_number: string;
  as_title: string;
  applicability: 'Applicable' | 'Applicable with Exemptions' | 'Not Applicable';
  exemption_notes?: string;
}

export interface LevelClassificationResult {
  level: NonCorporateLevel;
  turnover: number;
  borrowings: number;
  summary: string;
  standards: AsApplicabilityItem[];
  is_cash_flow_mandatory: boolean;
  is_segment_reporting_mandatory: boolean;
  is_deferred_tax_applicable: boolean;
}

/**
 * Table 3: trial_balance_data
 * Each row is a single ledger imported from Tally (port 9000) or CSV/Excel.
 */
export interface TrialBalanceEntry {
  id: string;
  client_id: string;
  ledger_name: string;
  cy_balance: number; // Positive = Debit, Negative = Credit
  py_balance: number;
  mapped_group_code: number | null;
  tally_parent_group?: string;
  tally_primary_group?: string;
  suggested_group_code?: number;
  suggestion_confidence?: number;
  note_grouping?: string;
  sub_note_grouping?: string;
  is_inter_branch?: boolean;
}

/**
 * Table 4: fixed_assets_register
 * Dual-depreciation Fixed Asset Register:
 * 1. Companies Act 2013 Schedule II (Useful Life, SLM/WDV, Residual value 5%)
 * 2. Income Tax Act 1961 Section 32 (Block-wise WDV, >180 days / <180 days additions)
 */
export interface FixedAssetEntry {
  id: string;
  client_id: string;
  asset_name: string;
  asset_class: string; // Building, Plant & Machinery, Computers, Vehicles, etc.
  block_rate_tax: number; // e.g. 10, 15, 40 %
  gross_block_opening: number;
  additions_more_180_days: number;
  additions_less_180_days: number;
  deductions: number;
  gross_block_closing: number;
  depreciation_opening: number;
  depreciation_for_year_books: number;
  depreciation_for_year_tax: number;
  accumulated_depreciation_closing: number;
  net_block_closing: number;
}

/**
 * Partners' Capital Account Schedule (for Partnerships & LLPs)
 */
export interface PartnerCapitalEntry {
  id: string;
  partner_name: string;
  profit_share_percent: number;
  opening_capital: number;
  additions_capital: number;
  withdrawals_drawings: number;
  interest_on_capital: number;
  partner_salary_remuneration: number;
  share_of_profit_loss: number;
  closing_capital: number;
}

/**
 * 11 Statutory MCA Financial Ratios (MCA Notification 24-March-2021)
 */
export interface FinancialRatio {
  id: string;
  ratio_name: string;
  numerator_label: string;
  denominator_label: string;
  cy_value: number;
  py_value: number;
  variance_percent: number;
  variance_reason?: string;
  is_flagged: boolean; // Flagged when variance > 25%
}

/**
 * Aging schedules for Trade Payables, Trade Receivables, CWIP
 */
export interface AgingScheduleBucket {
  category: string;
  less_than_1yr: number;
  one_to_two_yrs: number;
  two_to_three_yrs: number;
  more_than_three_yrs: number;
  unbilled_or_not_due: number;
  total: number;
}

export interface ReceivableAgingBucket {
  category: string;
  unbilled_or_not_due: number;
  less_than_6m: number;
  six_m_to_1yr: number;
  one_to_two_yrs: number;
  two_to_three_yrs: number;
  more_than_three_yrs: number;
  total: number;
}

export interface CwipAgingBucket {
  project_type: string;
  less_than_1yr: number;
  one_to_two_yrs: number;
  two_to_three_yrs: number;
  more_than_three_yrs: number;
  total: number;
}

/**
 * Cash Flow Statement (AS-3 Indirect Method) Model
 */
export interface CashFlowStatementData {
  operating_activities: {
    net_profit_before_tax: number;
    adjustments_non_cash: { label: string; cy_amount: number; py_amount: number }[];
    operating_profit_before_wc: number;
    working_capital_changes: { label: string; cy_amount: number; py_amount: number }[];
    cash_generated_from_operations: number;
    direct_taxes_paid: number;
    net_cash_from_operating: number;
  };
  investing_activities: {
    items: { label: string; cy_amount: number; py_amount: number }[];
    net_cash_from_investing: number;
  };
  financing_activities: {
    items: { label: string; cy_amount: number; py_amount: number }[];
    net_cash_from_financing: number;
  };
  net_increase_decrease_cash: number;
  opening_cash_equivalents: number;
  closing_cash_equivalents: number;
  reconciliation_variance: number;
  is_tallied: boolean;
}

/**
 * Internal Financial Control (IFC) Preventive Check
 */
export interface IfcCheckItem {
  id: string;
  check_name: string;
  check_type: 'CRITICAL' | 'WARNING' | 'COMPLIANCE';
  detail: string;
  cy_diff: number;
  py_diff: number;
  status: 'OK' | 'FLAG';
  action_guidance: string;
}

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

/** Mapping validation warning. */
export interface MappingWarning {
  ledger_name: string;
  mapped_code: number;
  warning_type: 'DEBIT_ON_INCOME' | 'CREDIT_ON_EXPENSE' | 'BS_PL_MISMATCH' | 'NEGATIVE_LIABILITY' | 'NEGATIVE_ASSET';
  message: string;
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

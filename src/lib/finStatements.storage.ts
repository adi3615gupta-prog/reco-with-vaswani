// ============================================================
// Financial Statements Module — Storage Manager
// Dual-Mode Architecture: Schedule III & ICAI Non-Corporate
// ============================================================

import type {
  MasterGroupCode,
  ClientSetup,
  TrialBalanceEntry,
  FixedAssetEntry,
  PartnerCapitalEntry,
  NoteAggregate,
  BalanceCheck,
  MappingWarning,
  LevelClassificationResult,
  AsApplicabilityItem,
} from './finStatements.types';
import { MASTER_GROUP_CODES_SEED } from './finStatements.seed';

// ---- Storage Keys ----
const KEYS = {
  MASTER:           'fs_master_groups_v2',
  CLIENT:           'fs_client_setup_v2',
  TRIAL_BALANCE:    'fs_trial_balance_v2',
  FIXED_ASSETS:     'fs_fixed_assets_v2',
  PARTNERS_CAPITAL: 'fs_partners_capital_v2',
} as const;

// ---- Safe localStorage helpers (Electron & Node test safe with Memory Fallback) ----
const memoryStore = new Map<string, string>();

function safeGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
    const mem = memoryStore.get(key);
    if (mem) return JSON.parse(mem) as T;
    return fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    const serialized = JSON.stringify(value);
    memoryStore.set(key, serialized);
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
      window.localStorage.setItem(key, serialized);
    }
  } catch (e) {
    // Silent in test environments
  }
}

// ============================================================
// Master Group Codes (Immutable System Dictionary)
// ============================================================

/** Returns the full master dictionary (1001-4902), seeding it on first access. */
export function getMasterGroupCodes(): MasterGroupCode[] {
  let data = safeGet<MasterGroupCode[]>(KEYS.MASTER, []);
  if (data.length === 0) {
    data = MASTER_GROUP_CODES_SEED;
    safeSet(KEYS.MASTER, data);
  }
  return data;
}

/** Force re-seed the master dictionary (admin reset). */
export function resetMasterGroupCodes(): MasterGroupCode[] {
  safeSet(KEYS.MASTER, MASTER_GROUP_CODES_SEED);
  return MASTER_GROUP_CODES_SEED;
}

/** Look up a single master entry by group_code. */
export function findMasterByCode(code: number): MasterGroupCode | undefined {
  return getMasterGroupCodes().find((m) => m.group_code === code);
}

/** Get all unique note references, sorted. */
export function getUniqueNoteReferences(): number[] {
  const codes = getMasterGroupCodes();
  return [...new Set(codes.map((c) => c.note_reference))].sort((a, b) => a - b);
}

/** Get all master entries for a specific note reference. */
export function getMasterByNote(noteRef: number): MasterGroupCode[] {
  return getMasterGroupCodes().filter((m) => m.note_reference === noteRef);
}

// ============================================================
// ICAI June 2022 Technical Guide Level Evaluator
// ============================================================

export function evaluateNonCorporateLevel(turnover: number, borrowings: number): LevelClassificationResult {
  const tCr = turnover / 10000000;
  const bCr = borrowings / 10000000;

  let level: 'Level I' | 'Level II' | 'Level III' | 'Level IV';
  let summary = '';

  if (tCr > 250 || bCr > 50) {
    level = 'Level I';
    summary = 'Level I (Large Entity): Turnover > ₹250 Cr or Borrowings > ₹50 Cr. Full Accounting Standards apply without exemption.';
  } else if (tCr > 50 || bCr > 10) {
    level = 'Level II';
    summary = 'Level II (Medium Entity): Turnover ₹50–250 Cr or Borrowings ₹10–50 Cr. Exempt from AS 3 (Cash Flow) & AS 17 (Segment Reporting).';
  } else if (tCr > 10 || bCr > 2) {
    level = 'Level III';
    summary = 'Level III (Small Entity): Turnover ₹10–50 Cr or Borrowings ₹2–10 Cr. Exempt from AS 3, AS 17, AS 18 (Related Party).';
  } else {
    level = 'Level IV';
    summary = 'Level IV (Micro Entity): Turnover ≤ ₹10 Cr and Borrowings ≤ ₹2 Cr. Significant disclosure relaxations & exempt from Deferred Tax (AS 22).';
  }

  const standards: AsApplicabilityItem[] = [
    { as_number: 'AS 1', as_title: 'Disclosure of Accounting Policies', applicability: 'Applicable' },
    { as_number: 'AS 2', as_title: 'Valuation of Inventories', applicability: 'Applicable' },
    { 
      as_number: 'AS 3', 
      as_title: 'Cash Flow Statements', 
      applicability: level === 'Level I' ? 'Applicable' : 'Not Applicable',
      exemption_notes: level !== 'Level I' ? 'Exempt for Level II, III, and IV Non-Corporate entities under ICAI 2022 TG.' : undefined
    },
    { as_number: 'AS 4', as_title: 'Contingencies and Events After Balance Sheet Date', applicability: 'Applicable' },
    { as_number: 'AS 5', as_title: 'Net Profit/Loss, Prior Period Items & Policy Changes', applicability: 'Applicable' },
    { as_number: 'AS 7', as_title: 'Construction Contracts', applicability: 'Applicable' },
    { as_number: 'AS 9', as_title: 'Revenue Recognition', applicability: 'Applicable' },
    { 
      as_number: 'AS 10', 
      as_title: 'Property, Plant and Equipment', 
      applicability: (level === 'Level I' || level === 'Level II') ? 'Applicable' : 'Applicable with Exemptions',
      exemption_notes: (level === 'Level III' || level === 'Level IV') ? 'Exempt from detailed reconciliation of gross/net block disclosures.' : undefined
    },
    { 
      as_number: 'AS 11', 
      as_title: 'Effects of Changes in Foreign Exchange Rates', 
      applicability: (level === 'Level I' || level === 'Level II') ? 'Applicable' : 'Applicable with Exemptions' 
    },
    { as_number: 'AS 12', as_title: 'Government Grants', applicability: 'Applicable' },
    { as_number: 'AS 13', as_title: 'Accounting for Investments', applicability: level === 'Level IV' ? 'Applicable with Exemptions' : 'Applicable' },
    { as_number: 'AS 14', as_title: 'Accounting for Amalgamations', applicability: level === 'Level IV' ? 'Not Applicable' : 'Applicable' },
    { as_number: 'AS 15', as_title: 'Employee Benefits', applicability: level === 'Level I' ? 'Applicable' : 'Applicable with Exemptions', exemption_notes: 'Exempt from actuarial valuation for accrued leave/gratuity.' },
    { as_number: 'AS 16', as_title: 'Borrowing Costs', applicability: 'Applicable' },
    { 
      as_number: 'AS 17', 
      as_title: 'Segment Reporting', 
      applicability: level === 'Level I' ? 'Applicable' : 'Not Applicable',
      exemption_notes: 'Exempt for all Non-Corporate Level II, III, IV entities.' 
    },
    { 
      as_number: 'AS 18', 
      as_title: 'Related Party Disclosures', 
      applicability: (level === 'Level I' || level === 'Level II') ? 'Applicable' : 'Not Applicable',
      exemption_notes: (level === 'Level III' || level === 'Level IV') ? 'Exempt for Level III and IV entities.' : undefined
    },
    { as_number: 'AS 19', as_title: 'Leases', applicability: 'Applicable with Exemptions' },
    { as_number: 'AS 20', as_title: 'Earnings Per Share', applicability: 'Not Applicable', exemption_notes: 'Not applicable to non-corporate entities.' },
    { as_number: 'AS 21', as_title: 'Consolidated Financial Statements', applicability: 'Not Applicable' },
    { 
      as_number: 'AS 22', 
      as_title: 'Accounting for Taxes on Income', 
      applicability: level === 'Level IV' ? 'Applicable with Exemptions' : 'Applicable',
      exemption_notes: level === 'Level IV' ? 'Exempt from Deferred Tax Asset/Liability calculation; only Current Tax applies.' : undefined
    },
    { as_number: 'AS 26', as_title: 'Intangible Assets', applicability: (level === 'Level I' || level === 'Level II') ? 'Applicable' : 'Applicable with Exemptions' },
    { as_number: 'AS 28', as_title: 'Impairment of Assets', applicability: (level === 'Level I' || level === 'Level II') ? 'Applicable' : 'Applicable with Exemptions' },
    { as_number: 'AS 29', as_title: 'Provisions, Contingent Liabilities & Contingent Assets', applicability: 'Applicable' }
  ];

  return {
    level,
    turnover,
    borrowings,
    summary,
    standards,
    is_cash_flow_mandatory: level === 'Level I',
    is_segment_reporting_mandatory: level === 'Level I',
    is_deferred_tax_applicable: level !== 'Level IV'
  };
}

// ============================================================
// Client Setup
// ============================================================

export const DEFAULT_CLIENT: ClientSetup = {
  client_id: 'client_default',
  company_name: 'DYP INFRAPROJECTS PRIVATE LIMITED',
  cin_number: 'U45200MH2018PTC305882',
  registered_address: 'Survey No. 45/2, Mumbai-Pune Highway, Tathawade, Pune - 411033',
  entity_type: 'corporate',
  corporate_sub_type: 'pvt_ltd',
  financial_year: '2024-25',
  assessment_year: '2025-26',
  turnover_preceding_year: 420000000, // 42 Cr
  borrowings_preceding_year: 85000000, // 8.5 Cr
  denomination: 'in_rupees',
  presentation_format: 'vertical',
  
  audit_firm_name: 'Vipul Patel & Associates',
  firm_reg_no: '155669W',
  partner_name: 'CA. Vipul Patel',
  membership_no: '184754',
  udin: '25184754AAAAAA1234',
  place_of_signature: 'Pune',
  date_of_signature: '2025-09-25',
  
  director_1_name: 'Om Ramchandani',
  director_1_din: '10598652',
  director_2_name: 'Ragini Ravindra Despande',
  director_2_din: '10598653',
};

export function getClientSetup(): ClientSetup {
  return safeGet<ClientSetup>(KEYS.CLIENT, DEFAULT_CLIENT);
}

export function saveClientSetup(setup: ClientSetup): void {
  safeSet(KEYS.CLIENT, setup);
}

export function clearClientSetup(): void {
  safeSet(KEYS.CLIENT, DEFAULT_CLIENT);
}

// ============================================================
// Trial Balance Storage & Auto-Mapping
// ============================================================

export function getTrialBalance(): TrialBalanceEntry[] {
  return safeGet<TrialBalanceEntry[]>(KEYS.TRIAL_BALANCE, []);
}

export function saveTrialBalance(entries: TrialBalanceEntry[]): void {
  safeSet(KEYS.TRIAL_BALANCE, entries);
}

export function updateTrialBalanceEntry(id: string, updates: Partial<TrialBalanceEntry>): void {
  const entries = getTrialBalance();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates };
    saveTrialBalance(entries);
  }
}

export function clearTrialBalance(): void {
  safeSet(KEYS.TRIAL_BALANCE, []);
}

/**
 * Intelligent Auto-Mapping Rule from Tally Primary & Parent Groups
 * Replicates the logic of TBSQL & codegrouping in Module16.bas
 */
export function suggestTallyGroupMapping(
  ledgerName: string,
  primaryGroup?: string,
  parentGroup?: string
): { code: number; confidence: number } {
  const normLedger = ledgerName.trim().toLowerCase();
  const normPrimary = (primaryGroup || '').trim().toLowerCase();
  const normParent = (parentGroup || '').trim().toLowerCase();

  // 1. Specific ledger name exact keywords
  if (normLedger.includes('share capital') || normLedger.includes('equity capital')) return { code: 1001, confidence: 99 };
  if (normLedger.includes('partner capital') || normLedger.includes('proprietor capital')) return { code: 1001, confidence: 98 };
  if (normLedger.includes('retained earnings') || normLedger.includes('profit & loss') || normLedger.includes('p&l')) return { code: 1110, confidence: 95 };
  if (normLedger.includes('securities premium')) return { code: 1104, confidence: 99 };
  if (normLedger.includes('general reserve')) return { code: 1106, confidence: 98 };

  // 2. Cash & Bank
  if (normLedger.includes('cash') || normPrimary.includes('cash') || normParent.includes('cash')) return { code: 2801, confidence: 98 };
  if (normPrimary.includes('bank accounts') || normParent.includes('bank accounts')) {
    if (normLedger.includes('deposit') || normLedger.includes('fd')) return { code: 2805, confidence: 90 };
    return { code: 2803, confidence: 95 };
  }
  if (normPrimary.includes('bank od') || normPrimary.includes('bank occ') || normParent.includes('bank od')) {
    return { code: 1601, confidence: 95 };
  }

  // 3. Trade Payables / Debtors
  if (normPrimary.includes('sundry creditors') || normParent.includes('sundry creditors')) {
    if (normLedger.includes('msme') || normParent.includes('msme')) return { code: 1701, confidence: 95 };
    return { code: 1702, confidence: 90 };
  }
  if (normPrimary.includes('sundry debtors') || normParent.includes('sundry debtors')) {
    return { code: 2704, confidence: 90 };
  }

  // 4. Fixed Assets (PPE)
  if (normPrimary.includes('fixed assets') || normParent.includes('fixed assets')) {
    if (normLedger.includes('software') || normLedger.includes('patent') || normLedger.includes('trademark')) return { code: 2002, confidence: 92 };
    if (normLedger.includes('cwip') || normLedger.includes('work-in-progress') || normLedger.includes('under development')) return { code: 2003, confidence: 95 };
    return { code: 2001, confidence: 95 };
  }

  // 5. Inventories
  if (normPrimary.includes('stock-in-hand') || normParent.includes('stock-in-hand') || normLedger.includes('closing stock') || normLedger.includes('inventory')) {
    return { code: 2601, confidence: 95 };
  }

  // 6. Duties & Taxes / Statutory
  if (normPrimary.includes('duties & taxes') || normParent.includes('duties & taxes')) {
    if (normLedger.includes('input') || normLedger.includes('cgst input') || normLedger.includes('sgst input') || normLedger.includes('igst input')) {
      return { code: 2904, confidence: 95 }; // GST Input asset
    }
    return { code: 1810, confidence: 90 }; // Payable liability
  }

  // 7. Loans
  if (normPrimary.includes('secured loans') || normParent.includes('secured loans')) return { code: 1302, confidence: 90 };
  if (normPrimary.includes('unsecured loans') || normParent.includes('unsecured loans')) return { code: 1310, confidence: 88 };

  // 8. P&L Items
  if (normPrimary.includes('sales accounts') || normParent.includes('sales accounts')) return { code: 3001, confidence: 95 };
  
  if (normPrimary.includes('indirect incomes') || normParent.includes('indirect incomes')) {
    if (normLedger.includes('interest')) return { code: 3101, confidence: 95 };
    if (normLedger.includes('dividend')) return { code: 3102, confidence: 95 };
    return { code: 3104, confidence: 85 };
  }
  if (normPrimary.includes('direct incomes') || normParent.includes('direct incomes')) return { code: 3002, confidence: 90 };

  if (normPrimary.includes('purchase accounts') || normParent.includes('purchase accounts')) return { code: 4101, confidence: 92 };

  if (normPrimary.includes('indirect expenses') || normParent.includes('indirect expenses')) {
    if (normLedger.includes('salary') || normLedger.includes('wages') || normLedger.includes('bonus')) return { code: 4301, confidence: 95 };
    if (normLedger.includes('pf') || normLedger.includes('provident')) return { code: 4302, confidence: 95 };
    if (normLedger.includes('interest') || normLedger.includes('finance')) return { code: 4401, confidence: 95 };
    if (normLedger.includes('bank charge')) return { code: 4402, confidence: 95 };
    if (normLedger.includes('depreciation') || normLedger.includes('amortization')) return { code: 4501, confidence: 98 };
    if (normLedger.includes('audit')) return { code: 4601, confidence: 95 };
    if (normLedger.includes('rent')) return { code: 4605, confidence: 95 };
    if (normLedger.includes('power') || normLedger.includes('electricity')) return { code: 4604, confidence: 95 };
    if (normLedger.includes('travel')) return { code: 4613, confidence: 90 };
    return { code: 4614, confidence: 80 }; // Misc
  }

  if (normPrimary.includes('direct expenses') || normParent.includes('direct expenses')) return { code: 4001, confidence: 85 };

  return { code: 4614, confidence: 50 };
}

// ============================================================
// Fixed Assets & Partners' Capital
// ============================================================

export function getFixedAssets(): FixedAssetEntry[] {
  return safeGet<FixedAssetEntry[]>(KEYS.FIXED_ASSETS, []);
}

export function saveFixedAssets(entries: FixedAssetEntry[]): void {
  safeSet(KEYS.FIXED_ASSETS, entries);
}

export function clearFixedAssets(): void {
  safeSet(KEYS.FIXED_ASSETS, []);
}

export function addFixedAssetEntry(entry: FixedAssetEntry): void {
  const current = getFixedAssets();
  current.push(entry);
  saveFixedAssets(current);
}

export function updateFixedAssetEntry(id: string, updates: Partial<FixedAssetEntry>): void {
  const current = getFixedAssets();
  const idx = current.findIndex((e) => e.id === id);
  if (idx !== -1) {
    current[idx] = { ...current[idx], ...updates };
    saveFixedAssets(current);
  }
}

export function deleteFixedAssetEntry(id: string): void {
  const current = getFixedAssets();
  saveFixedAssets(current.filter((e) => e.id !== id));
}

export function getPartnersCapital(): PartnerCapitalEntry[] {
  return safeGet<PartnerCapitalEntry[]>(KEYS.PARTNERS_CAPITAL, []);
}

export function savePartnersCapital(entries: PartnerCapitalEntry[]): void {
  safeSet(KEYS.PARTNERS_CAPITAL, entries);
}

// ============================================================
// Aggregation & Validation Logic
// ============================================================

export function countUnmappedEntries(): number {
  const tb = getTrialBalance();
  return tb.filter((e) => !e.mapped_group_code).length;
}

/**
 * Aggregate TB entries into Note-level totals.
 * Uses Schedule III taxonomy:
 *   1001–1902: Liabilities & Equity
 *   2001–2951: Assets
 *   3001–3105: Income
 *   4001–4902: Expenses
 */
export function aggregateNotes(suppressZeros = true): NoteAggregate[] {
  const tb = getTrialBalance();
  const master = getMasterGroupCodes();
  const noteRefs = getUniqueNoteReferences();

  const aggregates: NoteAggregate[] = [];

  for (const noteRef of noteRefs) {
    const noteEntries = master.filter((m) => m.note_reference === noteRef);
    if (noteEntries.length === 0) continue;

    const lineItems = noteEntries.map((m) => {
      const matchedTB = tb.filter((t) => t.mapped_group_code === m.group_code);
      // For liabilities/equity (1000s) and income (3000s), credit balance is positive
      // In standard Tally/PR data: Debit is positive, Credit is negative
      const isCreditNormal = (m.group_code >= 1000 && m.group_code < 2000) || (m.group_code >= 3000 && m.group_code < 4000);

      const cyRaw = matchedTB.reduce((sum, t) => sum + (t.cy_balance || 0), 0);
      const pyRaw = matchedTB.reduce((sum, t) => sum + (t.py_balance || 0), 0);

      const cy = isCreditNormal ? -cyRaw : cyRaw;
      const py = isCreditNormal ? -pyRaw : pyRaw;

      return {
        group_code: m.group_code,
        particulars: m.particulars,
        cy_total: cy,
        py_total: py,
      };
    });

    const filteredItems = suppressZeros
      ? lineItems.filter((li) => li.cy_total !== 0 || li.py_total !== 0)
      : lineItems;

    const cy_grand = filteredItems.reduce((s, li) => s + li.cy_total, 0);
    const py_grand = filteredItems.reduce((s, li) => s + li.py_total, 0);

    if (suppressZeros && cy_grand === 0 && py_grand === 0) continue;

    aggregates.push({
      note_reference: noteRef,
      note_title: noteEntries[0].statement_category,
      statement_type: noteEntries[0].statement_type,
      line_items: filteredItems,
      cy_grand_total: cy_grand,
      py_grand_total: py_grand,
    });
  }

  return aggregates;
}

/**
 * Balance Sheet Check:
 * Total Assets (2000s) vs Total Equity & Liabilities (1000s) + Net Profit (3000s - 4000s)
 */
export function computeBalanceCheck(): BalanceCheck {
  const tb = getTrialBalance();
  const master = getMasterGroupCodes();

  let totalAssets = 0;
  let totalLiabilitiesEquity = 0;
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const entry of tb) {
    if (!entry.mapped_group_code) continue;
    const code = entry.mapped_group_code;
    const val = entry.cy_balance; // Debit +ve, Credit -ve

    if (code >= 2000 && code < 3000) {
      // Assets: Debit is positive
      totalAssets += val;
    } else if (code >= 1000 && code < 2000) {
      // Equity & Liabilities: Credit is positive, so -val
      totalLiabilitiesEquity += -val;
    } else if (code >= 3000 && code < 4000) {
      // Income: Credit is positive, so -val
      totalIncome += -val;
    } else if (code >= 4000 && code < 5000) {
      // Expenses: Debit is positive
      totalExpenses += val;
    }
  }

  // Roll Net Profit / Loss into Equity
  const netProfit = totalIncome - totalExpenses;
  const totalAdjustedEquityLiabilities = totalLiabilitiesEquity + netProfit;
  const diff = Math.round((totalAssets - totalAdjustedEquityLiabilities) * 100) / 100;

  return {
    total_assets: totalAssets,
    total_equity_liabilities: totalAdjustedEquityLiabilities,
    difference: diff,
    is_balanced: Math.abs(diff) < 1.0,
  };
}

/**
 * Validate mapping rules for abnormal balances
 */
export function validateMappings(): MappingWarning[] {
  const tb = getTrialBalance();
  const warnings: MappingWarning[] = [];

  for (const entry of tb) {
    if (!entry.mapped_group_code) continue;
    const code = entry.mapped_group_code;

    // Debit balance on Income (3000s)
    if (code >= 3000 && code < 4000 && entry.cy_balance > 0) {
      warnings.push({
        ledger_name: entry.ledger_name,
        mapped_code: code,
        warning_type: 'DEBIT_ON_INCOME',
        message: `"${entry.ledger_name}" has a debit balance (₹${entry.cy_balance.toLocaleString('en-IN')}) but is mapped to Revenue/Income (${code}).`,
      });
    }

    // Credit balance on Expense (4000s)
    if (code >= 4000 && code < 5000 && entry.cy_balance < 0) {
      warnings.push({
        ledger_name: entry.ledger_name,
        mapped_code: code,
        warning_type: 'CREDIT_ON_EXPENSE',
        message: `"${entry.ledger_name}" has a credit balance (₹${entry.cy_balance.toLocaleString('en-IN')}) but is mapped to Expense (${code}).`,
      });
    }

    // Debit balance on standard liabilities (e.g. Creditors with Dr balance)
    if (code >= 1000 && code < 2000 && entry.cy_balance > 0 && code !== 1110) {
      warnings.push({
        ledger_name: entry.ledger_name,
        mapped_code: code,
        warning_type: 'NEGATIVE_LIABILITY',
        message: `"${entry.ledger_name}" has a debit balance (₹${entry.cy_balance.toLocaleString('en-IN')}) in Liability group (${code}). Consider regrouping under Advances to Creditors / Current Assets.`,
      });
    }
  }

  return warnings;
}

export function yearEndRollForward(): void {
  const entries = getTrialBalance();
  const rolled = entries.map((e) => ({
    ...e,
    py_balance: e.cy_balance,
    cy_balance: 0,
  }));
  saveTrialBalance(rolled);
}

export function resetAllData(): void {
  clearClientSetup();
  clearTrialBalance();
  clearFixedAssets();
  safeSet(KEYS.PARTNERS_CAPITAL, []);
}

// ============================================================
// SQLite Central Storage Persistence Integration (Phase 31)
// ============================================================

/**
 * Synchronize complete Financial Statements workspace to SQLite backend persistence
 */
export async function saveWorkspaceToBackend(
  clientGstin: string,
  fy: string,
  taxonomyType = 'company'
): Promise<{ success: boolean; message?: string }> {
  const workspaceData = {
    clientSetup: getClientSetup(),
    trialBalance: getTrialBalance(),
    fixedAssets: getFixedAssets(),
    partnersCapital: getPartnersCapital(),
  };

  try {
    const res = await fetch('/api/audit-storage/fin-statements/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_gstin: clientGstin,
        fy,
        taxonomy_type: taxonomyType,
        workspace_data: workspaceData,
      }),
    });
    const json = await res.json();
    return json;
  } catch (err: any) {
    console.warn('[finStatements.storage] Backend sync failed, keeping localStorage fallback:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Load complete Financial Statements workspace from SQLite backend persistence
 */
export async function loadWorkspaceFromBackend(
  clientGstin: string,
  fy: string,
  taxonomyType = 'company'
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/audit-storage/fin-statements/${encodeURIComponent(clientGstin)}/${encodeURIComponent(fy)}?taxonomy=${encodeURIComponent(taxonomyType)}`
    );
    const json = await res.json();
    if (json.success && json.data && json.data.workspace_data) {
      const ws = json.data.workspace_data;
      if (ws.clientSetup) saveClientSetup(ws.clientSetup);
      if (ws.trialBalance) saveTrialBalance(ws.trialBalance);
      if (ws.fixedAssets) saveFixedAssets(ws.fixedAssets);
      if (ws.partnersCapital) savePartnersCapital(ws.partnersCapital);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[finStatements.storage] Failed to fetch workspace from backend:', err);
    return false;
  }
}


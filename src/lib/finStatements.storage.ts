// ============================================================
// Financial Statements Module — Storage Manager
// localStorage-backed CRUD for all FS data models
// ============================================================

import type {
  MasterGroupCode,
  ClientSetup,
  TrialBalanceEntry,
  FixedAssetEntry,
  NoteAggregate,
  BalanceCheck,
  MappingWarning,
} from './finStatements.types';
import { MASTER_GROUP_CODES_SEED } from './finStatements.seed';

// ---- Storage Keys ----
const KEYS = {
  MASTER:        'fs_master_groups',
  CLIENT:        'fs_client_setup',
  TRIAL_BALANCE: 'fs_trial_balance',
  FIXED_ASSETS:  'fs_fixed_assets',
} as const;

// ---- Safe localStorage helpers (Electron-safe) ----
function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[FS Storage] Write failed for "${key}":`, e);
  }
}

// ============================================================
// Master Group Codes (Immutable Dictionary)
// ============================================================

/** Returns the full master dictionary, seeding it on first access. */
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

/** Get the category title for a note reference. */
export function getNoteCategoryTitle(noteRef: number): string {
  const entries = getMasterByNote(noteRef);
  return entries.length > 0 ? entries[0].statement_category : `Note ${noteRef}`;
}

// ============================================================
// Client Setup
// ============================================================

const EMPTY_CLIENT: ClientSetup = {
  client_id: '',
  company_name: '',
  cin_number: '',
  registered_address: '',
  audit_firm_name: '',
  firm_reg_no: '',
  partner_name: '',
  membership_no: '',
  udin: '',
  director_1_name: '',
  director_2_name: '',
};

export function getClientSetup(): ClientSetup {
  return safeGet<ClientSetup>(KEYS.CLIENT, { ...EMPTY_CLIENT });
}

export function saveClientSetup(data: ClientSetup): void {
  if (!data.client_id) {
    data.client_id = 'client_' + Date.now().toString(36);
  }
  safeSet(KEYS.CLIENT, data);
}

export function clearClientSetup(): void {
  safeSet(KEYS.CLIENT, { ...EMPTY_CLIENT });
}

// ============================================================
// Trial Balance Data
// ============================================================

export function getTrialBalance(): TrialBalanceEntry[] {
  return safeGet<TrialBalanceEntry[]>(KEYS.TRIAL_BALANCE, []);
}

export function saveTrialBalance(entries: TrialBalanceEntry[]): void {
  safeSet(KEYS.TRIAL_BALANCE, entries);
}

/** Append new entries (e.g. from CSV import). */
export function addTrialBalanceEntries(newEntries: TrialBalanceEntry[]): TrialBalanceEntry[] {
  const existing = getTrialBalance();
  const merged = [...existing, ...newEntries];
  saveTrialBalance(merged);
  return merged;
}

/** Update a single entry (used by mapping UI). */
export function updateTrialBalanceEntry(id: string, updates: Partial<TrialBalanceEntry>): void {
  const entries = getTrialBalance();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates };
    saveTrialBalance(entries);
  }
}

/** Clear all TB data. */
export function clearTrialBalance(): void {
  safeSet(KEYS.TRIAL_BALANCE, []);
}

/** Count how many TB entries still lack a mapped_group_code. */
export function countUnmappedEntries(): number {
  return getTrialBalance().filter((e) => !e.mapped_group_code).length;
}

// ============================================================
// Fixed Assets Register
// ============================================================

export function getFixedAssets(): FixedAssetEntry[] {
  return safeGet<FixedAssetEntry[]>(KEYS.FIXED_ASSETS, []);
}

export function saveFixedAssets(entries: FixedAssetEntry[]): void {
  safeSet(KEYS.FIXED_ASSETS, entries);
}

export function addFixedAssetEntry(entry: FixedAssetEntry): FixedAssetEntry[] {
  const existing = getFixedAssets();
  existing.push(entry);
  saveFixedAssets(existing);
  return existing;
}

export function updateFixedAssetEntry(id: string, updates: Partial<FixedAssetEntry>): void {
  const entries = getFixedAssets();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates };
    saveFixedAssets(entries);
  }
}

export function deleteFixedAssetEntry(id: string): void {
  const entries = getFixedAssets().filter((e) => e.id !== id);
  saveFixedAssets(entries);
}

export function clearFixedAssets(): void {
  safeSet(KEYS.FIXED_ASSETS, []);
}

// ============================================================
// Calculation Engine Helpers
// ============================================================

/**
 * Level 1: Aggregate TB entries into Note-level totals.
 * Only includes notes that have at least one non-zero value
 * (zero-suppression).
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
      const cy = matchedTB.reduce((sum, t) => sum + (t.cy_balance || 0), 0);
      const py = matchedTB.reduce((sum, t) => sum + (t.py_balance || 0), 0);
      return {
        group_code: m.group_code,
        particulars: m.particulars,
        cy_total: cy,
        py_total: py,
      };
    });

    // Zero-suppress individual line items
    const filteredItems = suppressZeros
      ? lineItems.filter((li) => li.cy_total !== 0 || li.py_total !== 0)
      : lineItems;

    const cy_grand = filteredItems.reduce((s, li) => s + li.cy_total, 0);
    const py_grand = filteredItems.reduce((s, li) => s + li.py_total, 0);

    // Zero-suppress entire note
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
 * Level 2: Balance-Sheet check.
 * Assets (1XXX codes) - (Equity + Liabilities) (2XXX codes) = 0
 */
export function computeBalanceCheck(): BalanceCheck {
  const notes = aggregateNotes(false); // Don't suppress for check
  let totalAssets = 0;
  let totalEquityLiabilities = 0;
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const note of notes) {
    const master = getMasterGroupCodes().find(
      (m) => m.note_reference === note.note_reference
    );
    if (!master) continue;

    const val = note.cy_grand_total;
    if (master.group_code >= 1000 && master.group_code < 2000) {
      // Asset (Dr positive, Cr negative)
      totalAssets += val;
    } else if (master.group_code >= 2000 && master.group_code < 3000) {
      // Liability/Equity (Cr positive, Dr negative). Negated to get positive balance.
      totalEquityLiabilities += -val;
    } else if (master.group_code >= 3000 && master.group_code < 4000) {
      // Income (Cr positive, Dr negative). Negated to get positive balance.
      totalIncome += -val;
    } else if (master.group_code >= 4000 && master.group_code < 5000) {
      // Expenses (Dr positive, Cr negative)
      totalExpenses += val;
    }
  }

  // Roll unclosed P&L surplus (Revenue - Expenses) into Equity & Liabilities
  const netProfit = totalIncome - totalExpenses;
  const adjustedEquityLiabilities = totalEquityLiabilities + netProfit;

  const diff = totalAssets - adjustedEquityLiabilities;
  return {
    total_assets: totalAssets,
    total_equity_liabilities: adjustedEquityLiabilities,
    difference: diff,
    is_balanced: Math.abs(diff) < 0.05,
  };
}

/**
 * Validate mapping rules:
 * - Codes 1XXX/2XXX must be BS
 * - Codes 3XXX/4XXX must be PL
 * - Debit balance mapped to 3XXX (Income) → soft warning
 */
export function validateMappings(): MappingWarning[] {
  const tb = getTrialBalance();
  const warnings: MappingWarning[] = [];

  for (const entry of tb) {
    if (!entry.mapped_group_code) continue;
    const code = entry.mapped_group_code;

    // Debit balance on Income code (3XXX)
    if (code >= 3000 && code < 4000 && entry.cy_balance > 0) {
      warnings.push({
        ledger_name: entry.ledger_name,
        mapped_code: code,
        warning_type: 'DEBIT_ON_INCOME',
        message: `"${entry.ledger_name}" has a debit balance (₹${entry.cy_balance.toLocaleString('en-IN')}) but is mapped to an Income code (${code}).`,
      });
    }

    // Credit balance on Expense code (4XXX)
    if (code >= 4000 && code < 5000 && entry.cy_balance < 0) {
      warnings.push({
        ledger_name: entry.ledger_name,
        mapped_code: code,
        warning_type: 'CREDIT_ON_EXPENSE',
        message: `"${entry.ledger_name}" has a credit balance (₹${entry.cy_balance.toLocaleString('en-IN')}) but is mapped to an Expense code (${code}).`,
      });
    }
  }

  return warnings;
}

/**
 * Year-End Roll Forward:
 * Move all cy_balance → py_balance, reset cy_balance to 0.
 * Retains all ledger names and mapping.
 */
export function yearEndRollForward(): void {
  const entries = getTrialBalance();
  const rolled = entries.map((e) => ({
    ...e,
    py_balance: e.cy_balance,
    cy_balance: 0,
  }));
  saveTrialBalance(rolled);
}

// ============================================================
// Full Module Reset
// ============================================================

/** Clear everything except master codes. */
export function resetAllData(): void {
  clearClientSetup();
  clearTrialBalance();
  clearFixedAssets();
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  recordOverrideLog,
  syncPendingAuditLogs,
  getOverrideLogs,
  clearLocalAuditQueue,
  getActivePractitioner,
  AuditOverrideRecord,
  AuditOverrideInput,
} from '../lib/auditTrailService';
import { appendAuditTrailSheet, buildMasterWorkbook } from '../lib/excel/builders/masterExport';
import { buildPartyWiseWorkbook } from '../lib/excel/builders/partyWiseExport';
import { assertZeroMerges } from '../lib/excel/styles/zeroMergeGuard';
import { STATUTORY_PRESETS } from '../components/AuditJustificationModal';

describe('Phase 3: Audit Trail Service & Offline Queue (AUDIT-01)', () => {
  beforeEach(() => {
    clearLocalAuditQueue();
    vi.restoreAllMocks();
  });

  it('rejects overrides with justification shorter than 5 characters', async () => {
    const invalidInputs: AuditOverrideInput[] = [
      {
        action_type: 'FORCE_MATCH',
        new_status: 'Perfect Match',
        justification: '',
      },
      {
        action_type: 'FORCE_MATCH',
        new_status: 'Perfect Match',
        justification: '   ',
      },
      {
        action_type: 'FORCE_MATCH',
        new_status: 'Perfect Match',
        justification: 'ok',
      },
      {
        action_type: 'FORCE_MATCH',
        new_status: 'Perfect Match',
        justification: 'done',
      },
    ];

    for (const input of invalidInputs) {
      await expect(recordOverrideLog(input)).rejects.toThrow(
        'Statutory justification requires minimum 5 characters'
      );
    }
  });

  it('records valid override log with UUID, timestamps, and default practitioner', async () => {
    const input: AuditOverrideInput = {
      action_type: 'FORCE_MATCH',
      new_status: 'Perfect Match',
      original_status: 'Value Mismatch',
      justification: 'Vendor confirmed typo in GSTR-1 return filing',
      company_name: 'Acme Agro Ltd',
      client_gstin: '27AAACA1234A1Z1',
      invoice_no_pr: 'INV-101',
      invoice_no_2b: 'INV/101',
      taxable_diff: 10.5,
      gst_diff: 1.89,
    };

    const record = await recordOverrideLog(input);

    expect(record.id).toBeDefined();
    expect(record.id.length).toBeGreaterThan(5);
    expect(record.timestamp).toBeGreaterThan(0);
    expect(record.iso_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.practitioner_username).toBeDefined();
    expect(record.justification).toBe('Vendor confirmed typo in GSTR-1 return filing');
    expect(record.taxable_diff).toBe(10.5);
    expect(record.gst_diff).toBe(1.89);
    expect(record.is_synced).toBe(false); // Offline mock environment
  });

  it('retrieves local offline queue records and filters by company name and GSTIN', async () => {
    await recordOverrideLog({
      action_type: 'FORCE_MATCH',
      new_status: 'Perfect Match',
      justification: 'Reason 1 for Acme Corporation',
      company_name: 'Acme Corporation',
      client_gstin: '27AAACA1111A1Z1',
    });

    await recordOverrideLog({
      action_type: 'MANUAL_MATCH',
      new_status: 'Perfect Match',
      justification: 'Reason 2 for Zenith Agro Ltd',
      company_name: 'Zenith Agro Ltd',
      client_gstin: '27AAACB2222B1Z2',
    });

    const all = await getOverrideLogs();
    expect(all).toHaveLength(2);

    const acmeOnly = await getOverrideLogs('Acme Corporation');
    expect(acmeOnly).toHaveLength(1);
    expect(acmeOnly[0].company_name).toBe('Acme Corporation');

    const zenithGstin = await getOverrideLogs(undefined, '27AAACB2222B1Z2');
    expect(zenithGstin).toHaveLength(1);
    expect(zenithGstin[0].client_gstin).toBe('27AAACB2222B1Z2');
  });

  it('syncPendingAuditLogs marks records as synced when backend fetch succeeds', async () => {
    // 1. Initial attempt fails (offline simulation)
    const fetchFail = vi.fn().mockRejectedValue(new Error('Network offline'));
    vi.stubGlobal('fetch', fetchFail);

    const record = await recordOverrideLog({
      action_type: 'FORCE_MATCH',
      new_status: 'Perfect Match',
      justification: 'Tax rounding accepted by buyer under Rule 37',
      company_name: 'Test Firm',
    });
    expect(record.is_synced).toBe(false);

    // 2. Connection restored (online simulation)
    const fetchSuccess = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSuccess);

    const syncedCount = await syncPendingAuditLogs();
    expect(syncedCount).toBe(1);

    const logs = await getOverrideLogs('Test Firm');
    expect(logs[0].is_synced).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('Phase 3: Statutory Justification Presets & UX Contracts (D-05)', () => {
  it('all statutory presets have valid minimum character lengths (>= 5 chars)', () => {
    expect(STATUTORY_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of STATUTORY_PRESETS) {
      expect(preset.trim().length).toBeGreaterThanOrEqual(5);
    }
  });

  it('includes mandatory Rule 37, GSTR-1 amendment, and PAN master presets', () => {
    const allPresets = STATUTORY_PRESETS.join(' ');
    expect(allPresets).toContain('GSTR-1');
    expect(allPresets).toContain('Rule 37');
    expect(allPresets).toContain('PAN');
  });
});

describe('Phase 3: Zero-Merge Excel Audit Trail Integration (D-06, CORE-01)', () => {
  const sampleAuditLogs: AuditOverrideRecord[] = [
    {
      id: 'audit-001',
      timestamp: 1729584000000,
      iso_timestamp: '2025-10-22T08:00:00.000Z',
      practitioner_username: 'Senior CA Partner',
      action_type: 'FORCE_MATCH',
      company_name: 'Goyal Trading Company',
      client_gstin: '27AABCM8797N1ZI',
      invoice_no_pr: 'PR-DN-101',
      invoice_no_2b: '2B-CN-101',
      original_status: 'Value Mismatch',
      new_status: 'Perfect Match',
      taxable_diff: 5.5,
      gst_diff: 0.99,
      justification: 'Vendor confirmed typographical rounding error in GSTR-1 filing',
      is_synced: true,
    },
    {
      id: 'audit-002',
      timestamp: 1729584060000,
      iso_timestamp: '2025-10-22T08:01:00.000Z',
      practitioner_username: 'Audit Manager',
      action_type: 'UNLINK',
      company_name: 'Goyal Trading Company',
      client_gstin: '27AABCM8797N1ZI',
      invoice_no_pr: 'PR-INV-999',
      invoice_no_2b: '2B-INV-888',
      original_status: 'Perfect Match',
      new_status: 'Not in 2B / Not in Books',
      taxable_diff: 100000.0,
      gst_diff: 18000.0,
      justification: 'Invoices pertain to two completely different contracts; unlinked for enquiry',
      is_synced: true,
    },
  ];

  it('appendAuditTrailSheet appends a properly structured, unmerged worksheet', () => {
    const wb = XLSX.utils.book_new();
    appendAuditTrailSheet(wb, sampleAuditLogs, 'Goyal Trading Company');

    expect(wb.SheetNames).toContain('Audit Trail');
    const ws = wb.Sheets['Audit Trail'];
    expect(ws).toBeDefined();

    // Invariant: Zero merged cells
    expect(ws['!merges'] === undefined || (Array.isArray(ws['!merges']) && ws['!merges'].length === 0)).toBe(true);

    // Assert zero-merge invariant passes without throwing
    expect(() => assertZeroMerges(wb)).not.toThrow();

    // Verify 12 standardized columns in Row 3 (0-indexed Row 2)
    const expectedHeaders = [
      'Timestamp (ISO)',
      'Practitioner Username',
      'Action Type',
      'Client Company',
      'Counterparty GSTIN',
      'Invoice No (Books)',
      'Invoice No (2B)',
      'Original Status',
      'Overridden Status',
      'Taxable Diff (₹)',
      'GST Diff (₹)',
      'Statutory Justification',
    ];

    for (let c = 0; c < expectedHeaders.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
      expect(cell).toBeDefined();
      expect(cell.v).toBe(expectedHeaders[c]);
    }
  });

  it('buildMasterWorkbook integrates Audit Trail tab without merged cells when logs exist', () => {
    const dummyResults = [
      {
        'Invoice No (PR)': 'INV-1',
        'Invoice No (2B)': 'INV-1',
        'Status': 'Perfect Match',
        'GST Diff': 0,
      },
    ];

    const wb = buildMasterWorkbook(
      dummyResults,
      'Test Company',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      sampleAuditLogs
    );

    expect(wb.SheetNames).toContain('Audit Trail');
    expect(() => assertZeroMerges(wb)).not.toThrow();
  });

  it('buildPartyWiseWorkbook integrates Audit Trail tab without merged cells when logs exist', () => {
    const dummyParties = [
      {
        partyName: 'Test Vendor',
        gstin: '27AAACA1111A1Z1',
        overall: 'All Matched' as const,
        invoices: [],
        totals: {
          count: 0,
          perfectMatch: 0,
          valueMismatch: 0,
          invoiceMissing: 0,
          unmatchedVendor: 0,
          missingInPR: 0,
          igstPR: 0,
          cgstPR: 0,
          sgstPR: 0,
          igst2B: 0,
          cgst2B: 0,
          sgst2B: 0,
          igstDiff: 0,
          cgstDiff: 0,
          sgstDiff: 0,
          totalDiff: 0,
        },
      },
    ];

    const wb = buildPartyWiseWorkbook(
      dummyParties,
      'Test Company',
      undefined,
      undefined,
      undefined,
      sampleAuditLogs
    );

    expect(wb.SheetNames).toContain('Audit Trail');
    expect(() => assertZeroMerges(wb)).not.toThrow();
  });
});

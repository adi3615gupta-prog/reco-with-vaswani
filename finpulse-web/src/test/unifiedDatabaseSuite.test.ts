import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import sqlite3 from 'sqlite3';
// @ts-ignore
import { setupAuditStorageRoutes, initAuditStorageDatabase } from '../../audit_storage_routes.js';
import type { Server } from 'http';

describe('Unified Enterprise Database Persistence Suite (/api/audit-storage)', () => {
  let app: express.Express;
  let db: sqlite3.Database;
  let server: Server;
  let baseUrl: string;

  const TEST_GSTIN = '27AABCS1429B1ZB';
  const TEST_FY = '2024-25';

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '50mb' }));

    // Create an isolated in-memory SQLite database to protect network_data.db
    db = new sqlite3.Database(':memory:');
    initAuditStorageDatabase(db);
    setupAuditStorageRoutes(app, db, '/tmp');

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) server.close();
    if (db) db.close();
  });

  // ─── 1. HEALTH CHECK & TABLE INITIALIZATION ──────────────────────────────────
  it('GET /api/audit-storage/health returns status healthy and initialized tables', async () => {
    const res = await fetch(`${baseUrl}/api/audit-storage/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('healthy');
    expect(Array.isArray(json.tables)).toBe(true);
    expect(json.tables).toContain('audit_clause44_records');
    expect(json.tables).toContain('audit_depreciation_assets');
    expect(json.tables).toContain('audit_sa530_samples');
    expect(json.tables).toContain('cma_appraisals');
    expect(json.tables).toContain('financial_statements_workspaces');
    expect(json.tables).toContain('gst_reconciliation_runs');
  });

  // ─── 2. SUITE 05: TAX AUDIT CLAUSE 44 PERSISTENCE ────────────────────────────
  describe('Suite 05: Tax Audit Clause 44', () => {
    it('saves Clause 44 working paper and verifies SQLite retrieval', async () => {
      const payload = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        spend_data: {
          result: {
            totalExpenditure: 15000000,
            exemptSupplies: 2000000,
            compositionSpend: 500000,
            registeredEntitiesSpend: 9500000,
            unregisteredEntitiesSpend: 3000000,
            registeredPercentage: 63.33,
            breakdownByLedger: [
              { ledgerName: 'Freight Inward', amount: 450000, category: 'registered' }
            ]
          },
          taxLedgersInput: 'GST Input 18%, IGST Input',
          fromDate: '2024-04-01',
          toDate: '2025-03-31'
        },
        summary: { totalAuditedLedgers: 42, flagsCount: 1 },
        metadata: { preparedBy: 'Senior Auditor', verified: true }
      };

      const saveRes = await fetch(`${baseUrl}/api/audit-storage/clause44/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(saveRes.status).toBe(200);
      const saveJson = await saveRes.json();
      expect(saveJson.success).toBe(true);

      // Retrieve by client and FY
      const getRes = await fetch(`${baseUrl}/api/audit-storage/clause44/${TEST_GSTIN}/${TEST_FY}`);
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data).toBeDefined();
      expect(getJson.data.client_gstin).toBe(TEST_GSTIN);
      expect(getJson.data.fy).toBe(TEST_FY);
      expect(getJson.data.spend_data.result.totalExpenditure).toBe(15000000);
      expect(getJson.data.spend_data.result.breakdownByLedger[0].ledgerName).toBe('Freight Inward');
    });

    it('handles UPSERT on duplicate client and FY without error', async () => {
      const updatedPayload = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        spend_data: {
          result: { totalExpenditure: 16500000, updated: true }
        },
        summary: { totalAuditedLedgers: 45 }
      };

      const saveRes = await fetch(`${baseUrl}/api/audit-storage/clause44/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload)
      });
      expect(saveRes.status).toBe(200);

      const getRes = await fetch(`${baseUrl}/api/audit-storage/clause44/${TEST_GSTIN}/${TEST_FY}`);
      const getJson = await getRes.json();
      expect(getJson.data.spend_data.result.totalExpenditure).toBe(16500000);
    });
  });

  // ─── 3. SUITE 05: DEPRECIATION SCHEDULE PERSISTENCE ──────────────────────────
  describe('Suite 05: Depreciation Schedules & DTA/DTL', () => {
    it('saves depreciation asset blocks and calculates DTA/DTL figures', async () => {
      const payload = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        assets_data: {
          companyName: 'Test Enterprises Ltd',
          entityType: 'Company',
          compAssets: [
            { id: '1', ledgerName: 'Plant & Machinery', cost: 5000000, booksDep: 450000 }
          ],
          itBlocks: [
            { category: 'Plant & Machinery', openingWdv: 3500000, additionsMore180: 500000, itDepRate: 15, itDepreciation: 600000 }
          ]
        },
        dta_dtl: {
          timingDifference: 150000,
          dtaDtlAmount: 37500,
          isDtl: true,
          effectiveTaxRate: 25
        },
        metadata: { scheduleType: 'Companies Act vs Income Tax WDV' }
      };

      const res = await fetch(`${baseUrl}/api/audit-storage/depreciation/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const getRes = await fetch(`${baseUrl}/api/audit-storage/depreciation/${TEST_GSTIN}/${TEST_FY}`);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data.assets_data.compAssets[0].cost).toBe(5000000);
      expect(getJson.data.dta_dtl.timingDifference).toBe(150000);
      expect(getJson.data.dta_dtl.isDtl).toBe(true);
    });
  });

  // ─── 4. SUITE 05: SA 530 MONETARY UNIT SAMPLING ─────────────────────────────
  describe('Suite 05: SA 530 Audit Sampling', () => {
    it('saves sample vouchers and sampling parameters', async () => {
      const payload = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        audit_area: 'Creditors and Purchase Invoices Verification',
        sample_vouchers: [
          { id: 'v1', voucherNumber: 'PUR-001', amount: 350000, ledgerName: 'Reliance Industries' },
          { id: 'v2', voucherNumber: 'PUR-002', amount: 890000, ledgerName: 'Tata Steel Ltd' }
        ],
        parameters: {
          method: 'high-value',
          highValueThreshold: 200000,
          randomCount: 30
        },
        metadata: {
          samplingWorkingPapers: {
            v1: { verificationStatus: 'Verified', auditorRemarks: 'PO matched with E-way bill' }
          }
        }
      };

      const res = await fetch(`${baseUrl}/api/audit-storage/sa530/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const getRes = await fetch(`${baseUrl}/api/audit-storage/sa530/${TEST_GSTIN}/${TEST_FY}`);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(Array.isArray(getJson.samples)).toBe(true);
      expect(getJson.samples.length).toBeGreaterThan(0);
      expect(getJson.samples[0].sample_vouchers.length).toBe(2);
      expect(getJson.samples[0].parameters.highValueThreshold).toBe(200000);
      expect(getJson.samples[0].metadata.samplingWorkingPapers.v1.verificationStatus).toBe('Verified');
    });
  });

  // ─── 5. SUITE 06: BANK CMA APPRAISAL PROJECTIONS ───────────────────────────
  describe('Suite 06: Bank CMA Appraisal Projections', () => {
    it('saves projection model and MPBF values with SQLite persistence', async () => {
      const payload = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        projection_data: {
          years: ['2023-24', '2024-25', '2025-26 (P)'],
          netSales: [45000000, 52000000, 60000000],
          pat: [2100000, 2600000, 3200000]
        },
        mpbf_outputs: {
          tandonMethod1: 8500000,
          tandonMethod2: 6800000,
          nayakCommittee: 7500000,
          recommendedLimit: 6800000
        },
        metadata: { bankTarget: 'State Bank of India - SME Branch' }
      };

      const res = await fetch(`${baseUrl}/api/audit-storage/cma/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const getRes = await fetch(`${baseUrl}/api/audit-storage/cma/${TEST_GSTIN}/${TEST_FY}`);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data.mpbf_outputs.recommendedLimit).toBe(6800000);
      expect(getJson.data.projection_data.years).toContain('2025-26 (P)');
    });
  });

  // ─── 6. SUITE 06: SCHEDULE III FINANCIAL STATEMENTS ────────────────────────
  describe('Suite 06: Schedule III Financial Statements Workspaces', () => {
    it('persists financial statements workspace and isolates by taxonomy', async () => {
      const payloadCorporate = {
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        taxonomy: 'corporate',
        workspace_data: {
          balanceSheet: { totalEquity: 12500000, totalLiabilities: 8500000 },
          profitLoss: { revenueFromOps: 52000000, totalExpenses: 48000000 },
          trialBalanceRowsCount: 154
        },
        metadata: { version: '1.2.0', locked: false }
      };

      const res = await fetch(`${baseUrl}/api/audit-storage/fin-statements/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadCorporate)
      });
      expect(res.status).toBe(200);

      // Verify retrieval by corporate taxonomy
      const getRes = await fetch(`${baseUrl}/api/audit-storage/fin-statements/${TEST_GSTIN}/${TEST_FY}/corporate`);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data.workspace_data.balanceSheet.totalEquity).toBe(12500000);

      // Verify non-corporate taxonomy returns null/empty
      const nonCorpRes = await fetch(`${baseUrl}/api/audit-storage/fin-statements/${TEST_GSTIN}/${TEST_FY}/non_corporate`);
      const nonCorpJson = await nonCorpRes.json();
      expect(nonCorpJson.data).toBeNull();
    });
  });

  // ─── 7. SUITE 02: GST RECONCILIATION RUNS & DISPUTES ─────────────────────────
  describe('Suite 02: GST Reconciliation Runs & Vendor Disputes', () => {
    const RUN_ID = `test_reco_run_${Date.now()}`;

    it('saves a full reconciliation run with line items and vendor disputes', async () => {
      const payload = {
        run_id: RUN_ID,
        client_gstin: TEST_GSTIN,
        fy: TEST_FY,
        summary: {
          totalRecords: 100,
          matched: 85,
          mismatched: 10,
          missingIn2B: 3,
          missingInPr: 2,
          totalTaxVariance: 12450.50
        },
        matched_records: [
          { invoiceNo: 'INV-101', status: 'Perfect Match', taxableDiff: 0, taxDiff: 0 },
          { invoiceNo: 'INV-102', status: 'Value Mismatch', taxableDiff: 500, taxDiff: 90 }
        ],
        vendor_disputes: {
          '27AAECS1984G1ZT': {
            partyName: 'Supplier A',
            status: 'Dispute Raised',
            note: 'Missing E-Way bill invoice from May 2024'
          }
        },
        metadata: {
          tolerance: 2,
          fuzzyStrictness: 'moderate',
          companyName: 'Test Enterprises Ltd'
        }
      };

      const res = await fetch(`${baseUrl}/api/audit-storage/reco-runs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.run_id).toBe(RUN_ID);
    });

    it('lists lightweight reconciliation runs for client and FY', async () => {
      const res = await fetch(`${baseUrl}/api/audit-storage/reco-runs/${TEST_GSTIN}/${TEST_FY}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.runs)).toBe(true);
      const found = json.runs.find((r: any) => r.run_id === RUN_ID);
      expect(found).toBeDefined();
      expect(found.summary.matched).toBe(85);
      // Lightweight list excludes matched_records to ensure fast page loads
      expect(found.matched_records).toBeUndefined();
    });

    it('retrieves detailed reconciliation run including line items and vendor disputes', async () => {
      const res = await fetch(`${baseUrl}/api/audit-storage/reco-runs/detail/${RUN_ID}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.run_id).toBe(RUN_ID);
      expect(json.data.matched_records.length).toBe(2);
      expect(json.data.vendor_disputes['27AAECS1984G1ZT'].status).toBe('Dispute Raised');
    });

    it('deletes reconciliation run cleanly from SQLite database', async () => {
      const delRes = await fetch(`${baseUrl}/api/audit-storage/reco-runs/${RUN_ID}`, {
        method: 'DELETE'
      });
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.success).toBe(true);

      // Verify subsequent detail fetch returns 404
      const getRes = await fetch(`${baseUrl}/api/audit-storage/reco-runs/detail/${RUN_ID}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ─── 8. VALIDATION & ERROR HANDLING ──────────────────────────────────────────
  describe('Validation & Error Boundaries', () => {
    it('returns 400 when client_gstin or fy is missing', async () => {
      const res = await fetch(`${baseUrl}/api/audit-storage/clause44/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spend_data: {} })
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('client_gstin');
    });
  });
});

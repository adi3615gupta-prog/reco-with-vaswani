import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import {
    initGstr2bDatabase,
    normalizeReturnPeriod,
    buildStrictPeriodFilter,
    verifyGstr2bBatchChecksum,
    updateGstr2bBatchVerification,
    recordGstr2bMonthError,
    bulkSaveGstr2bInvoices
} from '../../gstr2b/db.js';
import {
    parseGstr2bJsonHelper,
    verifyParsedGstr2bPayload,
    extractGstr2bPortalSummary
} from '../../gstr2b/parsers.js';
import {
    buildIsolatedPeriodDir
} from '../../gstr2b/autopilot.js';
import {
    filterTargetPeriods,
    createAndRunAutopilotJob,
    getJobSnapshot,
    cancelAutopilotJob
} from '../../gstr2b/jobs.js';
import {
    resolvePeriodForMonth,
    normalizeReturnPeriod as normalizeClientPeriod
} from '../lib/gstr2bAutopilotClient';
import { setupGstr2bRoutes } from '../../gstr2b_routes.js';

describe('Phase 36: GSTR-2B Autopilot Bulletproof Hardening Nyquist Suite', () => {
    let db: sqlite3.Database;

    beforeEach(async () => {
        db = new sqlite3.Database(':memory:');
        initGstr2bDatabase(db);
        await new Promise((r) => setTimeout(r, 60));
    });

    // ─── 1. CANONICAL PERIOD NORMALIZATION (G2B-BP-08) ───────────────────────
    describe('Canonical Period Normalization (G2B-BP-08)', () => {
        it('normalizes all GST period variants to canonical Month YYYY', () => {
            expect(normalizeReturnPeriod('042025')).toBe('April 2025');
            expect(normalizeReturnPeriod('04-2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('04/2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('2025-04')).toBe('April 2025');
            expect(normalizeReturnPeriod('2025/04')).toBe('April 2025');
            expect(normalizeReturnPeriod('April, 2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('Apr 2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('APR-2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('april   2025')).toBe('April 2025');
            expect(normalizeReturnPeriod('Apr-25')).toBe('April 2025');
            expect(normalizeReturnPeriod('01-2026')).toBe('January 2026');
            expect(normalizeReturnPeriod('2026-03')).toBe('March 2026');
            expect(normalizeReturnPeriod('11-2025')).toBe('November 2025');
        });

        it('parses idtFallback when periodStr cannot yield month and year', () => {
            expect(normalizeReturnPeriod('', '15-05-2025')).toBe('May 2025');
            expect(normalizeReturnPeriod('', '15/05/2025')).toBe('May 2025');
            expect(normalizeReturnPeriod('', '2025-05-15')).toBe('May 2025');
        });

        it('frontend client normalizeReturnPeriod matches backend db.js', () => {
            expect(normalizeClientPeriod('042025')).toBe('April 2025');
            expect(normalizeClientPeriod('2025-11')).toBe('November 2025');
            expect(normalizeClientPeriod('Jan-26')).toBe('January 2026');
        });

        it('parseGstr2bJsonHelper returns canonical period and attaches return_period to all invoices', () => {
            const rawJson = {
                gstin: '27AABCU9603R1ZM',
                fp: '042025',
                data: {
                    docdata: {
                        b2b: [
                            {
                                ctin: '27SUPP0000A1Z1',
                                trdnm: 'Supplier One',
                                inv: [
                                    {
                                        inum: 'INV-101',
                                        dt: '12-04-2025',
                                        val: 1180,
                                        pos: '27',
                                        rchrg: 'N',
                                        inv_typ: 'R',
                                        items: [{ itm_det: { txval: 1000, iamt: 0, camt: 90, samt: 90, csamt: 0 } }]
                                    }
                                ]
                            }
                        ]
                    },
                    itcsumm: {
                        itcavl: {
                            nonrevsup: { camt: 90, samt: 90 }
                        }
                    }
                }
            };

            const parsed = parseGstr2bJsonHelper(rawJson, '27AABCU9603R1ZM', '042025');
            expect(parsed.period).toBe('April 2025');
            expect(parsed.invoices).toHaveLength(1);
            expect(parsed.invoices[0].return_period).toBe('April 2025');
            expect(parsed.portalSummary).toEqual({
                eligibleItcTotal: 180,
                totalInvoices: null
            });
        });

        it('resolvePeriodForMonth maps Q4 to endYear and Q1-Q3 to startYear', () => {
            expect(resolvePeriodForMonth('January', '2025-26')).toBe('January 2026');
            expect(resolvePeriodForMonth('February', '2025-26')).toBe('February 2026');
            expect(resolvePeriodForMonth('March', '2025-26')).toBe('March 2026');
            expect(resolvePeriodForMonth('April', '2025-26')).toBe('April 2025');
            expect(resolvePeriodForMonth('December', '2025-26')).toBe('December 2025');
        });
    });

    // ─── 2. STRICT PERIOD FILTER & ISOLATION (G2B-BP-07) ─────────────────────
    describe('Strict Period Filter & /cancel Isolation (G2B-BP-07)', () => {
        it('buildStrictPeriodFilter generates exact IN (...) clauses without LIKE %wildcards%', () => {
            const pf = buildStrictPeriodFilter('April 2025');
            expect(pf.canonical).toBe('April 2025');
            expect(pf.clause).toContain('return_period IN (');
            expect(pf.clause).not.toContain('LIKE');
            expect(pf.clause).not.toContain('%');
            expect(pf.params).toContain('April 2025');
            expect(pf.params).toContain('042025');
            expect(pf.params).toContain('04-2025');
            expect(pf.params).not.toContain('April 2024');
            expect(pf.params).not.toContain('April 2026');
        });
    });

    // ─── 3. ISOLATED DOWNLOAD DIRECTORY & PAYLOAD VERIFICATION (G2B-BP-06) ───
    describe('Isolated Download Directory & Payload Validation (G2B-BP-06)', () => {
        it('buildIsolatedPeriodDir resolves inside scratch/downloads/gstr2b/${gstin}/${jobId}/${periodSlug}', () => {
            const dir = buildIsolatedPeriodDir('27AABCU9603R1ZM', 'job-42', 'April 2025');
            expect(dir).toContain('27AABCU9603R1ZM');
            expect(dir).toContain('job-42');
            expect(dir).toContain('April_2025');
            expect(dir.includes('scratch')).toBe(true);
        });

        it('buildIsolatedPeriodDir rejects path traversal attempts with ..', () => {
            expect(() => buildIsolatedPeriodDir('../evil', 'job-1', 'April 2025')).toThrow(/traversal/i);
            expect(() => buildIsolatedPeriodDir('27AABCU9603R1ZM', '../evil', 'April 2025')).toThrow(/traversal/i);
            expect(() => buildIsolatedPeriodDir('27AABCU9603R1ZM', 'job-1', '../../etc')).toThrow(/traversal/i);
        });

        it('verifyParsedGstr2bPayload rejects GSTIN or Period mismatches', () => {
            const valid = { gstin: '27AABCU9603R1ZM', period: 'April 2025', invoices: [] };
            expect(verifyParsedGstr2bPayload(valid, '27AABCU9603R1ZM', 'April 2025').valid).toBe(true);

            const wrongGstin = verifyParsedGstr2bPayload(valid, '24OTHER0000A1Z1', 'April 2025');
            expect(wrongGstin.valid).toBe(false);
            expect(wrongGstin.code).toBe('MISMATCH_GSTIN');

            const wrongPeriod = verifyParsedGstr2bPayload(valid, '27AABCU9603R1ZM', 'May 2025');
            expect(wrongPeriod.valid).toBe(false);
            expect(wrongPeriod.code).toBe('MISMATCH_PERIOD');
        });
    });

    // ─── 4. AUDIT CHECKSUM & GOLDEN RULE (G2B-BP-09) ─────────────────────────
    describe('Audit Checksum & Golden Rule Verification (G2B-BP-09)', () => {
        it('verifyGstr2bBatchChecksum verifies matching counts & ITC within tolerance', () => {
            const parsedMetrics = { totalInvoices: 10, eligibleItcTotal: 1800.50 };
            const portalSummary = { totalInvoices: 10, eligibleItcTotal: 1801.00 }; // ₹0.50 diff <= ₹2

            const res = verifyGstr2bBatchChecksum(parsedMetrics, portalSummary);
            expect(res.verifyStatus).toBe('VERIFIED');
            expect(res.verifyWarning).toBeNull();
        });

        it('verifyGstr2bBatchChecksum returns PARTIAL_VERIFY when count or ITC exceeds tolerance', () => {
            const parsedMetrics = { totalInvoices: 10, eligibleItcTotal: 1800 };
            const portalSummary = { totalInvoices: 12, eligibleItcTotal: 2500 }; // Diff ₹700, 2 invs

            const res = verifyGstr2bBatchChecksum(parsedMetrics, portalSummary);
            expect(res.verifyStatus).toBe('PARTIAL_VERIFY');
            expect(res.verifyWarning).toContain('Portal invoices: 12 vs Parsed: 10');
            expect(res.verifyWarning).toContain('Diff: ₹700');
        });

        it('verifyGstr2bBatchChecksum returns UNVERIFIED when portal summary is null or missing', () => {
            const res = verifyGstr2bBatchChecksum({ totalInvoices: 5 }, null);
            expect(res.verifyStatus).toBe('UNVERIFIED');
        });

        it('updateGstr2bBatchVerification updates verification status without touching invoice status', async () => {
            await new Promise((r) => {
                db.run(
                    `INSERT INTO gstr2b_batches (id, client_gstin, return_period, status) VALUES ('b-1', '27TEST1234F1Z5', 'April 2025', 'SYNCED')`,
                    r
                );
            });

            await updateGstr2bBatchVerification(db, '27TEST1234F1Z5', 'April 2025', {
                verifyStatus: 'PARTIAL_VERIFY',
                verifyWarning: 'Warning: 2 missing',
                portalSummary: { totalInvoices: 10 }
            });

            const row: any = await new Promise((r) => {
                db.get(`SELECT status, verify_status, verify_warning FROM gstr2b_batches WHERE client_gstin = '27TEST1234F1Z5'`, (_, res) => r(res));
            });

            expect(row.status).toBe('SYNCED'); // Status remains SYNCED for returns_storage_routes compatibility
            expect(row.verify_status).toBe('PARTIAL_VERIFY');
            expect(row.verify_warning).toBe('Warning: 2 missing');
        });

        it('recordGstr2bMonthError preserves existing SYNCED status on failed retry (Golden Rule)', async () => {
            await new Promise((r) => {
                db.run(
                    `INSERT INTO gstr2b_batches (id, client_gstin, return_period, status) VALUES ('b-sync', '27TEST1234F1Z5', 'April 2025', 'SYNCED')`,
                    r
                );
            });

            await recordGstr2bMonthError(db, '27TEST1234F1Z5', 'April 2025', 'Portal connection reset');

            const row: any = await new Promise((r) => {
                db.get(`SELECT status, last_error FROM gstr2b_batches WHERE client_gstin = '27TEST1234F1Z5'`, (_, res) => r(res));
            });

            expect(row.status).toBe('SYNCED'); // Golden Rule: SYNCED row never downgraded to FAILED
            expect(row.last_error).toBe('Portal connection reset');
        });
    });

    // ─── 5. ASYNC JOB REGISTRY & PERIOD FILTERING (G2B-BP-02, G2B-BP-04) ────
    describe('Async Job Registry & Period Filtering (G2B-BP-02, G2B-BP-04)', () => {
        it('filterTargetPeriods correctly partitions target and skipped months', () => {
            const fyMonths = [
                { month: 'April', period: 'April 2025' },
                { month: 'May', period: 'May 2025' },
                { month: 'June', period: 'June 2025' }
            ];

            const { targetMonths, skippedMonths } = filterTargetPeriods(fyMonths, {
                skipSynced: true,
                syncedPeriodsSet: new Set(['April 2025'])
            });

            expect(targetMonths).toHaveLength(2);
            expect(targetMonths.map(m => m.month)).toEqual(['May', 'June']);
            expect(skippedMonths).toHaveLength(1);
            expect(skippedMonths[0].month).toBe('April');
        });

        it('filterTargetPeriods respects onlyPeriods subset filter', () => {
            const fyMonths = [
                { month: 'April', period: 'April 2025' },
                { month: 'May', period: 'May 2025' },
                { month: 'June', period: 'June 2025' }
            ];

            const { targetMonths } = filterTargetPeriods(fyMonths, {
                onlyPeriods: ['May 2025']
            });

            expect(targetMonths).toHaveLength(1);
            expect(targetMonths[0].month).toBe('May');
        });

        it('createAndRunAutopilotJob manages execution lifecycle and returns sanitized snapshot', async () => {
            const runnerMock = async (opts: any) => {
                opts.onEvent('MONTH_START', { period: 'April 2025', month: 'April' });
                opts.onEvent('MONTH_DONE', { period: 'April 2025', month: 'April', status: 'SYNCED', count: 5 });
                return { success: true, count: 5 };
            };

            const { jobId, job, completionPromise } = createAndRunAutopilotJob({
                db,
                gstin: '27AABCU9603R1ZM',
                returnPeriod: 'April 2025',
                financialYear: '2025-26',
                isFullYear: false,
                runnerFn: runnerMock
            });

            expect(jobId).toBeDefined();
            expect(job.status).toBe('RUNNING');

            const result = await completionPromise;
            expect(result.success).toBe(true);

            const snap = getJobSnapshot(jobId);
            expect(snap?.status).toBe('COMPLETED');
            expect(snap?.months).toHaveLength(1);
            expect(snap?.months[0].status).toBe('SYNCED');
            expect(snap?.months[0].count).toBe(5);
        });
    });

    // ─── 6. ROUTE INTEGRATION & STRICT CANCEL (G2B-BP-07) ────────────────────
    describe('Route Handlers & End-to-End Contract Integration', () => {
        it('cancel endpoint cancels requested period without clobbering prior years or synced rows', async () => {
            // Seed DB with:
            // 1) April 2024 (PENDING)
            // 2) April 2025 (PENDING)
            // 3) May 2025 (SYNCED)
            await new Promise((r) => db.run(`INSERT INTO gstr2b_batches (id, client_gstin, return_period, status) VALUES ('b1', '27AABCU9603R1ZM', 'April 2024', 'PENDING')`, r));
            await new Promise((r) => db.run(`INSERT INTO gstr2b_batches (id, client_gstin, return_period, status) VALUES ('b2', '27AABCU9603R1ZM', 'April 2025', 'PENDING')`, r));
            await new Promise((r) => db.run(`INSERT INTO gstr2b_batches (id, client_gstin, return_period, status) VALUES ('b3', '27AABCU9603R1ZM', 'May 2025', 'SYNCED')`, r));

            // Set up lightweight Express route mockup
            const handlers: Record<string, Function> = {};
            const mockApp = {
                use: () => {},
                get: (p: string, h: Function) => { handlers[`GET ${p}`] = h; },
                post: (p: string, h: Function) => { handlers[`POST ${p}`] = h; },
                delete: (p: string, h: Function) => { handlers[`DELETE ${p}`] = h; }
            };

            setupGstr2bRoutes(mockApp as any, db);

            // Execute POST /api/gstr2b/cancel for April 2025
            const cancelHandler = handlers['POST /api/gstr2b/cancel'];
            expect(cancelHandler).toBeDefined();

            let responseData: any = null;
            const mockReq = {
                body: {
                    gstin: '27AABCU9603R1ZM',
                    returnPeriod: 'April 2025'
                }
            };
            const mockRes = {
                json: (d: any) => { responseData = d; },
                status: () => mockRes
            };

            await cancelHandler(mockReq, mockRes);
            expect(responseData?.success).toBe(true);

            // Inspect DB state
            const rows: any[] = await new Promise((r) => {
                db.all(`SELECT return_period, status FROM gstr2b_batches WHERE client_gstin = '27AABCU9603R1ZM'`, (_, res) => r(res));
            });

            const apr24 = rows.find(r => r.return_period === 'April 2024');
            const apr25 = rows.find(r => r.return_period === 'April 2025');
            const may25 = rows.find(r => r.return_period === 'May 2025');

            expect(apr24?.status).toBe('PENDING');   // Untouched!
            expect(apr25?.status).toBe('CANCELLED'); // Successfully cancelled
            expect(may25?.status).toBe('SYNCED');    // SYNCED batch protected!
        });
    });
});

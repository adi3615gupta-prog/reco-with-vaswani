import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import {
    initGstr2bDatabase,
    bulkSaveGstr2bInvoices,
    markGstr2bMonthNilSynced,
    getInvoicesWithAllocations,
    bulkSaveItcAllocations,
    normalizeReturnPeriod,
    buildStrictPeriodFilter,
    verifyGstr2bBatchChecksum,
    updateGstr2bBatchVerification
} from './gstr2b/db.js';
import {
    parseGstr2bExcelHelper,
    parseGstr2bJsonHelper,
    parseGstr2bZipHelper,
    verifyParsedGstr2bPayload
} from './gstr2b/parsers.js';
import { runGstr2bAutopilot, openPortalLoginHelper } from './gstr2b/autopilot.js';
import {
    createAndRunAutopilotJob,
    subscribeToJobStream,
    getJobSnapshot,
    cancelAutopilotJob,
    bringJobBrowserToFront
} from './gstr2b/jobs.js';
import { generateGstr2bFullYearWorkbook } from './gstr2b/fullYearExcel.js';
import { generateItcAllocationWorkbook } from './gstr2b/itcAuditExcel.js';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * setupGstr2bRoutes — Express API controller for GSTR-2B & GSTR-1 Auto Downloader
 * 
 * Modular architecture:
 * - `./gstr2b/db.js`: SQLite table initialization, batch recalculations, and bulk invoice ingestion
 * - `./gstr2b/parsers.js`: Dedicated parsers for GSTR-2B & GSTR-1 (Excel, JSON, ZIP)
 * - `./gstr2b/autopilot.js`: Playwright automation engine (Login, Period Select, GSTR-1 & GSTR-2B download)
 */
export function setupGstr2bRoutes(app, db, authenticateToken = (req, res, next) => next()) {
    const auth = typeof authenticateToken === 'function' ? authenticateToken : ((req, res, next) => next());
    app.use('/api/gstr2b', auth);
    app.use('/api/gstr3b/itc-allocations', auth);
    app.use('/api/gstr3b/export-itc-allocations', auth);

    const browserState = { current: null };
    const activeBrowsers = new Map(); // GSTIN -> { current: Browser }

    // Initialize Database Tables & Indexes
    initGstr2bDatabase(db);

    // ─── 1. GET GSTR-2B SUMMARY & CLIENTS FOR RETURN PERIOD ──────────────────
    app.get('/api/gstr2b/summary', (req, res) => {
        const period = req.query.period;
        if (!period) {
            return res.status(400).json({ success: false, error: 'period query parameter required' });
        }

        const normPeriod = normalizeReturnPeriod(period) || String(period).trim();
        const pf = buildStrictPeriodFilter(normPeriod);

        const query = `
            SELECT 
                c.id as client_id,
                c.gstin,
                c.trade_name,
                c.legal_name,
                c.phone,
                c.email,
                c.portal_username,
                CASE WHEN c.portal_password IS NOT NULL AND LENGTH(c.portal_password) > 0 THEN 1 ELSE 0 END as has_credentials,
                b.id as batch_id,
                b.return_period,
                COALESCE(b.status, 'PENDING') as batch_status,
                COALESCE(b.total_invoices, 0) as total_invoices,
                COALESCE(b.b2b_count, 0) as b2b_count,
                COALESCE(b.b2ba_count, 0) as b2ba_count,
                COALESCE(b.cdnr_count, 0) as cdnr_count,
                COALESCE(b.cdnra_count, 0) as cdnra_count,
                COALESCE(b.isd_count, 0) as isd_count,
                COALESCE(b.impg_count, 0) as impg_count,
                COALESCE(b.impgsez_count, 0) as impgsez_count,
                COALESCE(b.eco_count, 0) as eco_count,
                COALESCE(b.eligible_itc_igst, 0) as eligible_itc_igst,
                COALESCE(b.eligible_itc_cgst, 0) as eligible_itc_cgst,
                COALESCE(b.eligible_itc_sgst, 0) as eligible_itc_sgst,
                COALESCE(b.eligible_itc_cess, 0) as eligible_itc_cess,
                COALESCE(b.eligible_itc_total, 0) as eligible_itc_total,
                COALESCE(b.ineligible_itc_total, 0) as ineligible_itc_total,
                b.excel_path,
                b.json_path,
                b.downloaded_at,
                b.updated_at,
                b.verify_status,
                b.verify_warning,
                b.last_error
            FROM clients c
            LEFT JOIN gstr2b_batches b ON UPPER(TRIM(c.gstin)) = UPPER(TRIM(b.client_gstin)) AND (${pf.clause.replace(/return_period/g, 'b.return_period')})
            ORDER BY c.trade_name ASC, c.legal_name ASC, b.updated_at DESC
        `;

        db.all(query, pf.params, (err, rows) => {
            if (err) {
                console.error('[GSTR-2B Summary] DB Query error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }

            // Deduplicate per client gstin keeping newest batch
            const seenGstin = new Map();
            for (const r of rows) {
                const gUpper = String(r.gstin || '').trim().toUpperCase();
                if (!seenGstin.has(gUpper)) {
                    seenGstin.set(gUpper, r);
                }
            }

            // Query all historical synced batches to accurately populate syncedMonths across FY
            db.all(`SELECT client_gstin, return_period, status, total_invoices, b2b_count FROM gstr2b_batches WHERE status IN ('SYNCED', 'PUSHED_TO_3B', 'NIL_SYNCED')`, [], (bErr, batchRows) => {
                const batchesByClient = new Map();
                for (const b of (batchRows || [])) {
                    const g = String(b.client_gstin || '').trim().toUpperCase();
                    if (!batchesByClient.has(g)) batchesByClient.set(g, []);
                    batchesByClient.get(g).push(b);
                }

                const clientsList = Array.from(seenGstin.values()).map(r => {
                    const gUpper = String(r.gstin || '').trim().toUpperCase();
                    const clientBatches = batchesByClient.get(gUpper) || [];

                    const syncedMonths = [];
                    const nilMonths = [];
                    const monthDetails = {};

                    for (const b of clientBatches) {
                        const canonMonth = normalizeReturnPeriod(b.return_period);
                        const bStatus = b.status || 'PENDING';
                        if (bStatus === 'SYNCED' || bStatus === 'PUSHED_TO_3B' || bStatus === 'NIL_SYNCED') {
                            if (!syncedMonths.includes(canonMonth)) syncedMonths.push(canonMonth);
                            if (bStatus === 'NIL_SYNCED' && !nilMonths.includes(canonMonth)) nilMonths.push(canonMonth);
                        }
                        monthDetails[canonMonth] = {
                            period: canonMonth,
                            status: bStatus,
                            totalInvoices: b.total_invoices || 0,
                            b2bCount: b.b2b_count || 0
                        };
                    }

                    // Also guarantee currently queried batch is recognized if synced
                    const currentBatchStatus = r.batch_status;
                    if (currentBatchStatus === 'SYNCED' || currentBatchStatus === 'PUSHED_TO_3B' || currentBatchStatus === 'NIL_SYNCED') {
                        if (!syncedMonths.includes(normPeriod)) syncedMonths.push(normPeriod);
                        if (currentBatchStatus === 'NIL_SYNCED' && !nilMonths.includes(normPeriod)) nilMonths.push(normPeriod);
                        if (!monthDetails[normPeriod]) {
                            monthDetails[normPeriod] = {
                                period: normPeriod,
                                status: currentBatchStatus,
                                totalInvoices: r.total_invoices || 0,
                                b2bCount: r.b2b_count || 0
                            };
                        }
                    }

                    return {
                        id: r.client_id,
                        gstin: r.gstin,
                        trade_name: r.trade_name || r.legal_name || r.gstin,
                        legal_name: r.legal_name,
                        phone: r.phone,
                        email: r.email,
                        hasCreds: Boolean(r.has_credentials && r.portal_username),
                        portalUsername: r.portal_username,
                        status: r.batch_status,
                        verifyStatus: r.verify_status || 'UNVERIFIED',
                        verifyWarning: r.verify_warning || null,
                        lastError: r.last_error || null,
                        period: normPeriod,
                        syncedMonths,
                        nilMonths,
                        syncedCount: syncedMonths.length,
                        monthDetails,
                        stats: {
                            totalInvoices: r.total_invoices,
                            b2bCount: r.b2b_count,
                            b2baCount: r.b2ba_count,
                            cdnrCount: r.cdnr_count,
                            cdnraCount: r.cdnra_count,
                            isdCount: r.isd_count,
                            impgCount: r.impg_count,
                            impgsezCount: r.impgsez_count,
                            ecoCount: r.eco_count,
                            eligibleItc: {
                                igst: r.eligible_itc_igst,
                                cgst: r.eligible_itc_cgst,
                                sgst: r.eligible_itc_sgst,
                                cess: r.eligible_itc_cess,
                                total: r.eligible_itc_total
                            },
                            ineligibleTotal: r.ineligible_itc_total
                        },
                        hasExcel: Boolean(r.excel_path && fs.existsSync(r.excel_path)),
                        hasJson: Boolean(r.json_path && fs.existsSync(r.json_path)),
                        excelPath: r.excel_path,
                        jsonPath: r.json_path,
                        downloadedAt: r.downloaded_at,
                        updatedAt: r.updated_at
                    };
                });

                const totalClients = clientsList.length;
                const downloadedClients = clientsList.filter(c => c.status === 'SYNCED' || c.status === 'PUSHED_TO_3B' || c.status === 'NIL_SYNCED').length;
                const pendingClients = totalClients - downloadedClients;
                const totalEligibleItc = Math.round(clientsList.reduce((acc, c) => acc + (c.stats.eligibleItc.total || 0), 0) * 100) / 100;
                const totalInvoices = clientsList.reduce((acc, c) => acc + (c.stats.totalInvoices || 0), 0);

                res.json({
                    success: true,
                    period: normPeriod,
                    overview: {
                        totalClients,
                        downloadedClients,
                        pendingClients,
                        totalEligibleItc,
                        totalInvoices
                    },
                    clients: clientsList
                });
            });
        });
    });

    // ─── 1B. GET FULL YEAR 12-MONTH GSTR-2B SUMMARY & SYNC STATUS ────────────
    app.get('/api/gstr2b/fy-summary', (req, res) => {
        const fy = req.query.financialYear || '2026-27';
        const startYear = parseInt(fy.match(/\d{4}/)?.[0] || '2026', 10);
        const endYear = startYear + 1;
        const months12 = [
            `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
            `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
            `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
            `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
        ];

        // Strict deduplicated period params across all 12 months
        const candidatePeriods = Array.from(new Set(months12.flatMap(m => buildStrictPeriodFilter(m).params)));
        const placeholders = candidatePeriods.map(() => '?').join(',');

        const query = `
            SELECT 
                c.id as client_id,
                c.gstin,
                c.trade_name,
                c.legal_name,
                c.phone,
                c.email,
                c.portal_username,
                CASE WHEN c.portal_password IS NOT NULL AND LENGTH(c.portal_password) > 0 THEN 1 ELSE 0 END as has_credentials,
                b.return_period,
                b.status as batch_status,
                b.total_invoices,
                b.b2b_count,
                b.b2ba_count,
                b.cdnr_count,
                b.cdnra_count,
                b.isd_count,
                b.impg_count,
                b.impgsez_count,
                b.eco_count,
                b.eligible_itc_igst,
                b.eligible_itc_cgst,
                b.eligible_itc_sgst,
                b.eligible_itc_cess,
                b.eligible_itc_total,
                b.ineligible_itc_total,
                b.verify_status,
                b.verify_warning,
                b.last_error,
                b.updated_at
            FROM clients c
            LEFT JOIN gstr2b_batches b ON UPPER(TRIM(c.gstin)) = UPPER(TRIM(b.client_gstin)) AND b.return_period IN (${placeholders})
            ORDER BY c.trade_name ASC, c.legal_name ASC, b.updated_at DESC
        `;

        db.all(query, candidatePeriods, (err, rows) => {
            if (err) {
                console.error('[GSTR-2B FY Summary] DB Query error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }

            const clientMap = new Map();
            const populatedMonthsPerClient = new Map(); // gstin -> Set(canonMonth)

            for (const r of rows) {
                const gUpper = String(r.gstin || '').trim().toUpperCase();
                if (!clientMap.has(gUpper)) {
                    const monthDetails = {};
                    for (const m of months12) {
                        const monthPart = m.split(' ')[0];
                        monthDetails[m] = {
                            period: m,
                            month: monthPart,
                            status: 'PENDING',
                            totalInvoices: 0,
                            b2bCount: 0,
                            b2baCount: 0,
                            cdnrCount: 0,
                            cdnraCount: 0,
                            isdCount: 0,
                            impgCount: 0,
                            impgsezCount: 0,
                            ecoCount: 0,
                            eligibleItcTotal: 0,
                            ineligibleTotal: 0,
                            verifyStatus: 'UNVERIFIED',
                            verifyWarning: null,
                            lastError: null,
                            updatedAt: null
                        };
                    }

                    clientMap.set(gUpper, {
                        id: r.client_id,
                        gstin: r.gstin,
                        trade_name: r.trade_name || r.legal_name || r.gstin,
                        legal_name: r.legal_name,
                        phone: r.phone,
                        email: r.email,
                        hasCreds: Boolean(r.has_credentials && r.portal_username),
                        portalUsername: r.portal_username,
                        financialYear: fy,
                        syncedMonths: [],
                        nilMonths: [],
                        pendingMonths: [...months12],
                        monthDetails,
                        stats: {
                            totalInvoices: 0,
                            b2bCount: 0,
                            b2baCount: 0,
                            cdnrCount: 0,
                            cdnraCount: 0,
                            isdCount: 0,
                            impgCount: 0,
                            impgsezCount: 0,
                            ecoCount: 0,
                            ineligibleTotal: 0,
                            eligibleItc: { igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 }
                        }
                    });
                    populatedMonthsPerClient.set(gUpper, new Set());
                }

                if (r.return_period) {
                    const c = clientMap.get(gUpper);
                    const canonMonth = normalizeReturnPeriod(r.return_period);
                    const clientPopulated = populatedMonthsPerClient.get(gUpper);

                    if (months12.includes(canonMonth) && !clientPopulated.has(canonMonth)) {
                        clientPopulated.add(canonMonth);
                        const bStatus = r.batch_status || 'PENDING';

                        c.monthDetails[canonMonth] = {
                            period: canonMonth,
                            month: canonMonth.split(' ')[0],
                            status: bStatus,
                            totalInvoices: r.total_invoices || 0,
                            b2bCount: r.b2b_count || 0,
                            b2baCount: r.b2ba_count || 0,
                            cdnrCount: r.cdnr_count || 0,
                            cdnraCount: r.cdnra_count || 0,
                            isdCount: r.isd_count || 0,
                            impgCount: r.impg_count || 0,
                            impgsezCount: r.impgsez_count || 0,
                            ecoCount: r.eco_count || 0,
                            eligibleItcTotal: r.eligible_itc_total || 0,
                            ineligibleTotal: r.ineligible_itc_total || 0,
                            verifyStatus: r.verify_status || 'UNVERIFIED',
                            verifyWarning: r.verify_warning || null,
                            lastError: r.last_error || null,
                            updatedAt: r.updated_at || null
                        };

                        if (bStatus === 'SYNCED' || bStatus === 'PUSHED_TO_3B' || bStatus === 'NIL_SYNCED') {
                            if (!c.syncedMonths.includes(canonMonth)) {
                                c.syncedMonths.push(canonMonth);
                                c.pendingMonths = c.pendingMonths.filter(m => m !== canonMonth);
                            }
                            if (bStatus === 'NIL_SYNCED' && !c.nilMonths.includes(canonMonth)) {
                                c.nilMonths.push(canonMonth);
                            }

                            c.stats.totalInvoices += (r.total_invoices || 0);
                            c.stats.b2bCount += (r.b2b_count || 0);
                            c.stats.b2baCount += (r.b2ba_count || 0);
                            c.stats.cdnrCount += (r.cdnr_count || 0);
                            c.stats.cdnraCount += (r.cdnra_count || 0);
                            c.stats.isdCount += (r.isd_count || 0);
                            c.stats.impgCount += (r.impg_count || 0);
                            c.stats.impgsezCount += (r.impgsez_count || 0);
                            c.stats.ecoCount += (r.eco_count || 0);
                            c.stats.ineligibleTotal += (r.ineligible_itc_total || 0);
                            c.stats.eligibleItc.igst += (r.eligible_itc_igst || 0);
                            c.stats.eligibleItc.cgst += (r.eligible_itc_cgst || 0);
                            c.stats.eligibleItc.sgst += (r.eligible_itc_sgst || 0);
                            c.stats.eligibleItc.cess += (r.eligible_itc_cess || 0);
                            c.stats.eligibleItc.total += (r.eligible_itc_total || 0);
                        }
                    }
                }
            }

            const clientsList = Array.from(clientMap.values()).map(c => {
                const isFullySynced = c.syncedMonths.length === 12;
                const isPartial = c.syncedMonths.length > 0 && c.syncedMonths.length < 12;
                return {
                    ...c,
                    syncedCount: c.syncedMonths.length,
                    totalMonths: 12,
                    status: isFullySynced ? 'SYNCED' : (isPartial ? 'PARTIAL' : 'PENDING'),
                    stats: {
                        ...c.stats,
                        ineligibleTotal: Math.round(c.stats.ineligibleTotal * 100) / 100,
                        eligibleItc: {
                            igst: Math.round(c.stats.eligibleItc.igst * 100) / 100,
                            cgst: Math.round(c.stats.eligibleItc.cgst * 100) / 100,
                            sgst: Math.round(c.stats.eligibleItc.sgst * 100) / 100,
                            cess: Math.round(c.stats.eligibleItc.cess * 100) / 100,
                            total: Math.round(c.stats.eligibleItc.total * 100) / 100
                        }
                    }
                };
            });

            const totalClients = clientsList.length;
            const fullySyncedClients = clientsList.filter(c => c.status === 'SYNCED').length;
            const partiallySyncedClients = clientsList.filter(c => c.status === 'PARTIAL').length;
            const pendingClients = clientsList.filter(c => c.status === 'PENDING').length;
            const total12mInvoices = clientsList.reduce((acc, c) => acc + c.stats.totalInvoices, 0);
            const total12mEligibleItc = Math.round(clientsList.reduce((acc, c) => acc + c.stats.eligibleItc.total, 0) * 100) / 100;

            res.json({
                success: true,
                financialYear: fy,
                overview: {
                    totalClients,
                    fullySyncedClients,
                    partiallySyncedClients,
                    pendingClients,
                    downloadedClients: fullySyncedClients + partiallySyncedClients,
                    totalEligibleItc: total12mEligibleItc,
                    total12mEligibleItc,
                    totalInvoices: total12mInvoices,
                    total12mInvoices
                },
                clients: clientsList
            });
        });
    });

    // ─── 1C. EXPORT FULL YEAR CONSOLIDATED 2B EXCEL WORKBOOK ──────────────────
    app.get('/api/gstr2b/export-full-year/:gstin', (req, res) => {
        const { gstin } = req.params;
        const fy = req.query.financialYear || '2026-27';
        const startYear = parseInt(fy.match(/\d{4}/)?.[0] || '2026', 10);
        const endYear = startYear + 1;
        const months12 = [
            `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
            `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
            `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
            `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
        ];
        const candidatePeriods = Array.from(new Set(months12.flatMap(m => buildStrictPeriodFilter(m).params)));
        const placeholders = candidatePeriods.map(() => '?').join(',');

        db.get(`SELECT trade_name, legal_name, gstin FROM clients WHERE UPPER(TRIM(gstin)) = ?`, [gstin.toUpperCase()], (cErr, client) => {
            const clientInfo = client || { trade_name: gstin, gstin: gstin.toUpperCase() };

            const query = `
                SELECT * FROM gstr2b_invoices
                WHERE UPPER(TRIM(client_gstin)) = ? AND return_period IN (${placeholders})
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;

            db.all(query, [gstin.toUpperCase(), ...candidatePeriods], (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (!rows || rows.length === 0) {
                    return res.status(404).json({ success: false, error: `No GSTR-2B invoices found for ${gstin} in FY ${fy}` });
                }

                // Canonicalize return_period on invoices
                const normRows = rows.map(r => ({
                    ...r,
                    return_period: normalizeReturnPeriod(r.return_period, r.idt) || r.return_period
                }));

                const wb = generateGstr2bFullYearWorkbook({
                    clientInfo,
                    financialYear: fy,
                    invoices: normRows
                });

                const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                const cleanFy = fy.replace(/[^0-9]/g, '');
                const fileName = `GSTR2B_SectionWiseSummary_${gstin.toUpperCase()}_${cleanFy}.xlsx`;

                // Also silently save into client's configured Storage Path from Settings tab
                db.get("SELECT value FROM app_config WHERE key = 'returns_data_path' OR key = 'master_data_path' ORDER BY CASE WHEN key = 'returns_data_path' THEN 1 ELSE 2 END LIMIT 1", [], (cfgErr, cfgRow) => {
                    if (cfgRow && cfgRow.value) {
                        const raw = String(cfgRow.value).trim().replace(/^["']|["']$/g, '');
                        if (raw && fs.existsSync(raw)) {
                            const cRoot = path.resolve(raw);
                            const safeName = (clientInfo.trade_name || clientInfo.legal_name || '').replace(/[\\/:*?"<>|]/g, '').trim();
                            const clientFolderName = safeName ? `${safeName} - ${gstin.toUpperCase()}` : gstin.toUpperCase();
                            const saveDirs = [
                                path.join(cRoot, 'gstr2b', gstin.toUpperCase()),
                                path.join(cRoot, 'gst_returns_data', clientFolderName, fy, 'GSTR-2B'),
                                path.join(cRoot, clientFolderName, fy, 'GSTR-2B')
                            ];
                            for (const d of saveDirs) {
                                try {
                                    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                                    fs.writeFileSync(path.join(d, fileName), buf);
                                } catch (e) {}
                            }
                        }
                    }
                });

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.setHeader('Content-Length', buf.length);
                res.end(buf);
            });
        });
    });

    // ─── 2. GET DETAIL INVOICES FOR A CLIENT & PERIOD ──────────────────────────
    app.get('/api/gstr2b/invoices/:gstin', (req, res) => {
        const { gstin } = req.params;
        const period = req.query.period;
        const fy = req.query.financialYear;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        const isFullYear = period === 'FULL_YEAR' || (!period && fy);
        let query = '';
        let queryParams = [];
        let singlePeriodFilter = null;

        if (isFullYear) {
            const targetFy = fy || '2026-27';
            const startYear = parseInt(targetFy.match(/\d{4}/)?.[0] || '2026', 10);
            const endYear = startYear + 1;
            const months12 = [
                `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
                `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
                `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
                `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
            ];
            const candidatePeriods = Array.from(new Set(months12.flatMap(m => buildStrictPeriodFilter(m).params)));
            const placeholders = candidatePeriods.map(() => '?').join(',');
            query = `
                SELECT * FROM gstr2b_invoices
                WHERE UPPER(TRIM(client_gstin)) = ? AND return_period IN (${placeholders})
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;
            queryParams = [gstin.toUpperCase(), ...candidatePeriods];
        } else {
            const normPeriod = normalizeReturnPeriod(period) || String(period).trim();
            singlePeriodFilter = buildStrictPeriodFilter(normPeriod);
            query = `
                SELECT * FROM gstr2b_invoices
                WHERE UPPER(TRIM(client_gstin)) = ? AND (${singlePeriodFilter.clause})
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;
            queryParams = [gstin.toUpperCase(), ...singlePeriodFilter.params];
        }

        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const normRows = (rows || []).map(r => ({
                ...r,
                return_period: normalizeReturnPeriod(r.return_period, r.idt) || r.return_period
            }));

            if (!isFullYear && period && singlePeriodFilter) {
                db.get(
                    `SELECT * FROM gstr2b_batches WHERE UPPER(TRIM(client_gstin)) = ? AND (${singlePeriodFilter.clause}) ORDER BY updated_at DESC LIMIT 1`,
                    [gstin.toUpperCase(), ...singlePeriodFilter.params],
                    (bErr, batchRow) => {
                        res.json({
                            success: true,
                            gstin: gstin.toUpperCase(),
                            period: singlePeriodFilter.canonical || period,
                            financialYear: fy || null,
                            count: normRows.length,
                            batch: batchRow || null,
                            invoices: normRows
                        });
                    }
                );
            } else {
                res.json({
                    success: true,
                    gstin: gstin.toUpperCase(),
                    period: isFullYear ? 'FULL_YEAR' : (singlePeriodFilter?.canonical || period),
                    financialYear: fy || null,
                    count: normRows.length,
                    invoices: normRows
                });
            }
        });
    });

    // ─── 2B. CLEAR STORED GSTR-2B DATA FOR A CLIENT & PERIOD ──────────────────
    app.delete('/api/gstr2b/clear/:gstin', (req, res) => {
        const gstinUpper = String(req.params.gstin || '').trim().toUpperCase();
        const rawPeriod = String(req.query.period || req.body?.period || '').trim();
        const month = String(req.query.month || req.body?.month || '').trim();
        const fy = String(req.query.fy || req.body?.fy || '').trim();
        if (!gstinUpper || (!rawPeriod && !month && !fy)) {
            return res.status(400).json({ success: false, error: 'gstin and period/month/fy required' });
        }
        let pf;
        if (rawPeriod === 'ALL') {
            pf = { clause: '1=1', params: [] };
        } else {
            const candidates = [];
            if (rawPeriod) {
                const normPeriod = normalizeReturnPeriod(rawPeriod) || rawPeriod;
                const basePf = buildStrictPeriodFilter(normPeriod);
                candidates.push(...basePf.params);
            }
            if (month && fy) {
                const startYr = parseInt(fy.match(/\d{4}/)?.[0] || '2025', 10);
                const endYr = startYr + 1;
                candidates.push(`${month} ${startYr}`, `${month} ${endYr}`);
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const mIdx = monthNames.findIndex(m => m.toLowerCase().startsWith(month.toLowerCase().slice(0, 3)));
                if (mIdx !== -1) {
                    const mNum = String(mIdx + 1).padStart(2, '0');
                    candidates.push(`${mNum}${startYr}`, `${mNum}${endYr}`, `${mNum}-${startYr}`, `${mNum}-${endYr}`);
                }
            }
            const unique = Array.from(new Set(candidates));
            if (unique.length === 0) {
                return res.status(400).json({ success: false, error: 'Invalid or missing return period specification.' });
            }
            pf = {
                clause: `return_period IN (${unique.map(() => '?').join(',')})`,
                params: unique
            };
        }
        db.serialize(() => {
            db.run(`DELETE FROM gstr2b_invoices WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause})`, [gstinUpper, ...pf.params]);
            db.run(`DELETE FROM gstr2b_batches WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause})`, [gstinUpper, ...pf.params], function (err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, cleared: true, gstin: gstinUpper, period: rawPeriod || month });
            });
        });
    });

    // ─── 3. ASYNC AUTOPILOT JOB ORCHESTRATION & SSE STREAMING ────────────────
    app.post('/api/gstr2b/jobs/start', async (req, res) => {
        const { gstin, returnPeriod, financialYear, isFullYear, onlyPeriods, skipSynced, portal_username, portal_password, portalUsername, portalPassword, forceRestart } = req.body || {};
        if (!gstin || (!returnPeriod && !isFullYear)) {
            return res.status(400).json({ success: false, error: 'gstin and returnPeriod (or isFullYear) required' });
        }

        const normPeriod = isFullYear && !returnPeriod
            ? `April ${(financialYear || '2026-27').match(/\d{4}/)?.[0] || '2026'}`
            : (normalizeReturnPeriod(returnPeriod) || returnPeriod);

        try {
            const { jobId, job } = createAndRunAutopilotJob({
                db,
                gstin,
                returnPeriod: normPeriod,
                financialYear,
                isFullYear: Boolean(isFullYear),
                onlyPeriods: Array.isArray(onlyPeriods) ? onlyPeriods.map(p => normalizeReturnPeriod(p) || p) : null,
                skipSynced: Boolean(skipSynced),
                portal_username: portal_username || portalUsername,
                portal_password: portal_password || portalPassword,
                forceRestart: Boolean(forceRestart)
            });

            return res.status(202).json({
                success: true,
                jobId,
                gstin: job.gstin,
                mode: job.mode,
                streamUrl: `/api/gstr2b/job-stream/${jobId}`,
                pollUrl: `/api/gstr2b/job/${jobId}`
            });
        } catch (err) {
            if (err.statusCode === 409) {
                return res.status(409).json({
                    success: false,
                    code: err.code || 'JOB_ALREADY_RUNNING',
                    activeJobId: err.activeJobId,
                    error: err.message
                });
            }
            return res.status(err.statusCode || 500).json({
                success: false,
                error: err.message || 'Failed to start autopilot job'
            });
        }
    });

    app.get('/api/gstr2b/job-stream/:jobId', (req, res) => {
        subscribeToJobStream(req.params.jobId, req, res);
    });

    app.get('/api/gstr2b/job/:jobId', (req, res) => {
        const snapshot = getJobSnapshot(req.params.jobId);
        if (!snapshot) {
            return res.status(404).json({ success: false, error: `Job ${req.params.jobId} not found` });
        }
        res.json({ success: true, job: snapshot });
    });

    // ─── 3A. PLAYWRIGHT AUTOPILOT 2B & GSTR-1 DOWNLOADER (DUAL MODE) ───────────
    app.post('/api/gstr2b/portal-sync-browser', async (req, res) => {
        const { gstin, returnPeriod, financialYear, isFullYear, onlyPeriods, skipSynced, portal_username, portal_password, portalUsername, portalPassword, async: isAsyncMode } = req.body || {};
        if (!gstin || (!returnPeriod && !isFullYear)) {
            return res.status(400).json({ success: false, error: 'gstin and returnPeriod required' });
        }

        const normPeriod = isFullYear && !returnPeriod
            ? `April ${(financialYear || '2026-27').match(/\d{4}/)?.[0] || '2026'}`
            : (normalizeReturnPeriod(returnPeriod) || returnPeriod);

        if (isAsyncMode === true) {
            try {
                const { jobId, job } = createAndRunAutopilotJob({
                    db,
                    gstin,
                    returnPeriod: normPeriod,
                    financialYear,
                    isFullYear: Boolean(isFullYear),
                    onlyPeriods: Array.isArray(onlyPeriods) ? onlyPeriods.map(p => normalizeReturnPeriod(p) || p) : null,
                    skipSynced: Boolean(skipSynced),
                    portal_username: portal_username || portalUsername,
                    portal_password: portal_password || portalPassword,
                    forceRestart: true
                });
                return res.status(202).json({
                    success: true,
                    async: true,
                    jobId,
                    streamUrl: `/api/gstr2b/job-stream/${jobId}`,
                    pollUrl: `/api/gstr2b/job/${jobId}`
                });
            } catch (err) {
                return res.status(err.statusCode || 500).json({ success: false, error: err.message });
            }
        }

        // Synchronous Legacy Fallback Mode (backward compatible for ReturnsDashboard.tsx:1644)
        try {
            const { jobId, job, completionPromise } = createAndRunAutopilotJob({
                db,
                gstin,
                returnPeriod: normPeriod,
                financialYear,
                isFullYear: Boolean(isFullYear),
                onlyPeriods: Array.isArray(onlyPeriods) ? onlyPeriods.map(p => normalizeReturnPeriod(p) || p) : null,
                skipSynced: Boolean(skipSynced),
                portal_username: portal_username || portalUsername,
                portal_password: portal_password || portalPassword,
                forceRestart: true
            });

            res.setHeader('X-Autopilot-Job-Id', jobId);

            res.on('close', () => {
                if (!res.writableEnded) {
                    cancelAutopilotJob({ jobId, gstin: job.gstin, reason: 'HTTP client disconnected' }).catch(() => {});
                }
            });

            const result = await completionPromise;
            return res.status(result?.cancelled ? 200 : (result?.success === false ? 500 : 200)).json(result);
        } catch (err) {
            console.error('[GSTR-2B Autopilot] Execution error:', err);
            if (!res.headersSent) {
                return res.status(err.statusCode || 500).json({
                    success: false,
                    error: err.message || 'GSTR-2B Autopilot execution failed'
                });
            }
        }
    });

    // ─── 3B. CANCEL / ABORT ACTIVE AUTOPILOT BROWSER SESSION ─────────────────
    app.post('/api/gstr2b/cancel', async (req, res) => {
        try {
            const g = String(req.body?.gstin || req.body?.client_gstin || '').trim().toUpperCase();
            const jobId = req.body?.jobId || null;

            // 1. Cancel via job manager first
            await cancelAutopilotJob({ jobId, gstin: g, reason: 'User requested cancel' }).catch(() => {});

            // 2. Fallback to activeBrowsers or global browserState
            if (g && activeBrowsers.has(g)) {
                const targetState = activeBrowsers.get(g);
                if (targetState && targetState.current) {
                    const pid = typeof targetState.current.process === 'function' ? targetState.current.process()?.pid : null;
                    await targetState.current.close().catch(() => {});
                    if (pid && process.platform === 'win32') {
                        exec(`taskkill /F /T /PID ${pid}`, () => {});
                    }
                    targetState.current = null;
                }
                activeBrowsers.delete(g);
            } else if (!g && activeBrowsers.size > 0) {
                for (const [key, targetState] of activeBrowsers.entries()) {
                    if (targetState && targetState.current) {
                        const pid = typeof targetState.current.process === 'function' ? targetState.current.process()?.pid : null;
                        await targetState.current.close().catch(() => {});
                        if (pid && process.platform === 'win32') {
                            exec(`taskkill /F /T /PID ${pid}`, () => {});
                        }
                        targetState.current = null;
                    }
                    activeBrowsers.delete(key);
                }
            } else if (browserState && browserState.current) {
                const pid = typeof browserState.current.process === 'function' ? browserState.current.process()?.pid : null;
                await browserState.current.close().catch(() => {});
                if (pid && process.platform === 'win32') {
                    exec(`taskkill /F /T /PID ${pid}`, () => {});
                }
                browserState.current = null;
            }

            const p = String(req.body?.returnPeriod || req.body?.period || '').trim();
            const m = String(req.body?.month || req.body?.selectedMonth || '').trim();
            const fy = String(req.body?.financialYear || '').trim();

            let targetPeriodStr = '';
            if (p) {
                targetPeriodStr = normalizeReturnPeriod(p) || p;
            } else if (m) {
                const startYear = parseInt(fy.match(/\d{4}/)?.[0] || '2026', 10);
                const endYear = startYear + 1;
                const isQ4 = ['january', 'february', 'march', 'jan', 'feb', 'mar'].some(q => m.toLowerCase().startsWith(q));
                const yyyy = isQ4 ? endYear : startYear;
                targetPeriodStr = normalizeReturnPeriod(`${m} ${yyyy}`) || `${m} ${yyyy}`;
            }

            if (g && targetPeriodStr) {
                const pf = buildStrictPeriodFilter(targetPeriodStr);
                await new Promise((resolve) => {
                    db.run(
                        `UPDATE gstr2b_batches 
                         SET status = 'CANCELLED', updated_at = ? 
                         WHERE UPPER(TRIM(client_gstin)) = ? 
                           AND (${pf.clause})
                           AND COALESCE(status, 'PENDING') NOT IN ('SYNCED', 'PUSHED_TO_3B', 'NIL_SYNCED')`,
                        [Date.now(), g, ...pf.params],
                        (uErr) => {
                            if (uErr) console.warn('[GSTR-2B Autopilot] Note: batch cancel update warning:', uErr.message);
                            resolve();
                        }
                    );
                });
            }
            res.json({ success: true, message: 'Browser session terminated and GSTR-2B sync cancelled' });
        } catch (e) {
            console.error('[GSTR-2B Autopilot] Error canceling browser session:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 4. SCAN DOWNLOADS FOLDER (1-Click Auto Scanner) ───────────────────────
    app.post('/api/gstr2b/scan-downloads', async (req, res) => {
        const { returnPeriod, folderPath, customFolder } = req.body;
        const period = returnPeriod || '';

        const foldersToScan = [
            path.join(os.homedir(), 'Downloads'),
            path.join(process.cwd(), 'scratch', 'downloads'),
            path.join(process.cwd(), 'scratch', 'downloads', 'gstr2b')
        ];

        // Explicit test / user working directories
        ['D:\\test files', 'C:\\test files', 'E:\\test files'].forEach(d => {
            if (fs.existsSync(d) && !foldersToScan.includes(d)) foldersToScan.push(d);
        });

        if (folderPath && fs.existsSync(folderPath) && !foldersToScan.includes(folderPath)) {
            foldersToScan.push(folderPath);
        }
        if (customFolder && fs.existsSync(customFolder) && !foldersToScan.includes(customFolder)) {
            foldersToScan.push(customFolder);
        }

        // Include Configured Storage Paths from Settings tab (app_config)
        try {
            const configRow = await new Promise((resolve) => {
                db.get(
                    "SELECT value FROM app_config WHERE key = 'returns_data_path' OR key = 'master_data_path' ORDER BY CASE WHEN key = 'returns_data_path' THEN 1 ELSE 2 END LIMIT 1",
                    [],
                    (err, row) => resolve(row)
                );
            });
            if (configRow && configRow.value) {
                const raw = String(configRow.value).trim().replace(/^["']|["']$/g, '');
                if (raw && fs.existsSync(raw)) {
                    const cRoot = path.resolve(raw);
                    foldersToScan.push(cRoot);
                    foldersToScan.push(path.join(cRoot, 'gstr2b'));
                    foldersToScan.push(path.join(cRoot, 'gst_returns_data'));
                    
                    // Also scan any client subfolders inside gstr2b or gst_returns_data
                    [path.join(cRoot, 'gstr2b'), path.join(cRoot, 'gst_returns_data')].forEach(base => {
                        if (fs.existsSync(base)) {
                            try {
                                const subEntries = fs.readdirSync(base, { withFileTypes: true });
                                for (const sub of subEntries) {
                                    if (sub.isDirectory()) {
                                        foldersToScan.push(path.join(base, sub.name));
                                    }
                                }
                            } catch {}
                        }
                    });
                }
            }
        } catch (e) {}

        let totalParsedInvoices = 0;
        let matchedClients = 0;
        const processedGstins = new Set();

        for (const folder of foldersToScan) {
            if (!fs.existsSync(folder)) continue;
            let files = [];
            try { files = fs.readdirSync(folder); } catch (e) { continue; }

            for (const f of files) {
                const lower = f.toLowerCase();
                const is2b = lower.includes('2b') || lower.includes('gstr2b') || lower.includes('gstr-2b') || lower.includes('r2b');
                const isExt = lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.json') || lower.endsWith('.zip');
                if (!is2b || !isExt) continue;

                const filePath = path.join(folder, f);
                let parseResult = null;

                if (lower.endsWith('.xlsx')) {
                    parseResult = parseGstr2bExcelHelper(filePath, '', period);
                } else if (lower.endsWith('.json')) {
                    try {
                        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        parseResult = parseGstr2bJsonHelper(raw, '', period);
                    } catch (e) {}
                } else if (lower.endsWith('.zip')) {
                    parseResult = await parseGstr2bZipHelper(filePath, '', period);
                }

                if (parseResult && parseResult.invoices && parseResult.invoices.length > 0 && parseResult.gstin) {
                    const clientGstin = parseResult.gstin.toUpperCase();
                    const targetPeriod = normalizeReturnPeriod(parseResult.period || period) || String(parseResult.period || period).trim();

                    const verifyRes = verifyParsedGstr2bPayload(parseResult, clientGstin, targetPeriod);
                    if (!verifyRes.valid) {
                        console.warn(`[GSTR-2B Scan] Skipping ${f} due to verification mismatch:`, verifyRes.error);
                        continue;
                    }

                    await bulkSaveGstr2bInvoices(
                        db,
                        clientGstin,
                        targetPeriod,
                        parseResult.invoices,
                        lower.endsWith('.xlsx') ? filePath : null,
                        lower.endsWith('.json') ? filePath : null,
                        { portalSummary: parseResult.portalSummary }
                    );

                    totalParsedInvoices += parseResult.invoices.length;
                    if (!processedGstins.has(clientGstin)) {
                        processedGstins.add(clientGstin);
                        matchedClients++;
                    }
                }
            }
        }

        res.json({
            success: true,
            message: `Scanned Downloads! Found & synced ${totalParsedInvoices} invoices across ${matchedClients} clients.`,
            matchedClients,
            totalParsedInvoices,
            gstins: Array.from(processedGstins)
        });
    });

    // ─── 5. MANUAL FILE DROPZONE INGESTION ─────────────────────────────────────
    app.post('/api/gstr2b/ingest', async (req, res) => {
        const { gstin, returnPeriod, fileName, base64Content } = req.body;
        if (!fileName || !base64Content) {
            return res.status(400).json({ success: false, error: 'fileName and base64Content required' });
        }

        try {
            const buffer = Buffer.from(base64Content, 'base64');
            const rawFileName = fileName || 'uploaded_2b.xlsx';
            const safeName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
            const tempPath = path.join(os.tmpdir(), `upload_2b_${Date.now()}_${safeName}`);
            fs.writeFileSync(tempPath, buffer);

            const lower = safeName.toLowerCase();
            let parseResult = null;

            if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                parseResult = parseGstr2bExcelHelper(tempPath, gstin || '', returnPeriod || '');
            } else if (lower.endsWith('.json')) {
                const raw = JSON.parse(buffer.toString('utf8'));
                parseResult = parseGstr2bJsonHelper(raw, gstin || '', returnPeriod || '');
            } else if (lower.endsWith('.zip')) {
                parseResult = await parseGstr2bZipHelper(tempPath, gstin || '', returnPeriod || '');
            }

            try { fs.unlinkSync(tempPath); } catch (e) {}

            if (!parseResult || !parseResult.invoices || parseResult.invoices.length === 0) {
                return res.status(400).json({ success: false, error: 'Could not extract valid GSTR-2B invoices from uploaded file.' });
            }

            const targetGstin = (parseResult.gstin || gstin || '').toUpperCase();
            const targetPeriod = normalizeReturnPeriod(parseResult.period || returnPeriod || '') || (parseResult.period || returnPeriod || '');

            if (!targetGstin) {
                return res.status(400).json({ success: false, error: 'No GSTIN identified in file. Please specify client GSTIN.' });
            }

            const verifyRes = verifyParsedGstr2bPayload(parseResult, targetGstin, targetPeriod);
            if (!verifyRes.valid) {
                return res.status(400).json({ success: false, code: verifyRes.code, error: verifyRes.error });
            }

            const saveRes = await bulkSaveGstr2bInvoices(
                db,
                targetGstin,
                targetPeriod,
                parseResult.invoices,
                lower.endsWith('.xlsx') || lower.endsWith('.xls') ? tempPath : null,
                lower.endsWith('.json') ? tempPath : null,
                { portalSummary: parseResult.portalSummary }
            );

            res.json({
                success: true,
                message: `Successfully ingested ${parseResult.invoices.length} invoices for ${targetGstin}!`,
                gstin: targetGstin,
                period: targetPeriod,
                invoiceCount: parseResult.invoices.length,
                verifyStatus: saveRes.verifyStatus || 'UNVERIFIED',
                verifyWarning: saveRes.verifyWarning || null,
                metrics: saveRes.metrics
            });
        } catch (err) {
            console.error('[GSTR-2B Ingest] Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 6. PUSH APPROVED 2B ITC TO GSTR-3B TABLE 4 (DECOUPLED SAFE NO-OP) ─────
    app.post('/api/gstr2b/push-to-3b', (req, res) => {
        const { gstin, period } = req.body || {};
        res.json({
            success: true,
            decoupled: true,
            message: 'GSTR-2B and GSTR-3B are decoupled. Upload GSTR-2B files directly into Table 4.',
            gstin,
            period,
            itc2b: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
            rcmInward: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
            creditNotes: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
            importGoods: { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 },
            counts: { totalInvoices: 0, b2b: 0, cdnr: 0 }
        });
    });

    // ─── 7. BRING BROWSER WINDOW TO FRONT (MANUAL OVERRIDE) ────────────────────
    app.post('/api/gstr2b/bring-to-front', async (req, res) => {
        try {
            const { jobId, gstin } = req.body || {};
            if (jobId || gstin) {
                const brought = await bringJobBrowserToFront({ jobId, gstin }).catch(() => false);
                if (brought) {
                    return res.json({ success: true, message: 'Window focus triggered via job manager' });
                }
            }

            let browserPid = null;
            if (browserState.current) {
                try {
                    const cdp = await browserState.current.newBrowserCDPSession();
                    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
                    browserPid = processInfo.find(x => x.type === 'browser')?.id || null;
                } catch (e) {}
            }

            const bringPath = path.join(process.cwd(), 'scratch', 'bring_to_front.ps1');
            if (fs.existsSync(bringPath)) {
                const arg = browserPid ? `-TargetPid ${browserPid}` : '';
                exec(`powershell -ExecutionPolicy Bypass -File "${bringPath}" ${arg}`, { windowsHide: true }, () => {});
            } else {
                let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
                if (browserPid) psParts.push(`$wshell.AppActivate(${browserPid});`);
                psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
                psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
                psParts.push(`$wshell.AppActivate('GST | Login');`);
                psParts.push(`$wshell.AppActivate('Login');`);
                psParts.push(`$wshell.AppActivate('Chrome');`);
                const psCmd = `powershell -NoProfile -Command "${psParts.join(' ')}"`;
                exec(psCmd, () => {});
            }
            res.json({ success: true, message: 'Window focus triggered' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 8. QUICK LAUNCH & AUTO-FILL GST LOGIN PORTAL ─────────────────────────
    app.post('/api/gstr2b/open-portal-login', async (req, res) => {
        const { gstin, portal_username, portal_password, portalUsername, portalPassword } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        try {
            const effUser = portal_username || portalUsername;
            const effPass = portal_password || portalPassword;
            const result = await openPortalLoginHelper({ db, gstin, portal_username: effUser, portal_password: effPass, browserState });
            res.json({ success: true, message: 'Chrome launched and login details filled!', ...result });
        } catch (err) {
            console.error('[Open Portal Login] Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 9. GSTR-3B INWARD ITC MANUAL ALLOCATION & AUDIT WORKBENCH ───────────

    // GET /api/gstr3b/itc-allocations/:gstin?period=June%202025
    app.get('/api/gstr3b/itc-allocations/:gstin', async (req, res) => {
        const { gstin } = req.params;
        const period = req.query.period;
        if (!gstin || !period) {
            return res.status(400).json({ success: false, error: 'gstin and period query parameter required' });
        }

        if (gstin === 'Not Specified' || gstin.length < 5) {
            return res.json({
                success: true,
                clientGstin: gstin,
                returnPeriod: period,
                summary: {
                    totalInvoices: 0,
                    totalTaxable: 0,
                    totalTax: 0,
                    eligible_4a5: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    temporary_4b2: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    permanent_4b1: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    ineligible_4d1: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    ineligible_4d2: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    rcm_4a3: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    import_4a1: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 },
                    deferred: { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 }
                },
                invoices: []
            });
        }

        try {
            const data = await getInvoicesWithAllocations(db, gstin, period);
            res.json({ success: true, ...data });
        } catch (err) {
            console.error('[GSTR-3B ITC Allocations] Fetch error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/gstr3b/itc-allocations
    app.post('/api/gstr3b/itc-allocations', async (req, res) => {
        const { clientGstin, returnPeriod, allocations } = req.body;
        if (!clientGstin || !returnPeriod || !Array.isArray(allocations)) {
            return res.status(400).json({ success: false, error: 'clientGstin, returnPeriod, and allocations array required' });
        }

        try {
            const saveRes = await bulkSaveItcAllocations(db, clientGstin, returnPeriod, allocations);
            // Fetch updated summary
            const data = await getInvoicesWithAllocations(db, clientGstin, returnPeriod);
            res.json({ success: true, updatedCount: saveRes.updatedCount, summary: data.summary });
        } catch (err) {
            console.error('[GSTR-3B ITC Allocations] Save error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/gstr3b/export-itc-allocations?gstin=...&period=...&clientName=...
    app.get('/api/gstr3b/export-itc-allocations', async (req, res) => {
        const { gstin, period, clientName } = req.query;
        if (!gstin || !period) {
            return res.status(400).json({ success: false, error: 'gstin and period query parameters required' });
        }

        try {
            const data = await getInvoicesWithAllocations(db, gstin, period);
            const wb = generateItcAllocationWorkbook({
                clientGstin: gstin,
                returnPeriod: period,
                clientName: clientName || '',
                summary: data.summary,
                invoices: data.invoices
            });

            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            const cleanPeriod = (period || 'period').replace(/[^a-zA-Z0-9]/g, '_');
            const cleanGstin = gstin.toUpperCase();
            const filename = `GSTR3B_ITC_Allocations_${cleanGstin}_${cleanPeriod}.xlsx`;

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buf);
        } catch (err) {
            console.error('[GSTR-3B ITC Allocations] Export error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── GSTR-2B TO TALLY AUDIT LEDGER ENDPOINTS (PHASE 41) ─────────────────
    // 1. Get already posted 2B invoices for a client
    app.get('/api/gstr2b-tally/posted/:gstin', (req, res) => {
        const { gstin } = req.params;
        const { financialYear, period } = req.query;

        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        let query = `
            SELECT id, client_gstin, financial_year, return_period, section,
                   supplier_gstin, supplier_name, invoice_number, invoice_date,
                   taxable_value, igst, cgst, sgst, cess, total_value,
                   voucher_type, tally_voucher_no, status, tally_company, posted_at
            FROM tally_2b_posted_entries
            WHERE UPPER(TRIM(client_gstin)) = ?
        `;
        const params = [gstin.toUpperCase().trim()];

        if (financialYear) {
            query += ' AND financial_year = ?';
            params.push(financialYear);
        }
        if (period && period !== 'ALL' && period !== 'FULL_YEAR') {
            query += ' AND return_period = ?';
            params.push(period);
        }

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('[GSTR2B-Tally] Fetch posted entries error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            // Create a lookup map of keys for O(1) checking
            const postedMap = {};
            (rows || []).forEach(r => {
                const key = `${r.supplier_gstin}_${r.invoice_number}_${r.invoice_date}`.toUpperCase().trim();
                postedMap[key] = r;
            });

            res.json({
                success: true,
                count: rows ? rows.length : 0,
                postedMap,
                records: rows || []
            });
        });
    });

    // 2. Mark 2B invoices as posted into Tally
    app.post('/api/gstr2b-tally/mark-posted', (req, res) => {
        const { client_gstin, financial_year, return_period, entries, tally_company } = req.body;

        if (!client_gstin || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ success: false, error: 'client_gstin and non-empty entries array required' });
        }

        const now = Date.now();
        const clientGstinUpper = client_gstin.toUpperCase().trim();
        const fy = financial_year || '2024-25';
        const period = return_period || 'FULL_YEAR';
        const company = tally_company || '';

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            try {
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO tally_2b_posted_entries (
                        id, client_gstin, financial_year, return_period, section,
                        supplier_gstin, supplier_name, invoice_number, invoice_date,
                        taxable_value, igst, cgst, sgst, cess, total_value,
                        voucher_type, tally_voucher_no, status, tally_company, posted_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                let inserted = 0;
                for (const item of entries) {
                    const entryId = item.id || ('t2b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
                    const supplierGstin = (item.supplier_gstin || item.ctin || '').toUpperCase().trim();
                    const invNum = String(item.invoice_number || item.inum || '').trim();
                    const invDate = String(item.invoice_date || item.idt || '').trim();

                    if (!supplierGstin || !invNum) continue;

                    stmt.run([
                        entryId,
                        clientGstinUpper,
                        fy,
                        period,
                        item.section || 'B2B',
                        supplierGstin,
                        item.supplier_name || '',
                        invNum,
                        invDate,
                        Number(item.taxable_value || item.txval || 0),
                        Number(item.igst || 0),
                        Number(item.cgst || 0),
                        Number(item.sgst || 0),
                        Number(item.cess || 0),
                        Number(item.total_value || item.total_val || 0),
                        item.voucher_type || 'Purchase',
                        item.tally_voucher_no || '',
                        item.status || 'POSTED',
                        company,
                        now
                    ]);
                    inserted++;
                }

                stmt.finalize();

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        console.error('[GSTR2B-Tally] Transaction commit error:', commitErr);
                        db.run('ROLLBACK', () => {});
                        return res.status(500).json({ success: false, error: commitErr.message });
                    }
                    res.json({
                        success: true,
                        insertedCount: inserted,
                        postedAt: now
                    });
                });
            } catch (err) {
                console.error('[GSTR2B-Tally] Insert exception:', err);
                db.run('ROLLBACK', () => {});
                return res.status(500).json({ success: false, error: err.message });
            }
        });
    });

    // 3. Get chronological posting history / audit trail
    app.get('/api/gstr2b-tally/history/:gstin', (req, res) => {
        const { gstin } = req.params;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        const query = `
            SELECT posted_at, financial_year, return_period, voucher_type, tally_company,
                   COUNT(*) as total_vouchers,
                   SUM(taxable_value) as total_taxable,
                   SUM(igst + cgst + sgst + cess) as total_tax,
                   SUM(total_value) as total_amount
            FROM tally_2b_posted_entries
            WHERE UPPER(TRIM(client_gstin)) = ?
            GROUP BY posted_at, financial_year, return_period, voucher_type, tally_company
            ORDER BY posted_at DESC
            LIMIT 50
        `;

        db.all(query, [gstin.toUpperCase().trim()], (err, rows) => {
            if (err) {
                console.error('[GSTR2B-Tally] History fetch error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, history: rows || [] });
        });
    });

    // 4. Reset / Clear posting history for a client
    app.delete('/api/gstr2b-tally/posted/:gstin', (req, res) => {
        const { gstin } = req.params;
        const { financialYear } = req.query;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }
        let sql = 'DELETE FROM tally_2b_posted_entries WHERE UPPER(TRIM(client_gstin)) = ?';
        const params = [gstin.toUpperCase().trim()];
        if (financialYear) {
            sql += ' AND financial_year = ?';
            params.push(financialYear);
        }
        db.run(sql, params, function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, deletedCount: this.changes });
        });
    });

    // 5. Record rejected invoices with detailed reasons & timestamp
    app.post('/api/gstr2b-tally/record-rejections', (req, res) => {
        const { client_gstin, financial_year, return_period, rejections, tally_company } = req.body;
        if (!client_gstin || !Array.isArray(rejections) || rejections.length === 0) {
            return res.status(400).json({ success: false, error: 'client_gstin and rejections array required' });
        }
        const now = Date.now();
        const clientGstinUpper = client_gstin.toUpperCase().trim();
        const fy = financial_year || '2024-25';
        const period = return_period || 'FULL_YEAR';
        const company = tally_company || '';

        const stmt = db.prepare(`
            INSERT INTO tally_2b_rejections (
                id, client_gstin, financial_year, return_period, section,
                supplier_gstin, supplier_name, invoice_number, invoice_date,
                taxable_value, total_value, voucher_type, rejection_reason, tally_company, rejected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of rejections) {
            const id = ('rej-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
            stmt.run([
                id,
                clientGstinUpper,
                fy,
                period,
                item.section || 'B2B',
                item.supplier_gstin || item.ctin || '',
                item.supplier_name || '',
                item.invoice_number || item.inum || '',
                item.invoice_date || item.idt || '',
                Number(item.taxable_value || item.txval || 0),
                Number(item.total_value || item.total_val || 0),
                item.voucher_type || 'Purchase',
                item.rejection_reason || 'Rejected by Tally',
                company,
                now
            ]);
        }
        stmt.finalize();
        res.json({ success: true, recordedCount: rejections.length });
    });

    // 6. Get rejected invoices with timestamp and reasons
    app.get('/api/gstr2b-tally/rejections/:gstin', (req, res) => {
        const { gstin } = req.params;
        const { financialYear } = req.query;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }
        let sql = `
            SELECT id, client_gstin, financial_year, return_period, section,
                   supplier_gstin, supplier_name, invoice_number, invoice_date,
                   taxable_value, total_value, voucher_type, rejection_reason, tally_company, rejected_at
            FROM tally_2b_rejections
            WHERE UPPER(TRIM(client_gstin)) = ?
        `;
        const params = [gstin.toUpperCase().trim()];
        if (financialYear) {
            sql += ' AND financial_year = ?';
            params.push(financialYear);
        }
        sql += ' ORDER BY rejected_at DESC LIMIT 100';

        db.all(sql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, rejections: rows || [] });
        });
    });
}

export { setupGstr2bRoutes as registerGstr2bRoutes };
export default setupGstr2bRoutes;

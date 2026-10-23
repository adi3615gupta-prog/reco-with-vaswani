import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { initGstr2bDatabase, bulkSaveGstr2bInvoices, markGstr2bMonthNilSynced } from './gstr2b/db.js';
import { parseGstr2bExcelHelper, parseGstr2bJsonHelper, parseGstr2bZipHelper } from './gstr2b/parsers.js';
import { runGstr2bAutopilot, openPortalLoginHelper } from './gstr2b/autopilot.js';
import { generateGstr2bFullYearWorkbook } from './gstr2b/fullYearExcel.js';
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
export function setupGstr2bRoutes(app, db) {
    const browserState = { current: null };

    // Initialize Database Tables & Indexes
    initGstr2bDatabase(db);

    // ─── 1. GET GSTR-2B SUMMARY & CLIENTS FOR RETURN PERIOD ──────────────────
    app.get('/api/gstr2b/summary', (req, res) => {
        const period = req.query.period;
        if (!period) {
            return res.status(400).json({ success: false, error: 'period query parameter required' });
        }

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
                COALESCE(b.eligible_itc_igst, 0) as eligible_itc_igst,
                COALESCE(b.eligible_itc_cgst, 0) as eligible_itc_cgst,
                COALESCE(b.eligible_itc_sgst, 0) as eligible_itc_sgst,
                COALESCE(b.eligible_itc_cess, 0) as eligible_itc_cess,
                COALESCE(b.eligible_itc_total, 0) as eligible_itc_total,
                COALESCE(b.ineligible_itc_total, 0) as ineligible_itc_total,
                b.excel_path,
                b.json_path,
                b.downloaded_at,
                b.updated_at
            FROM clients c
            LEFT JOIN gstr2b_batches b ON c.gstin = b.client_gstin AND b.return_period = ?
            ORDER BY c.trade_name ASC, c.legal_name ASC
        `;

        db.all(query, [period], (err, rows) => {
            if (err) {
                console.error('[GSTR-2B Summary] DB Query error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }

            const clientsList = rows.map(r => ({
                id: r.client_id,
                gstin: r.gstin,
                trade_name: r.trade_name || r.legal_name || r.gstin,
                legal_name: r.legal_name,
                phone: r.phone,
                email: r.email,
                hasCreds: Boolean(r.has_credentials && r.portal_username),
                portalUsername: r.portal_username,
                status: r.batch_status,
                period,
                stats: {
                    totalInvoices: r.total_invoices,
                    b2bCount: r.b2b_count,
                    b2baCount: r.b2ba_count,
                    cdnrCount: r.cdnr_count,
                    cdnraCount: r.cdnra_count,
                    isdCount: r.isd_count,
                    impgCount: r.impg_count,
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
            }));

            const totalClients = clientsList.length;
            const downloadedClients = clientsList.filter(c => c.status === 'SYNCED').length;
            const pendingClients = totalClients - downloadedClients;
            const totalEligibleItc = Math.round(clientsList.reduce((acc, c) => acc + (c.stats.eligibleItc.total || 0), 0) * 100) / 100;
            const totalInvoices = clientsList.reduce((acc, c) => acc + (c.stats.totalInvoices || 0), 0);

            res.json({
                success: true,
                period,
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

    // ─── 1B. GET FULL YEAR 12-MONTH GSTR-2B SUMMARY & SYNC STATUS ────────────
    app.get('/api/gstr2b/fy-summary', (req, res) => {
        const fy = req.query.financialYear || '2025-26';
        const startYear = parseInt(fy.match(/\d{4}/)?.[0] || '2025', 10);
        const endYear = startYear + 1;
        const months12 = [
            `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
            `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
            `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
            `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
        ];
        const placeholders = months12.map(() => '?').join(',');

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
                b.cdnr_count,
                b.eligible_itc_total
            FROM clients c
            LEFT JOIN gstr2b_batches b ON c.gstin = b.client_gstin AND b.return_period IN (${placeholders})
            ORDER BY c.trade_name ASC, c.legal_name ASC
        `;

        db.all(query, months12, (err, rows) => {
            if (err) {
                console.error('[GSTR-2B FY Summary] DB Query error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }

            const clientMap = new Map();
            for (const r of rows) {
                if (!clientMap.has(r.gstin)) {
                    clientMap.set(r.gstin, {
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
                        stats: {
                            totalInvoices: 0,
                            b2bCount: 0,
                            cdnrCount: 0,
                            eligibleItc: { igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 }
                        }
                    });
                }

                if (r.return_period && (r.batch_status === 'SYNCED' || r.batch_status === 'PUSHED_TO_3B' || r.batch_status === 'NIL_SYNCED')) {
                    const c = clientMap.get(r.gstin);
                    if (!c.syncedMonths.includes(r.return_period)) {
                        c.syncedMonths.push(r.return_period);
                        c.pendingMonths = c.pendingMonths.filter(m => m !== r.return_period);
                    }
                    if (r.batch_status === 'NIL_SYNCED' && !c.nilMonths.includes(r.return_period)) {
                        c.nilMonths.push(r.return_period);
                    }
                    c.stats.totalInvoices += (r.total_invoices || 0);
                    c.stats.b2bCount += (r.b2b_count || 0);
                    c.stats.cdnrCount += (r.cdnr_count || 0);
                    c.stats.eligibleItc.total += (r.eligible_itc_total || 0);
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
                        eligibleItc: {
                            ...c.stats.eligibleItc,
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
                    totalInvoices: total12mInvoices
                },
                clients: clientsList
            });
        });
    });

    // ─── 1C. EXPORT FULL YEAR CONSOLIDATED 2B EXCEL WORKBOOK ──────────────────
    app.get('/api/gstr2b/export-full-year/:gstin', (req, res) => {
        const { gstin } = req.params;
        const fy = req.query.financialYear || '2025-26';
        const startYear = parseInt(fy.match(/\d{4}/)?.[0] || '2025', 10);
        const endYear = startYear + 1;
        const months12 = [
            `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
            `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
            `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
            `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
        ];
        const placeholders = months12.map(() => '?').join(',');

        db.get(`SELECT trade_name, legal_name, gstin FROM clients WHERE gstin = ?`, [gstin.toUpperCase()], (cErr, client) => {
            const clientInfo = client || { trade_name: gstin, gstin: gstin.toUpperCase() };

            const query = `
                SELECT * FROM gstr2b_invoices
                WHERE client_gstin = ? AND (
                    return_period IN (${placeholders}) OR 
                    return_period LIKE ? OR 
                    return_period LIKE ?
                )
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;

            db.all(query, [gstin.toUpperCase(), ...months12, `%${startYear}%`, `%${endYear}%`], (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (!rows || rows.length === 0) {
                    return res.status(404).json({ success: false, error: `No GSTR-2B invoices found for ${gstin} in FY ${fy}` });
                }

                const wb = generateGstr2bFullYearWorkbook({
                    clientInfo,
                    financialYear: fy,
                    invoices: rows
                });

                const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                const cleanFy = fy.replace(/[^0-9]/g, '');
                res.setHeader('Content-Disposition', `attachment; filename="GSTR2B_SectionWiseSummary_${gstin.toUpperCase()}_${cleanFy}.xlsx"`);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.send(buf);
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

        if (isFullYear) {
            const targetFy = fy || '2025-26';
            const startYear = parseInt(targetFy.match(/\d{4}/)?.[0] || '2025', 10);
            const endYear = startYear + 1;
            const months12 = [
                `April ${startYear}`, `May ${startYear}`, `June ${startYear}`,
                `July ${startYear}`, `August ${startYear}`, `September ${startYear}`,
                `October ${startYear}`, `November ${startYear}`, `December ${startYear}`,
                `January ${endYear}`, `February ${endYear}`, `March ${endYear}`
            ];
            const placeholders = months12.map(() => '?').join(',');
            query = `
                SELECT * FROM gstr2b_invoices
                WHERE client_gstin = ? AND (
                    return_period IN (${placeholders}) OR 
                    return_period LIKE ? OR 
                    return_period LIKE ?
                )
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;
            queryParams = [gstin.toUpperCase(), ...months12, `%${startYear}%`, `%${endYear}%`];
        } else {
            query = `
                SELECT * FROM gstr2b_invoices
                WHERE client_gstin = ? AND return_period = ?
                ORDER BY 
                    CASE 
                        WHEN UPPER(section) LIKE '%B2B%' THEN 1 
                        WHEN UPPER(section) LIKE '%CDNR%' THEN 2 
                        ELSE 3 
                    END,
                    idt DESC, inum ASC
            `;
            queryParams = [gstin.toUpperCase(), period];
        }

        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            if (!isFullYear && period) {
                db.get(
                    `SELECT * FROM gstr2b_batches WHERE UPPER(client_gstin) = ? AND (return_period = ? OR return_period LIKE ?)`,
                    [gstin.toUpperCase(), period, `%${period}%`],
                    (bErr, batchRow) => {
                        res.json({
                            success: true,
                            gstin: gstin.toUpperCase(),
                            period: period,
                            financialYear: fy || null,
                            count: rows ? rows.length : 0,
                            batch: batchRow || null,
                            invoices: rows || []
                        });
                    }
                );
            } else {
                res.json({
                    success: true,
                    gstin: gstin.toUpperCase(),
                    period: isFullYear ? 'FULL_YEAR' : period,
                    financialYear: fy || null,
                    count: rows ? rows.length : 0,
                    invoices: rows || []
                });
            }
        });
    });

    // ─── 3. PLAYWRIGHT AUTOPILOT 2B & GSTR-1 DOWNLOADER ────────────────────────
    app.post('/api/gstr2b/portal-sync-browser', async (req, res) => {
        const { gstin, returnPeriod, financialYear, isFullYear, portal_username, portal_password, portalUsername, portalPassword } = req.body;
        if (!gstin || (!returnPeriod && !isFullYear)) {
            return res.status(400).json({ success: false, error: 'gstin and returnPeriod required' });
        }

        let isAborted = false;
        req.on('close', async () => {
            if (!res.writableEnded && !isAborted) {
                isAborted = true;
                console.log('[GSTR-2B Autopilot] Client aborted request. Cleaning up browser session...');
                if (browserState && browserState.current) {
                    await browserState.current.close().catch(() => {});
                    browserState.current = null;
                }
            }
        });

        await runGstr2bAutopilot({
            db,
            gstin,
            returnPeriod: returnPeriod || `April ${(financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025'}`,
            financialYear,
            isFullYear: Boolean(isFullYear),
            portal_username: portal_username || portalUsername,
            portal_password: portal_password || portalPassword,
            req,
            res,
            browserState
        });
    });

    // ─── 3B. CANCEL / ABORT ACTIVE AUTOPILOT BROWSER SESSION ─────────────────
    app.post('/api/gstr2b/cancel', async (req, res) => {
        try {
            if (browserState && browserState.current) {
                console.log('[GSTR-2B Autopilot] Force closing browser on user cancel request');
                await browserState.current.close().catch(() => {});
                browserState.current = null;
            }
            res.json({ success: true, message: 'Browser session terminated' });
        } catch (e) {
            console.error('[GSTR-2B Autopilot] Error canceling browser session:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 4. SCAN DOWNLOADS FOLDER (1-Click Auto Scanner) ───────────────────────
    app.post('/api/gstr2b/scan-downloads', async (req, res) => {
        const { returnPeriod } = req.body;
        const period = returnPeriod || '';

        const foldersToScan = [
            path.join(os.homedir(), 'Downloads'),
            path.join(process.cwd(), 'scratch', 'downloads'),
            path.join(process.cwd(), 'scratch', 'downloads', 'gstr2b')
        ];

        let totalParsedInvoices = 0;
        let matchedClients = 0;
        const processedGstins = new Set();

        for (const folder of foldersToScan) {
            if (!fs.existsSync(folder)) continue;
            let files = [];
            try { files = fs.readdirSync(folder); } catch (e) { continue; }

            for (const f of files) {
                const lower = f.toLowerCase();
                const is2b = lower.includes('2b') || lower.includes('gstr2b') || lower.includes('gstr-2b');
                const isExt = lower.endsWith('.xlsx') || lower.endsWith('.json') || lower.endsWith('.zip');
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
                    const targetPeriod = parseResult.period || period;

                    await bulkSaveGstr2bInvoices(
                        db,
                        clientGstin,
                        targetPeriod,
                        parseResult.invoices,
                        lower.endsWith('.xlsx') ? filePath : null,
                        lower.endsWith('.json') ? filePath : null
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
            const tempPath = path.join(os.tmpdir(), `upload_2b_${Date.now()}_${fileName}`);
            fs.writeFileSync(tempPath, buffer);

            const lower = fileName.toLowerCase();
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
            const targetPeriod = parseResult.period || returnPeriod || '';

            if (!targetGstin) {
                return res.status(400).json({ success: false, error: 'No GSTIN identified in file. Please specify client GSTIN.' });
            }

            const saveRes = await bulkSaveGstr2bInvoices(db, targetGstin, targetPeriod, parseResult.invoices);

            res.json({
                success: true,
                message: `Successfully ingested ${parseResult.invoices.length} invoices for ${targetGstin}!`,
                gstin: targetGstin,
                period: targetPeriod,
                invoiceCount: parseResult.invoices.length,
                metrics: saveRes.metrics
            });
        } catch (err) {
            console.error('[GSTR-2B Ingest] Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 6. PUSH APPROVED 2B ITC TO GSTR-3B TABLE 4 ─────────────────────────────
    app.post('/api/gstr2b/push-to-3b', (req, res) => {
        const { gstin, period } = req.body;
        if (!gstin || !period) {
            return res.status(400).json({ success: false, error: 'gstin and period are required' });
        }

        db.get(`SELECT * FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (err, batch) => {
            if (err || !batch) {
                return res.status(404).json({ success: false, error: 'No GSTR-2B batch found for this client and period' });
            }

            db.run(`UPDATE gstr2b_batches SET status = 'PUSHED_TO_3B', updated_at = ? WHERE client_gstin = ? AND return_period = ?`, [Date.now(), gstin, period], (uErr) => {
                if (uErr) return res.status(500).json({ success: false, error: 'Failed updating batch status' });

                res.json({
                    success: true,
                    message: '2B Eligible ITC successfully prepared for GSTR-3B Table 4',
                    gstin,
                    period,
                    itc2b: {
                        taxable: batch.eligible_itc_txval || 0,
                        igst: batch.eligible_itc_igst || 0,
                        cgst: batch.eligible_itc_cgst || 0,
                        sgst: batch.eligible_itc_sgst || 0,
                        cess: batch.eligible_itc_cess || 0,
                        total: batch.eligible_itc_total || 0
                    },
                    rcmInward: {
                        taxable: batch.rcm_txval || 0,
                        igst: batch.rcm_igst || 0,
                        cgst: batch.rcm_cgst || 0,
                        sgst: batch.rcm_sgst || 0,
                        total: batch.rcm_total || 0
                    },
                    creditNotes: {
                        taxable: batch.cdnr_txval || 0,
                        igst: batch.cdnr_igst || 0,
                        cgst: batch.cdnr_cgst || 0,
                        sgst: batch.cdnr_sgst || 0,
                        total: batch.cdnr_total || 0
                    },
                    importGoods: {
                        taxable: 0,
                        igst: batch.impg_igst || 0,
                        cgst: 0,
                        sgst: 0,
                        total: batch.impg_igst || 0
                    },
                    counts: {
                        totalInvoices: batch.total_invoices,
                        b2b: batch.b2b_count,
                        cdnr: batch.cdnr_count
                    }
                });
            });
        });
    });

    // ─── 7. BRING BROWSER WINDOW TO FRONT (MANUAL OVERRIDE) ────────────────────
    app.post('/api/gstr2b/bring-to-front', (req, res) => {
        try {
            const browserPid = browserState.current && typeof browserState.current.process === 'function' ? browserState.current.process()?.pid : null;
            let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
            if (browserPid) psParts.push(`$wshell.AppActivate(${browserPid});`);
            psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
            psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
            psParts.push(`$wshell.AppActivate('Login');`);
            psParts.push(`$wshell.AppActivate('Chrome');`);
            psParts.push(`$wshell.AppActivate('Chromium');`);
            const psCmd = `powershell -NoProfile -Command "${psParts.join(' ')}"`;
            exec(psCmd, () => {});

            if (browserPid) {
                const bringPath = path.join(process.cwd(), 'scratch', 'bring_to_front.ps1');
                if (fs.existsSync(bringPath)) {
                    exec(`powershell -ExecutionPolicy Bypass -File "${bringPath}" -TargetPid ${browserPid}`, { windowsHide: true }, () => {});
                }
            }
            res.json({ success: true, message: 'Window focus triggered' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 8. QUICK LAUNCH & AUTO-FILL GST LOGIN PORTAL ─────────────────────────
    app.post('/api/gstr2b/open-portal-login', async (req, res) => {
        const { gstin } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        try {
            const result = await openPortalLoginHelper({ db, gstin, browserState });
            res.json({ success: true, message: 'Chrome launched and login details filled!', ...result });
        } catch (err) {
            console.error('[Open Portal Login] Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

export { setupGstr2bRoutes as registerGstr2bRoutes };
export default setupGstr2bRoutes;

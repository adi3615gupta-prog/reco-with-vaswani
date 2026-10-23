import fs from 'fs';
import path from 'path';
import os from 'os';
import { initGstr1Database, bulkSaveGstr1Invoices } from './gstr1/db.js';
import { parseGstr1Excel, parseGstr1Json, parseGstr1Zip } from './gstr1/parsers.js';
import { runGstr1Autopilot } from './gstr1/autopilot.js';
import { generateGstr1FullYearWorkbook } from './gstr1/fullYearExcel.js';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * setupGstr1Routes — Express API controller for GSTR-1 Auto Downloader & Full Year Consolidator
 */
export default function setupGstr1Routes(app, db) {
    const browserState = { current: null };

    // Initialize Database Tables & Indexes
    initGstr1Database(db);

    // ─── 1. GET GSTR-1 SUMMARY & CLIENTS FOR RETURN PERIOD ──────────────────
    app.get('/api/gstr1/summary', (req, res) => {
        const period = req.query.period;
        if (!period) {
            return res.status(400).json({ success: false, error: 'period query parameter required' });
        }

        const parts = period.trim().split(/\s+/);
        let startYr = 2025;
        if (parts.length > 1) {
            const yr = parseInt(parts[1], 10);
            if (!isNaN(yr)) {
                const mLow = parts[0].toLowerCase();
                if (['january', 'february', 'march'].includes(mLow)) {
                    startYr = yr - 1;
                } else {
                    startYr = yr;
                }
            }
        }
        const endYr = startYr + 1;
        const fyMonths = [
            `April ${startYr}`, `May ${startYr}`, `June ${startYr}`,
            `July ${startYr}`, `August ${startYr}`, `September ${startYr}`,
            `October ${startYr}`, `November ${startYr}`, `December ${startYr}`,
            `January ${endYr}`, `February ${endYr}`, `March ${endYr}`
        ];

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
                COALESCE(b.b2cl_count, 0) as b2cl_count,
                COALESCE(b.b2cs_count, 0) as b2cs_count,
                COALESCE(b.cdnr_count, 0) as cdnr_count,
                COALESCE(b.exp_count, 0) as exp_count,
                COALESCE(b.total_taxable, 0) as total_taxable,
                COALESCE(b.total_igst, 0) as total_igst,
                COALESCE(b.total_cgst, 0) as total_cgst,
                COALESCE(b.total_sgst, 0) as total_sgst,
                COALESCE(b.total_cess, 0) as total_cess,
                COALESCE(b.total_tax, 0) as total_tax,
                b.excel_path,
                b.json_path,
                b.downloaded_at,
                b.requested_at
            FROM clients c
            LEFT JOIN gstr1_batches b 
                ON UPPER(c.gstin) = UPPER(b.client_gstin) 
                AND b.return_period = ?
            ORDER BY c.trade_name ASC
        `;

        db.all(query, [period], (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }

            const qMarks = fyMonths.map(() => '?').join(',');
            db.all(
                `SELECT client_gstin, return_period, status, total_invoices, total_taxable, total_tax, excel_path, requested_at 
                 FROM gstr1_batches 
                 WHERE return_period IN (${qMarks})`,
                [...fyMonths],
                (bErr, batchRows) => {
                    const batchMap = new Map();
                    for (const br of (batchRows || [])) {
                        const key = `${(br.client_gstin || '').toUpperCase()}::${br.return_period}`;
                        batchMap.set(key, br);
                    }

                    const clients = (rows || []).map(r => {
                        const requestedAt = r.requested_at || null;
                        const secondsLeft = requestedAt ? Math.max(0, 1200 - Math.floor((Date.now() - requestedAt) / 1000)) : 0;
                        const isReady = (r.batch_status === 'REQUESTED' && secondsLeft === 0);

                        const gUpper = (r.gstin || '').toUpperCase();
                        const months = {};
                        for (const p of fyMonths) {
                            const bData = batchMap.get(`${gUpper}::${p}`);
                            const mReqAt = bData?.requested_at || (p === period ? requestedAt : null);
                            const mSecLeft = mReqAt ? Math.max(0, 1200 - Math.floor((Date.now() - mReqAt) / 1000)) : 0;
                            const mStatus = bData ? bData.status : (p === period ? r.batch_status : 'PENDING');
                            const mIsReady = (mStatus === 'REQUESTED' && mSecLeft === 0);

                            months[p] = {
                                status: mIsReady ? 'READY_TO_DOWNLOAD' : (mStatus || 'PENDING'),
                                invoices: bData?.total_invoices || 0,
                                taxable: bData?.total_taxable || 0,
                                tax: bData?.total_tax || 0,
                                requestedAt: mReqAt,
                                secondsLeft: mSecLeft,
                                isReady: mIsReady,
                                excelPath: bData?.excel_path || null
                            };
                        }

                        return {
                            id: r.client_id,
                            gstin: r.gstin,
                            trade_name: r.trade_name || r.legal_name || r.gstin,
                            legal_name: r.legal_name,
                            phone: r.phone,
                            email: r.email,
                            portalUsername: r.portal_username,
                            hasCreds: Boolean(r.has_credentials),
                            batchId: r.batch_id,
                            status: isReady ? 'READY_TO_DOWNLOAD' : (r.batch_status || 'PENDING'),
                            requestedAt,
                            secondsLeft,
                            isReady,
                            months,
                            totalInvoices: r.total_invoices || 0,
                            b2bCount: r.b2b_count || 0,
                            b2clCount: r.b2cl_count || 0,
                            b2csCount: r.b2cs_count || 0,
                            cdnrCount: r.cdnr_count || 0,
                            expCount: r.exp_count || 0,
                            totalTaxable: r.total_taxable || 0,
                            totalTax: r.total_tax || 0,
                            totalIgst: r.total_igst || 0,
                            totalCgst: r.total_cgst || 0,
                            totalSgst: r.total_sgst || 0,
                            totalCess: r.total_cess || 0,
                            excelPath: r.excel_path,
                            jsonPath: r.json_path,
                            downloadedAt: r.downloaded_at
                        };
                    });

                    const totalClients = clients.length;
                    const downloadedClients = clients.filter(c => c.status === 'SYNCED').length;
                    const pendingClients = totalClients - downloadedClients;
                    const totalOutwardTaxable = clients.reduce((acc, c) => acc + (c.totalTaxable || 0), 0);
                    const totalOutwardTax = clients.reduce((acc, c) => acc + (c.totalTax || 0), 0);
                    const totalInvoices = clients.reduce((acc, c) => acc + (c.totalInvoices || 0), 0);

                    res.json({
                        success: true,
                        period,
                        overview: {
                            totalClients,
                            downloadedClients,
                            pendingClients,
                            totalOutwardTaxable,
                            totalOutwardTax,
                            totalInvoices
                        },
                        clients
                    });
                }
            );
        });
    });

    // ─── 2. 12-MONTH FULL YEAR SYNC MATRIX ──────────────────────────────────
    app.get('/api/gstr1/fy-summary', (req, res) => {
        const fy = req.query.financialYear || '2025-26';
        const startYr = parseInt(fy.match(/\d{4}/)?.[0] || '2025', 10);
        const endYr = startYr + 1;
        const fyMonths = [
            `April ${startYr}`, `May ${startYr}`, `June ${startYr}`,
            `July ${startYr}`, `August ${startYr}`, `September ${startYr}`,
            `October ${startYr}`, `November ${startYr}`, `December ${startYr}`,
            `January ${endYr}`, `February ${endYr}`, `March ${endYr}`
        ];

        const qMarks = fyMonths.map(() => '?').join(',');

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
                COALESCE(b.status, 'PENDING') as batch_status,
                COALESCE(b.total_invoices, 0) as total_invoices,
                COALESCE(b.total_taxable, 0) as total_taxable,
                COALESCE(b.total_tax, 0) as total_tax,
                b.excel_path,
                b.requested_at
            FROM clients c
            LEFT JOIN gstr1_batches b 
                ON UPPER(c.gstin) = UPPER(b.client_gstin) 
                AND b.return_period IN (${qMarks})
            ORDER BY c.trade_name ASC
        `;

        db.all(query, [...fyMonths], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const clientMap = new Map();
            for (const r of (rows || [])) {
                const gUpper = (r.gstin || '').toUpperCase();
                if (!clientMap.has(gUpper)) {
                    clientMap.set(gUpper, {
                        id: r.client_id,
                        gstin: r.gstin,
                        trade_name: r.trade_name || r.legal_name || r.gstin,
                        phone: r.phone,
                        email: r.email,
                        portalUsername: r.portal_username,
                        hasCreds: Boolean(r.has_credentials),
                        total12mInvoices: 0,
                        total12mTaxable: 0,
                        total12mTax: 0,
                        syncedMonthsCount: 0,
                        months: {}
                    });
                }
                const clientObj = clientMap.get(gUpper);
                if (r.return_period) {
                    const requestedAt = r.requested_at || null;
                    const secondsLeft = requestedAt ? Math.max(0, 1200 - Math.floor((Date.now() - requestedAt) / 1000)) : 0;
                    const isReady = (r.batch_status === 'REQUESTED' && secondsLeft === 0);

                    clientObj.months[r.return_period] = {
                        status: isReady ? 'READY_TO_DOWNLOAD' : (r.batch_status || 'PENDING'),
                        invoices: r.total_invoices || 0,
                        taxable: r.total_taxable || 0,
                        tax: r.total_tax || 0,
                        requestedAt,
                        secondsLeft,
                        isReady,
                        excelPath: r.excel_path
                    };
                    if (r.batch_status === 'SYNCED' && r.total_invoices > 0) {
                        clientObj.syncedMonthsCount++;
                        clientObj.total12mInvoices += r.total_invoices;
                        clientObj.total12mTaxable += r.total_taxable;
                        clientObj.total12mTax += r.total_tax;
                    }
                }
            }

            // Ensure all 12 months exist in clientObj.months
            for (const clientObj of clientMap.values()) {
                for (const p of fyMonths) {
                    if (!clientObj.months[p]) {
                        clientObj.months[p] = {
                            status: 'PENDING',
                            invoices: 0,
                            taxable: 0,
                            tax: 0,
                            requestedAt: null,
                            secondsLeft: 0,
                            isReady: false,
                            excelPath: null
                        };
                    }
                }
            }

            const clients = Array.from(clientMap.values()).map(c => {
                let status = 'PENDING';
                if (c.syncedMonthsCount === 12) status = 'SYNCED';
                else if (c.syncedMonthsCount > 0) status = 'PARTIAL';
                return {
                    ...c,
                    status,
                    totalInvoices: c.total12mInvoices,
                    totalTaxable: c.total12mTaxable,
                    totalTax: c.total12mTax
                };
            });

            const totalClients = clients.length;
            const fullySyncedClients = clients.filter(c => c.status === 'SYNCED').length;
            const partiallySyncedClients = clients.filter(c => c.status === 'PARTIAL').length;
            const pendingClients = clients.filter(c => c.status === 'PENDING').length;
            const total12mInvoices = clients.reduce((acc, c) => acc + c.total12mInvoices, 0);
            const total12mTaxable = clients.reduce((acc, c) => acc + c.total12mTaxable, 0);
            const total12mTax = clients.reduce((acc, c) => acc + c.total12mTax, 0);

            res.json({
                success: true,
                financialYear: fy,
                fyMonths,
                overview: {
                    totalClients,
                    fullySyncedClients,
                    partiallySyncedClients,
                    pendingClients,
                    total12mInvoices,
                    total12mTaxable,
                    total12mTax
                },
                clients
            });
        });
    });

    // ─── 3. GET INVOICES FOR DRILLDOWN ──────────────────────────────────────
    app.get('/api/gstr1/invoices/:gstin', (req, res) => {
        const { gstin } = req.params;
        const { period, section, financialYear } = req.query;

        let query = `SELECT * FROM gstr1_invoices WHERE client_gstin = ?`;
        const params = [gstin.toUpperCase()];

        if (period && period !== 'ALL') {
            query += ` AND return_period = ?`;
            params.push(period);
        } else if (financialYear) {
            const startYr = parseInt(financialYear.match(/\d{4}/)?.[0] || '2025', 10);
            const endYr = startYr + 1;
            const fyMonths = [
                `April ${startYr}`, `May ${startYr}`, `June ${startYr}`,
                `July ${startYr}`, `August ${startYr}`, `September ${startYr}`,
                `October ${startYr}`, `November ${startYr}`, `December ${startYr}`,
                `January ${endYr}`, `February ${endYr}`, `March ${endYr}`
            ];
            query += ` AND return_period IN (${fyMonths.map(() => '?').join(',')})`;
            params.push(...fyMonths);
        }

        if (section && section !== 'ALL') {
            query += ` AND section = ?`;
            params.push(section.toUpperCase());
        }

        query += ` ORDER BY idt DESC`;

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                gstin: gstin.toUpperCase(),
                count: rows ? rows.length : 0,
                invoices: rows || []
            });
        });
    });

    // ─── 4. PLAYWRIGHT AUTOPILOT GSTR-1 DOWNLOADER ──────────────────────────
    app.post('/api/gstr1/portal-sync-browser', async (req, res) => {
        const { gstin, returnPeriod, financialYear, isFullYear, targetMonth, isDownloadOnly } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }

        await runGstr1Autopilot({
            db,
            gstin,
            returnPeriod: returnPeriod || `April ${(financialYear || '2025-26').match(/\d{4}/)?.[0] || '2025'}`,
            financialYear,
            isFullYear: Boolean(isFullYear),
            targetMonth: targetMonth || null,
            isDownloadOnly: Boolean(isDownloadOnly),
            req,
            res,
            browserState
        });
    });

    // ─── 5. EXPORT CONSOLIDATED 12M GSTR-1 EXCEL ────────────────────────────
    app.get('/api/gstr1/export-full-year/:gstin', async (req, res) => {
        const { gstin } = req.params;
        const fy = req.query.financialYear || '2025-26';
        const gstinUpper = gstin.toUpperCase();

        const startYr = parseInt(fy.match(/\d{4}/)?.[0] || '2025', 10);
        const endYr = startYr + 1;
        const fyMonths = [
            `April ${startYr}`, `May ${startYr}`, `June ${startYr}`,
            `July ${startYr}`, `August ${startYr}`, `September ${startYr}`,
            `October ${startYr}`, `November ${startYr}`, `December ${startYr}`,
            `January ${endYr}`, `February ${endYr}`, `March ${endYr}`
        ];

        db.get(`SELECT trade_name, legal_name FROM clients WHERE UPPER(gstin) = ?`, [gstinUpper], (cErr, clientRow) => {
            const clientTradeName = clientRow?.trade_name || clientRow?.legal_name || gstinUpper;

            const allPeriods = [...fyMonths, ...fyMonths.map(m => m.replace(' ', ', '))];
            db.all(
                `SELECT * FROM gstr1_invoices WHERE UPPER(client_gstin) = ? AND (return_period IN (${allPeriods.map(() => '?').join(',')}) OR return_period LIKE ?) ORDER BY idt DESC`,
                [gstinUpper, ...allPeriods, `%${startYr}%`],
                (err, invoices) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });

                    db.all(
                        `SELECT * FROM gstr1_summaries WHERE UPPER(client_gstin) = ?`,
                        [gstinUpper],
                        (sErr, summaryRows) => {
                            try {
                                const wb = generateGstr1FullYearWorkbook({
                                    clientInfo: { trade_name: clientTradeName, gstin: gstinUpper },
                                    financialYear: fy,
                                    invoices: invoices || [],
                                    summaries: summaryRows || []
                                });

                                const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                                const cleanFy = fy.replace(/[^0-9]/g, '');
                                const filename = `GSTR1_SectionWiseSummary_${gstinUpper}_${cleanFy}.xlsx`;

                                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                                res.send(buf);
                            } catch (xErr) {
                                res.status(500).json({ success: false, error: xErr.message });
                            }
                        }
                    );
                }
            );
        });
    });

    // ─── 6. SCAN DOWNLOADS FOLDER FOR GSTR-1 FILES ───────────────────────────
    app.post('/api/gstr1/scan-downloads', async (req, res) => {
        const { returnPeriod } = req.body;
        const period = returnPeriod || '';

        const foldersToScan = [
            path.join(os.homedir(), 'Downloads'),
            path.join(process.cwd(), 'scratch', 'downloads'),
            path.join(process.cwd(), 'scratch', 'downloads', 'gstr1')
        ];

        let totalParsedInvoices = 0;
        let matchedClients = 0;

        for (const folder of foldersToScan) {
            if (!fs.existsSync(folder)) continue;
            let files = [];
            try { files = fs.readdirSync(folder); } catch (e) { continue; }

            for (const f of files) {
                const lower = f.toLowerCase();
                const isG1 = (lower.includes('gstr1') || lower.includes('gstr-1') || lower.includes('_r1_') || lower.includes('returns_')) &&
                             !lower.includes('2b') && !lower.includes('r2b') && !lower.includes('3b');

                if (!isG1) continue;
                const fullPath = path.join(folder, f);

                try {
                    let parseRes = null;
                    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                        parseRes = parseGstr1Excel(fullPath, '', period);
                    } else if (lower.endsWith('.json')) {
                        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        parseRes = parseGstr1Json(raw, '', period);
                    } else if (lower.endsWith('.zip')) {
                        parseRes = await parseGstr1Zip(fullPath, '', period);
                    }

                    if (parseRes && parseRes.invoices && parseRes.invoices.length > 0) {
                        const gstin = parseRes.summary.gstin;
                        const detectedPeriod = parseRes.summary.period || period;
                        if (gstin) {
                            await bulkSaveGstr1Invoices(db, gstin, detectedPeriod, parseRes.invoices, fullPath, null);
                            totalParsedInvoices += parseRes.invoices.length;
                            matchedClients++;
                        }
                    }
                } catch (e) {}
            }
        }

        res.json({
            success: true,
            message: `Scanned downloads! Ingested ${totalParsedInvoices} GSTR-1 outward invoices across ${matchedClients} clients.`,
            totalInvoices: totalParsedInvoices,
            matchedClients
        });
    });

    // ─── 7. PUSH OUTWARD TO GSTR-3B TABLE 3.1 ────────────────────────────────
    app.post('/api/gstr1/push-to-3b', (req, res) => {
        const { gstin, period } = req.body;
        if (!gstin || !period) {
            return res.status(400).json({ success: false, error: 'gstin and period are required' });
        }

        db.get(`SELECT * FROM gstr1_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (err, batch) => {
            if (err || !batch) {
                return res.status(404).json({ success: false, error: 'No GSTR-1 batch found for this client and period' });
            }

            db.run(`UPDATE gstr1_batches SET status = 'PUSHED_TO_3B', updated_at = ? WHERE client_gstin = ? AND return_period = ?`, [Date.now(), gstin, period], (uErr) => {
                if (uErr) return res.status(500).json({ success: false, error: 'Failed updating batch status' });

                res.json({
                    success: true,
                    message: 'GSTR-1 Outward Supplies successfully applied to GSTR-3B Table 3.1',
                    gstin,
                    period,
                    outward31: {
                        taxable: batch.total_taxable || 0,
                        igst: batch.total_igst || 0,
                        cgst: batch.total_cgst || 0,
                        sgst: batch.total_sgst || 0,
                        cess: batch.total_cess || 0,
                        total: batch.total_tax || 0
                    }
                });
            });
        });
    });
}


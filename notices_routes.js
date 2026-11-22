import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import {
    initGstNoticesDatabase,
    upsertNotice,
    getNoticesByClient,
    getNoticeById,
    saveAttachment,
    getAttachmentsByNoticeId,
    saveNoticeReply,
    getNoticesSummary,
    deleteNotice,
    clearDemoNotices,
    computeLimitationDueDate,
    upsertCase,
    addCasePayment,
    addCaseEvent,
    getCasesByGstin,
    getCaseDetail,
    deleteCase
} from './notices/db.js';
import {
    classifyNoticeDocument,
    extractDemandBreakdown,
    extractTextFromBuffer,
    readZipEntries,
    isSkippableScrutinyFile
} from './notices/classifier.js';
import { runNoticesAutopilot } from './notices/autopilot.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function setupNoticesRoutes(app, db, authenticateToken = null) {
    const authMiddleware = typeof authenticateToken === 'function' ? authenticateToken : ((req, res, next) => next());
    app.use('/api/notices', authMiddleware);
    const activeBrowsers = new Map();

    // Initialize Database Tables & Indexes
    initGstNoticesDatabase(db);

    // ─── 0. RUN AUTOPILOT NOTICE SCRAPER (SSE STREAM) ──────────────────────
    app.post('/api/notices/autopilot', (req, res) => {
        const { gstin, portal_username, portal_password } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }
        const clientKey = String(gstin).trim().toUpperCase();
        const clientBrowserState = {
            get current() {
                return activeBrowsers.get(clientKey) || null;
            },
            set current(b) {
                if (b) activeBrowsers.set(clientKey, b);
                else activeBrowsers.delete(clientKey);
            }
        };

        runNoticesAutopilot({
            db,
            gstin,
            portal_username,
            portal_password,
            req,
            res,
            browserState: clientBrowserState
        });
    });

    // ─── 0.1 CANCEL RUNNING AUTOPILOT ──────────────────────────────────────
    app.post('/api/notices/autopilot/cancel', async (req, res) => {
        try {
            const { gstin } = req.body || {};
            const clientKey = gstin ? String(gstin).trim().toUpperCase() : null;

            if (clientKey && activeBrowsers.has(clientKey)) {
                console.log(`[Notices API] Cancelling active Playwright browser process for GSTIN: ${clientKey}`);
                const b = activeBrowsers.get(clientKey);
                activeBrowsers.delete(clientKey);
                if (b) await b.close().catch(() => {});
            } else if (!clientKey && activeBrowsers.size > 0) {
                for (const [key, b] of activeBrowsers.entries()) {
                    console.log(`[Notices API] Cancelling active Playwright browser process for GSTIN: ${key}`);
                    activeBrowsers.delete(key);
                    if (b) await b.close().catch(() => {});
                }
            }
            res.json({ success: true, message: 'Autopilot session cancelled' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 1. GET ALL NOTICES FOR CLIENT ──────────────────────────────────────
    app.get('/api/notices/:gstin', async (req, res) => {
        try {
            const { gstin } = req.params;
            const { notice_type, status, financial_year } = req.query;
            const notices = await getNoticesByClient(db, gstin, {
                notice_type,
                status,
                financial_year
            });
            res.json({ success: true, count: notices.length, notices });
        } catch (err) {
            console.error('[Notices API] Error fetching notices:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 2. GET NOTICE DETAIL WITH ATTACHMENTS & DRAFT REPLY ────────────────
    app.get('/api/notices/detail/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const notice = await getNoticeById(db, id);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }
            res.json({ success: true, notice });
        } catch (err) {
            console.error('[Notices API] Error fetching notice detail:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 3. GET SUMMARY KPI COUNTS FOR CLIENT ──────────────────────────────
    app.get('/api/notices/summary/:gstin', async (req, res) => {
        try {
            const { gstin } = req.params;
            const summary = await getNoticesSummary(db, gstin);
            res.json({ success: true, summary });
        } catch (err) {
            console.error('[Notices API] Error fetching summary:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 4. SAVE OR UPDATE DRAFT LEGAL REPLY ────────────────────────────────
    app.post('/api/notices/reply/save', async (req, res) => {
        try {
            const replyData = req.body;
            if (!replyData.notice_id || !replyData.reply_form) {
                return res.status(400).json({ success: false, error: 'notice_id and reply_form required' });
            }
            const result = await saveNoticeReply(db, replyData);
            res.json({ success: true, result });
        } catch (err) {
            console.error('[Notices API] Error saving reply:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 5. UPDATE NOTICE STATUS ────────────────────────────────────────────
    app.post('/api/notices/status/update', (req, res) => {
        const { id, status } = req.body;
        if (!id || !status) {
            return res.status(400).json({ success: false, error: 'id and status required' });
        }
        const now = Date.now();
        db.run(`UPDATE gst_notices SET status = ?, updated_at = ? WHERE id = ?`, [status, now, id], function (err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, updated: this.changes });
        });
    });

    // ─── 6. DOWNLOAD NOTICE ATTACHMENT ──────────────────────────────────────
    app.get('/api/notices/attachment/download/:id', (req, res) => {
        const { id } = req.params;
        db.get(`SELECT * FROM gst_notice_attachments WHERE id = ?`, [id], (err, row) => {
            if (err || !row) {
                return res.status(404).json({ success: false, error: 'Attachment record not found' });
            }
            const filePath = row.file_path;
            const resolvedPath = path.resolve(filePath);
            const allowedNoticesDir = path.resolve(process.cwd(), 'scratch', 'downloads', 'notices');
            const allowedUploadsDir = path.resolve(process.cwd(), 'uploads');
            if (!resolvedPath.startsWith(allowedNoticesDir + path.sep) && !resolvedPath.startsWith(allowedUploadsDir + path.sep)) {
                return res.status(403).json({ success: false, error: 'Access denied: attachment path outside allowed storage.' });
            }
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, error: 'File does not exist on disk' });
            }
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                return res.status(422).json({ success: false, error: 'File is empty (0 bytes). Download was interrupted or incomplete.' });
            }

            const rawName = row.file_name || path.basename(filePath);
            const ext = path.extname(rawName).toLowerCase() || (row.file_type === 'PDF' ? '.pdf' : row.file_type === 'ZIP' ? '.zip' : '');
            const finalName = rawName.includes('.') ? rawName : `${rawName}${ext}`;

            let contentType = 'application/octet-stream';
            if (ext === '.pdf' || row.file_type === 'PDF') contentType = 'application/pdf';
            else if (ext === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            else if (ext === '.zip' || row.file_type === 'ZIP') contentType = 'application/zip';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalName)}"`);

            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);
        });
    });

    // ─── 7. MULTI-RETURN CROSS-RECONCILIATION ────────────────────────────────
    app.post('/api/notices/reconcile/:noticeId', async (req, res) => {
        try {
            const { noticeId } = req.params;
            const notice = await getNoticeById(db, noticeId);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }

            const { reconcileNoticeDiscrepancy } = await import('./src/lib/noticeReconciliation.js');

            // Case-isolated returns data (no silent cross-queries to foreign tables)
            const twoBInvoices = req.body?.twoBInvoices || [];
            const threeBReturns = req.body?.threeBReturns || [];

            // Fetch alleged notice invoices
            const allegedInvoices = await new Promise((resolve) => {
                db.all(`SELECT supplier_gstin as supplierGstin, supplier_name as supplierName, invoice_number as invoiceNo, invoice_date as invoiceDate, taxable_value as taxableValue, total_tax as totalTax, igst, cgst, sgst, cess FROM gst_notice_invoices WHERE notice_id = ?`, [notice.id], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded,
                allegedInvoices
            }, { twoBInvoices, threeBReturns });

            res.json({ success: true, reconciliation: recoResult });
        } catch (err) {
            console.error('[Notices API] Error reconciling notice:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 8. EXPORT RECONCILIATION ANNEXURE (ZERO-MERGE EXCEL) ───────────────
    app.get('/api/notices/reconcile/export/:noticeId', async (req, res) => {
        try {
            const { noticeId } = req.params;
            const notice = await getNoticeById(db, noticeId);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }

            const { reconcileNoticeDiscrepancy, generateNoticeAnnexureExcel } = await import('./src/lib/noticeReconciliation.js');
            const xlsx = await import('xlsx');
            const XLSX = xlsx.default || xlsx;

            // Case-isolated returns data (no silent cross-queries to foreign tables)
            const twoBInvoices = [];
            const threeBReturns = [];

            // Fetch alleged notice invoices
            const allegedInvoices = await new Promise((resolve) => {
                db.all(`SELECT supplier_gstin as supplierGstin, supplier_name as supplierName, invoice_number as invoiceNo, invoice_date as invoiceDate, taxable_value as taxableValue, total_tax as totalTax, igst, cgst, sgst, cess FROM gst_notice_invoices WHERE notice_id = ?`, [notice.id], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded,
                allegedInvoices
            }, { twoBInvoices, threeBReturns });

            const wb = generateNoticeAnnexureExcel(recoResult, {
                companyName: notice.client_gstin,
                officerName: notice.issuing_officer
            });

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Notice_Annexure_${notice.reference_no}.xlsx"`);
            res.send(buffer);
        } catch (err) {
            console.error('[Notices API] Error exporting annexure:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 9. UPLOAD NOTICE PDF / DOCUMENT & EXTRACT TEXT ────────────────────────
    app.post('/api/notices/upload-pdf', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No notice file provided' });
            }

            const fileName = req.file.originalname || 'Notice_Document.pdf';
            const fileBuffer = req.file.buffer;
            const extractedText = (await extractTextFromBuffer(fileBuffer, fileName))
                || fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');

            const cls = classifyNoticeDocument(fileName, extractedText);
            const amounts = extractDemandBreakdown(extractedText);

            const detectedGstin = cls.gstin || (req.body.gstin || '').trim().toUpperCase();
            if (!detectedGstin) {
                return res.status(422).json({
                    success: false,
                    requiresManualConfirmation: true,
                    extractedText,
                    partialFields: {
                        ref: cls.portalRefNo,
                        din: cls.din,
                        amount: amounts.taxDemanded || null,
                        fy: cls.financialYear,
                        formCode: cls.formCode,
                        paramCodes: cls.paramCodes
                    },
                    error: 'Unable to extract valid GSTIN from uploaded notice PDF. Please provide client GSTIN.'
                });
            }
            const detectedRef = cls.portalRefNo || `NOTICE-${Date.now()}`;
            const detectedFy = cls.financialYear || '2023-24';
            const issueDate = cls.issueDate || new Date().toISOString().split('T')[0];
            const dueDate = cls.explicitDueDate || computeLimitationDueDate(cls.formCode, issueDate);

            const newNotice = {
                id: `notice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                client_gstin: detectedGstin,
                portal_source: 'PDF_UPLOAD',
                notice_type: cls.formCode,
                form_description: `${cls.formCode}${cls.isScannedImagePdf ? ' [Scanned Image PDF - Needs OCR/Review]' : ''}${cls.paramCodes.length ? ` [Params: ${cls.paramCodes.join(', ')}]` : ''}`,
                reference_no: detectedRef,
                din: cls.din || '',
                financial_year: detectedFy,
                tax_period: 'Annual',
                issue_date: issueDate,
                due_date: dueDate,
                issuing_officer: cls.issuingOfficer || 'The Proper Officer',
                issuing_jurisdiction: cls.issuingJurisdiction || 'Jurisdictional GST Circle',
                section_cited: cls.sectionCited || 'Section 73',
                tax_demanded: amounts.taxDemanded,
                interest_demanded: amounts.interestDemanded,
                penalty_demanded: amounts.penaltyDemanded,
                total_demanded: amounts.totalDemanded,
                param_codes_json: JSON.stringify(cls.paramCodes),
                issue_breakdown_json: JSON.stringify(amounts),
                status: 'PENDING_REPLY',
                raw_notice_text: extractedText
            };

            await upsertNotice(db, newNotice);

            res.json({
                success: true,
                notice: newNotice,
                classification: cls,
                amounts,
                rawText: extractedText,
                message: `Classified as ${cls.formCode} and saved to local database.`
            });
        } catch (err) {
            console.error('[Notices API] Error processing PDF upload:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 10. SAVE / LOAD PRELOADED DEMO NOTICE ────────────────────────────────
    app.post('/api/notices/save-demo', async (req, res) => {
        try {
            const demo = req.body;
            if (!demo || !demo.clientGstin || !demo.referenceNo) {
                return res.status(400).json({ success: false, error: 'Invalid demo notice payload' });
            }

            const noticeRecord = {
                id: demo.id || `demo_${Date.now()}`,
                client_gstin: demo.clientGstin,
                portal_source: 'DEMO_SIMULATOR',
                notice_type: demo.formCode || 'ASMT-10',
                form_description: demo.title,
                reference_no: demo.referenceNo,
                din: demo.din || '',
                financial_year: demo.financialYear || '2018-19',
                tax_period: demo.taxPeriod || 'Annual',
                issue_date: demo.issueDate,
                due_date: demo.dueDate,
                issuing_officer: demo.issuingOfficer,
                issuing_jurisdiction: demo.jurisdiction,
                section_cited: demo.statutorySection,
                tax_demanded: demo.taxDemanded || 0,
                interest_demanded: demo.interestDemanded || 0,
                penalty_demanded: demo.penaltyDemanded || 0,
                total_demanded: demo.totalDemanded || 0,
                status: 'PENDING_REPLY',
                raw_notice_text: demo.rawText
            };

            await upsertNotice(db, noticeRecord);
            res.json({ success: true, notice: noticeRecord });
        } catch (err) {
            console.error('[Notices API] Error saving demo notice:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 11. DELETE NOTICE ─────────────────────────────────────────────────────
    app.delete('/api/notices/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await deleteNotice(db, id);
            res.json({ success: true, ...result });
        } catch (err) {
            console.error('[Notices API] Error deleting notice:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 12. CLEAR ALL DEMO NOTICES ───────────────────────────────────────────
    app.post('/api/notices/clear-demos', async (req, res) => {
        try {
            const result = await clearDemoNotices(db);
            res.json({ success: true, ...result, message: 'All demo simulator records removed from database.' });
        } catch (err) {
            console.error('[Notices API] Error clearing demo notices:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
    // ─── 13. OFFLINE SCRUTINY FOLDER SCAN, IMPORT & CASE LIFECYCLE APIs ──────
    function isSafeFolderAccess(req, rawDir) {
        const clean = String(rawDir || '').trim().replace(/^["']|["']$/g, '');
        if (!clean || clean.startsWith('\\\\')) return { ok: false, error: 'Invalid or network UNC folder path.' };
        const role = String(req.user?.role || '').toLowerCase();
        if (role && !['admin', 'senior auditor', 'senior'].includes(role)) {
            return { ok: false, error: 'Admin or Senior Auditor privileges required for host folder scanning.' };
        }
        const resolved = path.resolve(clean);
        const blockedRoots = ['windows', 'program files', 'program files (x86)', 'programdata', 'system volume information', '$recycle.bin'];
        const normLow = resolved.toLowerCase();
        if (/^[a-z]:\\$/.test(normLow) || normLow === '/' || blockedRoots.some((b) => normLow.includes(`\\${b}`)) || /^\/(etc|proc|sys|dev|boot|root|bin|sbin|usr)(\/|$)/.test(normLow)) {
            return { ok: false, error: 'Access denied: system root directories cannot be scanned.' };
        }
        return { ok: true, resolved };
    }

    async function walkScrutinyFolder(resolvedRoot, maxFiles = 400) {
        if (!resolvedRoot || !fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
            throw new Error('Folder does not exist or is not a directory.');
        }

        const items = [];
        const walk = (dir) => {
            if (items.length >= maxFiles) return;
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                if (items.length >= maxFiles) break;
                if (ent.isSymbolicLink()) continue;
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    walk(full);
                    continue;
                }
                if (isSkippableScrutinyFile(ent.name)) continue;
                const stat = fs.statSync(full);
                if (stat.size > 20 * 1024 * 1024) continue;

                const rel = path.relative(resolvedRoot, full).replace(/\\/g, '/');
                if (ent.name.toLowerCase().endsWith('.zip')) {
                    const buf = fs.readFileSync(full);
                    const entries = readZipEntries(buf, (n) => /\.(pdf|docx|xlsx|csv|txt)$/i.test(n));
                    items.push({ full, rel, name: ent.name, size: stat.size, ext: '.zip', zipEntries: entries.slice(0, 20) });
                } else if (/\.(pdf|docx|xlsx|xls|csv|txt|json)$/i.test(ent.name)) {
                    items.push({ full, rel, name: ent.name, size: stat.size, ext: path.extname(ent.name).toLowerCase() });
                }
            }
        };
        walk(resolvedRoot);

        const classified = [];
        const gstinScores = new Map();
        for (const it of items) {
            let text = '';
            if (it.ext === '.zip') {
                for (const ze of it.zipEntries || []) {
                    const zTxt = await extractTextFromBuffer(ze.data, ze.name);
                    if (zTxt) text += `\n[${ze.name}]\n${zTxt.slice(0, 8000)}`;
                }
            } else {
                const buf = fs.readFileSync(it.full);
                text = await extractTextFromBuffer(buf, it.name);
            }
            const cls = classifyNoticeDocument(it.name, text, it.rel);
            const amounts = extractDemandBreakdown(text);
            if (cls.gstin) {
                const weight = ['NOTICE', 'ORDER', 'REPLY'].includes(cls.documentType) ? 10 : 1;
                gstinScores.set(cls.gstin, (gstinScores.get(cls.gstin) || 0) + weight);
            }
            classified.push({
                fileName: it.name,
                relPath: it.rel,
                filePath: it.full,
                size: it.size,
                ...cls,
                ...amounts,
                textLength: text.length,
                rawSnippet: text.slice(0, 4000)
            });
        }
        let detectedGstin = null;
        let bestScore = -1;
        for (const [g, sc] of gstinScores.entries()) {
            if (sc > bestScore) { bestScore = sc; detectedGstin = g; }
        }

        return { resolvedRoot, clientName: path.basename(resolvedRoot), detectedGstin, documents: classified };
    }

    app.post('/api/notices/scan-folder', async (req, res) => {
        try {
            const { folderPath, maxFiles } = req.body || {};
            const guard = isSafeFolderAccess(req, folderPath);
            if (!guard.ok) return res.status(403).json({ success: false, error: guard.error });
            const preview = await walkScrutinyFolder(guard.resolved, Math.min(Number(maxFiles) || 300, 600));
            res.json({ success: true, ...preview });
        } catch (err) {
            res.status(400).json({ success: false, error: err.message });
        }
    });

    app.post('/api/notices/import-folder', async (req, res) => {
        let inTx = false;
        const execSql = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
        try {
            const { folderPath, gstinOverride, clientNameOverride } = req.body || {};
            const guard = isSafeFolderAccess(req, folderPath);
            if (!guard.ok) return res.status(403).json({ success: false, error: guard.error });
            const scan = await walkScrutinyFolder(guard.resolved, 500);
            const gstin = (gstinOverride || scan.detectedGstin || 'UNASSIGNED').trim().toUpperCase();
            const fySet = new Set(scan.documents.map((d) => d.financialYear).filter(Boolean));
            const primaryFy = fySet.size === 1 ? [...fySet][0] : ([...fySet][0] || 'Multi-FY');

            const hasDropped = scan.documents.some((d) => ['DROPPED', 'WAIVER_APPROVED'].includes(d.stage));
            const hasAppeal = scan.documents.some((d) => ['FIRST_APPEAL', 'GSTAT_APPEAL'].includes(d.stage));
            const maxTax = Math.max(0, ...scan.documents.map((d) => d.taxDemanded || 0));
            const maxInt = Math.max(0, ...scan.documents.map((d) => d.interestDemanded || 0));
            const maxPen = Math.max(0, ...scan.documents.map((d) => d.penaltyDemanded || 0));
            const caseCat = scan.documents.find((d) => d.documentType === 'NOTICE')?.stage || 'SCRUTINY';

            const existingCase = await new Promise((resolve) => {
                db.get(
                    `SELECT id FROM gst_cases WHERE client_gstin = ? AND source_folder_path = ?`,
                    [gstin, scan.resolvedRoot],
                    (err, row) => resolve(row || null)
                );
            });

            await execSql('BEGIN IMMEDIATE');
            inTx = true;

            const savedCase = await upsertCase(db, {
                id: existingCase?.id,
                client_gstin: gstin,
                client_name: clientNameOverride || scan.clientName,
                financial_year: primaryFy,
                case_category: caseCat,
                status: hasDropped ? 'DROPPED' : (hasAppeal ? 'IN_APPEAL' : 'OPEN'),
                total_tax_demanded: maxTax,
                total_interest_demanded: maxInt,
                total_penalty_demanded: maxPen,
                source_folder_path: scan.resolvedRoot
            });

            // Deduplicate repeat folder imports cleanly while preserving manual non-folder payments
            await execSql(`DELETE FROM gst_case_events WHERE case_id = ?`, [savedCase.id]);
            await execSql(`DELETE FROM gst_case_payments WHERE case_id = ? AND notes LIKE '%.%'`, [savedCase.id]);

            let importedNotices = 0;
            let importedPayments = 0;
            for (const doc of scan.documents) {
                const dueDate = doc.explicitDueDate || (doc.deadlineDays > 0 && doc.issueDate ? computeLimitationDueDate(doc.formCode, doc.issueDate) : '');
                await addCaseEvent(db, {
                    case_id: savedCase.id,
                    event_type: doc.documentType,
                    event_date: doc.issueDate || '',
                    due_date: dueDate || '',
                    form_code: doc.formCode,
                    param_code: doc.paramCodes.join(','),
                    portal_ref_no: doc.portalRefNo || '',
                    title: `${doc.formCode} — ${doc.fileName}`,
                    summary: doc.relPath,
                    tax_amount: doc.taxDemanded,
                    interest_amount: doc.interestDemanded,
                    penalty_amount: doc.penaltyDemanded,
                    is_completed: ['ORDER', 'PAYMENT', 'REPLY', 'ACKNOWLEDGMENT'].includes(doc.documentType)
                });

                if (doc.documentType === 'PAYMENT' && (doc.taxDemanded > 0 || doc.interestDemanded > 0 || doc.portalRefNo)) {
                    await addCasePayment(db, {
                        case_id: savedCase.id,
                        payment_type: doc.formCode,
                        arn_no: doc.portalRefNo || '',
                        drc03_ref_no: doc.portalRefNo || '',
                        drc03a_adjusted: doc.formCode === 'DRC-03A',
                        payment_date: doc.issueDate || '',
                        igst: doc.igst,
                        cgst: doc.cgst,
                        sgst: doc.sgst,
                        interest_paid: doc.interestDemanded,
                        penalty_paid: doc.penaltyDemanded,
                        notes: doc.fileName
                    });
                    importedPayments++;
                }

                if ((doc.documentType === 'NOTICE' || doc.documentType === 'ORDER') && doc.formCode !== 'OTHER') {
                    await upsertNotice(db, {
                        client_gstin: gstin,
                        portal_source: 'FOLDER_IMPORT',
                        notice_type: doc.formCode,
                        form_description: `${doc.formCode}${doc.isScannedImagePdf ? ' [Scanned Image PDF]' : ''} (${doc.relPath})`,
                        reference_no: doc.portalRefNo || `LOCAL-${crypto.createHash('sha1').update(doc.relPath).digest('hex').slice(0, 12)}`,
                        din: doc.din || '',
                        financial_year: doc.financialYear || primaryFy,
                        issue_date: doc.issueDate || '',
                        due_date: dueDate || '',
                        issuing_officer: doc.issuingOfficer || 'The Proper Officer',
                        issuing_jurisdiction: doc.issuingJurisdiction || 'Jurisdictional GST Circle',
                        section_cited: doc.sectionCited || '',
                        tax_demanded: doc.taxDemanded,
                        interest_demanded: doc.interestDemanded,
                        penalty_demanded: doc.penaltyDemanded,
                        case_id: savedCase.id,
                        param_codes_json: JSON.stringify(doc.paramCodes),
                        status: hasDropped ? 'DROPPED' : 'PENDING_REPLY',
                        raw_notice_text: doc.rawSnippet
                    });
                    importedNotices++;
                }
            }

            await execSql('COMMIT');
            inTx = false;

            const fullCase = await getCaseDetail(db, savedCase.id);
            res.json({ success: true, case: fullCase, importedNotices, importedPayments, totalFiles: scan.documents.length });
        } catch (err) {
            if (inTx) { try { await execSql('ROLLBACK'); } catch {} }
            console.error('[Notices API] import-folder error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get(['/api/notices/cases', '/api/notices/cases/:gstin'], async (req, res) => {
        try {
            const cases = await getCasesByGstin(db, req.params.gstin || 'ALL');
            res.json({ success: true, cases });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/notices/cases/:id/payments', async (req, res) => {
        try {
            const result = await addCasePayment(db, { ...req.body, case_id: req.params.id });
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.delete('/api/notices/cases/:id', async (req, res) => {
        try {
            const result = await deleteCase(db, req.params.id);
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

export default setupNoticesRoutes;

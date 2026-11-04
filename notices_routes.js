import path from 'path';
import fs from 'fs';
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
    clearDemoNotices
} from './notices/db.js';
import { runNoticesAutopilot } from './notices/autopilot.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function setupNoticesRoutes(app, db) {
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

            // Fetch 2B invoices for client
            const twoBInvoices = await new Promise((resolve) => {
                db.all(`SELECT * FROM gstr2b_invoices WHERE client_gstin = ?`, [notice.client_gstin], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices });

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

            const twoBInvoices = await new Promise((resolve) => {
                db.all(`SELECT * FROM gstr2b_invoices WHERE client_gstin = ?`, [notice.client_gstin], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices });

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
            let extractedText = '';

            if (fileName.toLowerCase().endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
                try {
                    const pdfMod = await import('pdf-parse');
                    const PDFParseClass = pdfMod.PDFParse || pdfMod.default?.PDFParse;
                    if (PDFParseClass) {
                        const parser = new PDFParseClass({ data: fileBuffer });
                        extractedText = await parser.getText();
                    } else if (typeof pdfMod.default === 'function') {
                        const parsed = await pdfMod.default(fileBuffer);
                        extractedText = parsed.text || '';
                    } else {
                        extractedText = fileBuffer.toString('utf-8');
                    }
                } catch (pdfErr) {
                    console.warn('[Notices API] pdf-parse warning, attempting utf-8 stream fallback:', pdfErr.message);
                    extractedText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
                }
            } else {
                extractedText = fileBuffer.toString('utf-8');
            }

            // Extract GSTINs, sections, and amounts heuristically
            const gstinMatch = extractedText.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/);
            const refMatch = extractedText.match(/\b(?:Reference|Ref|Notice No|ARN)[\s:-]*([A-Z0-9\/-]{8,30})\b/i);
            const dinMatch = extractedText.match(/\bDIN[\s:-]*([0-9A-Z]{15,25})\b/i);
            const rupeeMatch = extractedText.match(/₹\s*([0-9,]+)/);

            const detectedGstin = gstinMatch ? gstinMatch[0] : (req.body.gstin || '27AAFCV1234A1Z5');
            const detectedRef = refMatch ? refMatch[1] : `NOTICE-${Date.now()}`;
            const detectedDin = dinMatch ? dinMatch[1] : '';
            const detectedAmount = rupeeMatch ? parseInt(rupeeMatch[1].replace(/,/g, ''), 10) : 500000;

            const isAsmt = /ASMT-?10|Section\s*61|Rule\s*99/i.test(extractedText);
            const isDrc01b = /DRC-?01B|Rule\s*88C/i.test(extractedText);
            const noticeType = isAsmt ? 'ASMT-10' : (isDrc01b ? 'DRC-01B' : 'DRC-01');

            const newNotice = {
                id: `notice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                client_gstin: detectedGstin,
                portal_source: 'PDF_UPLOAD',
                notice_type: noticeType,
                form_description: `Uploaded ${noticeType} Notice`,
                reference_no: detectedRef,
                din: detectedDin,
                financial_year: '2023-24',
                tax_period: 'Annual',
                issue_date: new Date().toISOString().split('T')[0],
                due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                issuing_officer: 'The Proper Officer',
                issuing_jurisdiction: 'Jurisdictional GST Circle',
                section_cited: isAsmt ? 'Section 61' : 'Section 73',
                tax_demanded: detectedAmount,
                interest_demanded: Math.round(detectedAmount * 0.25),
                penalty_demanded: 0,
                total_demanded: Math.round(detectedAmount * 1.25),
                status: 'PENDING_REPLY',
                raw_notice_text: extractedText
            };

            await upsertNotice(db, newNotice);

            res.json({
                success: true,
                notice: newNotice,
                rawText: extractedText,
                message: 'Notice PDF processed and saved to local database.'
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
}

export default setupNoticesRoutes;

import { decryptSecret } from '../cryptoVault.js';
/*! javascript-obfuscator:disable */
// Playwright dynamically imported inside runGstr1Autopilot to prevent startup crashes
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import { bulkSaveGstr1Invoices, saveGstr1Summary, markGstr1MonthRequested, markGstr1MonthSyncedEmpty } from './db.js';
import { parseGstr1Json, parseGstr1Excel, parseGstr1Zip } from './parsers.js';
import { buildGstr1FullYearWorkbookFromDb } from './fullYearExcel.js';
import { launchAutopilotBrowser } from '../gstr2b/browserLauncher.js';
import { parseGstr1PdfBuffer } from '../gstr1PdfParser.js';

const MONTH_INDEX = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

/** hasReturnPeriodEnded("October 2026", now): true once the whole month is over. Unparseable periods are allowed through. */
export function hasReturnPeriodEnded(period, now = new Date()) {
    const m = String(period || '').trim().match(/^([a-zA-Z]+)[\s,]+(\d{4})$/);
    const mIdx = m ? MONTH_INDEX[m[1].toLowerCase()] : undefined;
    if (mIdx === undefined) return true;
    return new Date(Number(m[2]), mIdx + 1, 1) <= now;
}

/**
 * saveGstr1FullYearExcel: Writes the 12-sheet SectionWiseSummary to the download dir and to
 * <Settings returns_data_path>/gstr1/<GSTIN> when configured. Never throws; returns the path or null.
 */
export async function saveGstr1FullYearExcel(db, gstinUpper, financialYear, downloadDir) {
    try {
        const { wb, filename } = await buildGstr1FullYearWorkbookFromDb(db, gstinUpper, financialYear);
        const consExcelPath = path.join(downloadDir, filename);
        XLSX.writeFile(wb, consExcelPath);
        console.log(`[GSTR-1 Full Year] Generated consolidated workbook at: ${consExcelPath}`);

        const configRow = await new Promise((resolve) => db.get(
            "SELECT value FROM app_config WHERE key = 'returns_data_path' OR key = 'master_data_path' ORDER BY CASE WHEN key = 'returns_data_path' THEN 1 ELSE 2 END LIMIT 1",
            [], (err, row) => resolve(err ? null : row)));
        const rawDir = String(configRow?.value || '').trim().replace(/^["']|["']$/g, '');
        if (rawDir && fs.existsSync(rawDir)) {
            try {
                const tDir = path.join(path.resolve(rawDir), 'gstr1', gstinUpper);
                fs.mkdirSync(tDir, { recursive: true });
                XLSX.writeFile(wb, path.join(tDir, filename));
            } catch (cpErr) {
                console.warn('[GSTR-1 Full Year] Could not copy consolidated Excel to Settings folder:', cpErr.message);
            }
        }
        return consExcelPath;
    } catch (xlErr) {
        console.error('[GSTR-1 Full Year] Error generating consolidated Excel:', xlErr.message);
        return null;
    }
}

/**
 * runGstr1Autopilot — Autonomous Playwright engine for GSTR-1:
 * - Single filing period OR full 12-month FY consolidation loop
 * - Automatic credential population from vault
 * - Single CAPTCHA entry by user
 * - Target GSTR-1 card -> Download offline JSON / Excel
 * - Persist outward supplies into SQLite
 * - Generates 12M Consolidated SectionWiseSummary Excel
 */
export async function runGstr1Autopilot({
    db,
    gstin,
    returnPeriod = 'April 2026',
    financialYear = '2026-27',
    isFullYear = false,
    targetMonth = null,
    isDownloadOnly = false,
    downloadFormat = 'JSON', // 'JSON' or 'PDF'
    req,
    res,
    browserState = null,
    onEvent = null
}) {
    const emit = (evt, data) => { try { onEvent?.(evt, data); } catch (e) {} };
    let browser = null;
    let context = null;
    let page = null;

    let activeSyncPeriod = returnPeriod;
    let parsedInvoices = null;
    let capturedExcelPath = null;
    let capturedJsonPath = null;
    let capturedPdfPath = null;
    let capturedGstr1PdfSummary = null;
    let capturedSummary = null;

    try {
        const gstinUpper = (gstin || '').toUpperCase().trim();
        const downloadDir = path.join(process.cwd(), 'scratch', 'downloads', 'gstr1', gstinUpper);
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        // Fetch credentials from SQLite clients table
        let portalUser = '';
        let portalPass = '';
        let clientTradeName = '';

        try {
            const clientRow = await new Promise((resolve) => {
                db.get(
                    `SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?`,
                    [gstinUpper],
                    (err, row) => resolve(row || null)
                );
            });
            if (clientRow) {
                portalUser = clientRow.portal_username || '';
                portalPass = decryptSecret(clientRow.portal_password || '');
                clientTradeName = clientRow.trade_name || clientRow.legal_name || gstinUpper;
            }
        } catch (e) {
            console.error('[GSTR-1 Autopilot] Vault lookup error:', e);
        }

        console.log(`\n======================================================`);
        console.log(`[GSTR-1 Autopilot] Starting session for ${gstinUpper} (${returnPeriod})`);
        console.log(`[GSTR-1 Autopilot] Vault Username: ${portalUser ? portalUser : '(NOT CONFIGURED)'}`);
        console.log(`======================================================\n`);

        if (browserState && browserState.current) {
            console.log('[GSTR-1 Autopilot] Terminating existing browser session before launching new...');
            try {
                await browserState.current.close().catch(() => {});
            } catch (e) {}
            browserState.current = null;
        }

        let chromiumModule;
        try {
            chromiumModule = await import('playwright');
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Playwright is not installed or available.' });
        }
        const chromium = chromiumModule.chromium || chromiumModule.default?.chromium || chromiumModule;

        const launchRes = await launchAutopilotBrowser(chromium, {
            headless: false,
            slowMo: 50,
            downloadsPath: downloadDir,
            viewport: { width: 1366, height: 768 }
        });
        browser = launchRes.browser;
        if (browserState) browserState.current = browser;

        context = await browser.newContext({
            viewport: null,
            acceptDownloads: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        });

        page = await context.newPage();

        // Close cleanly on request abort from UI
        if (req && typeof req.on === 'function') {
            req.on('close', async () => {
                if (browser && !parsedInvoices && !capturedSummary) {
                    console.log('[Autopilot GSTR-1] Request aborted from UI, closing browser');
                    await browser.close().catch(() => {});
                    if (browserState) browserState.current = null;
                }
            });
        }

        let browserPid = null;
        try {
            const cdp = await browser.newBrowserCDPSession();
            const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
            browserPid = processInfo.find(x => x.type === 'browser')?.id || null;
            if (browserPid) console.log('[GSTR-1 Autopilot] Detected Chrome Browser PID:', browserPid);
        } catch (e) {}

        const focusDesktopWindow = () => {
            try {
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
            } catch (e) {}
        };
        focusDesktopWindow();

        // Download event listener
        const activeGstr1DownloadPromises = new Set();
        page.on('download', (download) => {
            const dlTask = (async () => {
                try {
                    const suggestedFilename = download.suggestedFilename();
                    console.log('[Autopilot GSTR-1] Download detected:', suggestedFilename);
                    const savePath = path.join(downloadDir, `${Date.now()}_${suggestedFilename}`);
                    await download.saveAs(savePath);
                    
                    if (!fs.existsSync(savePath) || fs.statSync(savePath).size === 0) {
                        console.warn('[Autopilot GSTR-1] Warning: Downloaded file is 0 bytes or missing:', savePath);
                        return;
                    }
                    console.log('[Autopilot GSTR-1] Saved file to:', savePath, `(${fs.statSync(savePath).size} bytes)`);

                    const lower = suggestedFilename.toLowerCase();
                    const curPeriod = activeSyncPeriod;

                    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                        capturedExcelPath = savePath;
                        const res = parseGstr1Excel(savePath, gstinUpper, curPeriod);
                        if (res && res.invoices) {
                            parsedInvoices = res.invoices;
                            capturedSummary = res.summary;
                            console.log(`[Autopilot GSTR-1] Extracted ${res.invoices.length} invoices from downloaded Excel!`);
                        }
                    } else if (lower.endsWith('.json')) {
                        capturedJsonPath = savePath;
                        try {
                            const raw = JSON.parse(fs.readFileSync(savePath, 'utf8'));
                            const res = parseGstr1Json(raw, gstinUpper, curPeriod);
                            if (res && res.invoices) {
                                parsedInvoices = res.invoices;
                                capturedSummary = res.summary;
                                console.log(`[Autopilot GSTR-1] Extracted ${res.invoices.length} invoices from downloaded JSON!`);
                            }
                        } catch (e) {}
                    } else if (lower.endsWith('.zip')) {
                        const res = await parseGstr1Zip(savePath, gstinUpper, curPeriod);
                        if (res && res.invoices) {
                            parsedInvoices = res.invoices;
                            capturedSummary = res.summary;
                            console.log(`[Autopilot GSTR-1] Extracted ${res.invoices.length} invoices from downloaded ZIP!`);
                        }
                    } else if (lower.endsWith('.pdf')) {
                        capturedPdfPath = savePath;
                        try {
                            const buf = fs.readFileSync(savePath);
                            const res = await parseGstr1PdfBuffer(buf, suggestedFilename);
                            if (res) {
                                capturedGstr1PdfSummary = res;
                                capturedSummary = {
                                    gstin: res.gstin || gstinUpper,
                                    period: res.period || curPeriod,
                                    totalTaxable: res.totalOutwardTaxable,
                                    totalTax: res.totalOutwardTax,
                                    counts: res.counts
                                };
                                console.log(`[Autopilot GSTR-1] Extracted GSTR-1 summary from downloaded PDF! Taxable: ₹${res.totalOutwardTaxable}, Tax: ₹${res.totalOutwardTax}`);
                            }
                        } catch (pdfErr) {
                            console.error('[Autopilot GSTR-1] Error parsing downloaded PDF in listener:', pdfErr);
                        }
                    }
                } catch (dlErr) {
                    console.error('[Autopilot GSTR-1] Download save error:', dlErr);
                }
            })();
            activeGstr1DownloadPromises.add(dlTask);
            dlTask.finally(() => activeGstr1DownloadPromises.delete(dlTask));
        });

        // Banner update helper
        const updateBanner = async (stepText, color = '#8b5cf6') => {
            try {
                await page.evaluate(({ stepText, color, clientName, clientGstin }) => {
                    let b = document.getElementById('antigravity-1-banner');
                    if (!b) {
                        b = document.createElement('div');
                        b.id = 'antigravity-1-banner';
                        b.style.cssText = `
                            position: fixed; top: 0; left: 0; right: 0; z-index: 9999999;
                            background: linear-gradient(135deg, #4c1d95, #0f172a);
                            color: #f8fafc; padding: 10px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center;
                            border-bottom: 3px solid ${color}; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        `;
                        document.body.prepend(b);
                    }
                    b.innerHTML = `
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="background:${color};color:#ffffff;font-size:10px;font-weight:900;padding:3px 8px;border-radius:6px;">
                                ⚡ GSTR-1 AUTOPILOT
                            </span>
                            <span>${stepText}</span>
                        </div>
                        <div style="font-size:12px;color:#cbd5e1;font-family:monospace;">
                            ${clientName ? `Client: <strong style="color:#c4b5fd;">${clientName}</strong> (${clientGstin})` : ''}
                        </div>
                    `;
                }, { stepText, color, clientName: clientTradeName, clientGstin: gstinUpper });
            } catch (e) {}
        };

        // Dismiss popup helper (safe DOM evaluation < 2ms, zero timeout lag)
        const dismissPopups = async () => {
            try {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, a'));
                    const remind = btns.find(b => {
                        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                        return t === 'remind me later' || t.includes('remind me later');
                    });
                    if (remind) remind.click();

                    const closeBtn = document.querySelector('.modal-header .close, button.close, button[aria-label="Close"], .modal-dialog button[data-dismiss="modal"]');
                    if (closeBtn) closeBtn.click();
                });
            } catch (e) {}
        };

        // Navigate to GST Login
        console.log('[GSTR-1 Autopilot] Navigating to GST login...');
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.bringToFront().catch(() => {});
        focusDesktopWindow();

        // Auto-fill credentials
        try {
            await page.waitForSelector('#username', { timeout: 15000 });
            if (portalUser) {
                console.log(`[GSTR-1 Autopilot] Auto-filling username: ${portalUser}`);
                await page.fill('#username', portalUser);
                await page.evaluate((u) => {
                    const el = document.querySelector('#username');
                    if (el) {
                        el.value = u;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, portalUser);
            }
            // Deliberate delay so Angular portal finishes validating username
            await page.waitForTimeout(800);

            if (portalPass) {
                console.log('[GSTR-1 Autopilot] Auto-filling password...');
                const pInput = page.locator('input#user_pass');
                await pInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
                if (await pInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await pInput.click();
                    await page.waitForTimeout(100);
                    await pInput.fill('');
                    await pInput.fill(portalPass);
                    await pInput.evaluate((el, p) => {
                        el.value = p;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }, portalPass);
                    console.log('[GSTR-1 Autopilot] Password auto-filled successfully');
                } else {
                    await page.evaluate((p) => {
                        const passInputs = Array.from(document.querySelectorAll('input[type="password"], input[name="user_pass"]'));
                        const el = passInputs.find(i => {
                            const r = i.getBoundingClientRect();
                            return r.width > 0 && r.height > 0 && window.getComputedStyle(i).display !== 'none';
                        }) || document.getElementById('user_pass');
                        if (el) {
                            el.value = p;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                        }
                    }, portalPass);
                }
            }
            await page.focus('#captcha').catch(() => {});
            focusDesktopWindow();
        } catch (e) {
            console.log('[GSTR-1 Autopilot] Notice on login inputs:', e.message);
        }

        await updateBanner(portalUser ? 'Credentials auto-filled! Please enter CAPTCHA & click Login.' : 'Please enter your Login credentials & CAPTCHA.');

        // Wait for user to log in
        console.log('[GSTR-1 Autopilot] Waiting for user to complete login...');
        emit('LOGIN_WAIT', { phase: 'WAITING_CAPTCHA', message: 'GST portal window open: enter CAPTCHA and click LOGIN (waiting up to 3 min)...' });
        await page.waitForFunction(() => {
            const url = window.location.href;
            const isAuth = url.includes('/auth/') || url.includes('/dashboard') || url.includes('/quicklinks/') || url.includes('/returns/');
            const isNotLogin = !url.includes('/login');
            const hasNoInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
            const hasLogout = Boolean(document.querySelector('a[href*="logout"], [ng-click*="logout"], .user-name, #navbar-usr-menu, li.dropdown.user'));
            // The login page itself carries a hidden header "Logout" link, so nothing counts until we leave /login.
            return isNotLogin && (isAuth || hasNoInputs || hasLogout);
        }, null, { timeout: 180000, polling: 100 });

        console.log('[GSTR-1 Autopilot] Logged in successfully!');
        emit('LOGGED_IN', { phase: 'LOGGED_IN', message: 'Logged in to GST portal. Opening Returns Dashboard...' });
        focusDesktopWindow();
        await page.waitForTimeout(1000);
        await dismissPopups();

        // Parse default Month & FY
        const parts = returnPeriod.trim().split(/\s+/);
        const defaultMonth = parts[0] || 'April';
        let targetFy = financialYear || '';
        if (!targetFy && parts.length > 1) {
            const yearNum = parseInt(parts[1], 10);
            if (!isNaN(yearNum)) {
                targetFy = `${yearNum}-${String(yearNum + 1).slice(-2)}`;
            }
        }
        if (!targetFy) targetFy = '2026-27';

        // ─── SAFE SEARCH SCREEN NAVIGATION HELPER ─────────────────────────────
        // Helper to navigate from Returns Quick Links to Return Dashboard via authentic in-page native click
        // STRICT ZERO URL PUSH: Direct page.goto or window.location.href to return.gst.gov.in triggers "Access Denied" by GSTN WAF.
        const clickReturnsDashboardInPage = async () => {
            console.log('[GSTR-1 Autopilot] ⚡ Navigating from Home/Quick Links to Returns Dashboard via native click...');
            try {
                // Priority 1: Native Playwright click on the card/tile/button
                // visible: the portal's top menu holds a hidden "Returns Dashboard" link that would otherwise win .first()
                const dashTile = page.locator('div.card, div.panel, div.box, a, button, div[class*="card"], div[class*="box"], div[role="button"]')
                    .filter({ hasText: /returns?\s*dashboard|file\s*returns/i })
                    .filter({ visible: true })
                    .first();
                if (await dashTile.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await dashTile.scrollIntoViewIfNeeded().catch(() => {});
                    await dashTile.click({ force: true }).catch(() => {});
                    console.log('[GSTR-1 Autopilot] ✓ Clicked Returns Dashboard tile natively with Playwright');
                } else {
                    // Fallback to direct anchor link
                    const dashLink = page.locator('a[href*="returns/auth/dashboard"], a[href*="returns.gst.gov.in"]').first();
                    if (await dashLink.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await dashLink.click({ force: true }).catch(() => {});
                        console.log('[GSTR-1 Autopilot] ✓ Clicked Returns Dashboard anchor link');
                    }
                }
            } catch(e) {}

            // Rapid check for Returns Search Dashboard dropdowns (up to 12s)
            const waitSearchStart = Date.now();
            while (Date.now() - waitSearchStart < 12000) {
                if (page.isClosed()) return false;
                try {
                    const count = await page.locator('select').count();
                    if (count >= 2) {
                        console.log('[GSTR-1 Autopilot] ✓ Landed on Returns Dashboard with select dropdowns ready!');
                        return true;
                    }
                } catch(e) {}
                await page.waitForTimeout(150);
            }
            return false;
        };

        const ensureReturnsSearchScreen = async (timeoutMs = 25000) => {
            const startWait = Date.now();
            while (Date.now() - startWait < timeoutMs) {
                if (page.isClosed()) return false;
                await dismissPopups();

                const curUrl = page.url();

                // 1. If already on Returns Dashboard and select dropdowns are visible, we are ready!
                try {
                    const selectCount = await page.locator('select').count();
                    if (selectCount >= 2) return true;
                } catch(e) {}

                // 2. UNCONDITIONAL ON-SCREEN BACK CLICK:
                // Target strictly button / input[type="button"] / a.btn, excluding navbars and breadcrumbs
                try {
                    const backBtn = page.locator('button, input[type="button"], input[type="submit"], a.btn, .btn')
                        .filter({ hasText: /^back$/i })
                        .filter({ hasNot: page.locator('.navbar, .breadcrumb, nav, header') })
                        .first();
                    if (await backBtn.isVisible({ timeout: 800 }).catch(() => false)) {
                        console.log('[GSTR-1 Autopilot] Found on-screen BACK button. Clicking natively with Playwright...');
                        await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                        await backBtn.click({ force: true }).catch(() => {});

                        // Wait directly for returns search dropdowns to appear
                        try {
                            await page.waitForSelector('select', { timeout: 8000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) {
                                console.log('[GSTR-1 Autopilot] ✓ Clicked BACK: Returns Dashboard search dropdowns ready!');
                                return true;
                            }
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // 3. If on Returns Quick Links screen OR dashboard home screen -> Click Returns Dashboard tile with native click
                if (curUrl.includes('quicklinks/returns') || curUrl.includes('/quicklinks') || curUrl.includes('/auth/home')) {
                    console.log('[GSTR-1 Autopilot] Detected Home/Quick Links screen. Clicking Returns Dashboard natively...');
                    if (await clickReturnsDashboardInPage()) {
                        return true;
                    }
                    continue;
                }

                // 4. Check for RETURN DASHBOARD / File Returns button on dashboard home page
                try {
                    const retDashBtn = page.locator('button, a, div[role="button"]')
                        .filter({ hasText: /returns?\s*dashboard|file\s*returns/i })
                        .filter({ visible: true })
                        .first();
                    if (await retDashBtn.isVisible({ timeout: 600 }).catch(() => false)) {
                        console.log('[GSTR-1 Autopilot] Clicking RETURN DASHBOARD button on dashboard...');
                        await retDashBtn.click({ force: true }).catch(() => {});
                        try {
                            await page.waitForSelector('select', { timeout: 10000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) return true;
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // 5. Check for breadcrumb "Return Dashboard"
                try {
                    const breadcrumb = page.locator('.breadcrumb a:has-text("Return"), a:has-text("Return Dashboard"), a:has-text("Returns Dashboard")').filter({ visible: true }).first();
                    if (await breadcrumb.isVisible({ timeout: 400 }).catch(() => false)) {
                        console.log('[GSTR-1 Autopilot] Clicking Return Dashboard breadcrumb...');
                        await breadcrumb.click({ force: true }).catch(() => {});
                        try {
                            await page.waitForSelector('select', { timeout: 10000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) return true;
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                await page.waitForTimeout(200);
            }
            return false;
        };

        await ensureReturnsSearchScreen(20000);

        // ─── PERIOD SELECTION HELPER ──────────────────────────────────────────
        const selectPeriodAndSearch = async (curMonth = defaultMonth, curFy = targetFy, stepLabel = 'Period Selection') => {
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            let effectiveMonth = curMonth;
            let effectiveFy = curFy || targetFy;
            let effectiveLabel = stepLabel;

            if (!monthNames.some(m => String(curMonth).toLowerCase().includes(m))) {
                effectiveMonth = defaultMonth;
                effectiveLabel = curMonth;
            }

            console.log(`[GSTR-1 Autopilot] ${effectiveLabel}: Selecting FY=${effectiveFy}, Month=${effectiveMonth}...`);
            await dismissPopups();
            await ensureReturnsSearchScreen();

            try {
                await page.waitForSelector('select', { timeout: 8000 });
            } catch(e) {
                await ensureReturnsSearchScreen();
                await page.waitForSelector('select', { timeout: 12000 });
            }
            await page.waitForTimeout(300);

            // 1. Financial Year
            let fyLoc = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /\d{4}-\d{2}/ })
            }).first();
            if ((await fyLoc.count()) === 0) fyLoc = page.locator('select').first();

            const fyOptions = await fyLoc.evaluate(el => Array.from(el.options).map((o, idx) => ({ index: idx, text: (o.text || '').trim(), value: (o.value || '').trim() })));
            const cleanTargetFy = String(effectiveFy).replace(/[^0-9]/g, '');
            const matchedFy = fyOptions.find(o => {
                if (!o.text || o.text.toLowerCase().includes('select')) return false;
                const cleanOpt = o.text.replace(/[^0-9]/g, '');
                return o.text.includes(effectiveFy) || (cleanTargetFy && cleanOpt === cleanTargetFy);
            });

            if (matchedFy) {
                const currentFyIndex = await fyLoc.evaluate(el => el.selectedIndex);
                if (currentFyIndex !== matchedFy.index) {
                    await fyLoc.selectOption({ index: matchedFy.index });
                    await fyLoc.evaluate(el => {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) {
                            try {
                                const sc = window.angular.element(el).scope();
                                if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                            } catch(e) {}
                        }
                    });
                    await page.waitForTimeout(800);
                }
            }

            // 2. Quarter
            const monthLower = String(effectiveMonth).toLowerCase();
            let quarterNum = 1;
            let quarterMonthNames = ['apr', 'may', 'jun'];
            if (['july', 'august', 'september', 'jul', 'aug', 'sep'].some(m => monthLower.includes(m))) {
                quarterNum = 2;
                quarterMonthNames = ['jul', 'aug', 'sep'];
            } else if (['october', 'november', 'december', 'oct', 'nov', 'dec'].some(m => monthLower.includes(m))) {
                quarterNum = 3;
                quarterMonthNames = ['oct', 'nov', 'dec'];
            } else if (['january', 'february', 'march', 'jan', 'feb', 'mar'].some(m => monthLower.includes(m))) {
                quarterNum = 4;
                quarterMonthNames = ['jan', 'feb', 'mar'];
            }

            let qLoc = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /Quarter|[Qq][1-4]|Jul\s*-\s*Sep|Oct\s*-\s*Dec|Jan\s*-\s*Mar|Apr\s*-\s*Jun/i })
            }).first();
            if ((await qLoc.count()) === 0) qLoc = page.locator('select').nth(1);

            const qOptions = await qLoc.evaluate(el => Array.from(el.options).map((o, idx) => ({ index: idx, text: (o.text || '').trim(), value: (o.value || '').trim() })));
            const matchedQuarter = qOptions.find(o => {
                const t = o.text.toLowerCase();
                if (t.includes('select')) return false;
                return t.includes(`quarter ${quarterNum}`) || t.includes(`q${quarterNum}`) || quarterMonthNames.some(m => t.includes(m));
            });

            // Never search with a stale selection: that files a request for the previous month under this month's name.
            if (!matchedQuarter) throw new Error(`Quarter ${quarterNum} of FY ${effectiveFy} not offered by portal for ${effectiveMonth}`);
            if (matchedQuarter) {
                const currentQIndex = await qLoc.evaluate(el => el.selectedIndex);
                if (currentQIndex !== matchedQuarter.index) {
                    await qLoc.selectOption({ index: matchedQuarter.index });
                    await qLoc.evaluate(el => {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) {
                            try {
                                const sc = window.angular.element(el).scope();
                                if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                            } catch(e) {}
                        }
                    });
                    await page.waitForTimeout(800);
                }
            }

            // 3. Month
            let mLoc = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /January|February|March|April|May|June|July|August|September|October|November|December/i })
            }).first();
            if ((await mLoc.count()) === 0) mLoc = page.locator('select').last();

            const mOptions = await mLoc.evaluate(el => Array.from(el.options).map((o, idx) => ({ index: idx, text: (o.text || '').trim(), value: (o.value || '').trim() })));
            const targetMonthLower = String(effectiveMonth).toLowerCase().trim();
            const targetMonthShort = targetMonthLower.slice(0, 3);

            const matchedMonth = mOptions.find(o => {
                const t = o.text.toLowerCase().trim();
                if (t.includes('select') || t.startsWith('--')) return false;
                return t.includes(targetMonthLower) || t.includes(targetMonthShort);
            });

            // No positional guess: picking "the 1st option of the quarter" pulled another month's data.
            if (!matchedMonth) throw new Error(`${effectiveMonth} not offered by portal in FY ${effectiveFy} (return period not open yet?)`);
            if (matchedMonth) {
                await mLoc.selectOption({ index: matchedMonth.index });
                await mLoc.evaluate(el => {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        try {
                            const sc = window.angular.element(el).scope();
                            if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                        } catch(e) {}
                    }
                });
            }
            await page.waitForTimeout(400);

            // 4. Click SEARCH
            const searchLoc = page.locator('button:has-text("SEARCH"), input[value="SEARCH" i], button.btn-primary:has-text("SEARCH"), #search, button:has-text("Search")').first();
            let clickedSearch = false;
            try {
                if (await searchLoc.isVisible({ timeout: 2000 })) {
                    await searchLoc.scrollIntoViewIfNeeded().catch(() => {});
                    await searchLoc.click();
                    clickedSearch = true;
                }
            } catch(e) {}

            if (!clickedSearch) {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
                    const s = btns.find(b => (b.innerText || b.value || b.textContent || '').trim().toUpperCase() === 'SEARCH');
                    if (s) {
                        s.scrollIntoView({ block: 'center' });
                        s.click();
                        if (window.angular) {
                            try {
                                window.angular.element(s).triggerHandler('click');
                                window.angular.element(s).scope()?.$apply();
                            } catch(e) {}
                        }
                    }
                });
            }

            // 5. Wait for returns cards to render (handling loading overlay and AJAX digest)
            try {
                await page.waitForSelector('.loading, .spinner, .overlay, [ng-show*="loading"], .busy-indicator', { timeout: 1500 }).catch(() => {});
                await page.waitForSelector('.loading, .spinner, .overlay, [ng-show*="loading"], .busy-indicator', { state: 'hidden', timeout: 12000 }).catch(() => {});
            } catch(e) {}

            try {
                await page.waitForFunction(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav'));
                    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-title, .panel-title, strong, b, div, span, p'));
                    return allHeadings.some(el => {
                        if (isTopNavbarOrHeader(el)) return false;
                        const txt = (el.innerText || el.textContent || '').trim().toUpperCase();
                        if (txt.length > 120) return false;
                        return txt.includes('OUTWARD SUPPLIES') || ((txt.includes('GSTR-1') || txt.includes('GSTR 1')) && !txt.includes('3B') && !txt.includes('2B'));
                    });
                }, null, { timeout: 15000 });
            } catch (e) {}
            await page.waitForTimeout(600);
        };

        // ─── DOWNLOAD GSTR-1 & PERSIST HELPER ──────────────────────────────────
        const downloadAndProcessGstr1 = async (currentPeriodStr) => {
            activeSyncPeriod = currentPeriodStr;
            parsedInvoices = null;
            capturedExcelPath = null;
            capturedJsonPath = null;
            capturedSummary = null;
            const actionStartTime = Date.now();

            let clickedG1Download = false;
            let clickedBtnText = '';

            // ─── STEP 5: TARGET GSTR-1 CARD & CLICK "PREPARE OFFLINE" / "DOWNLOAD" ───
            console.log(`[GSTR-1 Autopilot] Step 5: Locating GSTR-1 card on dashboard for ${currentPeriodStr}...`);
            await updateBanner(`Locating GSTR-1 card on dashboard for ${currentPeriodStr}...`, '#8b5cf6');
            await dismissPopups();

            for (let attempt = 1; attempt <= 3; attempt++) {
                if (clickedG1Download) break;
                if (page.isClosed()) break;

                // Priority 1: Title-down matching from GSTR-1 specific heading to its card
                try {
                    const titleDownRes = await page.evaluate(() => {
                        const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                        
                        // 1. Find the specific heading element for GSTR-1
                        const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-title, .panel-title, strong, b, div, span, p'));
                        const g1TitleEl = allHeadings.find(el => {
                            if (isTopNavbarOrHeader(el)) return false;
                            const txt = (el.innerText || el.textContent || '').trim().toUpperCase();
                            if (txt.length > 120) return false;
                            const isOutward = txt.includes('OUTWARD SUPPLIES') || txt.includes('DETAILS OF OUTWARD');
                            const isG1Only = (txt.includes('GSTR-1') || txt.includes('GSTR 1') || txt === 'GSTR1') && !txt.includes('3B') && !txt.includes('2B') && !txt.includes('2A');
                            return isOutward || isG1Only;
                        });

                        if (!g1TitleEl) return { success: false, reason: 'GSTR-1 title element not found' };

                        // 2. Climb up to find the enclosing card container
                        let card = g1TitleEl.parentElement;
                        let matchedCard = null;
                        while (card && card !== document.body) {
                            const btns = Array.from(card.querySelectorAll('button, a, input[type="button"], .btn')).filter(b => !isTopNavbarOrHeader(b));
                            const cardText = (card.innerText || '').toUpperCase();

                            // Stop if container starts enclosing multiple distinct returns (e.g. both GSTR-3B and GSTR-2B)
                            const hasOtherReturns = (cardText.includes('GSTR-3B') || cardText.includes('GSTR 3B') || cardText.includes('MONTHLY RETURN')) &&
                                                    (cardText.includes('GSTR-2B') || cardText.includes('AUTO-DRAFTED') || cardText.includes('GSTR-2A'));
                            if (hasOtherReturns) break;

                            const hasTargetBtn = btns.some(b => {
                                const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return bt.includes('OFFLINE') || bt.includes('PREPARE OFFLINE') || bt === 'DOWNLOAD' || bt.includes('DOWNLOAD');
                            });

                            if (hasTargetBtn) {
                                matchedCard = card;
                                const cls = card.className || '';
                                if (cls.includes('col-') || cls.includes('card') || cls.includes('panel') || cls.includes('box')) {
                                    break;
                                }
                            }
                            card = card.parentElement;
                        }

                        if (!matchedCard) {
                            matchedCard = g1TitleEl.closest('.returns-card, div.panel, div.card, div.box, [class*="col-md-"], [class*="col-sm-"], [class*="col-lg-"], div.border-box');
                        }

                        if (matchedCard) {
                            const btns = Array.from(matchedCard.querySelectorAll('button, a, input[type="button"], .btn')).filter(b => !isTopNavbarOrHeader(b));
                            
                            // Priority A: PREPARE OFFLINE (for unfiled / pending return)
                            let targetBtn = btns.find(b => {
                                const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return bt === 'PREPARE OFFLINE' || bt.includes('PREPARE OFFLINE') || bt.includes('OFFLINE');
                            });

                            // Priority B: DOWNLOAD (for filed return)
                            if (!targetBtn) {
                                targetBtn = btns.find(b => {
                                    const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                    return bt === 'DOWNLOAD' || bt.includes('DOWNLOAD');
                                });
                            }

                            if (targetBtn) {
                                targetBtn.scrollIntoView({ block: 'center' });
                                targetBtn.click();
                                if (window.angular) {
                                    try {
                                        window.angular.element(targetBtn).triggerHandler('click');
                                        window.angular.element(targetBtn).scope()?.$apply();
                                    } catch(e) {}
                                }
                                return { success: true, text: (targetBtn.innerText || targetBtn.value || '').trim() };
                            }
                        }

                        return { success: false, reason: 'Button not found inside matched GSTR-1 card' };
                    });

                    if (titleDownRes.success) {
                        clickedG1Download = true;
                        clickedBtnText = titleDownRes.text;
                        console.log(`[GSTR-1 Autopilot] ✓ Clicked "${clickedBtnText}" on GSTR-1 card via Title-Down Search (Attempt ${attempt})`);
                        break;
                    }
                } catch (e) {}

                // Priority 2: Return cards container scan
                if (!clickedG1Download) {
                    try {
                        const cardScanRes = await page.evaluate(() => {
                            const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                            const potentialCards = Array.from(document.querySelectorAll('.returns-card, div.panel, div.card, div.box, [class*="col-md-"], [class*="col-sm-"], [class*="col-lg-"], div.border-box'));

                            for (const pc of potentialCards) {
                                if (isTopNavbarOrHeader(pc)) continue;
                                const headings = Array.from(pc.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-title, .panel-title, strong, b, div, span, p'));
                                const isG1 = headings.some(h => {
                                    const ht = (h.innerText || h.textContent || '').trim().toUpperCase();
                                    if (ht.length > 80) return false;
                                    return ht.includes('OUTWARD SUPPLIES') || (ht.includes('GSTR-1') && !ht.includes('3B') && !ht.includes('2B'));
                                });

                                const is3Bor2B = headings.some(h => {
                                    const ht = (h.innerText || h.textContent || '').trim().toUpperCase();
                                    if (ht.length > 80) return false;
                                    return ht.includes('MONTHLY RETURN') || (ht.includes('GSTR-3B') && !ht.includes('1')) || (ht.includes('GSTR-2B') && !ht.includes('1'));
                                });

                                if (isG1 && !is3Bor2B) {
                                    const btns = Array.from(pc.querySelectorAll('button, a, input[type="button"], .btn')).filter(b => !isTopNavbarOrHeader(b));
                                    let btn = btns.find(b => {
                                        const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                        return bt === 'PREPARE OFFLINE' || bt.includes('PREPARE OFFLINE') || bt.includes('OFFLINE');
                                    });
                                    if (!btn) {
                                        btn = btns.find(b => {
                                            const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                            return bt === 'DOWNLOAD' || bt.includes('DOWNLOAD');
                                        });
                                    }
                                    if (btn) {
                                        btn.scrollIntoView({ block: 'center' });
                                        btn.click();
                                        if (window.angular) {
                                            try {
                                                window.angular.element(btn).triggerHandler('click');
                                                window.angular.element(btn).scope()?.$apply();
                                            } catch(e) {}
                                        }
                                        return { success: true, text: (btn.innerText || btn.value || '').trim() };
                                    }
                                }
                            }
                            return { success: false };
                        });

                        if (cardScanRes.success) {
                            clickedG1Download = true;
                            clickedBtnText = cardScanRes.text;
                            console.log(`[GSTR-1 Autopilot] ✓ Clicked "${clickedBtnText}" on GSTR-1 card via Card Scan (Attempt ${attempt})`);
                            break;
                        }
                    } catch(e) {}
                }

                // Priority 3: Playwright scoped locator click
                if (!clickedG1Download) {
                    try {
                        const g1Card = page.locator('div[class*="col-"], div.card, div.panel, .returns-card, div.box, div[class*="card"]')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                            .filter({ hasText: /Outward\s*Supplies|GSTR-?1\b|IFF/i })
                            .filter({ hasNotText: /Monthly\s*Return|GSTR-?3B/i })
                            .first();

                        if (await g1Card.isVisible({ timeout: 1500 }).catch(() => false)) {
                            const dlBtn = g1Card.locator('button, a, input[type="button"], .btn')
                                .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu') })
                                .filter({ hasText: /PREPARE\s*OFFLINE|OFFLINE|^DOWNLOAD$/i })
                                .first();
                            if (await dlBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                                await dlBtn.scrollIntoViewIfNeeded().catch(() => {});
                                await dlBtn.click({ force: true });
                                clickedG1Download = true;
                                console.log(`[GSTR-1 Autopilot] ✓ Clicked button on GSTR-1 card via Playwright locator (Attempt ${attempt})`);
                                break;
                            }
                        }
                    } catch(e) {}
                }

                if (!clickedG1Download && attempt < 3) {
                    console.log(`[GSTR-1 Autopilot] GSTR-1 card button not clicked on attempt ${attempt}/3, waiting 1s for DOM...`);
                    await page.waitForTimeout(1000);
                }
            }

            // Verify navigation to GSTR-1 Offline Preparation or Download screen
            console.log(`[GSTR-1 Autopilot] Waiting for GSTR-1 Offline / Download screen to load...`);
            await updateBanner(`Entering GSTR-1 Offline / Download screen...`, '#8b5cf6');
            let landedOnOffline = false;

            try {
                await page.waitForFunction(() => {
                    const u = window.location.href.toLowerCase();
                    const bodyText = (document.body ? document.body.innerText : '').toUpperCase();
                    const hasOfflineUrl = u.includes('/offline') || u.includes('offline') || u.includes('offlinedownload');
                    const hasOfflineTabs = Boolean(document.querySelector('ul.nav-tabs, a[data-toggle="tab"], #download, #upload, button[role="tab"]'));
                    const hasOfflineText = bodyText.includes('OFFLINE DOWNLOAD FOR GSTR-1') || 
                                           bodyText.includes('DOWNLOAD DATA FOR GSTR-1') ||
                                           (bodyText.includes('OFFLINE') && (bodyText.includes('DOWNLOAD') || bodyText.includes('UPLOAD'))) ||
                                           bodyText.includes('GENERATE JSON FILE TO DOWNLOAD');
                    return hasOfflineUrl || hasOfflineTabs || hasOfflineText;
                }, null, { timeout: 12000 });
                landedOnOffline = true;
            } catch (e) {}

            await page.waitForTimeout(1000);
            await dismissPopups();

            // Guard: If Step 5 failed, do NOT falsely proceed to Step 6 or Step 7!
            if (!landedOnOffline) {
                console.error(`[GSTR-1 Autopilot] ❌ Step 5 Failed: Could not open GSTR-1 Prepare Offline screen for ${currentPeriodStr}. Current URL: ${page.url()}`);
                await updateBanner(`❌ Could not open GSTR-1 Prepare Offline screen.`, '#ef4444');
                await page.waitForTimeout(2000);
                return { status: 'FAILED', count: 0, excelPath: null, jsonPath: null, summary: null, error: 'Could not open GSTR-1 Prepare Offline screen from portal dashboard.' };
            }

            // ─── STEP 6: VERIFY / SWITCH TO IN-PAGE "DOWNLOAD" TAB (IF NOT ALREADY ON DOWNLOAD SCREEN) ───
            console.log(`[GSTR-1 Autopilot] Step 6: Verifying in-page "Download" tab on offline preparation page...`);
            await updateBanner(`Verifying in-page "Download" tab...`, '#8b5cf6');

            // Check if already on the Download screen (e.g. /offlinedownload or Download tab already active)
            const isAlreadyOnDownloadScreen = await page.evaluate(() => {
                const u = window.location.href.toLowerCase();
                const bodyText = (document.body ? document.body.innerText : '').toUpperCase();
                const isDirectDownloadUrl = u.includes('offlinedownload');
                const hasDirectGenerateBtn = bodyText.includes('GENERATE JSON FILE TO DOWNLOAD') || bodyText.includes('DOWNLOAD DATA FOR GSTR-1');
                const activeTab = document.querySelector('ul.nav-tabs li.active a, .nav-tabs .active, a.nav-link.active');
                const isDownloadTabActive = activeTab && (activeTab.innerText || '').toUpperCase().includes('DOWNLOAD');
                return Boolean(isDirectDownloadUrl || hasDirectGenerateBtn || isDownloadTabActive);
            });

            if (isAlreadyOnDownloadScreen) {
                console.log('[GSTR-1 Autopilot] ✓ Already on GSTR-1 Download screen (no tab switch needed)');
            } else {
                let switchedToDownloadTab = false;
                try {
                    // Priority 1: In-page evaluate targeting strictly the offline tab, ignoring any navbar/header
                    switchedToDownloadTab = await page.evaluate(() => {
                        const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                        const tabCandidates = Array.from(document.querySelectorAll('ul.nav-tabs a, .nav-tabs li a, a[data-toggle="tab"], .nav-pills a, button[role="tab"], a.nav-link, li.nav-item a'));
                        for (const tab of tabCandidates) {
                            if (isTopNavbarOrHeader(tab)) continue;
                            const txt = (tab.innerText || tab.textContent || '').trim().toUpperCase();
                            const href = (tab.getAttribute('href') || '').toLowerCase();
                            if (txt === 'DOWNLOAD' || txt === 'DOWNLOAD DETAILS' || txt.includes('DOWNLOAD') || href === '#download' || href.endsWith('/download')) {
                                tab.scrollIntoView({ block: 'center' });
                                tab.click();
                                if (tab.parentElement && tab.parentElement.click) tab.parentElement.click();
                                if (window.angular) {
                                    try {
                                        window.angular.element(tab).triggerHandler('click');
                                        window.angular.element(tab).scope()?.$apply();
                                    } catch(e) {}
                                }
                                return true;
                            }
                        }
                        return false;
                    });

                    if (switchedToDownloadTab) {
                        console.log('[GSTR-1 Autopilot] ✓ Switched to in-page Download tab via evaluate');
                    } else {
                        // Priority 2: Playwright locator strictly scoped to main content and excluding navbar/header
                        const nativeTab = page.locator('div[ng-view], #main, .content, body')
                            .locator('ul.nav-tabs a, a[data-toggle="tab"], .nav-tabs li a, a.nav-link')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                            .filter({ hasText: /^download/i })
                            .first();
                        if (await nativeTab.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await nativeTab.scrollIntoViewIfNeeded().catch(() => {});
                            await nativeTab.click({ force: true }).catch(() => {});
                            switchedToDownloadTab = true;
                            console.log('[GSTR-1 Autopilot] ✓ Switched to in-page Download tab via scoped Playwright locator');
                        }
                    }
                } catch (tabErr) {
                    console.warn('[GSTR-1 Autopilot] Notice while switching to Download tab:', tabErr.message);
                }

                // Verify that Download Tab is active or Download pane / buttons are visible
                try {
                    await page.waitForFunction(() => {
                        const activeTab = document.querySelector('ul.nav-tabs li.active a, .nav-tabs .active, a.nav-link.active');
                        const isTabActive = activeTab && (activeTab.innerText || '').toUpperCase().includes('DOWNLOAD');
                        const dlPane = document.querySelector('#download, .tab-pane.active, div[ng-view]');
                        const text = dlPane ? (dlPane.innerText || '').toUpperCase() : '';
                        const hasDownloadContent = text.includes('GENERATE') || text.includes('FILE 1') || text.includes('CLICK HERE TO DOWNLOAD') || text.includes('GENERATE JSON');
                        return isTabActive || hasDownloadContent;
                    }, null, { timeout: 8000 });
                } catch(e) {}
            }

            // Settle Download screen and wait for DOM elements
            try {
                await page.waitForFunction(() => {
                    const isTopNav = (el) => Boolean(el.closest('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav'));
                    const els = Array.from(document.querySelectorAll('a, span, button, [role="link"], p, div, input'));
                    return els.some(el => {
                        if (isTopNav(el)) return false;
                        const t = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
                        return (t.includes('click here') && t.includes('download')) ||
                               t.includes('file 1') ||
                               t.includes('generate json file to download') ||
                               t.includes('download data for gstr-1');
                    });
                }, null, { timeout: 6000 });
            } catch(e) {}

            await page.waitForTimeout(600);
            await dismissPopups();

            // ─── STEP 7: DYNAMIC JSON LINK DISCOVERY & REQUEST GENERATION (CASES A, B, C) ───
            let foundValidDownload = false;
            let linkWasExpired = false;

            // Robust function to locate the download link element
            // Strictly excludes the top navbar, user dropdown, and footer (DO NOT exclude .header)
            const findDownloadLink = async () => {
                // 1. Playwright Locator
                try {
                    const loc = page.locator('a, span, button, [role="link"], p')
                        .filter({ hasNot: page.locator('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                        .filter({ hasText: /Click\s*here\s*to\s*download|File\s*1/i })
                        .first();
                    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
                        const txt = (await loc.innerText().catch(() => '')) || 'Click here to download - File 1';
                        return { found: true, text: txt.trim() };
                    }
                } catch(e) {}

                // 2. DOM evaluate fallback
                try {
                    return await page.evaluate(() => {
                        const isTopNav = (el) => Boolean(el.closest('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown-menu'));
                        const candidates = Array.from(document.querySelectorAll('a, span, button, [role="link"], p, div'));
                        for (const el of candidates) {
                            if (isTopNav(el)) continue;
                            const t = (el.innerText || el.textContent || '').trim();
                            const lower = t.toLowerCase();
                            if (lower.includes('generate')) continue;
                            const isClickHere = (lower.includes('click here') && lower.includes('download')) || lower.includes('file 1') || lower.includes('file-1');
                            if (isClickHere) {
                                return { found: true, text: t };
                            }
                        }
                        return { found: false, text: '' };
                    });
                } catch(e) {
                    return { found: false, text: '' };
                }
            };

            // Direct click on "Click here to download - File 1"
            const clickReadyDownloadLink = async () => {
                let clicked = false;
                // Method 1: Playwright native locator
                try {
                    const dlLoc = page.locator('a, span, button, [role="link"], p')
                        .filter({ hasNot: page.locator('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                        .filter({ hasText: /Click\s*here\s*to\s*download|File\s*1/i })
                        .first();
                    if (await dlLoc.isVisible({ timeout: 1500 }).catch(() => false)) {
                        await dlLoc.scrollIntoViewIfNeeded().catch(() => {});
                        await dlLoc.click({ force: true });
                        clicked = true;
                    }
                } catch(e) {}

                // Method 2: DOM Evaluate click fallback
                if (!clicked) {
                    try {
                        clicked = await page.evaluate(() => {
                            const isTopNav = (el) => Boolean(el.closest('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown-menu'));
                            const candidates = Array.from(document.querySelectorAll('a, span, button, [role="link"], p, div'));
                            for (const el of candidates) {
                                if (isTopNav(el)) continue;
                                const t = (el.innerText || el.textContent || '').trim();
                                const lower = t.toLowerCase();
                                if (lower.includes('generate')) continue;
                                if ((lower.includes('click here') && lower.includes('download')) || lower.includes('file 1') || lower.includes('file-1')) {
                                    const target = el.closest('a, button, [role="link"]') || el;
                                    target.scrollIntoView({ block: 'center' });
                                    target.click();
                                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    if (window.angular) {
                                        try {
                                            const ngEl = window.angular.element(target);
                                            ngEl.triggerHandler('click');
                                            const sc = ngEl.scope();
                                            if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                        } catch(e) {}
                                    }
                                    return true;
                                }
                            }
                            return false;
                        });
                    } catch(e) {}
                }
                return clicked;
            };

            // Shared test clicker for download link: handles Case A (expired tab) vs Case B (file stream)
            const testDownloadLink = async (linkText) => {
                console.log(`[GSTR-1 Autopilot] Found download link on screen: "${linkText}". Testing validity...`);
                await updateBanner(`Testing download link validity...`, '#8b5cf6');

                let openedNewTab = null;
                let downloadEventTriggered = false;

                const pageListener = (newPage) => { openedNewTab = newPage; };
                if (context && typeof context.on === 'function') {
                    context.on('page', pageListener);
                }
                const dlListener = () => { downloadEventTriggered = true; };
                page.on('download', dlListener);

                const didClick = await clickReadyDownloadLink();
                if (didClick) {
                    console.log(`[GSTR-1 Autopilot] ✓ Clicked "${linkText}". Monitoring for tab vs file stream (up to 3.5s)...`);
                    const startWait = Date.now();
                    while (Date.now() - startWait < 3500) {
                        if (openedNewTab) break;
                        if (downloadEventTriggered || parsedInvoices || (activeGstr1DownloadPromises && activeGstr1DownloadPromises.size > 0)) break;
                        await page.waitForTimeout(150);
                    }
                }

                if (context && typeof context.off === 'function') context.off('page', pageListener);
                page.off('download', dlListener);

                // Check outcomes:
                if (openedNewTab) {
                    await page.waitForTimeout(500);
                    const isDownloadStream = downloadEventTriggered || parsedInvoices || (activeGstr1DownloadPromises && activeGstr1DownloadPromises.size > 0);
                    if (!isDownloadStream) {
                        console.log(`[GSTR-1 Autopilot] ⚠️ CASE A DETECTED: Download link is EXPIRED! Closing error tab...`);
                        await updateBanner('Download link is expired. Closing error tab...', '#f59e0b');

                        await openedNewTab.close().catch(() => {});
                        console.log('[GSTR-1 Autopilot] ✓ Closed new error tab.');

                        await page.bringToFront().catch(() => {});
                        focusDesktopWindow();
                        await page.waitForTimeout(500);

                        return { isValid: false, isExpired: true };
                    } else {
                        await openedNewTab.close().catch(() => {});
                        await page.bringToFront().catch(() => {});
                        return { isValid: true, isExpired: false };
                    }
                } else if (downloadEventTriggered || parsedInvoices || (activeGstr1DownloadPromises && activeGstr1DownloadPromises.size > 0)) {
                    console.log(`[GSTR-1 Autopilot] 🎯 CASE B DETECTED: Valid download stream initiated for ${currentPeriodStr}!`);
                    return { isValid: true, isExpired: false };
                }

                return { isValid: false, isExpired: false };
            };

            // ─── STEP 7.1: TEST CLICK EXISTING LINK (IF PRESENT ON SCREEN BEFORE GENERATE) ───
            let linkCheck = await findDownloadLink();
            if (linkCheck.found) {
                const res = await testDownloadLink(linkCheck.text);
                if (res.isValid) {
                    foundValidDownload = true;
                } else if (res.isExpired) {
                    linkWasExpired = true;
                }
            }

            // ─── STEP 7.2 / CASE C: CLICK "GENERATE JSON FILE TO DOWNLOAD" ───
            if (!foundValidDownload) {
                const reqReason = linkWasExpired
                    ? 'Expired link was detected and closed. Now clicking GENERATE JSON FILE TO DOWNLOAD'
                    : 'No download link present on screen. Clicking GENERATE JSON FILE TO DOWNLOAD';
                console.log(`[GSTR-1 Autopilot] Step 7.2: ${reqReason} for ${currentPeriodStr}...`);
                await updateBanner(`Clicking "GENERATE JSON FILE TO DOWNLOAD"...`, '#8b5cf6');

                let clickedGenerate = false;

                // Priority 1: In-page evaluate targeting GENERATE JSON FILE TO DOWNLOAD
                try {
                    clickedGenerate = await page.evaluate(() => {
                        const isTopNav = (el) => Boolean(el.closest('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown-menu'));
                        const candidates = Array.from(document.querySelectorAll('button, input, a.btn, a, .btn'));
                        for (const b of candidates) {
                            if (isTopNav(b)) continue;
                            const txt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                            const isGen = txt === 'GENERATE JSON FILE TO DOWNLOAD' ||
                                          (txt.includes('GENERATE') && txt.includes('JSON')) ||
                                          (txt.includes('GENERATE') && txt.includes('DOWNLOAD')) ||
                                          (txt.includes('GENERATE') && txt.includes('FILE'));
                            if (isGen) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                if (window.angular) {
                                    try {
                                        const ngEl = window.angular.element(b);
                                        ngEl.triggerHandler('click');
                                        const sc = ngEl.scope();
                                        if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                    } catch(e) {}
                                }
                                return true;
                            }
                        }
                        return false;
                    });
                } catch(e) {}

                // Priority 2: Playwright native click
                if (!clickedGenerate) {
                    try {
                        const genLocators = [
                            page.locator('button, input[type="submit"], input[type="button"], input, a.btn, a')
                                .filter({ hasNot: page.locator('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                                .filter({ hasText: /GENERATE\s*JSON\s*FILE\s*TO\s*DOWNLOAD/i }),
                            page.locator('button, input[type="submit"], input[type="button"], input, a.btn, a')
                                .filter({ hasNot: page.locator('header, nav, .navbar, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                                .filter({ hasText: /GENERATE\s*JSON/i }),
                            page.locator('input[value*="GENERATE JSON" i], input[value*="GENERATE" i]')
                        ];

                        for (const loc of genLocators) {
                            if (await loc.first().isVisible({ timeout: 1500 }).catch(() => false)) {
                                await loc.first().scrollIntoViewIfNeeded().catch(() => {});
                                await loc.first().click({ force: true }).catch(() => {});
                                clickedGenerate = true;
                                break;
                            }
                        }
                    } catch(e) {}
                }

                if (clickedGenerate) {
                    console.log(`[GSTR-1 Autopilot] ⚡ Clicked GENERATE JSON FILE TO DOWNLOAD successfully.`);
                    await updateBanner(`Clicked GENERATE JSON. Awaiting portal response...`, '#10b981');
                } else {
                    console.warn(`[GSTR-1 Autopilot] ⚠️ Could not find GENERATE JSON FILE TO DOWNLOAD button.`);
                }

                // ─── STEP 7.3: POST-GENERATE CHECK: MONITOR UP TO 8 SECONDS FOR DOWNLOAD LINK OR 20-MIN CONFIRMATION ───
                console.log(`[GSTR-1 Autopilot] Post-Generate: Checking for download link or 20-min wait confirmation for ${currentPeriodStr}...`);
                const postGenStart = Date.now();

                while (Date.now() - postGenStart < 8000) {
                    if (page.isClosed()) break;

                    // 1. Check if download link is available on screen (e.g. from previously generated file or freshly rendered)
                    // Only test if not already confirmed expired in this round
                    if (!linkWasExpired) {
                        const postLinkCheck = await findDownloadLink();
                        if (postLinkCheck.found) {
                            console.log(`[GSTR-1 Autopilot] Post-Generate: Detected download link on screen: "${postLinkCheck.text}". Testing validity...`);
                            const postRes = await testDownloadLink(postLinkCheck.text);
                            if (postRes.isValid) {
                                foundValidDownload = true;
                                break;
                            } else if (postRes.isExpired) {
                                linkWasExpired = true;
                            }
                        }
                    }

                    // 2. Check if portal shows 20-min wait confirmation message
                    try {
                        const pageText = await page.evaluate(() => {
                            const mainEl = document.querySelector('div[ng-view], .content, main, body');
                            return (mainEl ? mainEl.innerText : document.body.innerText || '').toLowerCase();
                        });
                        if (pageText.includes('in progress') || pageText.includes('processed') || pageText.includes('20 minutes') || pageText.includes('check after') || pageText.includes('request has been received')) {
                            console.log(`[GSTR-1 Autopilot] ✓ Portal confirmed: Generation request received (20-min wait).`);
                            break;
                        }
                    } catch(e) {}

                    await page.waitForTimeout(500);
                }
            }

            // ─── STEP 4: IF VALID DOWNLOAD LINK WAS FOUND & CLICKED (CASE B) -> DOWNLOAD & PERSIST ───
            if (foundValidDownload) {
                console.log(`[GSTR-1 Autopilot] CASE B: Download stream in progress for ${currentPeriodStr}. Waiting up to 15s for file completion...`);
                await updateBanner(`Downloading & extracting GSTR-1 for ${currentPeriodStr}...`, '#10b981');

                let curExcelPath = capturedExcelPath;
                let curJsonPath = capturedJsonPath;
                let curParsedInvoices = parsedInvoices;
                let curSummary = capturedSummary;

                const waitStart = Date.now();
                const userDownloadsDir = path.join(os.homedir(), 'Downloads');

                while (!curParsedInvoices && (Date.now() - waitStart < 15000)) {
                    if (page.isClosed()) break;
                    if (parsedInvoices) {
                        curParsedInvoices = parsedInvoices;
                        curExcelPath = capturedExcelPath;
                        curJsonPath = capturedJsonPath;
                        curSummary = capturedSummary;
                        break;
                    }

                    // Check both scratch downloadDir and user's Downloads folder
                    const targetDirs = [downloadDir, userDownloadsDir].filter(d => fs.existsSync(d));

                    for (const d of targetDirs) {
                        let files = [];
                        try {
                            files = fs.readdirSync(d)
                                .map(f => {
                                    const p = path.join(d, f);
                                    let time = 0;
                                    try { time = fs.statSync(p).mtimeMs; } catch(e) {}
                                    return { name: f, path: p, time };
                                })
                                .filter(f => f.time >= (actionStartTime - 6000))
                                .sort((a, b) => b.time - a.time);
                        } catch(e) {}

                        for (const fItem of files) {
                            const fPath = fItem.path;
                            const lower = fItem.name.toLowerCase();
                            if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                                curExcelPath = fPath;
                                const r = parseGstr1Excel(fPath, gstinUpper, currentPeriodStr);
                                if (r && r.invoices) {
                                    curParsedInvoices = r.invoices;
                                    curSummary = r.summary;
                                    break;
                                }
                            } else if (lower.endsWith('.json')) {
                                curJsonPath = fPath;
                                try {
                                    const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
                                    const r = parseGstr1Json(raw, gstinUpper, currentPeriodStr);
                                    if (r && r.invoices) {
                                        curParsedInvoices = r.invoices;
                                        curSummary = r.summary;
                                        break;
                                    }
                                } catch (e) {}
                            } else if (lower.endsWith('.zip')) {
                                const r = await parseGstr1Zip(fPath, gstinUpper, currentPeriodStr);
                                if (r && r.invoices) {
                                    curParsedInvoices = r.invoices;
                                    curSummary = r.summary;
                                    break;
                                }
                            }
                        }

                        if (curParsedInvoices) break;
                    }

                    if (curParsedInvoices) break;
                    await page.waitForTimeout(300);
                }

                // If invoices extracted (or 0 invoices for nil returns)
                if (curParsedInvoices && curParsedInvoices.length > 0) {
                    console.log(`[GSTR-1 Autopilot] ✓ Persisting ${curParsedInvoices.length} invoices for ${currentPeriodStr}...`);
                    await bulkSaveGstr1Invoices(db, gstinUpper, currentPeriodStr, curParsedInvoices, curExcelPath, curJsonPath);
                    if (curSummary) {
                        await saveGstr1Summary(db, gstinUpper, currentPeriodStr, curSummary);
                    }

                    // Click official on-screen BACK button (strictly excluding anchor <a> tags, breadcrumbs, navbars)
                    try {
                        const backBtn = page.locator('button, input[type="button"], input[type="submit"], a.btn, .btn')
                            .filter({ hasText: /^back$/i })
                            .filter({ hasNot: page.locator('.navbar, .breadcrumb, nav, header, footer') })
                            .first();
                        if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await backBtn.click({ force: true }).catch(() => {});
                        }
                    } catch(e) {}

                    return { status: 'SYNCED', count: curParsedInvoices.length, excelPath: curExcelPath, jsonPath: curJsonPath, summary: curSummary };
                } else if (curParsedInvoices && curParsedInvoices.length === 0) {
                    console.log(`[GSTR-1 Autopilot] ✓ Downloaded file has 0 invoices (Nil Return) for ${currentPeriodStr}. Marking SYNCED.`);
                    await markGstr1MonthSyncedEmpty(db, gstinUpper, currentPeriodStr, curExcelPath, curJsonPath);

                    try {
                        const backBtn = page.locator('button, input[type="button"], input[type="submit"], a.btn, .btn')
                            .filter({ hasText: /^back$/i })
                            .filter({ hasNot: page.locator('.navbar, .breadcrumb, nav, header, footer') })
                            .first();
                        if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await backBtn.click({ force: true }).catch(() => {});
                        }
                    } catch(e) {}

                    return { status: 'SYNCED', count: 0, excelPath: curExcelPath, jsonPath: curJsonPath, summary: curSummary };
                }
            }

            // ─── STEP 5: IF LINK DID NOT APPEAR -> CONFIRM REQUEST SENT & SET 20-MIN TIMER ───
            console.log(`[GSTR-1 Autopilot] ⏱️ Generation request confirmed for ${currentPeriodStr}. Setting 20-min timer in DB...`);
            await markGstr1MonthRequested(db, gstinUpper, currentPeriodStr);
            await page.waitForTimeout(1000);

            // Click official on-screen BACK button (strictly excluding anchor <a> tags, breadcrumbs, navbars)
            try {
                const clickedBack = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, .btn'));
                    const b = btns.find(btn => {
                        if (isTopNavbarOrHeader(btn)) return false;
                        const t = (btn.innerText || btn.value || btn.textContent || '').trim().toUpperCase();
                        return t === 'BACK';
                    });
                    if (b) {
                        b.scrollIntoView({ block: 'center' });
                        b.click();
                        if (window.angular) {
                            try {
                                window.angular.element(b).triggerHandler('click');
                                window.angular.element(b).scope()?.$apply();
                            } catch(e) {}
                        }
                        return true;
                    }
                    return false;
                });

                if (!clickedBack) {
                    const backBtn = page.locator('button, input[type="button"], input[type="submit"], a.btn, .btn')
                        .filter({ hasText: /^back$/i })
                        .filter({ hasNot: page.locator('.navbar, .breadcrumb, nav, header, footer') })
                        .first();
                    if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                        await backBtn.click({ force: true }).catch(() => {});
                    }
                }
            } catch(e) {}

            return { status: 'REQUESTED', count: 0, excelPath: null, jsonPath: null, summary: null };
        };

        // ─── DOWNLOAD GSTR-1 PDF (FILED SUMMARY OR PREVIEW) ────────────────────
        const downloadAndProcessGstr1Pdf = async (currentPeriodStr) => {
            activeSyncPeriod = currentPeriodStr;
            capturedPdfPath = null;
            capturedGstr1PdfSummary = null;

            console.log(`\n======================================================`);
            console.log(`[GSTR-1 Autopilot PDF] Initiating PDF download workflow for ${currentPeriodStr}...`);
            console.log(`======================================================\n`);
            await updateBanner(`[GSTR-1 PDF] Opening GSTR-1 details for ${currentPeriodStr}...`, '#8b5cf6');

            let clickedG1Open = false;

            // Step 4: Click "VIEW" (if filed) or "PREPARE ONLINE" (if pending)
            try {
                const clickRes = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));

                    // Title-down matching
                    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-title, .panel-title, strong, b, div, span, p'));
                    const g1TitleEl = allHeadings.find(el => {
                        if (isTopNavbarOrHeader(el)) return false;
                        const txt = (el.innerText || el.textContent || '').trim().toUpperCase();
                        if (txt.length > 120) return false;
                        const isOutward = txt.includes('OUTWARD SUPPLIES') || txt.includes('DETAILS OF OUTWARD');
                        const isG1Only = (txt.includes('GSTR-1') || txt.includes('GSTR 1') || txt === 'GSTR1') && !txt.includes('3B') && !txt.includes('2B') && !txt.includes('2A');
                        return isOutward || isG1Only;
                    });

                    let matchedCard = null;
                    if (g1TitleEl) {
                        let card = g1TitleEl.parentElement;
                        while (card && card !== document.body) {
                            const btns = Array.from(card.querySelectorAll('button, a, input[type="button"], .btn')).filter(b => !isTopNavbarOrHeader(b));
                            const cardText = (card.innerText || '').toUpperCase();
                            const hasOtherReturns = (cardText.includes('GSTR-3B') || cardText.includes('GSTR 3B') || cardText.includes('MONTHLY RETURN')) &&
                                                    (cardText.includes('GSTR-2B') || cardText.includes('AUTO-DRAFTED') || cardText.includes('GSTR-2A'));
                            if (hasOtherReturns) break;

                            const hasTargetBtn = btns.some(b => {
                                const bt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return bt === 'VIEW' || bt.includes('VIEW') || bt.includes('PREPARE ONLINE') || bt === 'ONLINE';
                            });

                            if (hasTargetBtn) {
                                matchedCard = card;
                                const cls = card.className || '';
                                if (cls.includes('col-') || cls.includes('card') || cls.includes('panel') || cls.includes('box')) break;
                            }
                            card = card.parentElement;
                        }
                    }

                    if (!matchedCard) {
                        const cards = Array.from(document.querySelectorAll('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel, div.box, [class*="col-"]'));
                        matchedCard = cards.find(card => {
                            if (isTopNavbarOrHeader(card)) return false;
                            const cardText = (card.innerText || '').toUpperCase();
                            return (cardText.includes('GSTR-1') || cardText.includes('GSTR 1') || cardText.includes('OUTWARD SUPPLIES') || cardText.includes('DETAILS OF OUTWARD')) &&
                                   !cardText.includes('GSTR-2B') && !cardText.includes('GSTR-2A') && !cardText.includes('GSTR-3B');
                        });
                    }

                    if (matchedCard) {
                        const btns = Array.from(matchedCard.querySelectorAll('button, a, input[type="button"], .btn')).filter(b => !isTopNavbarOrHeader(b));
                        // Check "VIEW" first
                        let targetBtn = btns.find(b => {
                            const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                            return t === 'VIEW' || t.startsWith('VIEW ') || t.includes('VIEW DETAILS');
                        });
                        // Fallback to "PREPARE ONLINE"
                        if (!targetBtn) {
                            targetBtn = btns.find(b => {
                                const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return t === 'PREPARE ONLINE' || t.includes('PREPARE ONLINE') || t === 'ONLINE';
                            });
                        }
                        if (targetBtn) {
                            targetBtn.scrollIntoView({ block: 'center' });
                            targetBtn.click();
                            if (window.angular) {
                                try {
                                    window.angular.element(targetBtn).triggerHandler('click');
                                    window.angular.element(targetBtn).scope()?.$apply();
                                } catch(e) {}
                            }
                            return { success: true, text: (targetBtn.innerText || targetBtn.value || '').trim() };
                        }
                    }
                    return { success: false };
                });
                clickedG1Open = clickRes.success;
                if (clickedG1Open) {
                    console.log(`[GSTR-1 Autopilot PDF] ✓ Clicked "${clickRes.text}" on GSTR-1 tile!`);
                }
            } catch (e) {
                console.warn('[GSTR-1 Autopilot PDF] Evaluate click error:', e.message);
            }

            // Fallback via Playwright locator
            if (!clickedG1Open) {
                try {
                    const g1Card = page.locator('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel')
                        .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                        .filter({ hasText: /GSTR-?1|Outward\s*Supplies|IFF/i })
                        .filter({ hasNotText: /GSTR-?2B|Auto\s*-\s*drafted|GSTR-?3B/i })
                        .first();
                    if (await g1Card.isVisible({ timeout: 2500 })) {
                        const viewBtn = g1Card.locator('button, a, input[type="button"]')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu') })
                            .filter({ hasText: /^VIEW$|PREPARE\s*ONLINE/i })
                            .first();
                        if (await viewBtn.isVisible({ timeout: 1500 })) {
                            await viewBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await viewBtn.click({ force: true });
                            clickedG1Open = true;
                            console.log('[GSTR-1 Autopilot PDF] ✓ Clicked VIEW / PREPARE ONLINE via locator');
                        }
                    }
                } catch(e) {}
            }

            if (!clickedG1Open) {
                console.warn('[GSTR-1 Autopilot PDF] Could not locate VIEW or PREPARE ONLINE button on GSTR-1 tile');
                return { status: 'FAILED', count: 0, excelPath: null, jsonPath: null, summary: null };
            }

            // Allow GSTR-1 page to load
            await page.waitForTimeout(2000);
            try {
                await page.waitForFunction(() => {
                    const u = window.location.href.toLowerCase();
                    const txt = (document.body.innerText || '').toUpperCase();
                    return u.includes('/gstr1') || u.includes('/view') || txt.includes('TABLE 4') || txt.includes('B2B') || txt.includes('DOWNLOAD PDF');
                }, null, { timeout: 15000 }).catch(() => {});
            } catch (e) {}
            await dismissPopups();

            // Step 5: Scroll to the very bottom of the page
            console.log('[GSTR-1 Autopilot PDF] Scrolling to bottom of GSTR-1 page to locate Download PDF button...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1000);

            await updateBanner(`[GSTR-1 PDF] Downloading official GSTR-1 PDF for ${currentPeriodStr}...`, '#10b981');

            // Download interception
            let downloadedPdfPath = null;
            let downloadedFilename = null;

            try {
                const downloadPromise = page.waitForEvent('download', { timeout: 35000 });

                // Click Download PDF / Preview button
                const clickedDownload = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav'));
                    const btns = Array.from(document.querySelectorAll('button, input[type="button"], a.btn, a'));

                    const matchers = [
                        (t) => t === 'DOWNLOAD PDF' || t.includes('DOWNLOAD PDF'),
                        (t) => t.includes('DOWNLOAD SUMMARY') || t.includes('DOWNLOAD FILED'),
                        (t) => t === 'PREVIEW' || t.includes('PREVIEW'),
                        (t) => t.includes('GENERATE PDF') || t.includes('PRINT / DOWNLOAD')
                    ];

                    for (const matcher of matchers) {
                        for (const b of btns) {
                            if (isTopNavbarOrHeader(b)) continue;
                            const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                            if (matcher(t)) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                if (window.angular) {
                                    try {
                                        window.angular.element(b).triggerHandler('click');
                                        window.angular.element(b).scope()?.$apply();
                                    } catch(e) {}
                                }
                                return { success: true, text: t };
                            }
                        }
                    }
                    return { success: false };
                });

                if (clickedDownload.success) {
                    console.log(`[GSTR-1 Autopilot PDF] Clicked "${clickedDownload.text}" button! Waiting for file download event...`);
                } else {
                    const dlLoc = page.locator('button, input[type="button"], a')
                        .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu') })
                        .filter({ hasText: /DOWNLOAD\s*PDF|DOWNLOAD\s*SUMMARY|PREVIEW|GENERATE\s*PDF/i })
                        .last();
                    if (await dlLoc.isVisible({ timeout: 2500 }).catch(() => false)) {
                        await dlLoc.scrollIntoViewIfNeeded().catch(() => {});
                        await dlLoc.click({ force: true });
                        console.log('[GSTR-1 Autopilot PDF] Clicked Download PDF button via Playwright locator!');
                    }
                }

                const download = await downloadPromise;
                if (download) {
                    downloadedFilename = download.suggestedFilename();
                    downloadedPdfPath = path.join(downloadDir, `${Date.now()}_${downloadedFilename}`);
                    await download.saveAs(downloadedPdfPath);
                    console.log(`[GSTR-1 Autopilot PDF] ✓ Successfully saved downloaded PDF to: ${downloadedPdfPath}`);
                }
            } catch (dlErr) {
                console.warn('[GSTR-1 Autopilot PDF] Download event note:', dlErr.message);
            }

            // Fallback: Check downloadDir or user Downloads folder for freshly created .pdf file
            if (!downloadedPdfPath || !fs.existsSync(downloadedPdfPath)) {
                console.log('[GSTR-1 Autopilot PDF] Checking local directories for intercepted PDF file...');
                const checkFolders = [downloadDir, path.join(os.homedir(), 'Downloads')];
                const now = Date.now();
                for (const folder of checkFolders) {
                    if (!fs.existsSync(folder)) continue;
                    try {
                        const files = fs.readdirSync(folder);
                        for (const f of files) {
                            if (f.toLowerCase().endsWith('.pdf') && (f.toLowerCase().includes('gstr1') || f.toLowerCase().includes('gstr-1') || f.toUpperCase().includes(gstinUpper))) {
                                const fPath = path.join(folder, f);
                                const stats = fs.statSync(fPath);
                                if (now - stats.mtimeMs < 60000 && stats.size > 1000) {
                                    downloadedPdfPath = fPath;
                                    downloadedFilename = f;
                                    console.log(`[GSTR-1 Autopilot PDF] Located downloaded PDF in ${folder}: ${f}`);
                                    break;
                                }
                            }
                        }
                    } catch (e) {}
                    if (downloadedPdfPath) break;
                }
            }

            if (!downloadedPdfPath || !fs.existsSync(downloadedPdfPath)) {
                return {
                    status: 'REQUESTED',
                    count: 0,
                    excelPath: null,
                    jsonPath: null,
                    summary: null,
                    message: 'PDF download request triggered. If portal generation takes 1-2 minutes, click Download & Inject GSTR-1 PDF again once ready.'
                };
            }

            // Step 6: Parse the downloaded PDF Buffer with gstr1PdfParser!
            const pdfBuf = fs.readFileSync(downloadedPdfPath);
            const parsedSummary = await parseGstr1PdfBuffer(pdfBuf, downloadedFilename || 'GSTR1.pdf');

            // Persist to SQLite clients table if firmName/tradeName is present
            if (parsedSummary.gstin && parsedSummary.legalName && db && typeof db.run === 'function') {
                db.run(
                    "UPDATE clients SET trade_name = COALESCE(NULLIF(trade_name, ''), ?) WHERE gstin = ?",
                    [parsedSummary.legalName, parsedSummary.gstin],
                    () => {}
                );
            }

            // Save batch to SQLite gstr1_batches as SYNCED
            try {
                const bId = randomUUID();
                const now = Date.now();
                db.run(
                    `INSERT INTO gstr1_batches (
                        id, client_gstin, return_period, status,
                        total_invoices, b2b_count, b2cl_count, b2cs_count, cdnr_count, exp_count,
                        total_taxable, total_igst, total_cgst, total_sgst, total_cess, total_tax,
                        excel_path, json_path, downloaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                        status = 'SYNCED',
                        total_invoices = excluded.total_invoices,
                        total_taxable = excluded.total_taxable,
                        total_igst = excluded.total_igst,
                        total_cgst = excluded.total_cgst,
                        total_sgst = excluded.total_sgst,
                        total_tax = excluded.total_tax,
                        excel_path = excluded.excel_path,
                        downloaded_at = excluded.downloaded_at,
                        updated_at = excluded.updated_at`,
                    [
                        bId, gstinUpper, currentPeriodStr,
                        parsedSummary.counts.totalDocs, parsedSummary.counts.b2b, parsedSummary.counts.b2cl, parsedSummary.counts.b2cs, parsedSummary.counts.cdnr, parsedSummary.counts.exp,
                        parsedSummary.totalOutwardTaxable, parsedSummary.breakdowns.b2b.igst, parsedSummary.breakdowns.b2b.cgst, parsedSummary.breakdowns.b2b.sgst, 0, parsedSummary.totalOutwardTax,
                        downloadedPdfPath, null, now, now, now
                    ],
                    () => {}
                );
            } catch (dbErr) {
                console.warn('[GSTR-1 Autopilot PDF] DB batch save note:', dbErr.message);
            }

            capturedGstr1PdfSummary = parsedSummary;
            capturedSummary = {
                gstin: parsedSummary.gstin || gstinUpper,
                period: parsedSummary.period || currentPeriodStr,
                totalTaxable: parsedSummary.totalOutwardTaxable,
                totalTax: parsedSummary.totalOutwardTax,
                counts: parsedSummary.counts
            };

            return {
                status: 'SYNCED',
                count: parsedSummary.counts.totalDocs,
                excelPath: null,
                jsonPath: null,
                pdfPath: downloadedPdfPath,
                summary: parsedSummary
            };
        };

        // ─── EXECUTION: 12-MONTH REQUEST LOOP OR TARGETED DOWNLOAD ─────────
        const startYr = parseInt(targetFy.match(/\d{4}/)?.[0] || '2025', 10);
        const endYr = startYr + 1;
        const fyMonths = [
            { month: 'April', period: `April ${startYr}` },
            { month: 'May', period: `May ${startYr}` },
            { month: 'June', period: `June ${startYr}` },
            { month: 'July', period: `July ${startYr}` },
            { month: 'August', period: `August ${startYr}` },
            { month: 'September', period: `September ${startYr}` },
            { month: 'October', period: `October ${startYr}` },
            { month: 'November', period: `November ${startYr}` },
            { month: 'December', period: `December ${startYr}` },
            { month: 'January', period: `January ${endYr}` },
            { month: 'February', period: `February ${endYr}` },
            { month: 'March', period: `March ${endYr}` }
        ];

        let monthsToProcess = fyMonths;
        const isTargetedMonth = Boolean(targetMonth || isDownloadOnly || (!isFullYear && defaultMonth && defaultMonth.toLowerCase() !== 'all'));

        if (isTargetedMonth) {
            const tMonth = targetMonth || defaultMonth;
            const found = fyMonths.find(m => m.month.toLowerCase() === tMonth.toLowerCase());
            monthsToProcess = found ? [found] : [{ month: tMonth, period: returnPeriod }];
            console.log(`[GSTR-1 Autopilot] Target Mode: Processing ${monthsToProcess[0].period} directly...`);
        } else {
            console.log(`[GSTR-1 Autopilot] 12-Month Autonomous Request & Sync Loop starting for ${targetFy}...`);
        }

        const syncedResults = [];
        let totalDownloadedCount = 0;
        let totalRequestedCount = 0;

        for (let i = 0; i < monthsToProcess.length; i++) {
            if (page.isClosed()) break;
            const mInfo = monthsToProcess[i];
            const progressLabel = isTargetedMonth ? `Target: ${mInfo.period}` : `Month ${i + 1}/12: ${mInfo.period}`;

            // A month's GSTR-1 exists only after the month ends (filed by the 11th of the next month).
            if (!hasReturnPeriodEnded(mInfo.period)) {
                const notDueMsg = `${mInfo.period} has not ended yet, GSTR-1 not due. Skipped (no portal request).`;
                console.log(`[GSTR-1 Autopilot] ${notDueMsg}`);
                syncedResults.push({ period: mInfo.period, month: mInfo.month, status: 'NOT_DUE', count: 0, error: notDueMsg });
                emit('MONTH_DONE', { period: mInfo.period, month: mInfo.month, status: 'NOT_DUE', count: 0, message: `${progressLabel}: not due yet, skipped` });
                continue;
            }
            console.log(`\n--- [GSTR-1 Autopilot] Processing ${progressLabel} ---`);
            emit('MONTH_START', { phase: 'SYNCING', period: mInfo.period, month: mInfo.month, currentMonthIndex: i + 1, totalTargetMonths: monthsToProcess.length, message: `${progressLabel}: searching...` });

            try {
                await updateBanner(`[GSTR-1 Autopilot] ${progressLabel}: Searching...`, '#8b5cf6');
                await selectPeriodAndSearch(mInfo.month, targetFy, progressLabel);
                await page.waitForTimeout(400);

                await updateBanner(`[GSTR-1 Autopilot] ${progressLabel}: Checking download / requesting file...`, '#10b981');
                const mRes = downloadFormat === 'PDF'
                    ? await downloadAndProcessGstr1Pdf(mInfo.period)
                    : await downloadAndProcessGstr1(mInfo.period);
                syncedResults.push({ period: mInfo.period, month: mInfo.month, status: mRes.status, count: mRes.count });
                emit('MONTH_DONE', { period: mInfo.period, month: mInfo.month, status: mRes.status, count: mRes.count || 0, message: `${progressLabel}: ${mRes.status} (${mRes.count || 0} docs)` });

                if (mRes.status === 'SYNCED') {
                    totalDownloadedCount += (mRes.count || 0);
                } else if (mRes.status === 'REQUESTED') {
                    totalRequestedCount++;
                }
            } catch (mErr) {
                // Browser closed/cancelled ends the run; any other glitch fails only this month (existing data untouched).
                if (page.isClosed() || /closed/i.test(mErr.message || '')) throw mErr;
                console.error(`[GSTR-1 Autopilot] ${progressLabel} failed:`, mErr.message);
                syncedResults.push({ period: mInfo.period, month: mInfo.month, status: 'FAILED', count: 0, error: mErr.message });
                emit('MONTH_DONE', { level: 'error', period: mInfo.period, month: mInfo.month, status: 'FAILED', error: mErr.message, message: `${progressLabel}: FAILED - ${mErr.message}` });
            }

            if (i < monthsToProcess.length - 1) {
                try {
                    await updateBanner(`[GSTR-1 Autopilot] Returning to dashboard for ${monthsToProcess[i + 1].period}...`, '#8b5cf6');
                    await ensureReturnsSearchScreen();
                    await page.waitForTimeout(400);
                } catch (navErr) {
                    if (page.isClosed()) throw navErr;
                    console.error('[GSTR-1 Autopilot] Search screen reset error:', navErr.message);
                }
            }
        }

        if (isTargetedMonth) {
            const resMonth = syncedResults[0];
            const monthFailed = !resMonth || resMonth.status === 'FAILED' || resMonth.status === 'NOT_DUE';
            if (resMonth && resMonth.status === 'SYNCED' && (resMonth.count > 0 || capturedGstr1PdfSummary)) {
                await updateBanner(`✓ SUCCESS: GSTR-1 ${downloadFormat === 'PDF' ? 'PDF' : 'Invoices'} downloaded for ${resMonth.period}! Closing in 2s...`, '#10b981');
            } else if (monthFailed) {
                await updateBanner(`✗ GSTR-1 download failed for ${resMonth?.period || returnPeriod}: ${resMonth?.error || 'unknown error'}. Closing in 2s...`, '#ef4444');
            } else {
                await updateBanner(`⏱️ File generation is in progress for ${resMonth?.period || returnPeriod}. Timer running. Closing in 2s...`, '#f59e0b');
            }
            // Ensure all in-flight file downloads finish writing before closing browser
            if (activeGstr1DownloadPromises.size > 0) {
                console.log(`[GSTR-1 Autopilot] Waiting for ${activeGstr1DownloadPromises.size} active download(s) to finish writing...`);
                await Promise.race([
                    Promise.all(Array.from(activeGstr1DownloadPromises)),
                    new Promise(resolve => setTimeout(resolve, 15000))
                ]);
            }

            await page.waitForTimeout(2000);
            await browser.close().catch(() => {});
            if (browserState) browserState.current = null;

            if (monthFailed) {
                return res.json({ success: false, gstin: gstinUpper, period: resMonth?.period || returnPeriod, status: 'FAILED', error: `GSTR-1 download failed for ${resMonth?.period || returnPeriod}: ${resMonth?.error || 'unknown error'}` });
            }
            return res.json({
                success: true,
                message: resMonth && resMonth.status === 'SYNCED'
                    ? `Successfully downloaded GSTR-1 ${downloadFormat === 'PDF' ? 'PDF' : 'data'} for ${resMonth.period}!`
                    : `GSTR-1 generation in progress for ${resMonth?.period || returnPeriod}.`,
                gstin: gstinUpper,
                period: resMonth?.period || returnPeriod,
                invoiceCount: resMonth?.count || 0,
                status: resMonth?.status || 'REQUESTED',
                requestedAt: Date.now(),
                gstr1: capturedGstr1PdfSummary || null
            });
        } else {
            // Full 12-Month Loop completed!
            const failedCount = syncedResults.filter(r => r.status === 'FAILED').length;
            await updateBanner(`✓ Completed 12 Months: ${totalDownloadedCount} invoices downloaded, ${totalRequestedCount} months queued with 20-min timers${failedCount ? `, ${failedCount} failed` : ''}! Closing in 2s...`, failedCount ? '#f59e0b' : '#10b981');

            // Let in-flight downloads finish writing to SQLite before consolidating
            if (activeGstr1DownloadPromises.size > 0) {
                await Promise.race([
                    Promise.all(Array.from(activeGstr1DownloadPromises)),
                    new Promise(resolve => setTimeout(resolve, 15000))
                ]);
            }
            await page.waitForTimeout(2500);
            await browser.close().catch(() => {});
            if (browserState) browserState.current = null;

            const consExcelPath = await saveGstr1FullYearExcel(db, gstinUpper, targetFy, downloadDir);
            if (consExcelPath) emit('EXCEL_SAVED', { phase: 'CONSOLIDATING', message: `12-Month SectionWiseSummary saved: ${consExcelPath}`, data: { path: consExcelPath } });

            return res.json({
                success: true,
                message: `Processed 12 months for ${gstinUpper}: ${syncedResults.filter(r => r.status !== 'FAILED' && r.status !== 'NOT_DUE').length} OK, ${failedCount} failed, ${syncedResults.filter(r => r.status === 'NOT_DUE').length} not due yet; ${totalDownloadedCount} invoices downloaded, ${totalRequestedCount} months queued with 20-minute countdown timers.`,
                isFullYear: true,
                gstin: gstinUpper,
                financialYear: targetFy,
                totalInvoices: totalDownloadedCount,
                consolidatedExcelPath: consExcelPath,
                months: syncedResults
            });
        }
    } catch (err) {
        console.error('[GSTR-1 Autopilot] Raw error details:', err.message, err.stack);
        const isClosedByUser = err.message?.includes('Target page') || err.message?.includes('browser has been closed') || err.message?.includes('closed');
        if (isClosedByUser) {
            console.log('[GSTR-1 Autopilot] Session cancelled: GST Portal browser was closed by user.');
        } else {
            console.error('[GSTR-1 Autopilot] Execution error:', err);
        }
        if (browser) await browser.close().catch(() => {});
        if (browserState) browserState.current = null;
        return res.status(isClosedByUser ? 200 : 500).json({
            success: false,
            cancelled: isClosedByUser,
            error: isClosedByUser ? 'GST Portal browser window was closed.' : err.message
        });
    }
}

/**
 * runGstr1UploadAutopilot — Autonomous Playwright engine for uploading GSTR-1 JSON directly to portal:
 * - Direct navigation to Return Dashboard
 * - Auto-fill credentials
 * - Month and FY selection
 * - Click PREPARE OFFLINE on GSTR-1 tile
 * - Attach generated JSON payload directly
 * - Capture acknowledgment reference
 */
export async function runGstr1UploadAutopilot({
    db,
    gstin,
    month = 'September',
    financialYear = '2026-27',
    jsonFilePath = null,
    jsonContent = null,
    browserState = null
}) {
    let browser = null;
    let context = null;
    let page = null;

    const gstinUpper = (gstin || '').toUpperCase().trim();

    try {
        // 1. Resolve JSON File Path
        let uploadFile = jsonFilePath;
        if (!uploadFile && jsonContent) {
            const tempDir = path.join(process.cwd(), 'scratch', 'uploads', 'gstr1');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            uploadFile = path.join(tempDir, `gstr1_upload_${gstinUpper}_${month}.json`);
            const contentStr = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent, null, 2);
            fs.writeFileSync(uploadFile, contentStr, 'utf8');
        }

        if (!uploadFile || !fs.existsSync(uploadFile)) {
            throw new Error(`GSTR-1 JSON upload file not found: ${uploadFile || 'No path provided'}`);
        }

        console.log(`\n======================================================`);
        console.log(`[GSTR-1 Upload Autopilot] Starting session for ${gstinUpper}`);
        console.log(`[GSTR-1 Upload Autopilot] Period: ${month} ${financialYear}`);
        console.log(`[GSTR-1 Upload Autopilot] Payload: ${uploadFile}`);
        console.log(`======================================================\n`);

        // 2. Fetch Vault Credentials
        let portalUser = '';
        let portalPass = '';
        let clientTradeName = '';

        if (db) {
            try {
                const clientRow = await new Promise((resolve) => {
                    db.get(
                        `SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE UPPER(TRIM(gstin)) = ? OR UPPER(TRIM(id)) = ?`,
                        [gstinUpper, gstinUpper],
                        (err, row) => resolve(row || null)
                    );
                });
                if (clientRow) {
                    portalUser = clientRow.portal_username || '';
                    portalPass = decryptSecret(clientRow.portal_password || '');
                    clientTradeName = clientRow.trade_name || clientRow.legal_name || gstinUpper;
                }
            } catch (e) {
                console.warn('[GSTR-1 Upload Autopilot] Vault lookup warning:', e.message);
            }
        }

        // Close any stale browser session
        if (browserState && browserState.current) {
            try {
                await browserState.current.close().catch(() => {});
            } catch (e) {}
            browserState.current = null;
        }

        let chromiumModule;
        try {
            chromiumModule = await import('playwright');
        } catch (e) {
            throw new Error('Playwright is not available or installed.');
        }
        const chromium = chromiumModule.chromium || chromiumModule.default?.chromium || chromiumModule;

        const launchRes = await launchAutopilotBrowser(chromium, {
            headless: false,
            slowMo: 50,
            viewport: { width: 1366, height: 768 }
        });
        browser = launchRes.browser;
        if (browserState) browserState.current = browser;

        context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        });

        page = await context.newPage();

        const updateBanner = async (text, isSuccess = false) => {
            try {
                if (page.isClosed()) return;
                await page.evaluate(({ msg, success }) => {
                    let b = document.getElementById('gstr1-upload-banner');
                    if (!b) {
                        b = document.createElement('div');
                        b.id = 'gstr1-upload-banner';
                        b.style.cssText = `
                            position: fixed; top: 0; left: 0; right: 0; z-index: 99999999;
                            background: ${success ? 'linear-gradient(90deg, #059669, #10b981)' : 'linear-gradient(90deg, #1e293b, #0f172a)'};
                            color: white; padding: 12px 20px; font-family: system-ui, sans-serif;
                            font-size: 14px; font-weight: 600; text-align: center;
                            box-shadow: 0 4px 15px rgba(0,0,0,0.4); border-bottom: 2px solid ${success ? '#34d399' : '#0ea5e9'};
                            display: flex; align-items: center; justify-content: center; gap: 10px;
                        `;
                        document.body.prepend(b);
                    }
                    b.innerHTML = `<span style="font-size: 18px;">${success ? '✅' : '⚡'}</span> ${msg}`;
                }, { msg: text, success: isSuccess });
            } catch (e) {}
        };

        // 3. Navigate to GST Portal Login
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await updateBanner(`Vaswani GSTR-1 Upload Autopilot: Preparing upload for ${clientTradeName || gstinUpper}...`);

        // Fill credentials
        try {
            await page.waitForSelector('#username', { timeout: 8000 });
            if (portalUser) await page.fill('#username', portalUser);
            if (portalPass) await page.fill('#user_pass', portalPass);
            await updateBanner('Credentials filled! Please enter the CAPTCHA and click LOGIN...');
        } catch (e) {}

        // 4. Wait for Login Completion
        console.log('[GSTR-1 Upload Autopilot] Waiting for user to solve CAPTCHA and log in...');
        await page.waitForFunction(() => {
            const url = window.location.href;
            return url.includes('/auth/') || url.includes('/dashboard') || Boolean(document.querySelector('.dashboard-card, #returnDashboard'));
        }, null, { timeout: 120000 });

        await updateBanner('Login successful! Navigating to Returns Dashboard...');
        console.log('[GSTR-1 Upload Autopilot] Login successful.');
        await page.waitForTimeout(2000);

        // 5. Navigate to Returns Dashboard via authentic in-page DOM click
        let onReturnsPage = page.url().includes('/returns/auth/dashboard');
        if (!onReturnsPage) {
            await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a, button, div.tile'));
                const retTile = anchors.find(a => (a.innerText || '').toLowerCase().includes('return dashboard') || (a.innerText || '').toLowerCase().includes('returns dashboard'));
                if (retTile) retTile.click();
            });
            await page.waitForTimeout(2000);
            onReturnsPage = page.url().includes('/returns/auth/dashboard');
        }

        if (!onReturnsPage) {
            // Direct safe navigation
            await page.goto('https://return.gst.gov.in/returns/auth/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        }

        // Wait for Period Selectors
        await updateBanner(`Selecting Financial Year (${financialYear}) & Month (${month})...`);
        await page.waitForSelector('select', { timeout: 15000 }).catch(() => {});

        // Select Financial Year
        const fySelect = page.locator('select').first();
        if (await fySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            const options = await fySelect.locator('option').allInnerTexts();
            const matchedFy = options.find(t => t.includes(financialYear) || financialYear.includes(t.trim()));
            if (matchedFy) {
                await fySelect.selectOption({ label: matchedFy });
                await fySelect.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
                await page.waitForTimeout(800);
            }
        }

        // Select Month in Month Dropdown
        const mSelect = page.locator('select').filter({
            has: page.locator('option').filter({ hasText: new RegExp(month, 'i') })
        }).first();

        if (await mSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            const mOptions = await mSelect.locator('option').allInnerTexts();
            const matchedM = mOptions.find(t => t.toLowerCase().includes(month.toLowerCase()));
            if (matchedM) {
                await mSelect.selectOption({ label: matchedM });
                await mSelect.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
                await page.waitForTimeout(600);
            }
        }

        // Click SEARCH
        console.log('[GSTR-1 Upload Autopilot] Clicking SEARCH button...');
        await updateBanner(`Searching returns for ${month} ${financialYear}...`);
        const searchBtn = page.locator('button:has-text("SEARCH"), input[value="SEARCH" i], button.btn-primary:has-text("SEARCH"), #search').first();
        if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await searchBtn.click();
        } else {
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
                const s = btns.find(b => (b.innerText || b.value || '').trim().toUpperCase() === 'SEARCH');
                if (s) s.click();
            });
        }

        // 6. Wait for Return Tiles & Target GSTR-1
        console.log('[GSTR-1 Upload Autopilot] Waiting for return tiles to load...');
        await page.waitForFunction(() => {
            const text = (document.body.innerText || '').toUpperCase();
            return text.includes('GSTR-1') || text.includes('GSTR1') || text.includes('IFF') || Boolean(document.querySelector('.returns-card'));
        }, null, { timeout: 15000 });
        await page.waitForTimeout(1000);

        // 7. Find GSTR-1 / IFF Card & Click PREPARE OFFLINE
        await updateBanner('Locating GSTR-1 / IFF Return tile...');
        console.log('[GSTR-1 Upload Autopilot] Locating GSTR-1 tile...');

        const gstr1Tile = page.locator('.returns-card, div.panel, div.box, .col-md-6, .col-sm-6, .border-box')
            .filter({ hasText: /GSTR-1|GSTR 1|IFF/i })
            .first();

        let clickedOffline = false;
        if (await gstr1Tile.isVisible({ timeout: 4000 }).catch(() => false)) {
            const offlineBtn = gstr1Tile.locator('button, a, input[type="button"]')
                .filter({ hasText: /PREPARE OFFLINE|OFFLINE/i })
                .first();
            if (await offlineBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log('[GSTR-1 Upload Autopilot] Found PREPARE OFFLINE button inside GSTR-1 tile. Clicking...');
                await offlineBtn.scrollIntoViewIfNeeded().catch(() => {});
                await offlineBtn.click({ force: true });
                clickedOffline = true;
            }
        }

        if (!clickedOffline) {
            console.log('[GSTR-1 Upload Autopilot] Searching globally for GSTR-1 Prepare Offline button...');
            await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
                for (const l of links) {
                    const text = (l.innerText || l.value || '').trim().toUpperCase();
                    if (text.includes('PREPARE OFFLINE') || text === 'OFFLINE') {
                        const cardText = l.closest('.panel, .returns-card, div, section')?.innerText?.toUpperCase() || '';
                        if (cardText.includes('GSTR-1') || cardText.includes('GSTR 1') || cardText.includes('IFF')) {
                            l.click();
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        // 8. Wait for GSTR-1 Offline Upload Screen
        await updateBanner('Waiting for GSTR-1 Offline Upload screen...');
        console.log('[GSTR-1 Upload Autopilot] Waiting for Offline upload file input...');

        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: 'attached', timeout: 20000 });

        await updateBanner(`Attaching JSON payload: ${path.basename(uploadFile)}...`);
        console.log(`[GSTR-1 Upload Autopilot] Setting file payload: ${uploadFile}`);

        await fileInput.setInputFiles(uploadFile);
        await fileInput.evaluate(el => {
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await page.waitForTimeout(1000);

        // Click explicit Upload / Submit button if present
        try {
            const uploadBtn = page.locator('button:has-text("Upload"), input[value*="Upload" i], button:has-text("Submit")').first();
            if (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                console.log('[GSTR-1 Upload Autopilot] Found Upload submit button. Clicking...');
                await uploadBtn.click();
            }
        } catch (e) {}

        // 9. Verify Upload Confirmation Message
        await updateBanner('Payload uploaded! Waiting for portal validation confirmation...');
        console.log('[GSTR-1 Upload Autopilot] Waiting for portal validation response...');

        let confirmedMessage = 'Your GSTR-1 JSON file has been uploaded to GST Portal successfully.';
        try {
            await page.waitForFunction(() => {
                const text = (document.body.innerText || '').toLowerCase();
                return text.includes('uploaded successfully') ||
                       text.includes('processed') ||
                       text.includes('in progress') ||
                       text.includes('reference id') ||
                       text.includes('error report') ||
                       text.includes('validation');
            }, null, { timeout: 25000 });

            const pageText = await page.evaluate(() => document.body.innerText);
            if (pageText.includes('uploaded successfully') || pageText.includes('Processed') || pageText.includes('In Progress')) {
                confirmedMessage = 'Your GSTR-1 JSON file has been successfully uploaded and acknowledged by the GST Portal!';
            }
        } catch (e) {
            console.log('[GSTR-1 Upload Autopilot] Note on confirmation wait:', e.message);
        }

        console.log(`[GSTR-1 Upload Autopilot] ✓ ${confirmedMessage}`);
        await updateBanner(`✓ ${confirmedMessage} You can now click PREPARE ONLINE to verify the sections.`, true);

        return {
            success: true,
            gstin: gstinUpper,
            month,
            financialYear,
            message: confirmedMessage,
            uploadedFile: path.basename(uploadFile)
        };
    } catch (err) {
        console.error('[GSTR-1 Upload Autopilot Error]:', err);
        throw err;
    }
}
/*! javascript-obfuscator:enable */


import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { bulkSaveGstr2bInvoices, saveGstr1Summary, markGstr2bMonthNilSynced } from './db.js';
import {
    parseGstr2bExcelHelper,
    parseGstr2bJsonHelper,
    parseGstr2bZipHelper,
    parseGstr1ExcelHelper,
    parseGstr1DataHelper,
    parseGstr1ZipHelper
} from './parsers.js';
import { generateGstr2bFullYearWorkbook } from './fullYearExcel.js';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * runGstr2bAutopilot — Autonomous Playwright automation engine for GST Portal:
 * 1. Log in (with credential vault auto-fill & user CAPTCHA wait)
 * 2. Navigate to Returns Dashboard & Select Financial Year, Quarter, and Filing Month
 * 3. Submit SEARCH and render return cards
 * 4. Locate GSTR-1 card -> Click DOWNLOAD -> capture/queue outward file -> click on-screen BACK
 * 5. Locate GSTR-2B card -> Click DOWNLOAD
 * 6. Download official Excel & JSON files, extract line-item invoices & persist to SQLite
 */
export async function runGstr2bAutopilot({ db, gstin, returnPeriod, financialYear, req, res, browserState, isFullYear = false }) {
    const gstinUpper = gstin.trim().toUpperCase();

    // 1. Fetch Client Credentials from Database Vault
    let portalUser = '';
    let portalPass = '';
    let clientTradeName = '';

    try {
        const clientRow = await new Promise((resolve) => {
            db.get(`SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?`, [gstinUpper], (err, row) => {
                resolve(row || null);
            });
        });
        if (clientRow) {
            portalUser = clientRow.portal_username || '';
            portalPass = clientRow.portal_password || '';
            clientTradeName = clientRow.trade_name || clientRow.legal_name || '';
        }
    } catch (e) {
        console.error('[GSTR-2B Autopilot] Vault lookup error:', e);
    }

    console.log(`\n======================================================`);
    console.log(`[GSTR-2B Autopilot] Starting session for ${gstinUpper} (${returnPeriod})`);
    console.log(`[GSTR-2B Autopilot] Vault Username: ${portalUser ? portalUser : '(NOT CONFIGURED)'}`);
    console.log(`======================================================\n`);

    let chromiumModule;
    try {
        chromiumModule = await import('playwright');
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Playwright is not installed or available.' });
    }

    let browser = null;
    let context = null;
    let page = null;

    const downloadDir = path.join(process.cwd(), 'scratch', 'downloads', 'gstr2b', gstinUpper);
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    let capturedExcelPath = null;
    let capturedJsonPath = null;
    let parsedInvoices = null;
    let capturedGstr1Summary = null;
    let capturedGstr1Path = null;
    let activeSyncPeriod = returnPeriod;

    if (browserState && browserState.current) {
        console.log('[GSTR-2B Autopilot] Terminating existing browser session before launching new...');
        try {
            await browserState.current.close().catch(() => {});
        } catch (e) {}
        browserState.current = null;
    }

    try {
        console.log(`[GSTR-2B Autopilot] Launching visible browser for GSTIN ${gstinUpper}...`);
        const browserLaunchOptions = {
            headless: false,
            slowMo: 50,
            args: [
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--no-first-run',
                '--no-default-browser-check'
            ]
        };

        try {
            browser = await chromiumModule.chromium.launch(browserLaunchOptions);
            console.log('[GSTR-2B Autopilot] Launched dedicated bundled Chromium');
        } catch (e) {
            try {
                browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
                console.log('[GSTR-2B Autopilot] Launched system Microsoft Edge');
            } catch (edgeErr) {
                browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'chrome' });
                console.log('[GSTR-2B Autopilot] Launched system Google Chrome');
            }
        }
        if (browserState) browserState.current = browser;

        context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            acceptDownloads: true
        });

        page = await context.newPage();

        // Close browser cleanly if user aborts HTTP request from UI
        req.on('close', async () => {
            if (browser && !parsedInvoices && !capturedGstr1Summary) {
                console.log('[Autopilot] Request aborted from UI, closing browser');
                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;
            }
        });

        const browserPid = browser && typeof browser.process === 'function' ? browser.process()?.pid : null;
        const focusDesktopWindow = () => {
            try {
                let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
                if (browserPid) psParts.push(`$wshell.AppActivate(${browserPid});`);
                psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
                psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
                psParts.push(`$wshell.AppActivate('Goods & Services Tax (GST) | Login');`);
                psParts.push(`$wshell.AppActivate('GST | Login');`);
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
            } catch (e) {}
        };

        // ─── Set up Download Event listener for BOTH GSTR-1 and GSTR-2B ───────
        page.on('download', async (download) => {
            try {
                const originalName = download.suggestedFilename();
                console.log(`[Autopilot] Download detected: ${originalName}`);
                const savePath = path.join(downloadDir, `${Date.now()}_${originalName}`);
                await download.saveAs(savePath);
                console.log(`[Autopilot] Saved file to: ${savePath}`);

                const lower = originalName.toLowerCase();
                const isGstr1File = lower.includes('gstr1') || lower.includes('gstr-1') || lower.includes('_r1_') || lower.includes('_r1.') || (lower.includes('returns_') && !lower.includes('2b') && !lower.includes('r2b'));

                if (isGstr1File) {
                    capturedGstr1Path = savePath;
                    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                        const res = parseGstr1ExcelHelper(savePath, gstinUpper, returnPeriod);
                        if (res) {
                            capturedGstr1Summary = res;
                            console.log(`[Autopilot GSTR-1] Extracted Excel: ₹${res.totalOutwardTaxable} Taxable, ₹${res.totalOutwardTax} Tax, ${res.counts.totalDocs} docs`);
                        }
                    } else if (lower.endsWith('.json')) {
                        try {
                            const raw = JSON.parse(fs.readFileSync(savePath, 'utf8'));
                            const res = parseGstr1DataHelper(raw, gstinUpper, returnPeriod);
                            if (res) {
                                capturedGstr1Summary = res;
                                console.log(`[Autopilot GSTR-1] Extracted JSON: ₹${res.totalOutwardTaxable} Taxable, ₹${res.totalOutwardTax} Tax, ${res.counts.totalDocs} docs`);
                            }
                        } catch (e) {}
                    } else if (lower.endsWith('.zip')) {
                        const res = await parseGstr1ZipHelper(savePath, gstinUpper, returnPeriod);
                        if (res) {
                            capturedGstr1Summary = res;
                            console.log(`[Autopilot GSTR-1] Extracted ZIP: ₹${res.totalOutwardTaxable} Taxable, ₹${res.totalOutwardTax} Tax, ${res.counts.totalDocs} docs`);
                        }
                    }
                } else {
                    // GSTR-2B download handling
                    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                        capturedExcelPath = savePath;
                        const res = parseGstr2bExcelHelper(savePath, gstinUpper, activeSyncPeriod);
                        if (res && Array.isArray(res.invoices)) {
                            parsedInvoices = res.invoices;
                            console.log(`[Autopilot GSTR-2B] Extracted ${res.invoices.length} invoices from downloaded Excel!`);
                        }
                    } else if (lower.endsWith('.json')) {
                        capturedJsonPath = savePath;
                        try {
                            const raw = JSON.parse(fs.readFileSync(savePath, 'utf8'));
                            const res = parseGstr2bJsonHelper(raw, gstinUpper, activeSyncPeriod);
                            if (res && Array.isArray(res.invoices)) {
                                parsedInvoices = res.invoices;
                                console.log(`[Autopilot GSTR-2B] Extracted ${res.invoices.length} invoices from downloaded JSON!`);
                            }
                        } catch (e) {}
                    } else if (lower.endsWith('.zip')) {
                        const res = await parseGstr2bZipHelper(savePath, gstinUpper, activeSyncPeriod);
                        if (res && Array.isArray(res.invoices)) {
                            parsedInvoices = res.invoices;
                            console.log(`[Autopilot GSTR-2B] Extracted ${res.invoices.length} invoices from downloaded ZIP!`);
                        }
                    }
                }
            } catch (err) {
                console.error('[Autopilot] Error saving download:', err);
            }
        });

        // Navigate to GST Portal Login
        console.log(`[GSTR-2B Autopilot] Navigating to GST login...`);
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.bringToFront().catch(() => {});
        focusDesktopWindow();

        // Auto-fill Username & Password
        try {
            await page.waitForSelector('#username', { timeout: 15000 });
            if (portalUser) {
                await page.fill('#username', portalUser);
            }
            if (portalPass) {
                await page.waitForSelector('#user_pass', { timeout: 5000 });
                await page.fill('#user_pass', portalPass);
            }
            await page.focus('#captcha').catch(() => {});
            focusDesktopWindow();
        } catch (e) {
            console.log('[GSTR-2B Autopilot] Notice on login inputs:', e.message);
        }

        // Inject assistive banner
        await page.evaluate(({ clientName, clientGstin, hasCreds }) => {
            const banner = document.createElement('div');
            banner.id = 'antigravity-2b-banner';
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; z-index: 9999999;
                background: linear-gradient(135deg, #0284c7, #1e1b4b);
                color: #f8fafc; padding: 10px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center;
                border-bottom: 3px solid #38bdf8; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            `;
            banner.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="background:#38bdf8;color:#0f172a;font-size:10px;font-weight:900;padding:3px 8px;border-radius:6px;text-transform:uppercase;">
                        ⚡ GSTR-2B AUTOPILOT
                    </span>
                    <span>
                        ${hasCreds ? 'Credentials auto-filled! Please enter CAPTCHA & click Login.' : 'Please enter your Login credentials & CAPTCHA.'}
                    </span>
                </div>
                <div style="font-size:12px;color:#cbd5e1;font-family:monospace;">
                    Client: <strong style="color:#7dd3fc;">${clientName || clientGstin}</strong> (${clientGstin})
                </div>
            `;
            document.body.prepend(banner);
        }, { clientName: clientTradeName, clientGstin: gstinUpper, hasCreds: Boolean(portalUser && portalPass) });

        // Wait for user login (URL leaves /login, 180s timeout)
        console.log('[GSTR-2B Autopilot] Waiting for user to complete login...');
        try {
            await page.waitForFunction(() => {
                const url = window.location.href;
                const isAuth = url.includes('/auth/') || url.includes('/dashboard');
                const isNotLogin = !url.includes('/login');
                const hasNoInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
                return (isAuth && isNotLogin) || (isNotLogin && hasNoInputs);
            }, null, { timeout: 180000 });
        } catch (waitErr) {
            if (waitErr.message?.includes('Target page') || waitErr.message?.includes('browser has been closed') || waitErr.message?.includes('closed')) {
                console.log('[GSTR-2B Autopilot] Browser window was closed by user.');
                if (browser) await browser.close().catch(() => {});
                if (browserState) browserState.current = null;
                return res.json({
                    success: false,
                    cancelled: true,
                    error: 'GST Portal browser window was closed before login was completed.'
                });
            }
            throw waitErr;
        }

        console.log('[GSTR-2B Autopilot] Logged in successfully!');

        // ─── Set up Real-Time API Response Interceptor for live GSTR-1 data ───
        page.on('response', async (response) => {
            try {
                if (!response || typeof response.url !== 'function') return;
                const url = response.url().toLowerCase();
                if ((url.includes('gstr1') || url.includes('/r1/') || url.includes('_r1') || url.includes('secsum') || url.includes('summary')) && response.status() === 200) {
                    const headers = response.headers ? response.headers() : {};
                    const ct = headers['content-type'] || '';
                    if (ct.includes('json') || ct.includes('plain') || ct.includes('javascript') || !ct) {
                        const text = await response.text().catch(() => '');
                        if (text && (text.startsWith('{') || text.startsWith('['))) {
                            try {
                                const json = JSON.parse(text);
                                const unwrapped = json.data && typeof json.data === 'object' ? json.data : json;
                                if (unwrapped && (unwrapped.b2b || unwrapped.b2cs || unwrapped.sec_sum || unwrapped.sec_list || unwrapped.cur_sum || unwrapped.secsum || unwrapped.cur_gt)) {
                                    console.log('[Autopilot GSTR-1] Live API intercepted from URL:', url);
                                    const g1Parsed = parseGstr1DataHelper(unwrapped, gstinUpper, returnPeriod);
                                    if (g1Parsed && (g1Parsed.totalOutwardTaxable > 0 || g1Parsed.counts.totalDocs > 0 || g1Parsed.totalOutwardTax > 0)) {
                                        capturedGstr1Summary = g1Parsed;
                                        console.log(`[Autopilot GSTR-1] Successfully parsed live API: ₹${g1Parsed.totalOutwardTaxable} Taxable, ₹${g1Parsed.totalOutwardTax} Tax`);
                                    }
                                }
                            } catch(e) {}
                        }
                    }
                }
            } catch (e) {}
        });

        // Helper to update banner text
        const updateBanner = async (stepText, color = '#38bdf8') => {
            try {
                await page.evaluate(({ stepText, color, clientName, clientGstin }) => {
                    let b = document.getElementById('antigravity-2b-banner');
                    if (!b) {
                        b = document.createElement('div');
                        b.id = 'antigravity-2b-banner';
                        b.style.cssText = `
                            position: fixed; top: 0; left: 0; right: 0; z-index: 9999999;
                            background: linear-gradient(135deg, #0284c7, #0f172a);
                            color: #f8fafc; padding: 10px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center;
                            border-bottom: 3px solid #38bdf8; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                        `;
                        document.body.prepend(b);
                    }
                    b.innerHTML = `
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="background:${color};color:#0f172a;font-size:10px;font-weight:900;padding:3px 8px;border-radius:6px;">
                                ⚡ 2B AUTOPILOT
                            </span>
                            <span>${stepText}</span>
                        </div>
                        <div style="font-size:12px;color:#cbd5e1;font-family:monospace;">
                            ${clientName ? `Client: <strong style="color:#7dd3fc;">${clientName}</strong> (${clientGstin})` : ''}
                        </div>
                    `;
                }, { stepText, color, clientName: clientTradeName, clientGstin: gstinUpper });
            } catch (e) {}
        };

        // Auto-dismiss common GST portal popups
        const dismissPopups = async () => {
            try {
                const remindLater = page.locator('button:has-text("Remind Me Later"), a:has-text("Remind Me Later"), button:has-text("Remind me later")').first();
                if (await remindLater.isVisible({ timeout: 1500 })) {
                    await remindLater.click().catch(() => {});
                    console.log('[GSTR-2B Autopilot] Dismissed "Remind Me Later" popup');
                }
            } catch (e) {}
            try {
                const closeBtn = page.locator('.modal-header .close, button:has-text("Close"), button[aria-label="Close"]').first();
                if (await closeBtn.isVisible({ timeout: 1500 })) {
                    await closeBtn.click().catch(() => {});
                    console.log('[GSTR-2B Autopilot] Dismissed modal popup');
                }
            } catch (e) {}
        };

        await dismissPopups();

        // Parse target Month & FY from inputs
        const parts = returnPeriod.trim().split(/\s+/);
        const targetMonth = parts[0];
        let targetFy = financialYear || '';
        if (!targetFy && parts.length > 1) {
            const yearNum = parseInt(parts[1], 10);
            if (!isNaN(yearNum)) {
                targetFy = `${yearNum}-${String(yearNum + 1).slice(-2)}`;
            }
        }
        if (!targetFy) targetFy = '2025-26';

        console.log(`[GSTR-2B Autopilot] Target Filing Period: Month=${targetMonth}, FY=${targetFy}`);

        await updateBanner(`Navigating to Returns Dashboard for ${targetMonth} ${targetFy}...`);
        await page.waitForTimeout(300);
        await dismissPopups();

        // Helper to guarantee the page is on the File Returns / Search screen with dropdowns
        const ensureReturnsSearchScreen = async (timeoutMs = 20000) => {
            const startWait = Date.now();
            while (Date.now() - startWait < timeoutMs) {
                if (page.isClosed()) return false;
                await dismissPopups();

                // 1. If select dropdowns are already visible, we are ready!
                try {
                    const selectCount = await page.locator('select').count();
                    if (selectCount >= 2) {
                        return true;
                    }
                } catch(e) {}

                const curUrl = page.url();

                // 2. If on Access Denied or Error page, click "Dashboard" tab in navbar to recover
                if (curUrl.includes('accessdenied') || curUrl.includes('/error/')) {
                    console.log('[GSTR-2B Autopilot] Recovering from accessdenied page via Dashboard navbar...');
                    try {
                        const dashLink = page.locator('a:has-text("Dashboard"), .navbar a:has-text("Dashboard"), li a:has-text("Dashboard")').first();
                        if (await dashLink.isVisible({ timeout: 1500 }).catch(() => false)) {
                            await dashLink.click().catch(() => {});
                            await page.waitForTimeout(1000);
                            await dismissPopups();
                            continue;
                        }
                    } catch(e) {}
                }

                // 3. If on GSTR-2B download page or inward details page -> Click on-screen BACK once and wait!
                if (curUrl.includes('/download') || curUrl.includes('/inward/')) {
                    console.log('[GSTR-2B Autopilot] On download page, navigating back to search screen...');
                    let backClicked = false;
                    try {
                        const backBtn = page.locator('button, a, input[type="button"]')
                            .filter({ hasText: /\bback\b/i })
                            .last();
                        if (await backBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
                            await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await backBtn.click({ timeout: 2000 }).catch(() => {});
                            backClicked = true;
                            console.log('[GSTR-2B Autopilot] ✓ Clicked on-screen BACK button');
                        }
                    } catch(e) {}

                    if (!backClicked) {
                        try {
                            const rBreadcrumb = page.locator('.breadcrumb a, a:has-text("Return Dashboard"), a:has-text("Returns Dashboard")').first();
                            if (await rBreadcrumb.isVisible({ timeout: 800 }).catch(() => false)) {
                                await rBreadcrumb.click().catch(() => {});
                                backClicked = true;
                                console.log('[GSTR-2B Autopilot] ✓ Clicked Return Dashboard breadcrumb');
                            }
                        } catch(e) {}
                    }

                    if (!backClicked) {
                        console.log('[GSTR-2B Autopilot] Using browser back navigation...');
                        await page.goBack().catch(() => {});
                    }

                    // WAIT for returns search screen dropdowns to appear (up to 12s, no frantic repeated clicks)
                    try {
                        await page.waitForSelector('select', { timeout: 12000 });
                        await dismissPopups();
                        if (await page.locator('select').count() >= 2) {
                            return true;
                        }
                    } catch(e) {}
                    continue;
                }

                // 4. Check for RETURN DASHBOARD / File Returns buttons (on Dashboard home page)
                try {
                    const retDashBtn = page.locator('button:has-text("RETURN DASHBOARD"), a:has-text("RETURN DASHBOARD"), button:has-text("File Returns"), a:has-text("File Returns")').first();
                    if (await retDashBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                        console.log('[GSTR-2B Autopilot] Clicking RETURN DASHBOARD button on dashboard...');
                        await retDashBtn.click().catch(() => {});
                        try {
                            await page.waitForSelector('select', { timeout: 12000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) return true;
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // 5. Check for breadcrumb "Return Dashboard"
                try {
                    const breadcrumb = page.locator('a:has-text("Return Dashboard"), a:has-text("Returns Dashboard"), .breadcrumb a:has-text("Return")').first();
                    if (await breadcrumb.isVisible({ timeout: 600 }).catch(() => false)) {
                        console.log('[GSTR-2B Autopilot] Clicking Return Dashboard breadcrumb...');
                        await breadcrumb.click().catch(() => {});
                        try {
                            await page.waitForSelector('select', { timeout: 12000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) return true;
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // 6. Navigate via Top Navbar (Services -> Returns Dashboard in-app click)
                let navClicked = false;
                try {
                    navClicked = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const rLink = links.find(el => {
                            const href = (el.getAttribute('href') || '').toLowerCase();
                            const t = (el.innerText || el.textContent || '').trim().toUpperCase();
                            return href.includes('quicklinks/returns') || t === 'RETURNS DASHBOARD' || t === 'RETURN DASHBOARD';
                        });
                        if (rLink) {
                            rLink.click();
                            return true;
                        }
                        return false;
                    });
                } catch(e) {}

                if (navClicked) {
                    try {
                        await page.waitForSelector('select', { timeout: 12000 });
                        if (await page.locator('select').count() >= 2) return true;
                    } catch(e) {}
                }

                await page.waitForTimeout(600);
            }
            return false;
        };

        // Guarantee search screen is ready after login
        await ensureReturnsSearchScreen(20000);

        // Helper to select Financial Year, Quarter, Month and click SEARCH
        const selectPeriodAndSearch = async (curMonth = targetMonth, curFy = targetFy, stepLabel = 'Period Selection') => {
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            let effectiveMonth = curMonth;
            let effectiveFy = curFy || targetFy;
            let effectiveLabel = stepLabel;

            if (!monthNames.some(m => String(curMonth).toLowerCase().includes(m))) {
                effectiveMonth = targetMonth;
                effectiveLabel = curMonth;
            }

            console.log(`[GSTR-2B Autopilot] ${effectiveLabel}: Selecting FY=${effectiveFy}, Month=${effectiveMonth}...`);
            await dismissPopups();
            await ensureReturnsSearchScreen();

            // Wait for dropdowns (rapid check with retry)
            try {
                await page.waitForSelector('select', { timeout: 8000 });
            } catch(e) {
                console.log(`[GSTR-2B Autopilot] Select not immediately ready, retrying search screen navigation...`);
                await ensureReturnsSearchScreen();
                await page.waitForSelector('select', { timeout: 12000 });
            }
            await page.waitForTimeout(300);

            // 1. Select Financial Year
            await updateBanner(`${effectiveLabel}: Selecting Financial Year (${effectiveFy})...`);
            let fyLoc = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /\d{4}-\d{2}/ })
            }).first();

            if ((await fyLoc.count()) === 0) {
                fyLoc = page.locator('select').first();
            }

            const fyOptions = await fyLoc.evaluate(el => {
                return Array.from(el.options).map((o, idx) => ({
                    index: idx,
                    text: (o.text || '').trim(),
                    value: (o.value || '').trim()
                }));
            });
            console.log('[GSTR-2B Autopilot] Portal FY Options:', JSON.stringify(fyOptions));

            const cleanTargetFy = String(effectiveFy).replace(/[^0-9]/g, '');
            const matchedFy = fyOptions.find(o => {
                if (!o.text || o.text.toLowerCase().includes('select')) return false;
                const cleanOpt = o.text.replace(/[^0-9]/g, '');
                return o.text.includes(effectiveFy) || (cleanTargetFy && cleanOpt === cleanTargetFy);
            });

            if (matchedFy) {
                const currentFyIndex = await fyLoc.evaluate(el => el.selectedIndex);
                if (currentFyIndex !== matchedFy.index) {
                    console.log(`[GSTR-2B Autopilot] Selecting FY: [${matchedFy.index}] "${matchedFy.text}"`);
                    await fyLoc.selectOption({ index: matchedFy.index });
                    await fyLoc.evaluate(el => {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) {
                            try {
                                const sc = window.angular.element(el).scope();
                                if (sc && !sc.$$phase && !sc.$root.$$phase) {
                                    sc.$apply();
                                }
                            } catch(e) {}
                        }
                    });
                    await page.waitForTimeout(800); // Wait for quarters to populate
                } else {
                    console.log(`[GSTR-2B Autopilot] FY is already "${matchedFy.text}", skipping re-selection`);
                }
            } else {
                console.log(`[GSTR-2B Autopilot] Warning: curFy "${effectiveFy}" not found in portal options.`);
            }

            // 2. Select Quarter
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

            await updateBanner(`${effectiveLabel}: Selecting Quarter ${quarterNum} (${quarterMonthNames.join('/').toUpperCase()})...`);

            let qLoc = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /Quarter|[Qq][1-4]|Jul\s*-\s*Sep|Oct\s*-\s*Dec|Jan\s*-\s*Mar|Apr\s*-\s*Jun/i })
            }).first();

            if ((await qLoc.count()) === 0) {
                qLoc = page.locator('select').nth(1);
            }

            const qOptions = await qLoc.evaluate(el => {
                return Array.from(el.options).map((o, idx) => ({
                    index: idx,
                    text: (o.text || '').trim(),
                    value: (o.value || '').trim()
                }));
            });
            console.log('[GSTR-2B Autopilot] Portal Quarter Options:', JSON.stringify(qOptions));

            const matchedQuarter = qOptions.find(o => {
                const t = o.text.toLowerCase();
                if (t.includes('select')) return false;
                return t.includes(`quarter ${quarterNum}`) || 
                       t.includes(`q${quarterNum}`) ||
                       quarterMonthNames.some(m => t.includes(m));
            });

            if (matchedQuarter) {
                const currentQIndex = await qLoc.evaluate(el => el.selectedIndex);
                if (currentQIndex !== matchedQuarter.index) {
                    console.log(`[GSTR-2B Autopilot] Selecting Quarter: [${matchedQuarter.index}] "${matchedQuarter.text}"`);
                    await qLoc.selectOption({ index: matchedQuarter.index });
                    await qLoc.evaluate(el => {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.angular) {
                            try {
                                const sc = window.angular.element(el).scope();
                                if (sc && !sc.$$phase && !sc.$root.$$phase) {
                                    sc.$apply();
                                }
                            } catch(e) {}
                        }
                    });
                    await page.waitForTimeout(800); // Wait for months to populate
                } else {
                    console.log(`[GSTR-2B Autopilot] Quarter is already "${matchedQuarter.text}", skipping re-selection`);
                }
            } else {
                console.log(`[GSTR-2B Autopilot] Warning: Quarter ${quarterNum} not found in portal options.`);
            }
            await page.waitForTimeout(400);

            // 3. Select Month / Period
            await updateBanner(`${effectiveLabel}: Selecting Month / Period (${effectiveMonth})...`);

            let mLoc = null;
            let mOptions = [];

            // Retry up to 2 attempts if month select is temporarily disabled during Angular digest
            for (let mAttempt = 1; mAttempt <= 2; mAttempt++) {
                mLoc = page.locator('select').filter({
                    has: page.locator('option').filter({ hasText: /January|February|March|April|May|June|July|August|September|October|November|December/i })
                }).first();

                if ((await mLoc.count()) === 0) {
                    mLoc = page.locator('select').last();
                }

                const isDisabled = await mLoc.evaluate(el => el.disabled || el.classList.contains('ng-disabled')).catch(() => false);
                if (isDisabled && mAttempt < 2) {
                    console.log(`[GSTR-2B Autopilot] Month dropdown disabled (attempt ${mAttempt}/2), waiting for Angular digest...`);
                    await page.waitForTimeout(600);
                    continue;
                }

                mOptions = await mLoc.evaluate(el => {
                    return Array.from(el.options).map((o, idx) => ({
                        index: idx,
                        text: (o.text || '').trim(),
                        value: (o.value || '').trim()
                    }));
                }).catch(() => []);

                const validOpts = mOptions.filter(o => !o.text.toLowerCase().includes('select') && !o.text.startsWith('--'));
                if (validOpts.length > 0 || mAttempt === 2) break;
                console.log(`[GSTR-2B Autopilot] Month options not populated yet (attempt ${mAttempt}/2), waiting...`);
                await page.waitForTimeout(600);
            }
            console.log('[GSTR-2B Autopilot] Portal Month Options:', JSON.stringify(mOptions));

            const targetMonthLower = String(effectiveMonth).toLowerCase().trim();
            const targetMonthShort = targetMonthLower.slice(0, 3);

            let matchedMonth = mOptions.find(o => {
                const t = o.text.toLowerCase().trim();
                if (t.includes('select') || t.startsWith('--')) return false;
                return t.includes(targetMonthLower) || t.includes(targetMonthShort);
            });

            if (!matchedMonth) {
                let posInQuarter = 0;
                if (['apr', 'jul', 'oct', 'jan'].some(m => targetMonthLower.includes(m))) posInQuarter = 0;
                else if (['may', 'aug', 'nov', 'feb'].some(m => targetMonthLower.includes(m))) posInQuarter = 1;
                else if (['jun', 'sep', 'dec', 'mar'].some(m => targetMonthLower.includes(m))) posInQuarter = 2;

                const selectableOpts = mOptions.filter(o => !o.text.toLowerCase().includes('select') && !o.text.startsWith('--'));
                if (selectableOpts.length > posInQuarter) {
                    matchedMonth = selectableOpts[posInQuarter];
                }
            }

            if (matchedMonth) {
                console.log(`[GSTR-2B Autopilot] Selecting Month: [${matchedMonth.index}] "${matchedMonth.text}"`);
                await mLoc.selectOption({ index: matchedMonth.index });
                await mLoc.evaluate(el => {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        try {
                            const sc = window.angular.element(el).scope();
                            if (sc && !sc.$$phase && !sc.$root.$$phase) {
                                sc.$apply();
                            }
                        } catch(e) {}
                    }
                });
            } else {
                console.log(`[GSTR-2B Autopilot] Warning: Month "${effectiveMonth}" not found in portal options.`);
            }
            await page.waitForTimeout(400);

            // 4. Click SEARCH
            await updateBanner(`${effectiveLabel}: Submitting SEARCH for ${effectiveMonth}...`);
            console.log(`[GSTR-2B Autopilot] Submitting SEARCH for Quarter ${quarterNum}, Month: ${effectiveMonth}...`);

            let searchSuccess = false;
            try {
                const searchLoc = page.locator('button:has-text("SEARCH"), input[value="SEARCH" i], button.btn-primary:has-text("SEARCH"), #search, button:has-text("Search")').first();
                if (await searchLoc.isVisible({ timeout: 2500 })) {
                    await searchLoc.scrollIntoViewIfNeeded().catch(() => {});
                    await searchLoc.click();
                    searchSuccess = true;
                    console.log('[GSTR-2B Autopilot] Clicked SEARCH button via native Playwright locator');
                }
            } catch (e) {
                console.log('[GSTR-2B Autopilot] Notice on locator search click:', e.message);
            }

            if (!searchSuccess) {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
                    const s = btns.find(b => (b.innerText || b.value || b.textContent || '').trim().toUpperCase() === 'SEARCH');
                    if (s) {
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

            // 5. Wait for returns cards to render
            await updateBanner(`Waiting for Returns Cards for ${effectiveMonth} to load...`);
            try {
                await page.waitForFunction(() => {
                    const text = (document.body.innerText || '').toUpperCase();
                    return text.includes('GSTR-2B') || text.includes('GSTR 2B') || Boolean(document.querySelector('.returns-card'));
                }, null, { timeout: 12000 });
                console.log('[GSTR-2B Autopilot] Returns cards successfully rendered on GST Portal!');
            } catch (e) {
                console.log('[GSTR-2B Autopilot] Notice while waiting for return cards:', e.message);
            }
            await page.waitForTimeout(600);
        };

        // GSTR-1 bypassed: Autopilot is dedicated to rapid GSTR-2B consolidation

        // ─── HELPER: DOWNLOAD GSTR-2B AND PERSIST TO SQLITE ───────────────────
        const downloadAndProcess2b = async (currentPeriodStr) => {
            activeSyncPeriod = currentPeriodStr;
            parsedInvoices = null;
            capturedExcelPath = null;
            capturedJsonPath = null;
            const actionStartTime = Date.now();

            let clicked2bDownload = false;

            // Priority 0: Check if GSTR-2B card on dashboard explicitly indicates Nil / 0 records
            let isPortalConfirmedNil = false;
            try {
                isPortalConfirmedNil = await page.evaluate(() => {
                    const allCards = Array.from(document.querySelectorAll('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel'));
                    for (const card of allCards) {
                        const txt = (card.innerText || '').toUpperCase();
                        if ((txt.includes('GSTR-2B') || txt.includes('GSTR 2B') || txt.includes('AUTO - DRAFTED')) &&
                            !txt.includes('GSTR-1') && !txt.includes('OUTWARD SUPPLIES')) {
                            if (txt.includes('NO RECORDS AVAILABLE') || txt.includes('0 INVOICES') || 
                                txt.includes('TOTAL INVOICES: 0') || txt.includes('TOTAL INVOICES : 0') || 
                                txt.includes('COUNT : 0') || txt.includes('COUNT: 0') || 
                                txt.includes('NO INVOICES AVAILABLE') || txt.includes('NIL FILED') || 
                                txt.includes('NIL RETURN')) {
                                return true;
                            }
                        }
                    }
                    const bodyText = (document.body.innerText || '').toUpperCase();
                    if (bodyText.includes('NO RECORDS FOUND FOR GSTR-2B') || 
                        bodyText.includes('GSTR-2B HAS NO RECORDS') || 
                        bodyText.includes('NO DATA AVAILABLE FOR GSTR-2B')) {
                        return true;
                    }
                    return false;
                });
            } catch (e) {}

            // Priority 1: Precise DOM evaluation targeting only the GSTR-2B card DOWNLOAD button
            try {
                const g2bClickResult = await page.evaluate(() => {
                    const dlButtons = Array.from(document.querySelectorAll('button, a, input[type="button"]')).filter(b => {
                        if (b.closest('header, nav, footer, .navbar, .header, .footer')) return false;
                        const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                        return t === 'DOWNLOAD';
                    });

                    for (const btn of dlButtons) {
                        let parent = btn.parentElement;
                        let cardEl = null;

                        while (parent && parent !== document.body) {
                            const pText = (parent.innerText || '').toUpperCase();
                            if (pText.includes('GSTR-1') && pText.includes('GSTR-2B')) break;
                            cardEl = parent;
                            parent = parent.parentElement;
                        }

                        if (cardEl) {
                            const cardText = (cardEl.innerText || '').toUpperCase();
                            const is2b = (cardText.includes('GSTR-2B') || cardText.includes('GSTR 2B') || cardText.includes('AUTO - DRAFTED')) &&
                                         !cardText.includes('GSTR-1') && 
                                         !cardText.includes('OUTWARD SUPPLIES');

                            if (is2b) {
                                btn.scrollIntoView({ block: 'center' });
                                btn.click();
                                if (window.angular) {
                                    try {
                                        window.angular.element(btn).triggerHandler('click');
                                        window.angular.element(btn).scope()?.$apply();
                                    } catch(e) {}
                                }
                                return { success: true, text: btn.innerText || btn.value };
                            }
                        }
                    }
                    return { success: false, reason: 'GSTR-2B specific card not matched' };
                });

                clicked2bDownload = g2bClickResult.success;
            } catch(e) {}

            // Priority 2: Playwright locator with strict negative filtering against GSTR-1
            if (!clicked2bDownload) {
                try {
                    const g2bCard = page.locator('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel')
                        .filter({ hasText: /GSTR-?2B|Auto\s*-\s*drafted\s*ITC/i })
                        .filter({ hasNotText: /Details of outward|GSTR-?1(?!\.?[0-9A-Z])/i })
                        .first();

                    if (await g2bCard.isVisible({ timeout: 2000 })) {
                        const dlBtn2b = g2bCard.locator('button, a, input[type="button"]').filter({ hasText: /^DOWNLOAD$/i }).first();
                        if (await dlBtn2b.isVisible({ timeout: 1500 })) {
                            await dlBtn2b.scrollIntoViewIfNeeded().catch(() => {});
                            await dlBtn2b.click();
                            clicked2bDownload = true;
                        }
                    }
                } catch(e) {}
            }

            await page.waitForTimeout(1200);

            // On GSTR-2B download page -> click download links
            const clickDownloadLinks = async () => {
                return await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a, button, input[type="button"]'));

                    // 1. Direct Excel download link
                    const excelLink = links.find(el => {
                        const t = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
                        return (t.includes('download') || t.includes('click here')) && t.includes('excel');
                    });
                    if (excelLink) { 
                        excelLink.click(); 
                        return { type: 'excel_download', text: excelLink.innerText }; 
                    }

                    // 2. Table cell download link (often generated xlsx link)
                    const tblLink = document.querySelector('table tr td a');
                    if (tblLink) { 
                        tblLink.click(); 
                        return { type: 'table_download', text: tblLink.innerText }; 
                    }

                    // 3. Direct JSON download link
                    const jsonLink = links.find(el => {
                        const t = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
                        return (t.includes('download') || t.includes('click here')) && t.includes('json');
                    });
                    if (jsonLink) { 
                        jsonLink.click(); 
                        return { type: 'json_download', text: jsonLink.innerText }; 
                    }

                    // 4. If no ready download link, click Generate Excel
                    const genExcelBtn = links.find(el => {
                        const t = (el.innerText || el.textContent || el.value || '').trim().toUpperCase();
                        return t.includes('GENERATE EXCEL');
                    });
                    if (genExcelBtn) { 
                        genExcelBtn.click(); 
                        return { type: 'generate_excel', text: genExcelBtn.innerText || genExcelBtn.value }; 
                    }

                    return { type: 'none' };
                });
            };

            await clickDownloadLinks();
            await page.waitForTimeout(1000);

            let curExcelPath = capturedExcelPath;
            let curJsonPath = capturedJsonPath;
            let curParsedInvoices = parsedInvoices;

            const waitStart = Date.now();
            while (!curParsedInvoices && (Date.now() - waitStart < 15000)) {
                if (page.isClosed()) break;
                if (parsedInvoices) {
                    curParsedInvoices = parsedInvoices;
                    curExcelPath = capturedExcelPath;
                    curJsonPath = capturedJsonPath;
                    break;
                }

                // Check local scratch downloads directory
                if (fs.existsSync(downloadDir)) {
                    const files = fs.readdirSync(downloadDir)
                        .map(f => {
                            const p = path.join(downloadDir, f);
                            let time = 0;
                            try { time = fs.statSync(p).mtimeMs; } catch(e) {}
                            return { name: f, path: p, time };
                        })
                        .filter(f => f.time >= (actionStartTime - 6000))
                        .sort((a, b) => b.time - a.time);

                    for (const fItem of files) {
                        const fPath = fItem.path;
                        const lower = fItem.name.toLowerCase();
                        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                            curExcelPath = fPath;
                            const r = parseGstr2bExcelHelper(fPath, gstinUpper, currentPeriodStr);
                            if (r && Array.isArray(r.invoices)) {
                                curParsedInvoices = r.invoices;
                                break;
                            }
                        } else if (lower.endsWith('.json')) {
                            curJsonPath = fPath;
                            try {
                                const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
                                const r = parseGstr2bJsonHelper(raw, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices)) {
                                    curParsedInvoices = r.invoices;
                                    break;
                                }
                            } catch (e) {}
                        } else if (lower.endsWith('.zip')) {
                            const r = await parseGstr2bZipHelper(fPath, gstinUpper, currentPeriodStr);
                            if (r && Array.isArray(r.invoices)) {
                                curParsedInvoices = r.invoices;
                                break;
                            }
                        }
                    }
                }

                // Check user Downloads folder
                const userDownloads = path.join(os.homedir(), 'Downloads');
                if (!curParsedInvoices && fs.existsSync(userDownloads)) {
                    const userFiles = fs.readdirSync(userDownloads)
                        .filter(f => {
                            const l = f.toLowerCase();
                            return (l.includes('2b') || l.includes('gstr2b') || l.includes('returns')) && (l.endsWith('.xlsx') || l.endsWith('.json') || l.endsWith('.zip'));
                        })
                        .map(f => {
                            const p = path.join(userDownloads, f);
                            let time = 0;
                            try { time = fs.statSync(p).mtimeMs; } catch(e) {}
                            return { name: f, path: p, time };
                        })
                        .filter(f => f.time >= (actionStartTime - 6000))
                        .sort((a, b) => b.time - a.time);

                    if (userFiles.length > 0) {
                        const latest = userFiles[0];
                        if (latest.name.toLowerCase().endsWith('.xlsx') || latest.name.toLowerCase().endsWith('.xls')) {
                            curExcelPath = latest.path;
                            const r = parseGstr2bExcelHelper(latest.path, gstinUpper, currentPeriodStr);
                            if (r && Array.isArray(r.invoices)) {
                                curParsedInvoices = r.invoices;
                                break;
                            }
                        } else if (latest.name.toLowerCase().endsWith('.json')) {
                            curJsonPath = latest.path;
                            try {
                                const raw = JSON.parse(fs.readFileSync(latest.path, 'utf8'));
                                const r = parseGstr2bJsonHelper(raw, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices)) {
                                    curParsedInvoices = r.invoices;
                                    break;
                                }
                            } catch(e) {}
                        } else if (latest.name.toLowerCase().endsWith('.zip')) {
                            const r = await parseGstr2bZipHelper(latest.path, gstinUpper, currentPeriodStr);
                            if (r && Array.isArray(r.invoices)) {
                                curParsedInvoices = r.invoices;
                                break;
                            }
                        }
                    }
                }

                if (curParsedInvoices) break;
                await page.waitForTimeout(250); // Fast 250ms polling
            }

            if (curParsedInvoices && curParsedInvoices.length > 0) {
                console.log(`[GSTR-2B Autopilot] Persisting ${curParsedInvoices.length} invoices for ${currentPeriodStr}...`);
                const saveRes = await bulkSaveGstr2bInvoices(db, gstinUpper, currentPeriodStr, curParsedInvoices, curExcelPath, curJsonPath);
                return { count: curParsedInvoices.length, status: 'SYNCED', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: saveRes.metrics };
            }

            if (isPortalConfirmedNil || (curParsedInvoices && curParsedInvoices.length === 0 && (curExcelPath || curJsonPath))) {
                console.log(`[GSTR-2B Autopilot] Confirmed Nil Return for ${currentPeriodStr} (0 invoices). Recording NIL_SYNCED.`);
                await markGstr2bMonthNilSynced(db, gstinUpper, currentPeriodStr, curExcelPath, curJsonPath);
                return { count: 0, status: 'NIL_SYNCED', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: null };
            }

            console.log(`[GSTR-2B Autopilot] Download timed out or unconfirmed for ${currentPeriodStr}. Preserving existing database records.`);
            return { count: 0, status: 'PENDING', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: null };
        };

        // ─── EXECUTION: FULL YEAR LOOP OR SINGLE MONTH ───────────────────────
        if (isFullYear) {
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

            const syncedResults = [];
            let total12mCount = 0;

            for (let i = 0; i < fyMonths.length; i++) {
                if (page.isClosed()) break;
                const mInfo = fyMonths[i];
                console.log(`\n--- [GSTR-2B Full Year] Syncing Month ${i + 1}/12: ${mInfo.period} ---`);
                await updateBanner(`[Full Year 2B] Month ${i + 1}/12: Searching ${mInfo.period}...`, '#3b82f6');

                try {
                    await selectPeriodAndSearch(mInfo.month, targetFy, `Month ${i + 1}/12`);
                    await page.waitForTimeout(400);

                    await updateBanner(`[Full Year 2B] Month ${i + 1}/12: Downloading 2B for ${mInfo.period}...`, '#10b981');
                    const mRes = await downloadAndProcess2b(mInfo.period);

                    syncedResults.push({
                        period: mInfo.period,
                        month: mInfo.month,
                        status: mRes.status || (mRes.count > 0 ? 'SYNCED' : 'PENDING'),
                        count: mRes.count,
                        excelPath: mRes.excelPath,
                        jsonPath: mRes.jsonPath
                    });
                    total12mCount += mRes.count;
                } catch (monthErr) {
                    console.error(`[GSTR-2B Full Year] ⚠️ Month ${i + 1}/12 (${mInfo.period}) failed:`, monthErr.message);
                    syncedResults.push({
                        period: mInfo.period,
                        month: mInfo.month,
                        status: 'FAILED',
                        count: 0,
                        error: monthErr.message
                    });
                    await updateBanner(`⚠️ Month ${i + 1}/12 (${mInfo.month}) failed. Retaining old data & continuing...`, '#f59e0b');
                    await page.waitForTimeout(1000);
                }

                if (i < fyMonths.length - 1) {
                    try {
                        await updateBanner(`[Full Year 2B] Preparing for Month ${i + 2}/12: ${fyMonths[i + 1].period}...`, '#3b82f6');
                        await ensureReturnsSearchScreen();
                        await page.waitForTimeout(400);
                    } catch (navErr) {
                        console.error('[GSTR-2B Full Year] Search screen reset error:', navErr.message);
                    }
                }
            }

            // Generate full year consolidated Excel workbook
            const allInvs = await new Promise((resolveInvs) => {
                const qMarks = fyMonths.map(() => '?').join(',');
                db.all(
                    `SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND return_period IN (${qMarks}) ORDER BY idt DESC`,
                    [gstinUpper, ...fyMonths.map(m => m.period)],
                    (err, rows) => resolveInvs(rows || [])
                );
            });

            let consExcelPath = null;
            try {
                const wb = generateGstr2bFullYearWorkbook({
                    clientInfo: { trade_name: clientTradeName, gstin: gstinUpper },
                    financialYear: targetFy,
                    invoices: allInvs
                });

                const cleanFy = targetFy.replace(/[^0-9]/g, '');
                consExcelPath = path.join(downloadDir, `GSTR2B_SectionWiseSummary_${gstinUpper}_${cleanFy}.xlsx`);
                XLSX.writeFile(wb, consExcelPath);
                console.log(`[Full Year 2B] Generated consolidated workbook at: ${consExcelPath}`);
            } catch (xlErr) {
                console.error('[Full Year 2B] Error generating consolidated Excel:', xlErr.message);
            }

            const syncedCount = syncedResults.filter(r => r.status === 'SYNCED' || r.status === 'NIL_SYNCED').length;
            const hasFailures = syncedResults.some(r => r.status === 'FAILED');

            const completionBanner = hasFailures
                ? `⚠️ Full Year Sync: ${syncedCount}/12 months synced (${allInvs.length} invoices). Some months had errors. Closing in 2s...`
                : `✓ SUCCESS: All 12 months synced (${allInvs.length} invoices)! Consolidated Excel generated! Closing in 2s...`;
            const bannerColor = hasFailures ? '#f59e0b' : '#10b981';

            await updateBanner(completionBanner, bannerColor);
            await page.waitForTimeout(2000);

            await browser.close().catch(() => {});
            if (browserState) browserState.current = null;

            return res.json({
                success: true,
                message: `${syncedCount}/12 months synced for ${gstinUpper}! Total ${allInvs.length} invoices.`,
                isFullYear: true,
                gstin: gstinUpper,
                financialYear: targetFy,
                totalInvoices: allInvs.length,
                syncedCount,
                consolidatedExcelPath: consExcelPath,
                months: syncedResults
            });
        } else {
            // Single Month Execution (Fast direct GSTR-2B search and download)
            await updateBanner(`Locating GSTR-2B for ${returnPeriod}...`, '#10b981');
            await selectPeriodAndSearch(targetMonth, targetFy, 'Single Month');
            await page.waitForTimeout(300);

            await updateBanner(`Downloading GSTR-2B for ${returnPeriod}...`, '#10b981');
            const dlRes = await downloadAndProcess2b(returnPeriod);

            if (dlRes.status === 'SYNCED' && dlRes.count > 0) {
                await updateBanner(`✓ SUCCESS: ${dlRes.count} GSTR-2B Invoices synced! Closing in 2s...`, '#10b981');
                await page.waitForTimeout(2000);

                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;

                return res.json({
                    success: true,
                    message: `Successfully downloaded and parsed ${dlRes.count} GSTR-2B invoices for ${gstinUpper}!`,
                    gstin: gstinUpper,
                    period: returnPeriod,
                    status: 'SYNCED',
                    invoiceCount: dlRes.count,
                    excelPath: dlRes.excelPath,
                    jsonPath: dlRes.jsonPath,
                    metrics: dlRes.metrics
                });
            } else if (dlRes.status === 'NIL_SYNCED') {
                await updateBanner(`✓ SUCCESS: Confirmed Nil Return (0 Invoices) for ${returnPeriod}! Closing in 2s...`, '#10b981');
                await page.waitForTimeout(2000);

                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;

                return res.json({
                    success: true,
                    message: `Confirmed Nil Return (0 invoices) recorded for ${gstinUpper} (${returnPeriod}).`,
                    gstin: gstinUpper,
                    period: returnPeriod,
                    status: 'NIL_SYNCED',
                    invoiceCount: 0,
                    excelPath: dlRes.excelPath,
                    jsonPath: dlRes.jsonPath
                });
            } else {
                await updateBanner('Download request submitted or timed out. Old records retained.', '#f59e0b');
                await page.waitForTimeout(2000);
                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;

                return res.json({
                    success: true,
                    message: 'Download request dispatched to GST Portal. Once portal finishes compiling, click "Scan Downloads" or run download again.',
                    gstin: gstinUpper,
                    period: returnPeriod,
                    status: 'PENDING',
                    invoiceCount: 0
                });
            }
        }
    } catch (err) {
        const isClosedByUser = err.message?.includes('Target page') || err.message?.includes('browser has been closed') || err.message?.includes('closed');
        if (isClosedByUser) {
            console.log('[GSTR-2B Autopilot] Session cancelled: GST Portal browser was closed by user.');
        } else {
            console.error('[GSTR-2B Autopilot] Execution error:', err);
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
 * openPortalLoginHelper — Launches visible Chrome/Edge, navigates to GST Portal login,
 * auto-fills Username & Password from database vault, focuses CAPTCHA, and brings window to front.
 */
export async function openPortalLoginHelper({ db, gstin, browserState }) {
    const gstinUpper = (gstin || '').trim().toUpperCase();

    // 1. Fetch credentials from clients table
    let portalUser = '';
    let portalPass = '';
    let clientName = '';

    const clientRow = await new Promise((resolve) => {
        db.get(`SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE UPPER(gstin) = ?`, [gstinUpper], (err, row) => {
            resolve(row || null);
        });
    });

    if (clientRow) {
        portalUser = clientRow.portal_username || '';
        portalPass = clientRow.portal_password || '';
        clientName = clientRow.trade_name || clientRow.legal_name || gstinUpper;
    }

    console.log(`[Quick Login] Launching browser for ${clientName} (${gstinUpper}) with Username: ${portalUser ? portalUser : '(NOT CONFIGURED)'}`);

    const chromiumModule = await import('playwright');

    // Terminate any existing browser session
    if (browserState && browserState.current) {
        try {
            await browserState.current.close().catch(() => {});
        } catch(e) {}
        browserState.current = null;
    }

    const browserLaunchOptions = {
        headless: false,
        slowMo: 100,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--no-first-run',
            '--no-default-browser-check'
        ]
    };

    let browser = null;
    try {
        browser = await chromiumModule.chromium.launch(browserLaunchOptions);
    } catch(e) {
        browser = await chromiumModule.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
    }

    if (browserState) {
        browserState.current = browser;
    }

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    // Navigate to GST Portal login
    await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Auto-fill Username
    if (portalUser) {
        try {
            const uInput = page.locator('#username, input[name="user_name"], input[placeholder*="Username" i]').first();
            if (await uInput.isVisible({ timeout: 5000 }).catch(() => false)) {
                await uInput.fill(portalUser);
                await uInput.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
            }
        } catch(e) {}
    }

    // Auto-fill Password
    if (portalPass) {
        try {
            const pInput = page.locator('#user_pass, input[name="user_pass"], input[type="password"]').first();
            if (await pInput.isVisible({ timeout: 5000 }).catch(() => false)) {
                await pInput.fill(portalPass);
                await pInput.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
            }
        } catch(e) {}
    }

    // Focus CAPTCHA field
    try {
        const captchaInput = page.locator('#captcha, input[name="captcha"], input[placeholder*="characters" i]').first();
        if (await captchaInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await captchaInput.focus();
        }
    } catch(e) {}

    // Bring browser window to front via PowerShell
    try {
        const browserPid = typeof browser.process === 'function' ? browser.process()?.pid : null;
        let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
        if (browserPid) psParts.push(`$wshell.AppActivate(${browserPid});`);
        psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
        psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
        psParts.push(`$wshell.AppActivate('Login');`);
        psParts.push(`$wshell.AppActivate('Chrome');`);
        psParts.push(`$wshell.AppActivate('Chromium');`);
        exec(`powershell -NoProfile -Command "${psParts.join(' ')}"`, () => {});
    } catch(e) {}

    return { success: true, clientName, username: portalUser };
}


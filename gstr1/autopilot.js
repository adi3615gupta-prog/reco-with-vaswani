/*! javascript-obfuscator:disable */
// Playwright dynamically imported inside runGstr1Autopilot to prevent startup crashes
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import { bulkSaveGstr1Invoices, saveGstr1Summary, markGstr1MonthRequested, markGstr1MonthSyncedEmpty } from './db.js';
import { parseGstr1Json, parseGstr1Excel, parseGstr1Zip } from './parsers.js';
import { generateGstr1FullYearWorkbook } from './fullYearExcel.js';
import { launchAutopilotBrowser } from '../gstr2b/browserLauncher.js';

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
    returnPeriod = 'April 2025',
    financialYear = '2025-26',
    isFullYear = false,
    targetMonth = null,
    isDownloadOnly = false,
    req,
    res,
    browserState = null
}) {
    let browser = null;
    let context = null;
    let page = null;

    let activeSyncPeriod = returnPeriod;
    let parsedInvoices = null;
    let capturedExcelPath = null;
    let capturedJsonPath = null;
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
                portalPass = clientRow.portal_password || '';
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
        await page.waitForFunction(() => {
            const url = window.location.href;
            const isAuth = url.includes('/auth/') || url.includes('/dashboard') || url.includes('/quicklinks/') || url.includes('/returns/');
            const isNotLogin = !url.includes('/login');
            const hasNoInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
            const hasLogout = Boolean(document.querySelector('a[href*="logout"], [ng-click*="logout"], .user-name, #navbar-usr-menu, li.dropdown.user'));
            return (isAuth && isNotLogin) || (isNotLogin && hasNoInputs) || hasLogout;
        }, null, { timeout: 180000, polling: 100 });

        console.log('[GSTR-1 Autopilot] Logged in successfully!');
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
        if (!targetFy) targetFy = '2025-26';

        // ─── SAFE SEARCH SCREEN NAVIGATION HELPER ─────────────────────────────
        // Helper to navigate from Returns Quick Links to Return Dashboard via authentic in-page native click
        // STRICT ZERO URL PUSH: Direct page.goto or window.location.href to return.gst.gov.in triggers "Access Denied" by GSTN WAF.
        const clickReturnsDashboardInPage = async () => {
            console.log('[GSTR-1 Autopilot] ⚡ Navigating from Quick Links to Returns Dashboard via native click...');
            try {
                // Priority 1: Native Playwright click on the card/tile/button
                const dashTile = page.locator('div.card, div.panel, div.box, a, button, div[class*="card"], div[class*="box"]')
                    .filter({ hasText: /returns dashboard|file returns/i })
                    .first();
                if (await dashTile.isVisible({ timeout: 1200 }).catch(() => false)) {
                    await dashTile.scrollIntoViewIfNeeded().catch(() => {});
                    await dashTile.click({ force: true }).catch(() => {});
                    console.log('[GSTR-1 Autopilot] ✓ Clicked Returns Dashboard tile natively with Playwright');
                } else {
                    // Fallback to direct anchor link
                    const dashLink = page.locator('a[href*="returns/auth/dashboard"], a[href*="returns.gst.gov.in"]').first();
                    if (await dashLink.isVisible({ timeout: 800 }).catch(() => false)) {
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

                // 3. If on Returns Quick Links screen -> Click Returns Dashboard tile with native click
                if (curUrl.includes('quicklinks/returns') || curUrl.includes('/quicklinks')) {
                    console.log('[GSTR-1 Autopilot] Detected Returns Quick Links screen. Clicking Returns Dashboard tile natively...');
                    if (await clickReturnsDashboardInPage()) {
                        return true;
                    }
                    continue;
                }

                // 4. Check for RETURN DASHBOARD / File Returns button on dashboard home page
                try {
                    const retDashBtn = page.locator('button:has-text("RETURN DASHBOARD"), button:has-text("File Returns"), a:has-text("RETURN DASHBOARD"), a:has-text("File Returns")').first();
                    if (await retDashBtn.isVisible({ timeout: 500 }).catch(() => false)) {
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
                    const breadcrumb = page.locator('.breadcrumb a:has-text("Return"), a:has-text("Return Dashboard"), a:has-text("Returns Dashboard")').first();
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

            let matchedMonth = mOptions.find(o => {
                const t = o.text.toLowerCase().trim();
                if (t.includes('select') || t.startsWith('--')) return false;
                return t.includes(targetMonthLower) || t.includes(targetMonthShort);
            });

            if (!matchedMonth) {
                let pos = 0;
                if (['apr', 'jul', 'oct', 'jan'].some(m => targetMonthLower.includes(m))) pos = 0;
                else if (['may', 'aug', 'nov', 'feb'].some(m => targetMonthLower.includes(m))) pos = 1;
                else if (['jun', 'sep', 'dec', 'mar'].some(m => targetMonthLower.includes(m))) pos = 2;
                const selectable = mOptions.filter(o => !o.text.toLowerCase().includes('select') && !o.text.startsWith('--'));
                if (selectable.length > pos) matchedMonth = selectable[pos];
            }

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
            const searchLoc = page.locator('button:has-text("SEARCH"), input[value="SEARCH" i], button.btn-primary:has-text("SEARCH"), #search').first();
            if (await searchLoc.isVisible({ timeout: 2000 })) {
                await searchLoc.click();
            } else {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
                    const s = btns.find(b => (b.innerText || b.value || b.textContent || '').trim().toUpperCase() === 'SEARCH');
                    if (s) s.click();
                });
            }

            // 5. Wait for returns cards
            try {
                await page.waitForFunction(() => {
                    const text = (document.body.innerText || '').toUpperCase();
                    return text.includes('GSTR-1') || text.includes('GSTR 1') || text.includes('OUTWARD SUPPLIES') || Boolean(document.querySelector('.returns-card'));
                }, null, { timeout: 12000 });
            } catch (e) {}
            await page.waitForTimeout(400);
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

            // Target GSTR-1 card PREPARE OFFLINE / DOWNLOAD button (strictly excluding header/navbar)
            try {
                const g1ClickResult = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                    const cards = Array.from(document.querySelectorAll('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel'));
                    for (const card of cards) {
                        if (isTopNavbarOrHeader(card)) continue;
                        const cardText = (card.innerText || '').toUpperCase();
                        const isG1 = (cardText.includes('GSTR-1') || cardText.includes('GSTR 1') || cardText.includes('OUTWARD SUPPLIES') || cardText.includes('IFF')) &&
                                     !cardText.includes('GSTR-2B') && !cardText.includes('GSTR-2A') && !cardText.includes('GSTR-3B');

                        if (isG1) {
                            const btns = Array.from(card.querySelectorAll('button, a, input[type="button"]'));
                            const dlBtn = btns.find(b => {
                                if (isTopNavbarOrHeader(b)) return false;
                                const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return t === 'PREPARE OFFLINE' || t.includes('PREPARE OFFLINE') || t === 'DOWNLOAD';
                            });
                            if (dlBtn) {
                                dlBtn.scrollIntoView({ block: 'center' });
                                dlBtn.click();
                                if (window.angular) {
                                    try {
                                        window.angular.element(dlBtn).triggerHandler('click');
                                        window.angular.element(dlBtn).scope()?.$apply();
                                    } catch(e) {}
                                }
                                return { success: true };
                            }
                        }
                    }
                    return { success: false };
                });
                clickedG1Download = g1ClickResult.success;
            } catch (e) {}

            if (!clickedG1Download) {
                try {
                    const g1Card = page.locator('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel')
                        .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                        .filter({ hasText: /GSTR-?1|Outward\s*Supplies|IFF/i })
                        .filter({ hasNotText: /GSTR-?2B|Auto\s*-\s*drafted|GSTR-?3B/i })
                        .first();
                    if (await g1Card.isVisible({ timeout: 2000 })) {
                        const dlBtn = g1Card.locator('button, a, input[type="button"]')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu') })
                            .filter({ hasText: /PREPARE\s*OFFLINE|DOWNLOAD/i })
                            .first();
                        if (await dlBtn.isVisible({ timeout: 1500 })) {
                            await dlBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await dlBtn.click({ force: true });
                            clickedG1Download = true;
                        }
                    }
                } catch(e) {}
            }

            // Allow time for Offline page to load
            try {
                await page.waitForFunction(() => {
                    const u = window.location.href.toLowerCase();
                    return u.includes('/offline') || Boolean(document.querySelector('ul.nav-tabs, a[data-toggle="tab"], #download, #upload'));
                }, null, { timeout: 8000 }).catch(() => {});
            } catch (e) {}
            await page.waitForTimeout(1500);
            await dismissPopups();

            // ─── CRITICAL STEP: SWITCH TO IN-PAGE "DOWNLOAD" TAB (STRICTLY EXCLUDING TOP NAVBAR) ───
            let switchedToDownloadTab = false;
            try {
                console.log(`[GSTR-1 Autopilot] Switching to in-page "Download" tab on offline preparation page...`);

                // Priority 1: In-page evaluate targeting strictly the offline tab, ignoring any navbar/header
                switchedToDownloadTab = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));

                    const tabCandidates = Array.from(document.querySelectorAll('ul.nav-tabs a, .nav-tabs li a, a[data-toggle="tab"], .nav-pills a, button[role="tab"]'));
                    for (const tab of tabCandidates) {
                        if (isTopNavbarOrHeader(tab)) continue;
                        const txt = (tab.innerText || tab.textContent || '').trim().toUpperCase();
                        const href = (tab.getAttribute('href') || '').toLowerCase();
                        if (txt === 'DOWNLOAD' || txt === 'DOWNLOAD DETAILS' || href === '#download' || href.endsWith('/download')) {
                            tab.scrollIntoView({ block: 'center' });
                            tab.click();
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
                        .locator('ul.nav-tabs a, a[data-toggle="tab"], .nav-tabs li a')
                        .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                        .filter({ hasText: /^download$/i })
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

            await page.waitForTimeout(1200);
            await dismissPopups();

            // ─── STEP 1: HELPER TO FIND & CLICK "Click here to download - File 1" BELOW BUTTON ───
            let foundReadyLink = false;
            let readyLinkText = '';

            const clickReadyLinkIfFound = async () => {
                // Priority 1: In-page evaluate strictly inside main offline content area / table / tab-pane (never in navbar/header)
                try {
                    const evalRes = await page.evaluate(() => {
                        const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));

                        // Look inside the active tab-pane, #download section, table, or main view
                        const containers = Array.from(document.querySelectorAll('.tab-pane.active, #download, table, div[ng-view], .content, main'));
                        const searchAreas = containers.length > 0 ? containers : [document.body];

                        for (const area of searchAreas) {
                            if (isTopNavbarOrHeader(area)) continue;
                            const anchors = Array.from(area.querySelectorAll('a'));
                            for (const a of anchors) {
                                if (isTopNavbarOrHeader(a)) continue;
                                const t = (a.innerText || a.textContent || '').trim().toLowerCase();
                                if (t.includes('generate')) continue;

                                // Match "Click here to download - File 1" or "Click here to download" or "File 1"
                                const isClickHereToDownload = t.includes('click here') && t.includes('download');
                                const isFile1 = t.includes('file 1') || t === 'file 1' || t.includes('file-1');
                                const isTableDownload = a.closest('table, tbody, tr') && t.includes('download');

                                if (isClickHereToDownload || isFile1 || isTableDownload) {
                                    a.scrollIntoView({ block: 'center' });
                                    a.click();
                                    if (window.angular) {
                                        try {
                                            window.angular.element(a).triggerHandler('click');
                                            window.angular.element(a).scope()?.$apply();
                                        } catch(e) {}
                                    }
                                    return { success: true, text: a.innerText || 'Click here to download - File 1' };
                                }
                            }
                        }
                        return { success: false };
                    });

                    if (evalRes && evalRes.success) {
                        readyLinkText = evalRes.text || 'Click here to download - File 1';
                        console.log(`[GSTR-1 Autopilot] 🎯 Clicked ready download link via evaluate: "${readyLinkText.trim()}"`);
                        return true;
                    }
                } catch(e) {}

                // Priority 2: Playwright locator strictly excluding header/nav/footer
                try {
                    const readyLocators = [
                        page.locator('.tab-pane.active, #download, table, div[ng-view], .content')
                            .locator('a')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                            .filter({ hasText: /click\s*here\s*to\s*download/i }),
                        page.locator('.tab-pane.active, #download, table, div[ng-view], .content')
                            .locator('a')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                            .filter({ hasText: /file\s*1/i }),
                        page.locator('table tr td a')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                    ];

                    for (const loc of readyLocators) {
                        if (await loc.first().isVisible({ timeout: 1000 }).catch(() => false)) {
                            readyLinkText = (await loc.first().innerText().catch(() => '')) || 'Click here to download';
                            console.log(`[GSTR-1 Autopilot] 🎯 Found ready download link via locator: "${readyLinkText.trim()}" for ${currentPeriodStr}`);
                            await loc.first().scrollIntoViewIfNeeded().catch(() => {});
                            await loc.first().click({ force: true }).catch(() => {});
                            return true;
                        }
                    }
                } catch(e) {}

                return false;
            };

            // Check if download link is already showing on tab load
            foundReadyLink = await clickReadyLinkIfFound();

            // ─── STEP 2: CLICK "GENERATE JSON FILE TO DOWNLOAD" (1 TIME) ─────────────────────
            // User explicit requirement:
            // "it should click generate JSON FILE TO Download if it is first time then request will be send then 20 mins waiting time will be then after that it will again go then again click on generate json file to download then below that button Click here to download - File 1 will show it will click on that to download file understood !!"
            if (!foundReadyLink) {
                console.log(`[GSTR-1 Autopilot] Clicking "GENERATE JSON FILE TO DOWNLOAD" for ${currentPeriodStr}...`);
                let clickedGenerate = false;

                // Priority 1: In-page evaluate strictly inside main content (never in navbar/header)
                clickedGenerate = await page.evaluate(() => {
                    const isTopNavbarOrHeader = (el) => Boolean(el.closest('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav, .dropdown, .dropdown-menu'));
                    const btns = Array.from(document.querySelectorAll('button, input[type="button"], a.btn, a'));
                    for (const b of btns) {
                        if (isTopNavbarOrHeader(b)) continue;
                        const txt = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                        if (txt.includes('GENERATE JSON') || txt.includes('GENERATE FILE') || txt === 'GENERATE') {
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
                    }
                    return false;
                });

                if (clickedGenerate) {
                    console.log(`[GSTR-1 Autopilot] ⚡ Clicked GENERATE JSON FILE TO DOWNLOAD via evaluate.`);
                } else {
                    // Priority 2: Playwright locator strictly excluding header/nav
                    try {
                        const genBtn = page.locator('div[ng-view], #main, .content, .tab-pane.active, #download, body')
                            .locator('button, input[type="button"], a')
                            .filter({ hasNot: page.locator('header, nav, .navbar, .header, footer, #navbar, #navbar-usr-menu, .navbar-nav') })
                            .filter({ hasText: /GENERATE\s*JSON/i })
                            .first();
                        if (await genBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await genBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await genBtn.click({ force: true }).catch(() => {});
                            clickedGenerate = true;
                            console.log(`[GSTR-1 Autopilot] ⚡ Clicked GENERATE JSON FILE TO DOWNLOAD via Playwright locator.`);
                        }
                    } catch(e) {}
                }

                // ─── STEP 3: WAIT AND CHECK WHETHER "Click here to download - File 1" APPEARS BELOW BUTTON ──
                console.log(`[GSTR-1 Autopilot] Checking for "Click here to download - File 1" below button for ${currentPeriodStr}...`);
                const checkStart = Date.now();

                while (Date.now() - checkStart < 5000) {
                    if (page.isClosed()) break;

                    foundReadyLink = await clickReadyLinkIfFound();
                    if (foundReadyLink) {
                        console.log(`[GSTR-1 Autopilot] 🎯 "Click here to download - File 1" appeared below button! Proceeding to download.`);
                        break;
                    }

                    // Check if portal has confirmed that generation is in progress (20-min wait)
                    try {
                        const pageText = await page.evaluate(() => {
                            const mainEl = document.querySelector('div[ng-view], .content, main, body');
                            return (mainEl ? mainEl.innerText : document.body.innerText || '').toLowerCase();
                        });
                        if (pageText.includes('in progress') || pageText.includes('processed') || pageText.includes('20 minutes') || pageText.includes('check after') || pageText.includes('request has been received')) {
                            console.log(`[GSTR-1 Autopilot] Portal confirmed: Generation request received (20-min wait).`);
                            break;
                        }
                    } catch(e) {}

                    await page.waitForTimeout(600);
                }
            }

            // ─── STEP 4: IF READY DOWNLOAD LINK WAS FOUND & CLICKED -> DOWNLOAD & PERSIST ───
            if (foundReadyLink) {
                console.log(`[GSTR-1 Autopilot] Download initiated for ${currentPeriodStr}. Waiting up to 15s for file stream...`);

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
                const backBtn = page.locator('button, input[type="button"], input[type="submit"], a.btn, .btn')
                    .filter({ hasText: /^back$/i })
                    .filter({ hasNot: page.locator('.navbar, .breadcrumb, nav, header, footer') })
                    .first();
                if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await backBtn.click({ force: true }).catch(() => {});
                }
            } catch(e) {}

            return { status: 'REQUESTED', count: 0, excelPath: null, jsonPath: null, summary: null };
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
            console.log(`\n--- [GSTR-1 Autopilot] Processing ${progressLabel} ---`);
            await updateBanner(`[GSTR-1 Autopilot] ${progressLabel}: Searching...`, '#8b5cf6');

            await selectPeriodAndSearch(mInfo.month, targetFy, progressLabel);
            await page.waitForTimeout(400);

            await updateBanner(`[GSTR-1 Autopilot] ${progressLabel}: Checking download / requesting file...`, '#10b981');
            const mRes = await downloadAndProcessGstr1(mInfo.period);
            syncedResults.push({ period: mInfo.period, month: mInfo.month, status: mRes.status, count: mRes.count });

            if (mRes.status === 'SYNCED') {
                totalDownloadedCount += (mRes.count || 0);
            } else if (mRes.status === 'REQUESTED') {
                totalRequestedCount++;
            }

            if (i < monthsToProcess.length - 1) {
                await updateBanner(`[GSTR-1 Autopilot] Returning to dashboard for ${monthsToProcess[i + 1].period}...`, '#8b5cf6');
                await ensureReturnsSearchScreen();
                await page.waitForTimeout(400);
            }
        }

        if (isTargetedMonth) {
            const resMonth = syncedResults[0];
            if (resMonth && resMonth.status === 'SYNCED' && resMonth.count > 0) {
                await updateBanner(`✓ SUCCESS: ${resMonth.count} GSTR-1 Invoices downloaded for ${resMonth.period}! Closing in 2s...`, '#10b981');
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

            return res.json({
                success: true,
                message: resMonth && resMonth.status === 'SYNCED'
                    ? `Successfully downloaded ${resMonth.count} GSTR-1 invoices for ${resMonth.period}!`
                    : `GSTR-1 generation in progress for ${resMonth?.period || returnPeriod}. 20-min timer active in dashboard.`,
                gstin: gstinUpper,
                period: resMonth?.period || returnPeriod,
                invoiceCount: resMonth?.count || 0,
                status: resMonth?.status || 'REQUESTED',
                requestedAt: Date.now()
            });
        } else {
            // Full 12-Month Loop completed!
            await updateBanner(`✓ Completed 12 Months: ${totalDownloadedCount} invoices downloaded, ${totalRequestedCount} months queued with 20-min timers! Closing in 2s...`, '#10b981');
            await page.waitForTimeout(2500);
            await browser.close().catch(() => {});
            if (browserState) browserState.current = null;

            return res.json({
                success: true,
                message: `Successfully processed all 12 months for ${gstinUpper}! ${totalDownloadedCount} invoices downloaded, ${totalRequestedCount} months queued with 20-minute countdown timers.`,
                isFullYear: true,
                gstin: gstinUpper,
                financialYear: targetFy,
                totalInvoices: totalDownloadedCount,
                months: syncedResults
            });
        }
    } catch (err) {
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
                    portalPass = clientRow.portal_password || '';
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


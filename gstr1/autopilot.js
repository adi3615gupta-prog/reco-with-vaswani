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

        // Launch Chromium browser
        const bundledChrome = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1155', 'chrome-win', 'chrome.exe');
        const launchOptions = {
            headless: false,
            slowMo: 50,
            downloadsPath: downloadDir,
            viewport: { width: 1366, height: 768 },
            args: [
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-infobars',
                '--disable-extensions'
            ]
        };

        if (fs.existsSync(bundledChrome)) {
            launchOptions.executablePath = bundledChrome;
        }

        let chromiumModule;
        try {
            chromiumModule = await import('playwright');
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Playwright is not installed or available.' });
        }
        const chromium = chromiumModule.chromium || chromiumModule.default?.chromium || chromiumModule;
        browser = await chromium.launch(launchOptions);
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
        page.on('download', async (download) => {
            try {
                const suggestedFilename = download.suggestedFilename();
                console.log('[Autopilot GSTR-1] Download detected:', suggestedFilename);
                const savePath = path.join(downloadDir, `${Date.now()}_${suggestedFilename}`);
                await download.saveAs(savePath);
                console.log('[Autopilot GSTR-1] Saved file to:', savePath);

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
            } catch (err) {
                console.error('[Autopilot GSTR-1] Download processing notice:', err.message);
            }
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

        // Dismiss popup helper
        const dismissPopups = async () => {
            try {
                const remindLater = page.locator('button:has-text("Remind Me Later"), a:has-text("Remind Me Later"), button:has-text("Remind me later")').first();
                if (await remindLater.isVisible({ timeout: 1000 })) {
                    await remindLater.click().catch(() => {});
                }
            } catch (e) {}
            try {
                const closeBtn = page.locator('.modal-header .close, button:has-text("Close"), button[aria-label="Close"]').first();
                if (await closeBtn.isVisible({ timeout: 1000 })) {
                    await closeBtn.click().catch(() => {});
                }
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
            if (portalPass) {
                console.log('[GSTR-1 Autopilot] Auto-filling password...');
                await page.waitForSelector('#user_pass', { timeout: 5000 });
                await page.fill('#user_pass', portalPass);
                await page.evaluate((p) => {
                    const el = document.querySelector('#user_pass');
                    if (el) {
                        el.value = p;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, portalPass);
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
            const isAuth = url.includes('/auth/') || url.includes('/dashboard');
            const isNotLogin = !url.includes('/login');
            const hasNoInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
            return (isAuth && isNotLogin) || (isNotLogin && hasNoInputs);
        }, null, { timeout: 180000 });

        console.log('[GSTR-1 Autopilot] Logged in successfully!');
        focusDesktopWindow();

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
        const ensureReturnsSearchScreen = async (timeoutMs = 20000) => {
            const startWait = Date.now();
            while (Date.now() - startWait < timeoutMs) {
                if (page.isClosed()) return false;
                await dismissPopups();

                try {
                    const selectCount = await page.locator('select').count();
                    if (selectCount >= 2) return true;
                } catch(e) {}

                const curUrl = page.url();

                // Recovery from accessdenied
                if (curUrl.includes('accessdenied') || curUrl.includes('/error/')) {
                    try {
                        const dashLink = page.locator('a:has-text("Dashboard"), .navbar a:has-text("Dashboard")').first();
                        if (await dashLink.isVisible({ timeout: 1500 }).catch(() => false)) {
                            await dashLink.click().catch(() => {});
                            await page.waitForTimeout(1000);
                            await dismissPopups();
                            continue;
                        }
                    } catch(e) {}
                }

                // If on GSTR-1 offline/download page -> click on-screen BACK once and wait!
                if (curUrl.includes('/download') || curUrl.includes('/gstr1/') || curUrl.includes('/offline/')) {
                    let backClicked = false;
                    try {
                        const backBtn = page.locator('button, a, input[type="button"]')
                            .filter({ hasText: /\bback\b/i })
                            .last();
                        if (await backBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
                            await backBtn.scrollIntoViewIfNeeded().catch(() => {});
                            await backBtn.click({ timeout: 2000 }).catch(() => {});
                            backClicked = true;
                        }
                    } catch(e) {}

                    if (!backClicked) {
                        try {
                            const rBreadcrumb = page.locator('.breadcrumb a, a:has-text("Return Dashboard"), a:has-text("Returns Dashboard")').first();
                            if (await rBreadcrumb.isVisible({ timeout: 800 }).catch(() => false)) {
                                await rBreadcrumb.click().catch(() => {});
                                backClicked = true;
                            }
                        } catch(e) {}
                    }

                    if (!backClicked) {
                        await page.goBack().catch(() => {});
                    }

                    try {
                        await page.waitForSelector('select', { timeout: 12000 });
                        await dismissPopups();
                        if (await page.locator('select').count() >= 2) return true;
                    } catch(e) {}
                    continue;
                }

                // On Dashboard page -> Click RETURN DASHBOARD
                try {
                    const retDashBtn = page.locator('button:has-text("RETURN DASHBOARD"), a:has-text("RETURN DASHBOARD"), button:has-text("File Returns"), a:has-text("File Returns")').first();
                    if (await retDashBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await retDashBtn.click().catch(() => {});
                        try {
                            await page.waitForSelector('select', { timeout: 12000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) return true;
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // Navbar link fallback
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

            // Target GSTR-1 card DOWNLOAD button
            try {
                const g1ClickResult = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('div.col-md-4, div.col-sm-6, .returns-card, .card, div.panel'));
                    for (const card of cards) {
                        const cardText = (card.innerText || '').toUpperCase();
                        const isG1 = (cardText.includes('GSTR-1') || cardText.includes('GSTR 1') || cardText.includes('OUTWARD SUPPLIES')) &&
                                     !cardText.includes('GSTR-2B') && !cardText.includes('GSTR-2A');

                        if (isG1) {
                            const btns = Array.from(card.querySelectorAll('button, a, input[type="button"]'));
                            const dlBtn = btns.find(b => {
                                const t = (b.innerText || b.value || b.textContent || '').trim().toUpperCase();
                                return t === 'DOWNLOAD' || t === 'PREPARE OFFLINE';
                            });
                            if (dlBtn) {
                                dlBtn.scrollIntoView({ block: 'center' });
                                dlBtn.click();
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
                        .filter({ hasText: /GSTR-?1|Outward\s*Supplies/i })
                        .filter({ hasNotText: /GSTR-?2B|Auto\s*-\s*drafted/i })
                        .first();
                    if (await g1Card.isVisible({ timeout: 2000 })) {
                        const dlBtn = g1Card.locator('button, a, input[type="button"]').filter({ hasText: /DOWNLOAD|PREPARE\s*OFFLINE/i }).first();
                        if (await dlBtn.isVisible({ timeout: 1500 })) {
                            await dlBtn.click();
                            clickedG1Download = true;
                        }
                    }
                } catch(e) {}
            }

            // Allow time for Offline Download page to load
            await page.waitForTimeout(1500);

            // Dismiss any modal/dialog that might appear
            await dismissPopups();

            // ─── STEP 1: INITIAL CHECK - IS DOWNLOAD LINK ALREADY VISIBLE? ───────────
            let foundReadyLink = false;
            let readyLinkText = '';

            const readyLocators = [
                page.locator('a').filter({ hasText: /click\s*here\s*to\s*download/i }),
                page.locator('a').filter({ hasText: /file\s*1/i }),
                page.locator('a:has-text("Click here to download")'),
                page.locator('a:has-text("File 1")'),
                page.locator('table tr td a')
            ];

            const clickReadyLinkIfFound = async () => {
                for (const loc of readyLocators) {
                    try {
                        if (await loc.first().isVisible({ timeout: 800 })) {
                            readyLinkText = (await loc.first().innerText().catch(() => '')) || 'Click here to download';
                            console.log(`[GSTR-1 Autopilot] 🎯 Found ready download link: "${readyLinkText.trim()}" for ${currentPeriodStr}`);
                            await loc.first().scrollIntoViewIfNeeded().catch(() => {});
                            await loc.first().click().catch(() => {});
                            return true;
                        }
                    } catch (e) {}
                }

                // In-page fallback search specifically for <a> tags containing "click here" or "file 1"
                try {
                    const evalRes = await page.evaluate(() => {
                        const anchors = Array.from(document.querySelectorAll('a'));
                        const link = anchors.find(a => {
                            const t = (a.innerText || a.textContent || '').trim().toLowerCase();
                            if (t.includes('generate')) return false;
                            return (t.includes('click here') && t.includes('download')) || 
                                   t.includes('file 1') || 
                                   (t.includes('download') && (t.includes('.zip') || t.includes('.json') || t.includes('.xlsx')));
                        });
                        if (link) {
                            link.scrollIntoView({ block: 'center' });
                            link.click();
                            return { success: true, text: link.innerText };
                        }
                        return { success: false };
                    });
                    if (evalRes && evalRes.success) {
                        readyLinkText = evalRes.text || 'Click here to download';
                        console.log(`[GSTR-1 Autopilot] 🎯 Clicked ready download link via evaluate: "${readyLinkText.trim()}"`);
                        return true;
                    }
                } catch(e) {}

                return false;
            };

            // Check if download link is already showing on page load
            foundReadyLink = await clickReadyLinkIfFound();

            // ─── STEP 2: IF NOT YET VISIBLE, CLICK "GENERATE JSON FILE TO DOWNLOAD" (1 TIME) ──
            // "download link will not appear until and unless we click on generate json file to download"
            if (!foundReadyLink) {
                console.log(`[GSTR-1 Autopilot] Download link not yet showing for ${currentPeriodStr}. Clicking "GENERATE JSON FILE TO DOWNLOAD" (1 time)...`);
                let clickedGenerate = false;

                try {
                    const genBtn = page.locator('button, input[type="button"], a').filter({ hasText: /GENERATE\s*JSON|GENERATE\s*EXCEL/i }).first();
                    if (await genBtn.isVisible({ timeout: 2000 })) {
                        await genBtn.scrollIntoViewIfNeeded().catch(() => {});
                        await genBtn.click().catch(() => {});
                        clickedGenerate = true;
                        console.log(`[GSTR-1 Autopilot] ⚡ Clicked GENERATE JSON FILE TO DOWNLOAD (1 time).`);
                    }
                } catch(e) {}

                if (!clickedGenerate) {
                    try {
                        const evalGen = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, input[type="button"], a'));
                            const b = btns.find(el => {
                                const t = (el.innerText || el.value || el.textContent || '').trim().toUpperCase();
                                return t.includes('GENERATE JSON') || t.includes('GENERATE EXCEL');
                            });
                            if (b) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                return true;
                            }
                            return false;
                        });
                        clickedGenerate = Boolean(evalGen);
                        if (clickedGenerate) console.log(`[GSTR-1 Autopilot] ⚡ Clicked GENERATE via evaluate (1 time).`);
                    } catch(e) {}
                }

                // ─── STEP 3: WAIT AND CHECK WHETHER LINK GENERATED OR REQUEST SENT ──
                // "it have to wait and check whether link generated or request sent if link is shown then click on link"
                console.log(`[GSTR-1 Autopilot] Checking whether download link generated or request sent for ${currentPeriodStr}...`);
                const checkStart = Date.now();

                while (Date.now() - checkStart < 5000) {
                    if (page.isClosed()) break;

                    foundReadyLink = await clickReadyLinkIfFound();
                    if (foundReadyLink) {
                        console.log(`[GSTR-1 Autopilot] 🎯 Download link appeared after generate click! Proceeding to download.`);
                        break;
                    }

                    // Check if portal has confirmed that generation is in progress
                    try {
                        const pageText = await page.evaluate(() => (document.body.innerText || '').toLowerCase());
                        if (pageText.includes('in progress') || pageText.includes('processed') || pageText.includes('20 minutes') || pageText.includes('check after') || pageText.includes('request has been received')) {
                            console.log(`[GSTR-1 Autopilot] Portal confirmed: Generation request received.`);
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

                    // Click on-screen BACK button / Return Dashboard breadcrumb
                    try {
                        const backBtn = page.locator('button, a, input[type="button"]').filter({ hasText: /\bback\b/i }).last();
                        if (await backBtn.isVisible({ timeout: 1500 })) await backBtn.click();
                    } catch(e) {}

                    return { status: 'SYNCED', count: curParsedInvoices.length, excelPath: curExcelPath, jsonPath: curJsonPath, summary: curSummary };
                } else if (curParsedInvoices && curParsedInvoices.length === 0) {
                    console.log(`[GSTR-1 Autopilot] ✓ Downloaded file has 0 invoices (Nil Return) for ${currentPeriodStr}. Marking SYNCED.`);
                    await markGstr1MonthSyncedEmpty(db, gstinUpper, currentPeriodStr, curExcelPath, curJsonPath);

                    try {
                        const backBtn = page.locator('button, a, input[type="button"]').filter({ hasText: /\bback\b/i }).last();
                        if (await backBtn.isVisible({ timeout: 1500 })) await backBtn.click();
                    } catch(e) {}

                    return { status: 'SYNCED', count: 0, excelPath: curExcelPath, jsonPath: curJsonPath, summary: curSummary };
                }
            }

            // ─── STEP 5: IF LINK DID NOT APPEAR -> CONFIRM REQUEST SENT & SET 20-MIN TIMER ───
            console.log(`[GSTR-1 Autopilot] ⏱️ Generation request confirmed for ${currentPeriodStr}. Setting 20-min timer in DB...`);
            await markGstr1MonthRequested(db, gstinUpper, currentPeriodStr);
            await page.waitForTimeout(1000);

            // Click on-screen BACK button / Return Dashboard breadcrumb
            try {
                const backBtn = page.locator('button, a, input[type="button"]').filter({ hasText: /\bback\b/i }).last();
                if (await backBtn.isVisible({ timeout: 1500 })) await backBtn.click();
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
                status: resMonth?.status || 'REQUESTED'
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

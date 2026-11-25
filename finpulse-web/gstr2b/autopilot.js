import { decryptSecret } from '../cryptoVault.js';
/*! javascript-obfuscator:disable */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execFile } from 'child_process';
import {
    bulkSaveGstr2bInvoices,
    markGstr2bMonthNilSynced,
    markGstr2bMonthRequested,
    normalizeReturnPeriod,
    buildStrictPeriodFilter,
    recordGstr2bMonthError,
    verifyGstr2bBatchChecksum,
    updateGstr2bBatchVerification
} from './db.js';
import {
    parseGstr2bExcelHelper,
    parseGstr2bJsonHelper,
    parseGstr2bZipHelper,
    verifyParsedGstr2bPayload,
    extractGstr2bPortalSummary
} from './parsers.js';
import { killBrowserWithPidFallback, resolveTargetPeriods } from './jobs.js';
import { generateGstr2bFullYearWorkbook } from './fullYearExcel.js';
import { launchAutopilotBrowser } from './browserLauncher.js';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * buildIsolatedPeriodDir: Pure path helper that ensures automated downloads save exclusively into
 * path-traversal-guarded scratch/downloads/gstr2b/${gstinUpper}/${jobId}/${periodSlug}
 */
export function buildIsolatedPeriodDir(gstinUpper, jobId, periodStr) {
    if (String(gstinUpper || '').includes('..') || String(jobId || '').includes('..') || String(periodStr || '').includes('..')) {
        throw new Error('Unsafe download directory path: path traversal detected');
    }
    const sessionRoot = path.resolve(process.cwd(), 'scratch', 'downloads', 'gstr2b');
    const safeGstin = String(gstinUpper || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!safeGstin) throw new Error('Client GSTIN is required for isolated download directory');
    const safeJobId = String(jobId || 'direct_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '') || 'session';
    const periodSlug = (normalizeReturnPeriod(periodStr) || String(periodStr || 'period')).replace(/[^a-zA-Z0-9]+/g, '_');
    const targetDir = path.resolve(sessionRoot, safeGstin, safeJobId, periodSlug);
    if (!targetDir.startsWith(sessionRoot + path.sep)) {
        throw new Error('Unsafe download directory path');
    }
    return targetDir;
}

/**
 * runGstr2bAutopilot — Autonomous Playwright automation engine for GST Portal:
 * 1. Log in (with credential vault auto-fill & user CAPTCHA wait)
 * 2. Navigate to Returns Dashboard & Select Financial Year, Quarter, and Filing Month
 * 3. Submit SEARCH and render return cards
 * 4. Locate GSTR-1 card -> Click DOWNLOAD -> capture/queue outward file -> click on-screen BACK
 * 5. Locate GSTR-2B card -> Click DOWNLOAD
 * 6. Download official Excel & JSON files, extract line-item invoices & persist to SQLite
 */
export async function runGstr2bAutopilot({
    db,
    gstin,
    returnPeriod,
    financialYear,
    portal_username,
    portal_password,
    req = null,
    res = null,
    browserState = null,
    isFullYear = false,
    jobId = null,
    onlyPeriods = null,
    skipSynced = false,
    onEvent = null,
    abortSignal = null
}) {
    const emit = (eventName, data = {}) => {
        try {
            if (typeof onEvent === 'function') onEvent(eventName, data);
        } catch (e) {}
    };

    const sendOutcome = (httpStatus, payload) => {
        if (res && !res.headersSent) {
            res.status(httpStatus).json(payload);
        }
        return payload;
    };

    const gstinUpper = String(gstin || '').trim().toUpperCase();
    const effectiveJobId = String(jobId || 'direct_' + Date.now());

    // 1. Fetch Client Credentials from Database Vault (with direct payload fallback)
    let portalUser = (portal_username || '').trim();
    let portalPass = (portal_password || '').trim();
    let clientTradeName = '';

    try {
        const clientRow = await new Promise((resolve) => {
            db.get(`SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?`, [gstinUpper], (err, row) => {
                resolve(row || null);
            });
        });
        if (clientRow) {
            portalUser = clientRow.portal_username || portalUser;
            portalPass = decryptSecret(clientRow.portal_password || portalPass);
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
        return sendOutcome(500, { success: false, error: 'Playwright is not installed or available.' });
    }

    let browser = null;
    let context = null;
    let page = null;

    // ─── Resolve Configured Storage Path from Settings Tab (app_config) ────────
    let configuredDataPath = null;
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
                configuredDataPath = path.resolve(raw);
            }
        }
    } catch (e) {
        console.warn('[GSTR-2B Autopilot] Could not read configured storage path from app_config:', e.message);
    }

    const targetFy = financialYear || '2026-27';
    const scratchDownloadDir = path.join(process.cwd(), 'scratch', 'downloads', 'gstr2b', gstinUpper);
    if (!fs.existsSync(scratchDownloadDir)) fs.mkdirSync(scratchDownloadDir, { recursive: true });

    const downloadDir = scratchDownloadDir;

    // Build list of target storage folders configured in Settings
    const configuredTargetDirs = [];
    let configuredClientDir = null;
    let configuredAnnualDir = null;
    let configuredCentralDir = null;

    if (configuredDataPath) {
        // 1. Central 2B downloads folder: <configuredDataPath>/gstr2b/<GSTIN>
        configuredCentralDir = path.join(configuredDataPath, 'gstr2b', gstinUpper);
        if (!fs.existsSync(configuredCentralDir)) {
            try { fs.mkdirSync(configuredCentralDir, { recursive: true }); } catch {}
        }
        if (fs.existsSync(configuredCentralDir)) configuredTargetDirs.push(configuredCentralDir);

        // 2. Client Folder under configured data path: <configuredDataPath>/gst_returns_data/<ClientName> - <GSTIN>
        const safeTradeName = (clientTradeName || '').replace(/[\\/:*?"<>|]/g, '').trim();
        const clientFolderName = safeTradeName ? `${safeTradeName} - ${gstinUpper}` : gstinUpper;
        
        const candidateRoots = [
            path.join(configuredDataPath, 'gst_returns_data'),
            configuredDataPath
        ];

        for (const cRoot of candidateRoots) {
            if (!fs.existsSync(cRoot)) continue;
            const exact = path.join(cRoot, clientFolderName);
            if (fs.existsSync(exact)) {
                configuredClientDir = exact;
                break;
            }
            try {
                const entries = fs.readdirSync(cRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.toUpperCase().includes(gstinUpper)) {
                        configuredClientDir = path.join(cRoot, entry.name);
                        break;
                    }
                }
            } catch {}
            if (configuredClientDir) break;
        }

        if (!configuredClientDir) {
            const primaryRoot = fs.existsSync(path.join(configuredDataPath, 'gst_returns_data'))
                ? path.join(configuredDataPath, 'gst_returns_data')
                : configuredDataPath;
            configuredClientDir = path.join(primaryRoot, clientFolderName);
            try { fs.mkdirSync(configuredClientDir, { recursive: true }); } catch {}
        }

        // 3. Client Annual GSTR-2B Folder: <clientDir>/<FY>/GSTR-2B
        configuredAnnualDir = path.join(configuredClientDir, targetFy, 'GSTR-2B');
        if (!fs.existsSync(configuredAnnualDir)) {
            try { fs.mkdirSync(configuredAnnualDir, { recursive: true }); } catch {}
        }
        if (fs.existsSync(configuredAnnualDir) && !configuredTargetDirs.includes(configuredAnnualDir)) {
            configuredTargetDirs.push(configuredAnnualDir);
        }
    }

    const MONTH_FOLDERS = {
        'April': '01 - April', 'May': '02 - May', 'June': '03 - June',
        'July': '04 - July', 'August': '05 - August', 'September': '06 - September',
        'October': '07 - October', 'November': '08 - November', 'December': '09 - December',
        'January': '10 - January', 'February': '11 - February', 'March': '12 - March'
    };

    const getMonth2bDir = (periodStr) => {
        if (!configuredClientDir) return null;
        const monthMatch = (periodStr || '').match(/^([A-Za-z]+)/);
        const mName = monthMatch ? monthMatch[1] : 'April';
        const mFolder = MONTH_FOLDERS[mName] || `01 - ${mName}`;
        const dir = path.join(configuredClientDir, targetFy, mFolder, '2B');
        if (!fs.existsSync(dir)) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        }
        return dir;
    };

    let capturedExcelPath = null;
    let capturedJsonPath = null;
    let parsedInvoices = null;
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

        const launchRes = await launchAutopilotBrowser(chromiumModule.chromium, browserLaunchOptions);
        browser = launchRes.browser;
        if (browserState) browserState.current = browser;

        context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            acceptDownloads: true
        });

        page = await context.newPage();

        // Close browser cleanly if user aborts HTTP request or abortSignal triggers
        if (abortSignal) {
            abortSignal.addEventListener('abort', async () => {
                console.log('[GSTR-2B Autopilot] Abort signal triggered, closing browser...');
                if (browser) await killBrowserWithPidFallback(browser);
                if (browserState) browserState.current = null;
            }, { once: true });
        } else if (res) {
            res.on('close', async () => {
                if (!res.writableEnded && browser && !parsedInvoices) {
                    console.log('[Autopilot] Client disconnected, closing browser');
                    await killBrowserWithPidFallback(browser);
                    if (browserState) browserState.current = null;
                }
            });
        }

        let browserPid = null;
        try {
            const cdp = await browser.newBrowserCDPSession();
            const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
            browserPid = processInfo.find(x => x.type === 'browser')?.id || null;
            if (browserPid) console.log('[GSTR-2B Autopilot] Detected Chrome Browser PID:', browserPid);
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

        // ─── Set up Download Event listener for GSTR-2B ───────
        const activeGstr2bDownloadPromises = new Set();
        page.on('download', (download) => {
            const dlTask = (async () => {
                try {
                    const originalName = download.suggestedFilename();
                    console.log(`[GSTR-2B Autopilot] Download detected: ${originalName}`);
                    const savePath = path.join(downloadDir, `${Date.now()}_${originalName}`);
                    await download.saveAs(savePath);
                    console.log(`[GSTR-2B Autopilot] Saved file (${fs.existsSync(savePath) ? fs.statSync(savePath).size : 0} bytes) to: ${savePath}`);

                    // Synchronize downloaded file to Configured Settings Folders
                    const activeMonthDir = getMonth2bDir(activeSyncPeriod);
                    const allTargetDirs = [...configuredTargetDirs];
                    if (activeMonthDir && !allTargetDirs.includes(activeMonthDir)) {
                        allTargetDirs.push(activeMonthDir);
                    }

                    for (const tDir of allTargetDirs) {
                        try {
                            if (!fs.existsSync(tDir)) fs.mkdirSync(tDir, { recursive: true });
                            const destFile = path.join(tDir, `${Date.now()}_${originalName}`);
                            fs.copyFileSync(savePath, destFile);
                            console.log(`[GSTR-2B Autopilot] Synced download to Settings folder: ${destFile}`);
                        } catch (cpErr) {
                            console.warn(`[GSTR-2B Autopilot] Copy error to ${tDir}:`, cpErr.message);
                        }
                    }

                    // Also save a clean copy in user's Windows Downloads folder
                    try {
                        const userDl = path.join(os.homedir(), 'Downloads', originalName);
                        fs.copyFileSync(savePath, userDl);
                        console.log(`[GSTR-2B Autopilot] Clean copy saved to Downloads: ${userDl}`);
                    } catch {}

                    const lower = originalName.toLowerCase();

                    // Dedicated GSTR-2B download handling
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
                } catch (err) {
                    console.error('[GSTR-2B Autopilot] Error saving download:', err);
                }
            })();
            activeGstr2bDownloadPromises.add(dlTask);
            dlTask.finally(() => activeGstr2bDownloadPromises.delete(dlTask));
        });

        // Navigate to GST Portal Login
        console.log(`[GSTR-2B Autopilot] Navigating to GST login...`);
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.bringToFront().catch(() => {});
        focusDesktopWindow();

        // Auto-fill Username & Password
        try {
            await page.waitForSelector('#username, input[name="user_name"]', { timeout: 15000 });
            if (portalUser) {
                console.log(`[GSTR-2B Autopilot] Auto-filling username: ${portalUser}`);
                await page.fill('#username', portalUser);
                await page.evaluate((u) => {
                    const el = document.querySelector('#username') || document.querySelector('input[name="user_name"]');
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
                console.log('[GSTR-2B Autopilot] Auto-filling password...');
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
                    console.log('[GSTR-2B Autopilot] Password auto-filled successfully');
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
            console.log('[GSTR-2B Autopilot] Notice on login inputs:', e.message);
        }

        // Inject assistive banner (wrapped in try/catch so DOM styling never blocks login flow)
        try {
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
        } catch (bannerErr) {
            console.warn('[GSTR-2B Autopilot] Non-fatal banner notice:', bannerErr.message);
        }

        // Wait for user login (URL leaves /login, 180s timeout)
        console.log('[GSTR-2B Autopilot] Waiting for user to complete login...');
        try {
            await page.waitForFunction(() => {
                const url = window.location.href;
                const isAuth = url.includes('/auth/') || url.includes('/dashboard') || url.includes('/quicklinks/') || url.includes('/returns/');
                const isNotLogin = !url.includes('/login');
                const hasNoInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
                const hasLogout = Boolean(document.querySelector('a[href*="logout"], [ng-click*="logout"], .user-name, #navbar-usr-menu, li.dropdown.user'));
                return (isAuth && isNotLogin) || (isNotLogin && hasNoInputs) || hasLogout;
            }, null, { timeout: 180000, polling: 100 });
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

        // Auto-dismiss common GST portal popups (Instant DOM evaluation < 2ms, zero timeout lag)
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
        if (!targetFy) targetFy = '2026-27';

        console.log(`[GSTR-2B Autopilot] Target Filing Period: Month=${targetMonth}, FY=${targetFy}`);

        await updateBanner(`Navigating to Returns Dashboard for ${targetMonth} ${targetFy}...`);
        await page.waitForTimeout(100);
        await dismissPopups();

        // Helper to navigate from Returns Quick Links to Return Dashboard via authentic in-page native click
        // STRICT ZERO URL PUSH: Direct page.goto or window.location.href to return.gst.gov.in triggers "Access Denied" by GSTN WAF.
        const clickReturnsDashboardInPage = async () => {
            console.log('[GSTR-2B Autopilot] ⚡ Navigating from Quick Links to Returns Dashboard via native click...');
            try {
                // Priority 1: Native Playwright click on the card/tile/button
                const dashTile = page.locator('div.card, div.panel, div.box, a, button, div[class*="card"], div[class*="box"]')
                    .filter({ hasText: /returns dashboard|file returns/i })
                    .first();
                if (await dashTile.isVisible({ timeout: 1200 }).catch(() => false)) {
                    await dashTile.scrollIntoViewIfNeeded().catch(() => {});
                    await dashTile.click({ force: true }).catch(() => {});
                    console.log('[GSTR-2B Autopilot] ✓ Clicked Returns Dashboard tile natively with Playwright');
                } else {
                    // Fallback to direct anchor link
                    const dashLink = page.locator('a[href*="returns/auth/dashboard"], a[href*="returns.gst.gov.in"]').first();
                    if (await dashLink.isVisible({ timeout: 800 }).catch(() => false)) {
                        await dashLink.click({ force: true }).catch(() => {});
                        console.log('[GSTR-2B Autopilot] ✓ Clicked Returns Dashboard anchor link');
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
                        console.log('[GSTR-2B Autopilot] ✓ Landed on Returns Dashboard with select dropdowns ready!');
                        return true;
                    }
                } catch(e) {}
                await page.waitForTimeout(150);
            }
            return false;
        };

        // Helper to guarantee the page is on the File Returns / Search screen with dropdowns
        const ensureReturnsSearchScreen = async (timeoutMs = 25000) => {
            const startWait = Date.now();
            while (Date.now() - startWait < timeoutMs) {
                if (page.isClosed()) return false;
                await dismissPopups();

                const curUrl = page.url();

                // 1. If already on Returns Dashboard and select dropdowns are visible, we are ready!
                try {
                    const selectCount = await page.locator('select').count();
                    if (selectCount >= 2) {
                        return true;
                    }
                } catch(e) {}

                // 2. UNCONDITIONAL ON-SCREEN BACK CLICK:
                // If select dropdowns are not present, check if an on-screen BACK button is visible (Download page, Inward page, etc.)
                // Target strictly button / input[type="button"] / a.btn, excluding navbars and breadcrumbs
                try {
                    const backSelectors = [
                        'button:text-is("BACK")',
                        'input[value="BACK" i]',
                        'button:text-is("Back")',
                        'input[value="Back" i]',
                        'button.btn:has-text("BACK")',
                        'input.btn[value="BACK" i]',
                        'button:has-text("BACK")',
                        'input[type="button"][value*="BACK" i]'
                    ];

                    let backClicked = false;
                    for (const sel of backSelectors) {
                        try {
                            const loc = page.locator(sel).first();
                            if (await loc.isVisible({ timeout: 350 }).catch(() => false)) {
                                await loc.scrollIntoViewIfNeeded().catch(() => {});
                                await loc.click({ force: true }).catch(() => {});
                                console.log(`[GSTR-2B Autopilot] ensureReturnsSearchScreen: Clicked BACK button via: ${sel}`);
                                backClicked = true;
                                break;
                            }
                        } catch(e) {}
                    }

                    if (!backClicked) {
                        backClicked = await page.evaluate(() => {
                            const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
                            const b = candidates.find(el => {
                                if (el.closest('header, nav, .navbar, .breadcrumb, footer')) return false;
                                const val = (el.value || el.innerText || el.textContent || '').trim().toUpperCase();
                                return val === 'BACK';
                            });
                            if (b) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                if (window.angular) {
                                    try {
                                        window.angular.element(b).triggerHandler('click');
                                        const sc = window.angular.element(b).scope();
                                        if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                    } catch(e) {}
                                }
                                return true;
                            }
                            return false;
                        }).catch(() => false);
                    }

                    if (backClicked) {
                        try {
                            await page.waitForSelector('select', { timeout: 8000 });
                            await dismissPopups();
                            if (await page.locator('select').count() >= 2) {
                                console.log('[GSTR-2B Autopilot] ✓ Clicked BACK: Returns Dashboard search dropdowns ready!');
                                return true;
                            }
                        } catch(e) {}
                        continue;
                    }
                } catch(e) {}

                // 3. If on Returns Quick Links screen -> Click Returns Dashboard tile with native click
                if (curUrl.includes('quicklinks/returns') || curUrl.includes('/quicklinks')) {
                    console.log('[GSTR-2B Autopilot] Detected Returns Quick Links screen. Clicking Returns Dashboard tile natively...');
                    if (await clickReturnsDashboardInPage()) {
                        return true;
                    }
                    continue;
                }

                // 4. Check for RETURN DASHBOARD / File Returns button on dashboard home page
                try {
                    const retDashBtn = page.locator('button:has-text("RETURN DASHBOARD"), button:has-text("File Returns"), a:has-text("RETURN DASHBOARD"), a:has-text("File Returns")').first();
                    if (await retDashBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                        console.log('[GSTR-2B Autopilot] Clicking RETURN DASHBOARD button on dashboard...');
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
                        console.log('[GSTR-2B Autopilot] Clicking Return Dashboard breadcrumb...');
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

            // Helper to immediately click on-screen BACK button to return to search dashboard
            const clickBackImmediately = async () => {
                try {
                    console.log('[GSTR-2B Autopilot] Navigating BACK to returns search dashboard...');

                    // 1. If already on Returns Dashboard and select dropdowns are visible, we're ready!
                    const curSelectCount = await page.locator('select').count().catch(() => 0);
                    if (curSelectCount >= 2 && !page.url().includes('offlinedl')) {
                        console.log('[GSTR-2B Autopilot] Already on returns search dashboard.');
                        return true;
                    }

                    // 2. Click official on-screen BACK button via Playwright native locators
                    const backSelectors = [
                        'button:text-is("BACK")',
                        'input[value="BACK" i]',
                        'button:text-is("Back")',
                        'input[value="Back" i]',
                        'button.btn:has-text("BACK")',
                        'input.btn[value="BACK" i]',
                        'button:has-text("BACK")',
                        'input[type="button"][value*="BACK" i]'
                    ];

                    let clicked = false;
                    for (const sel of backSelectors) {
                        try {
                            const loc = page.locator(sel).first();
                            if (await loc.isVisible({ timeout: 400 }).catch(() => false)) {
                                await loc.scrollIntoViewIfNeeded().catch(() => {});
                                await loc.click({ force: true }).catch(() => {});
                                console.log(`[GSTR-2B Autopilot] ✓ Clicked on-screen BACK button via: ${sel}`);
                                clicked = true;
                                break;
                            }
                        } catch(e) {}
                    }

                    // 3. Fallback to DOM evaluate if Playwright locator didn't fire
                    if (!clicked) {
                        clicked = await page.evaluate(() => {
                            const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
                            const b = candidates.find(el => {
                                if (el.closest('header, nav, .navbar, .breadcrumb, footer')) return false;
                                const val = (el.value || el.innerText || el.textContent || '').trim().toUpperCase();
                                return val === 'BACK';
                            });
                            if (b) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                if (window.angular) {
                                    try {
                                        window.angular.element(b).triggerHandler('click');
                                        const sc = window.angular.element(b).scope();
                                        if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                    } catch(e) {}
                                }
                                return true;
                            }
                            return false;
                        }).catch(() => false);
                        if (clicked) {
                            console.log('[GSTR-2B Autopilot] ✓ Clicked on-screen BACK button via DOM evaluate');
                        }
                    }

                    // 4. Actively wait up to 5s for the page to navigate back to /returns/auth/dashboard
                    const waitBackStart = Date.now();
                    while (Date.now() - waitBackStart < 5000) {
                        if (page.isClosed()) break;
                        const u = page.url();
                        const selects = await page.locator('select').count().catch(() => 0);
                        if (!u.includes('offlinedl') && (selects >= 2 || u.includes('/dashboard'))) {
                            console.log('[GSTR-2B Autopilot] ✓ Landed back on returns search dashboard!');
                            return true;
                        }
                        await page.waitForTimeout(200);
                    }

                    // 5. If STILL on offlinedl after 5s, fallback to breadcrumb or window.history.back()
                    if (page.url().includes('offlinedl')) {
                        console.log('[GSTR-2B Autopilot] Still on download page, attempting breadcrumb / history.back()...');
                        try {
                            const retBreadcrumb = page.locator('.breadcrumb a').filter({ hasText: /Return/i }).first();
                            if (await retBreadcrumb.isVisible({ timeout: 600 }).catch(() => false)) {
                                await retBreadcrumb.click({ force: true }).catch(() => {});
                            } else {
                                await page.evaluate(() => window.history.back()).catch(() => {});
                            }
                        } catch(e) {}
                        await page.waitForTimeout(800);
                    }

                    return true;
                } catch(e) {
                    console.error('[GSTR-2B Autopilot] Error in clickBackImmediately:', e.message);
                    return false;
                }
            };

            // Inspect GSTR-2B offline download page: distinguish ready download vs generate request
            const inspection = await page.evaluate(() => {
                const allElements = Array.from(document.querySelectorAll('a, button, input[type="button"]'));

                // 1. Direct ready download link (Excel or JSON or Zip)
                // Strictly exclude any button or link containing "GENERATE"
                const readyLink = allElements.find(el => {
                    const t = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
                    if (t.includes('generate')) return false;
                    return (t.includes('click here') || t.includes('download') || t.includes('file 1')) &&
                           (t.includes('excel') || t.includes('json') || t.includes('.xlsx') || t.includes('.zip') || t.includes('click here'));
                });
                if (readyLink) {
                    readyLink.click();
                    return { type: 'ready_download', text: readyLink.innerText || readyLink.textContent };
                }

                // 2. Table cell download link (often generated xlsx link)
                const tblLink = document.querySelector('table tr td a, .table a');
                if (tblLink) {
                    const t = (tblLink.innerText || tblLink.textContent || '').trim().toLowerCase();
                    if (!t.includes('generate')) {
                        tblLink.click();
                        return { type: 'table_download', text: tblLink.innerText };
                    }
                }

                // 3. Check if Generate button is present
                const genBtn = allElements.find(el => {
                    const t = (el.innerText || el.textContent || el.value || '').trim().toUpperCase();
                    return t.includes('GENERATE EXCEL') || t.includes('GENERATE JSON');
                });
                if (genBtn) {
                    return { type: 'generate_needed', text: genBtn.innerText || genBtn.value };
                }

                // 4. Check if 20-min processing banner is visible
                const bodyText = (document.body?.innerText || '').toUpperCase();
                if (bodyText.includes('20 MINUTES') || bodyText.includes('REQUEST HAS BEEN ACCEPTED') || bodyText.includes('IS IN PROGRESS')) {
                    return { type: 'already_requested' };
                }

                return { type: 'none' };
            });

            console.log(`[GSTR-2B Autopilot] Download page inspection for ${currentPeriodStr}:`, JSON.stringify(inspection));

            // Case A: If GENERATE buttons are present, click BOTH GENERATE JSON and GENERATE EXCEL natively
            if (inspection.type === 'generate_needed') {
                console.log(`[GSTR-2B Autopilot] Clicking both 'GENERATE JSON' and 'GENERATE EXCEL' for ${currentPeriodStr}...`);

                // 1. Click GENERATE JSON FILE TO DOWNLOAD
                try {
                    const genJsonLoc = page.locator('button, input[type="button"]').filter({ hasText: /GENERATE JSON/i }).first();
                    if (await genJsonLoc.isVisible({ timeout: 1200 }).catch(() => false)) {
                        await genJsonLoc.scrollIntoViewIfNeeded().catch(() => {});
                        await genJsonLoc.click({ force: true }).catch(() => {});
                        console.log(`[GSTR-2B Autopilot] ✓ Clicked 'GENERATE JSON FILE TO DOWNLOAD' natively for ${currentPeriodStr}`);
                    } else {
                        await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, input[type="button"]'));
                            const b = btns.find(el => (el.innerText || el.value || '').toUpperCase().includes('GENERATE JSON'));
                            if (b) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                if (window.angular) {
                                    try {
                                        window.angular.element(b).triggerHandler('click');
                                        const sc = window.angular.element(b).scope();
                                        if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                    } catch(e) {}
                                }
                            }
                        });
                    }
                } catch(e) {}

                await page.waitForTimeout(600);
                await dismissPopups();

                // 2. Click GENERATE EXCEL FILE TO DOWNLOAD
                try {
                    const genExcelLoc = page.locator('button, input[type="button"]').filter({ hasText: /GENERATE EXCEL/i }).first();
                    if (await genExcelLoc.isVisible({ timeout: 1200 }).catch(() => false)) {
                        await genExcelLoc.scrollIntoViewIfNeeded().catch(() => {});
                        await genExcelLoc.click({ force: true }).catch(() => {});
                        console.log(`[GSTR-2B Autopilot] ✓ Clicked 'GENERATE EXCEL FILE TO DOWNLOAD' natively for ${currentPeriodStr}`);
                    } else {
                        await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, input[type="button"]'));
                            const b = btns.find(el => (el.innerText || el.value || '').toUpperCase().includes('GENERATE EXCEL'));
                            if (b) {
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                if (window.angular) {
                                    try {
                                        window.angular.element(b).triggerHandler('click');
                                        const sc = window.angular.element(b).scope();
                                        if (sc && !sc.$$phase && !sc.$root.$$phase) sc.$apply();
                                    } catch(e) {}
                                }
                            }
                        });
                    }
                } catch(e) {}

                await page.waitForTimeout(800);
                await dismissPopups();

                console.log(`[GSTR-2B Autopilot] Both JSON and Excel generation requested for ${currentPeriodStr} (GSTN ~20 min window). Recording REQUESTED.`);
                await markGstr2bMonthRequested(db, gstinUpper, currentPeriodStr);
                await updateBanner(`[${currentPeriodStr}] JSON + Excel generation requested (20-min window). Returning to search...`, '#f59e0b');

                await clickBackImmediately();
                return { count: 0, status: 'REQUESTED', excelPath: null, jsonPath: null, metrics: null, requestedAt: Date.now() };
            }

            // Case B: If generation is already in progress (20-min window)
            if (inspection.type === 'already_requested') {
                console.log(`[GSTR-2B Autopilot] File generation already in progress for ${currentPeriodStr} (20-min window). Recording REQUESTED.`);
                await markGstr2bMonthRequested(db, gstinUpper, currentPeriodStr);
                await updateBanner(`[${currentPeriodStr}] Generation in progress (20-min window). Returning to search...`, '#f59e0b');
                await clickBackImmediately();
                return { count: 0, status: 'REQUESTED', excelPath: null, jsonPath: null, metrics: null, requestedAt: Date.now() };
            }

            // Case C: Ready download link exists - wait for download and parse invoices
            let curExcelPath = capturedExcelPath;
            let curJsonPath = capturedJsonPath;
            let curParsedInvoices = parsedInvoices;

            if (inspection.type === 'ready_download' || inspection.type === 'table_download') {
                try {
                    const readyLoc = page.locator('a, button').filter({ hasText: /click here|download/i }).filter({ hasNotText: /generate/i }).first();
                    if (await readyLoc.isVisible({ timeout: 800 }).catch(() => false)) {
                        await readyLoc.click({ force: true }).catch(() => {});
                    }
                } catch(e) {}

                const waitStart = Date.now();
                while (!curParsedInvoices && (Date.now() - waitStart < 15000)) {
                    if (page.isClosed()) break;
                    if (parsedInvoices) {
                        curParsedInvoices = parsedInvoices;
                        curExcelPath = capturedExcelPath;
                        curJsonPath = capturedJsonPath;
                        break;
                    }

                    // Check local scratch downloads directory, test directories, and all Configured Settings folders
                    const curMonthDir = getMonth2bDir(currentPeriodStr);
                    const candidateExtraDirs = ['D:\\test files', 'C:\\test files', 'E:\\test files'].filter(d => fs.existsSync(d));
                    const searchDirs = [downloadDir, curMonthDir, configuredAnnualDir, configuredCentralDir, ...candidateExtraDirs].filter(Boolean);

                    for (const sDir of searchDirs) {
                        if (curParsedInvoices) break;
                        if (!fs.existsSync(sDir)) continue;
                        const files = fs.readdirSync(sDir)
                            .map(f => {
                                const p = path.join(sDir, f);
                                let time = 0;
                                try { time = fs.statSync(p).mtimeMs; } catch(e) {}
                                return { name: f, path: p, time };
                            })
                            .filter(f => {
                                const l = f.name.toLowerCase();
                                const gLower = gstinUpper.toLowerCase();
                                const isClientFile = l.includes(gLower);
                                const isRecent = f.time >= (actionStartTime - 10000);
                                return isClientFile || isRecent;
                            })
                            .sort((a, b) => b.time - a.time);

                        for (const fItem of files) {
                            const fPath = fItem.path;
                            const lower = fItem.name.toLowerCase();
                            if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                                curExcelPath = fPath;
                                const r = parseGstr2bExcelHelper(fPath, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
                                    curParsedInvoices = r.invoices;
                                    break;
                                }
                            } else if (lower.endsWith('.json')) {
                                curJsonPath = fPath;
                                try {
                                    const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
                                    const r = parseGstr2bJsonHelper(raw, gstinUpper, currentPeriodStr);
                                    if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
                                        curParsedInvoices = r.invoices;
                                        break;
                                    }
                                } catch (e) {}
                            } else if (lower.endsWith('.zip')) {
                                const r = await parseGstr2bZipHelper(fPath, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
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
                                return (l.includes('2b') || l.includes('gstr2b') || l.includes('returns') || l.includes('r2b')) && (l.endsWith('.xlsx') || l.endsWith('.xls') || l.endsWith('.json') || l.endsWith('.zip'));
                            })
                            .map(f => {
                                const p = path.join(userDownloads, f);
                                let time = 0;
                                try { time = fs.statSync(p).mtimeMs; } catch(e) {}
                                return { name: f, path: p, time };
                            })
                            .filter(f => {
                                const l = f.name.toLowerCase();
                                const gLower = gstinUpper.toLowerCase();
                                const isClientFile = l.includes(gLower);
                                const isRecent = f.time >= (actionStartTime - 10000);
                                return isClientFile || isRecent;
                            })
                            .sort((a, b) => b.time - a.time);

                        for (const uItem of userFiles) {
                            if (curParsedInvoices) break;
                            const uPath = uItem.path;
                            const uLower = uItem.name.toLowerCase();
                            if (uLower.endsWith('.xlsx') || uLower.endsWith('.xls')) {
                                curExcelPath = uPath;
                                const r = parseGstr2bExcelHelper(uPath, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
                                    curParsedInvoices = r.invoices;
                                    break;
                                }
                            } else if (uLower.endsWith('.json')) {
                                curJsonPath = uPath;
                                try {
                                    const raw = JSON.parse(fs.readFileSync(uPath, 'utf8'));
                                    const r = parseGstr2bJsonHelper(raw, gstinUpper, currentPeriodStr);
                                    if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
                                        curParsedInvoices = r.invoices;
                                        break;
                                    }
                                } catch(e) {}
                            } else if (uLower.endsWith('.zip')) {
                                const r = await parseGstr2bZipHelper(uPath, gstinUpper, currentPeriodStr);
                                if (r && Array.isArray(r.invoices) && (!r.period || normalizeReturnPeriod(r.period) === normalizeReturnPeriod(currentPeriodStr))) {
                                    curParsedInvoices = r.invoices;
                                    break;
                                }
                            }
                        }
                    }

                    if (curParsedInvoices) break;
                    await page.waitForTimeout(250); // Fast 250ms polling
                }
            }

            if (curParsedInvoices && curParsedInvoices.length > 0) {
                console.log(`[GSTR-2B Autopilot] Persisting ${curParsedInvoices.length} invoices for ${currentPeriodStr}...`);
                const saveRes = await bulkSaveGstr2bInvoices(db, gstinUpper, currentPeriodStr, curParsedInvoices, curExcelPath, curJsonPath);
                await clickBackImmediately();
                return { count: curParsedInvoices.length, status: 'SYNCED', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: saveRes.metrics };
            }

            const isRequested20Min = await page.evaluate(() => {
                const text = (document.body?.innerText || '').toUpperCase();
                return text.includes('20 MINUTES') || text.includes('REQUEST HAS BEEN ACCEPTED') || text.includes('IS IN PROGRESS');
            }).catch(() => false);

            if (isRequested20Min) {
                console.log(`[GSTR-2B Autopilot] File generation in progress for ${currentPeriodStr} (20-min window). Recording REQUESTED.`);
                await markGstr2bMonthRequested(db, gstinUpper, currentPeriodStr);
                await clickBackImmediately();
                return { count: 0, status: 'REQUESTED', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: null, requestedAt: Date.now() };
            }

            if (isPortalConfirmedNil || (curParsedInvoices && curParsedInvoices.length === 0 && (curExcelPath || curJsonPath))) {
                console.log(`[GSTR-2B Autopilot] Confirmed Nil Return for ${currentPeriodStr} (0 invoices). Recording NIL_SYNCED.`);
                await markGstr2bMonthNilSynced(db, gstinUpper, currentPeriodStr, curExcelPath, curJsonPath);
                await clickBackImmediately();
                return { count: 0, status: 'NIL_SYNCED', excelPath: curExcelPath, jsonPath: curJsonPath, metrics: null };
            }

            console.log(`[GSTR-2B Autopilot] Download timed out or unconfirmed for ${currentPeriodStr}. Preserving existing database records.`);
            await clickBackImmediately();
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

                // Synchronize consolidated 12-month Excel to all Configured Settings Folders
                for (const tDir of configuredTargetDirs) {
                    try {
                        if (!fs.existsSync(tDir)) fs.mkdirSync(tDir, { recursive: true });
                        const destCons = path.join(tDir, `GSTR2B_SectionWiseSummary_${gstinUpper}_${cleanFy}.xlsx`);
                        XLSX.writeFile(wb, destCons);
                        console.log(`[Full Year 2B] Saved consolidated Excel to Settings folder: ${destCons}`);
                    } catch (cpErr) {
                        console.warn(`[Full Year 2B] Error copying consolidated Excel to ${tDir}:`, cpErr.message);
                    }
                }
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

            if (activeGstr2bDownloadPromises.size > 0) {
                console.log(`[GSTR-2B Autopilot] Waiting for ${activeGstr2bDownloadPromises.size} active download stream(s) to finish saving...`);
                await Promise.race([
                    Promise.all(Array.from(activeGstr2bDownloadPromises)),
                    new Promise(resolve => setTimeout(resolve, 15000))
                ]);
            }

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
            } else if (dlRes.status === 'REQUESTED') {
                await updateBanner(`[${returnPeriod}] Excel generation requested on GST Portal (20-min window). Closing in 2s...`, '#f59e0b');
                await page.waitForTimeout(2000);

                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;

                return res.json({
                    success: true,
                    message: `Excel generation requested on GST Portal for ${gstinUpper} (${returnPeriod}). Portal requires ~20 minutes to compile.`,
                    gstin: gstinUpper,
                    period: returnPeriod,
                    status: 'REQUESTED',
                    invoiceCount: 0,
                    excelPath: null,
                    jsonPath: null
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
export async function openPortalLoginHelper({ db, gstin, portal_username, portal_password, browserState }) {
    const gstinUpper = (gstin || '').trim().toUpperCase();

    // 1. Fetch credentials from clients table (with trimmed uppercase lookup)
    let portalUser = (portal_username || '').trim();
    let portalPass = (portal_password || '').trim();
    let clientName = '';

    const clientRow = await new Promise((resolve) => {
        db.get(`SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE UPPER(TRIM(gstin)) = ? OR UPPER(TRIM(id)) = ?`, [gstinUpper, gstinUpper], (err, row) => {
            resolve(row || null);
        });
    });

    if (clientRow) {
        if (!portalUser && clientRow.portal_username) {
            portalUser = String(clientRow.portal_username).trim();
        }
        if (!portalPass && clientRow.portal_password) {
            portalPass = decryptSecret(String(clientRow.portal_password).trim());
        }
        clientName = clientRow.trade_name || clientRow.legal_name || gstinUpper;
    }

    console.log(`[Quick Login] Launching browser for ${clientName} (${gstinUpper}) - Username: ${portalUser || '(NOT CONFIGURED)'}, Password: ${portalPass ? '******' : '(NOT CONFIGURED)'}`);

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

    const launchRes = await launchAutopilotBrowser(chromiumModule.chromium, browserLaunchOptions);
    let browser = launchRes.browser;

    if (browserState) {
        browserState.current = browser;
    }

    const userDownloadsDir = path.join(os.homedir(), 'Downloads');

    const context = await browser.newContext({
        viewport: null,
        acceptDownloads: true
    });

    const bindPageDownloads = async (targetPage) => {
        try {
            const session = await context.newCDPSession(targetPage);
            await session.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: userDownloadsDir
            });
        } catch (cdpErr) {}

        targetPage.on('download', async (download) => {
            try {
                const originalName = download.suggestedFilename();
                console.log(`[Launch Portal] Saving manual download to Downloads: ${originalName}`);
                const destPath = path.join(userDownloadsDir, originalName);
                await download.saveAs(destPath);
                console.log(`[Launch Portal] Successfully saved download to: ${destPath}`);
            } catch (err) {
                console.warn('[Launch Portal] Download save error:', err.message);
            }
        });
    };

    const page = await context.newPage();
    await bindPageDownloads(page);
    context.on('page', (newPage) => {
        bindPageDownloads(newPage);
    });

    // Navigate to GST Portal login
    await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(1500);

    // Auto-fill Username
    if (portalUser) {
        try {
            const uSelector = '#username';
            await page.waitForSelector(uSelector, { state: 'visible', timeout: 15000 });
            const uInput = page.locator(uSelector).first();
            if (await uInput.isVisible({ timeout: 5000 }).catch(() => false)) {
                await uInput.click();
                await page.waitForTimeout(100);
                await uInput.fill('');
                await uInput.pressSequentially(portalUser, { delay: 25 });
                await uInput.evaluate((el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        const ngEl = window.angular.element(el);
                        const ngModel = ngEl.controller('ngModel');
                        if (ngModel) {
                            ngModel.$setViewValue(val);
                            ngModel.$render();
                        }
                        const scope = ngEl.scope();
                        if (scope && scope.lform) {
                            scope.lform.username = val;
                            scope.$apply();
                        }
                    }
                }, portalUser);
                console.log(`[Quick Login] Username auto-filled: ${portalUser}`);
            }
        } catch(e) {
            console.warn('[Quick Login] Warning on username auto-fill:', e.message);
        }
    }

    // Await deliberate delay so Angular processes username and enables the password field
    await page.waitForTimeout(1000);

    // Auto-fill Password
    if (portalPass) {
        try {
            console.log(`[Quick Login] Auto-filling password for ${clientName}...`);
            const pInput = page.locator('#user_pass').first();
            await pInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
            if (await pInput.isVisible({ timeout: 5000 }).catch(() => false)) {
                await pInput.click();
                await page.waitForTimeout(100);
                await pInput.fill('');
                await pInput.pressSequentially(portalPass, { delay: 35 });
                await pInput.evaluate((el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        const ngEl = window.angular.element(el);
                        const ngModel = ngEl.controller('ngModel');
                        if (ngModel) {
                            ngModel.$setViewValue(val);
                            ngModel.$render();
                        }
                        const scope = ngEl.scope();
                        if (scope && scope.lform) {
                            scope.lform.password = val;
                            scope.$apply();
                        }
                    }
                }, portalPass);

                const pVal = await pInput.inputValue().catch(() => '');
                if (pVal !== portalPass) {
                    await pInput.fill(portalPass);
                }
                console.log(`[Quick Login] Password auto-filled successfully (${portalPass.length} chars) for ${clientName}`);
            } else {
                // Secondary fallback via visible DOM query
                await page.evaluate((passVal) => {
                    const passInputs = Array.from(document.querySelectorAll('input[type="password"]'));
                    const visibleInput = passInputs.find(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                    }) || document.getElementById('user_pass');
                    if (visibleInput) {
                        visibleInput.value = passVal;
                        visibleInput.dispatchEvent(new Event('input', { bubbles: true }));
                        visibleInput.dispatchEvent(new Event('change', { bubbles: true }));
                        visibleInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, portalPass);
                console.log(`[Quick Login] Password auto-filled via visible DOM query fallback`);
            }
        } catch(e) {
            console.warn('[Quick Login] Warning on password auto-fill:', e.message);
        }
    } else {
        console.warn(`[Quick Login] No password available in vault for client ${gstinUpper}`);
    }

    await page.waitForTimeout(1000);

    // Focus CAPTCHA field
    try {
        const captchaSelector = '#captcha, input[name="captcha"], input[placeholder*="characters" i]';
        await page.waitForSelector(captchaSelector, { state: 'visible', timeout: 6000 }).catch(() => {});
        const captchaInput = page.locator(captchaSelector).first();
        if (await captchaInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await captchaInput.click();
            await captchaInput.focus();
        }
    } catch (e) {}

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
/*! javascript-obfuscator:enable */



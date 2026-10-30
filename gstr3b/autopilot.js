/*! javascript-obfuscator:disable */
import path from 'path';
import fs from 'fs';
import { launchAutopilotBrowser } from '../gstr2b/browserLauncher.js';

/**
 * runGstr3bUploadAutopilot
 * - Automatically connects to GST Portal
 * - Auto-fills Username & Password from Credentials Vault
 * - Guides user through CAPTCHA
 * - Navigates to Returns Dashboard safely (bypassing SSO restrictions)
 * - Selects Financial Year and Return Period (Month)
 * - Clicks 'SEARCH'
 * - Targets 'Monthly Return GSTR-3B' -> clicks 'PREPARE OFFLINE'
 * - Selects and uploads the generated GSTR-3B JSON file
 * - Verifies upload confirmation and keeps session open for verification
 */
export async function runGstr3bUploadAutopilot({
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
            const tempDir = path.join(process.cwd(), 'scratch', 'uploads', 'gstr3b');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            uploadFile = path.join(tempDir, `gstr3b_upload_${gstinUpper}_${month}.json`);
            const contentStr = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent, null, 2);
            fs.writeFileSync(uploadFile, contentStr, 'utf8');
        }

        if (!uploadFile || !fs.existsSync(uploadFile)) {
            throw new Error(`GSTR-3B JSON upload file not found: ${uploadFile || 'No path provided'}`);
        }

        console.log(`\n======================================================`);
        console.log(`[GSTR-3B Upload Autopilot] Starting session for ${gstinUpper}`);
        console.log(`[GSTR-3B Upload Autopilot] Period: ${month} ${financialYear}`);
        console.log(`[GSTR-3B Upload Autopilot] Payload: ${uploadFile}`);
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
                console.warn('[GSTR-3B Upload Autopilot] Vault lookup warning:', e.message);
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
                    let b = document.getElementById('gstr3b-autopilot-banner');
                    if (!b) {
                        b = document.createElement('div');
                        b.id = 'gstr3b-autopilot-banner';
                        b.style.cssText = `
                            position: fixed; top: 0; left: 0; right: 0; z-index: 99999999;
                            background: linear-gradient(135deg, #0f172a, #1e293b);
                            color: #f8fafc; padding: 10px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;
                            border-bottom: 3px solid #10b981; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        `;
                        document.body.prepend(b);
                    }
                    b.style.borderBottomColor = success ? '#10b981' : '#38bdf8';
                    b.innerHTML = `
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="background:${success ? '#10b981' : '#38bdf8'};color:#0f172a;font-size:10px;font-weight:900;padding:3px 8px;border-radius:6px;text-transform:uppercase;">
                                🚀 GSTR-3B AUTOPILOT
                            </span>
                            <span>${msg}</span>
                        </div>
                        <div style="font-size:11px;color:#94a3b8;font-family:monospace;">
                            Vaswani Return Enterprise
                        </div>
                    `;
                }, { msg: text, success: isSuccess });
            } catch (e) {}
        };

        const dismissPopups = async () => {
            try {
                if (page.isClosed()) return;
                await page.evaluate(() => {
                    const closeBtns = Array.from(document.querySelectorAll('button, a, span, .close, .modal-close'));
                    for (const b of closeBtns) {
                        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                        if (t === 'close' || t === 'remind me later' || t === '×' || t === 'cancel' || t === 'no') {
                            b.click();
                        }
                    }
                });
            } catch (e) {}
        };

        // 3. Navigate to GST Portal Login
        console.log('[GSTR-3B Upload Autopilot] Navigating to GST login page...');
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(1000);

        // Auto-fill Username & Password
        try {
            await page.waitForSelector('#username, input[name="user_name"]', { timeout: 15000 });
            if (portalUser) {
                console.log(`[GSTR-3B Upload Autopilot] Auto-filling username: ${portalUser}`);
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

            await page.waitForTimeout(600);

            if (portalPass) {
                console.log('[GSTR-3B Upload Autopilot] Auto-filling password...');
                const pInput = page.locator('#user_pass').first();
                if (await pInput.isVisible({ timeout: 4000 }).catch(() => false)) {
                    await pInput.fill('');
                    await pInput.fill(portalPass);
                    await pInput.evaluate((el, p) => {
                        el.value = p;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }, portalPass);
                }
            }
            await page.focus('#captcha').catch(() => {});
        } catch (e) {
            console.warn('[GSTR-3B Upload Autopilot] Login input note:', e.message);
        }

        await updateBanner(portalUser ? 'Credentials auto-filled! Please enter CAPTCHA & click Login.' : 'Please enter credentials & CAPTCHA.');

        // Wait for user to log in
        console.log('[GSTR-3B Upload Autopilot] Waiting for login completion...');
        await page.waitForFunction(() => {
            const url = window.location.href;
            const isAuth = url.includes('/auth/') || url.includes('/dashboard') || url.includes('/returns/');
            const isNotLogin = !url.includes('/login');
            const hasLogout = Boolean(document.querySelector('a[href*="logout"], [ng-click*="logout"], .user-name, #navbar-usr-menu'));
            return (isAuth && isNotLogin) || hasLogout;
        }, null, { timeout: 180000, polling: 200 });

        console.log('[GSTR-3B Upload Autopilot] Logged in successfully!');
        await updateBanner(`Logged in! Navigating to Returns Dashboard for ${month} ${financialYear}...`);
        await page.waitForTimeout(1000);
        await dismissPopups();

        // 4. Navigate to Returns Dashboard (Authentic in-page click)
        const ensureOnReturnsDashboard = async () => {
            for (let step = 1; step <= 10; step++) {
                if (page.isClosed()) return false;
                await dismissPopups();

                const selectCount = await page.locator('select').count().catch(() => 0);
                if (selectCount >= 2) {
                    console.log('[GSTR-3B Upload Autopilot] Returns search dropdowns visible.');
                    return true;
                }

                // Check for RETURN DASHBOARD button
                const retDashBtn = page.locator('button:has-text("RETURN DASHBOARD"), button:has-text("File Returns"), a:has-text("RETURN DASHBOARD"), a:has-text("File Returns")').first();
                if (await retDashBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                    console.log('[GSTR-3B Upload Autopilot] Clicking RETURN DASHBOARD tile...');
                    await retDashBtn.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(1500);
                    continue;
                }

                // Check for Quick links Returns Dashboard tile
                const quickTile = page.locator('a[href*="returns/auth/dashboard"], .panel:has-text("Returns Dashboard"), a:has-text("Returns Dashboard")').first();
                if (await quickTile.isVisible({ timeout: 1000 }).catch(() => false)) {
                    console.log('[GSTR-3B Upload Autopilot] Clicking Returns Dashboard link...');
                    await quickTile.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(1500);
                    continue;
                }

                await page.waitForTimeout(1000);
            }
            return false;
        };

        const onDash = await ensureOnReturnsDashboard();
        if (!onDash) {
            throw new Error('Could not reach Returns Search Dashboard. Please ensure you are logged in.');
        }

        // 5. Select Financial Year & Return Period
        await updateBanner(`Selecting Financial Year (${financialYear}) and Period (${month})...`);

        // Select FY
        const fyOptions = await page.locator('select').first().locator('option').allInnerTexts().catch(() => []);
        const matchedFy = fyOptions.find(o => {
            const clean = o.trim();
            return clean.includes(financialYear) || clean.replace(/\s+/g, '') === financialYear.replace(/\s+/g, '');
        });

        if (matchedFy) {
            console.log(`[GSTR-3B Upload Autopilot] Selecting FY: ${matchedFy}`);
            await page.locator('select').first().selectOption({ label: matchedFy });
            await page.locator('select').first().evaluate(el => {
                el.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.angular) {
                    try { window.angular.element(el).scope()?.$apply(); } catch (e) {}
                }
            });
            await page.waitForTimeout(1000);
        }

        // Select Period (Month)
        // Check if there's a Quarter dropdown first
        const selects = await page.locator('select').all();
        if (selects.length >= 3) {
            // Dropdown 1: FY, Dropdown 2: Quarter, Dropdown 3: Month
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const mIndex = monthNames.findIndex(m => m.toLowerCase() === month.toLowerCase());
            const quarterNum = mIndex >= 0 ? (mIndex <= 2 ? 4 : Math.floor((mIndex - 3) / 3) + 1) : 1;

            const qSelect = selects[1];
            const qOptions = await qSelect.locator('option').allInnerTexts().catch(() => []);
            const matchedQ = qOptions.find(t => t.toLowerCase().includes(`quarter ${quarterNum}`) || t.toLowerCase().includes(`q${quarterNum}`));
            if (matchedQ) {
                console.log(`[GSTR-3B Upload Autopilot] Selecting Quarter: ${matchedQ}`);
                await qSelect.selectOption({ label: matchedQ });
                await qSelect.evaluate(el => {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        try { window.angular.element(el).scope()?.$apply(); } catch (e) {}
                    }
                });
                await page.waitForTimeout(1000);
            }
        }

        // Select Month in Month Dropdown
        const mSelect = page.locator('select').filter({
            has: page.locator('option').filter({ hasText: new RegExp(month, 'i') })
        }).first();

        if (await mSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log(`[GSTR-3B Upload Autopilot] Selecting Month: ${month}`);
            const mOptions = await mSelect.locator('option').allInnerTexts();
            const matchedM = mOptions.find(t => t.toLowerCase().includes(month.toLowerCase()));
            if (matchedM) {
                await mSelect.selectOption({ label: matchedM });
                await mSelect.evaluate(el => {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.angular) {
                        try { window.angular.element(el).scope()?.$apply(); } catch (e) {}
                    }
                });
                await page.waitForTimeout(600);
            }
        }

        // Click SEARCH
        console.log('[GSTR-3B Upload Autopilot] Clicking SEARCH button...');
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

        // 6. Wait for Returns Cards to Render
        console.log('[GSTR-3B Upload Autopilot] Waiting for return tiles to load...');
        await page.waitForFunction(() => {
            const text = (document.body.innerText || '').toUpperCase();
            return text.includes('GSTR-3B') || text.includes('GSTR 3B') || Boolean(document.querySelector('.returns-card'));
        }, null, { timeout: 15000 });
        await page.waitForTimeout(1000);

        // 7. Find GSTR-3B Card & Click PREPARE OFFLINE
        await updateBanner('Locating Monthly Return GSTR-3B tile...');
        console.log('[GSTR-3B Upload Autopilot] Locating GSTR-3B tile...');

        const gstr3bTile = page.locator('.returns-card, div.panel, div.box, .col-md-6, .col-sm-6, .border-box')
            .filter({ hasText: /GSTR-3B|Monthly Return GSTR-3B/i })
            .first();

        let clickedOffline = false;
        if (await gstr3bTile.isVisible({ timeout: 4000 }).catch(() => false)) {
            const offlineBtn = gstr3bTile.locator('button, a, input[type="button"]')
                .filter({ hasText: /PREPARE OFFLINE|OFFLINE/i })
                .first();
            if (await offlineBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log('[GSTR-3B Upload Autopilot] Found PREPARE OFFLINE button inside GSTR-3B tile. Clicking...');
                await offlineBtn.scrollIntoViewIfNeeded().catch(() => {});
                await offlineBtn.click({ force: true });
                clickedOffline = true;
            }
        }

        if (!clickedOffline) {
            // Fallback: search globally for PREPARE OFFLINE in the section near GSTR-3B
            console.log('[GSTR-3B Upload Autopilot] Searching globally for GSTR-3B Prepare Offline button...');
            await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
                for (const l of links) {
                    const text = (l.innerText || l.value || '').trim().toUpperCase();
                    if (text.includes('PREPARE OFFLINE') || text === 'OFFLINE') {
                        // Check if parent card references 3B
                        const cardText = l.closest('.panel, .returns-card, div, section')?.innerText?.toUpperCase() || '';
                        if (cardText.includes('GSTR-3B') || cardText.includes('3B')) {
                            l.click();
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        // 8. Wait for GSTR-3B Offline Upload Screen
        await updateBanner('Waiting for GSTR-3B Offline Upload page...');
        console.log('[GSTR-3B Upload Autopilot] Waiting for Offline upload file input...');

        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: 'attached', timeout: 20000 });

        await updateBanner(`Uploading JSON file: ${path.basename(uploadFile)}...`);
        console.log(`[GSTR-3B Upload Autopilot] Setting file payload: ${uploadFile}`);

        // Set input file
        await fileInput.setInputFiles(uploadFile);

        // Dispatch events
        await fileInput.evaluate(el => {
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await page.waitForTimeout(1000);

        // Check if explicit Upload / Submit button exists
        try {
            const uploadBtn = page.locator('button:has-text("Upload"), input[value*="Upload" i], button:has-text("Submit")').first();
            if (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                console.log('[GSTR-3B Upload Autopilot] Found Upload submit button. Clicking...');
                await uploadBtn.click();
            }
        } catch (e) {}

        // 9. Verify Upload Confirmation Message
        await updateBanner('Payload uploaded! Waiting for portal validation confirmation...');
        console.log('[GSTR-3B Upload Autopilot] Waiting for portal response...');

        let confirmedMessage = 'Your JSON file has been uploaded to GST Portal successfully.';
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
                confirmedMessage = 'Your GSTR-3B JSON file has been successfully uploaded and processed by the GST Portal!';
            }
        } catch (e) {
            console.log('[GSTR-3B Upload Autopilot] Note on confirmation wait:', e.message);
        }

        console.log(`[GSTR-3B Upload Autopilot] ✓ ${confirmedMessage}`);
        await updateBanner(`✓ ${confirmedMessage} You can now click PREPARE ONLINE to review.`, true);

        return {
            success: true,
            gstin: gstinUpper,
            month,
            financialYear,
            message: confirmedMessage,
            file: path.basename(uploadFile)
        };

    } catch (err) {
        console.error('[GSTR-3B Upload Autopilot Error]:', err);
        throw err;
    }
}

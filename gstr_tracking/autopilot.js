import { exec } from 'child_process';
import { launchAutopilotBrowser } from '../gstr2b/browserLauncher.js';
import { decryptSecret } from '../cryptoVault.js';

/**
 * Normalizes portal date strings "15/05/2025" or "15-05-2025" to standard "YYYY-MM-DD".
 */
function normalizePortalDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    const parts = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (parts) {
        const day = parts[1].padStart(2, '0');
        const month = parts[2].padStart(2, '0');
        const year = parts[3];
        return `${year}-${month}-${day}`;
    }
    return clean;
}

/**
 * Maps any portal period string ("April", "042026", "Apr") to standard month key.
 */
function normalizeMonthKey(periodStr) {
    if (!periodStr) return '';
    const p = periodStr.trim().toLowerCase();
    const map = {
        'april': 'April', 'apr': 'April', '04': 'April',
        'may': 'May', '05': 'May',
        'june': 'June', 'jun': 'June', '06': 'June',
        'july': 'July', 'jul': 'July', '07': 'July',
        'august': 'August', 'aug': 'August', '08': 'August',
        'september': 'September', 'sep': 'September', 'sept': 'September', '09': 'September',
        'october': 'October', 'oct': 'October', '10': 'October',
        'november': 'November', 'nov': 'November', '11': 'November',
        'december': 'December', 'dec': 'December', '12': 'December',
        'january': 'January', 'jan': 'January', '01': 'January',
        'february': 'February', 'feb': 'February', '02': 'February',
        'march': 'March', 'mar': 'March', '03': 'March'
    };
    for (const [k, v] of Object.entries(map)) {
        if (p.includes(k)) return v;
    }
    return periodStr.trim();
}

/**
 * Calculates statutory due date for late fee evaluation.
 */
function getStatutoryDueDate(monthKey, financialYear, returnType) {
    let startYear = 2026;
    if (financialYear && financialYear.includes('-')) {
        const parts = financialYear.split('-');
        const parsed = parseInt(parts[0], 10);
        if (!isNaN(parsed)) startYear = parsed;
    }
    const endYear = startYear + 1;

    const monthIndexMap = {
        'April': { monthNum: 4, year: startYear },
        'May': { monthNum: 5, year: startYear },
        'June': { monthNum: 6, year: startYear },
        'July': { monthNum: 7, year: startYear },
        'August': { monthNum: 8, year: startYear },
        'September': { monthNum: 9, year: startYear },
        'October': { monthNum: 10, year: startYear },
        'November': { monthNum: 11, year: startYear },
        'December': { monthNum: 12, year: startYear },
        'January': { monthNum: 1, year: endYear },
        'February': { monthNum: 2, year: endYear },
        'March': { monthNum: 3, year: endYear },
    };

    const info = monthIndexMap[monthKey] || { monthNum: 4, year: startYear };
    let nextMonth = info.monthNum + 1;
    let nextYear = info.year;
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
    }

    const day = (returnType || '').toUpperCase().includes('GSTR-1') || (returnType || '').toUpperCase().includes('GSTR1') ? 11 : 20;
    const pad = (n) => String(n).padStart(2, '0');
    return `${nextYear}-${pad(nextMonth)}-${pad(day)}`;
}

/**
 * Returns Tracking Autopilot Engine
 * 1. Launches Chrome & Auto-fills Credentials from Vault.
 * 2. Waits for user CAPTCHA solving and login detection.
 * 3. Part 1: Navigates to Services -> Returns -> Track Return Status.
 * 4. Part 2: Selects Option B (Return Filing Period), selects Financial Year & Tax Period.
 * 5. Part 3: Clicks Search, scrapes Search Results table (ARN, Return Type, Period, Filing Date, Status, Mode).
 * 6. Ingests scraped return details into SQLite `returns_tracking_records`.
 */
export async function runReturnsTrackingAutopilot({
    db,
    gstin,
    financialYear = '2025-26',
    targetMonth = null,
    onProgress = () => {},
    browserState = null
}) {
    const gstinUpper = (gstin || '').trim().toUpperCase();
    onProgress('START', `Initializing Returns Tracking Autopilot for ${gstinUpper}...`);

    // 1. Fetch credentials from clients table
    const clientRow = await new Promise((resolve) => {
        db.get(
            `SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE UPPER(TRIM(gstin)) = ? OR UPPER(TRIM(id)) = ?`,
            [gstinUpper, gstinUpper],
            (err, row) => resolve(row || null)
        );
    });

    if (!clientRow || !clientRow.portal_username || !clientRow.portal_password) {
        throw new Error(`No portal credentials saved for ${gstinUpper}. Please enter Username & Password in Credentials Vault.`);
    }

    const clientName = clientRow.trade_name || clientRow.legal_name || gstinUpper;
    const portalUser = clientRow.portal_username.trim();
    const portalPass = decryptSecret(clientRow.portal_password).trim();

    onProgress('LAUNCH_BROWSER', `Launching Chrome for ${clientName}...`);

    const chromiumModule = await import('playwright');

    // Terminate any old hanging browser
    if (browserState && browserState.current) {
        try {
            await browserState.current.close().catch(() => {});
        } catch (e) {}
        browserState.current = null;
    }

    const browserLaunchOptions = {
        headless: false,
        slowMo: 0,
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
        const launchRes = await launchAutopilotBrowser(chromiumModule.chromium, browserLaunchOptions);
        browser = launchRes.browser;
        if (browserState) {
            browserState.current = browser;
        }

        const context = await browser.newContext({ viewport: null });
        const page = await context.newPage();

    // Navigate to GST Portal Login
    onProgress('NAVIGATING_LOGIN', 'Navigating to GST Portal login page...');
    await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });

    // Auto-fill Username
    try {
        const uSelector = '#username';
        await page.waitForSelector(uSelector, { state: 'visible', timeout: 15000 });
        const uInput = page.locator(uSelector).first();
        if (await uInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await uInput.click();
            await uInput.fill(portalUser);
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
            console.log(`[Returns Tracking] Username auto-filled for ${gstinUpper}`);
        }
    } catch (e) {
        console.warn('[Returns Tracking] Username auto-fill warning:', e.message);
    }

    // Brief delay to allow password input to initialize
    await page.waitForTimeout(150);

    // Auto-fill Password (Target strictly #user_pass to avoid hidden dummy password trap)
    try {
        const pSelector = '#user_pass';
        await page.waitForSelector(pSelector, { state: 'visible', timeout: 10000 }).catch(() => {});
        const pInput = page.locator(pSelector).first();
        if (await pInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await pInput.click();
            await pInput.fill(portalPass);

            // Ensure Angular ngModel and scope.lform.password are explicitly synchronized
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

            console.log(`[Returns Tracking] Password auto-filled successfully (${portalPass.length} chars) for ${gstinUpper}`);
        } else {
            console.warn('[Returns Tracking] Password input #user_pass was not visible!');
        }
    } catch (e) {
        console.warn('[Returns Tracking] Password auto-fill warning:', e.message);
    }

    // Immediately focus CAPTCHA field so user can type right away
    try {
        const captchaSelector = '#captcha, input[name="captcha"], input[placeholder*="characters" i]';
        const captchaInput = page.locator(captchaSelector).first();
        if (await captchaInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await captchaInput.click();
            await captchaInput.focus();
            console.log('[Returns Tracking] Focused CAPTCHA field');
        }
    } catch (e) {}

    // Bring browser window to front via Windows PowerShell
    try {
        const browserPid = typeof browser.process === 'function' ? browser.process()?.pid : null;
        let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
        if (browserPid) psParts.push(`$wshell.AppActivate(${browserPid});`);
        psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
        psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
        psParts.push(`$wshell.AppActivate('Chrome');`);
        exec(`powershell -NoProfile -Command "${psParts.join(' ')}"`, () => {});
    } catch (e) {}

    onProgress('AWAITING_LOGIN', 'Chrome launched and credentials filled. Please type CAPTCHA and click LOGIN on portal...');

    // Wait for user to solve CAPTCHA and submit login (up to 3 minutes with 100ms active polling)
    await page.waitForFunction(() => {
        const href = window.location.href;
        const isAuthUrl = href.includes('/auth/') || 
                          href.includes('/dashboard') || 
                          href.includes('/quicklinks/') || 
                          href.includes('/returns/') || 
                          href.includes('/track');

        const hasInputs = Boolean(document.querySelector('#username') || document.querySelector('#user_pass'));
        const hasLogout = Boolean(document.querySelector('a[href*="logout"], [ng-click*="logout"], .user-name, #navbar-usr-menu, li.dropdown.user'));
        const hasServices = Array.from(document.querySelectorAll('a')).some(a => {
            const t = (a.innerText || a.textContent || '').trim();
            return t === 'Services' && !a.href.includes('www.gst.gov.in');
        });
        const hasRemindLater = Array.from(document.querySelectorAll('button, a')).some(b => {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            return t.includes('remind me later') || t.includes('aadhaar');
        });

        return isAuthUrl || hasLogout || hasServices || hasRemindLater || (!hasInputs && !href.endsWith('/login'));
    }, null, { timeout: 180000, polling: 100 });

    onProgress('LOGIN_DETECTED', 'Login successful! Allowing dashboard to load...');
    await page.waitForTimeout(400);

    // Auto-dismiss common GST portal popups (Remind Me Later, Aadhaar auth, bank account validation, modals)
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

    // Helper to render real-time on-screen status banner in Chrome
    const updateBanner = async (stepText, color = '#38bdf8') => {
        try {
            await page.evaluate(({ stepText, color, clientName, clientGstin }) => {
                let b = document.getElementById('antigravity-returns-banner');
                if (!b) {
                    b = document.createElement('div');
                    b.id = 'antigravity-returns-banner';
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
                            ⚡ RETURNS TRACKER
                        </span>
                        <span>${stepText}</span>
                    </div>
                    <div style="font-size:12px;color:#cbd5e1;font-family:monospace;">
                        ${clientName ? `Client: <strong style="color:#7dd3fc;">${clientName}</strong> (${clientGstin})` : ''}
                    </div>
                `;
            }, { stepText, color, clientName, clientGstin: gstinUpper }).catch(() => {});
        } catch (e) {}
    };

    // Wait for any active spinner overlay (.dimmer-holder) to hide (non-blocking, max 1.5s)
    try {
        await page.locator('.dimmer-holder:visible, .loading:visible, .spinner:visible').first().waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
    } catch (e) {}
    await dismissPopups();

    // ─────────────────────────────────────────────────────────────────────────────
    // PART 1: STEP-BY-STEP NAVIGATION (POST-LOGIN)
    // ─────────────────────────────────────────────────────────────────────────────
    let onTrackPage = false;

    // Check if already on Track Return Status page (URL: return.gst.gov.in/returns/auth/trackreturnstatus)
    if (page.url().includes('trackreturnstatus') || page.url().includes('trackstatus')) {
        onTrackPage = true;
    }

    if (!onTrackPage) {
        try {
            onProgress('NAVIGATING_MENU', 'Navigating: Services -> Returns -> Track Return Status...');
            await dismissPopups();

            // Step 1: Click "Services" tab in top nav bar (Screenshot 1)
            // STRICT: Must match exact text "Services" in navbar, never the logo banner (<a href="//www.gst.gov.in/">)
            const servicesSelector = 'ul.navbar-nav a:text-is("Services"), li.dropdown > a:text-is("Services"), a:text-is("Services"):not([href*="www.gst.gov.in"])';
            const servicesTab = page.locator(servicesSelector).first();
            await servicesTab.waitFor({ state: 'visible', timeout: 10000 });
            await servicesTab.click({ force: true });
            await page.waitForTimeout(600);

            // Step 2: Hover/Click "Returns" in horizontal sub-navbar (Screenshot 2)
            // Target the unique sub-navbar Returns tab (href contains quicklinks/returns or exact text 'Returns')
            const returnsTab = page.locator('a[href*="quicklinks/returns"], a.nav-link:text-is("Returns"), a:text-is("Returns"):not([href*="dashboard"]):not([href*="track"])').first();
            if (await returnsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
                await returnsTab.hover().catch(() => {});
                await returnsTab.click({ force: true }).catch(() => {});
                await page.waitForTimeout(600);
            }

            // Step 3: Click "Track Return Status" in the Returns dropdown panel (Screenshot 2)
            const trackStatusSelector = 'a:has-text("Track Return Status"), a[href*="trackreturnstatus"]';
            const trackBtn = page.locator(trackStatusSelector).first();
            await trackBtn.waitFor({ state: 'visible', timeout: 8000 });
            await trackBtn.click({ force: true });

            // Wait for navigation to complete to Track Return Status
            await page.waitForFunction(() => {
                const u = window.location.href;
                return u.includes('track') || !!document.querySelector('select#fin');
            }, { timeout: 15000 }).catch(() => {});

            if (page.url().includes('track')) {
                onTrackPage = true;
                console.log('[Returns Tracking] Arrived on Track Return Status page:', page.url());
            }
        } catch (navErr) {
            console.warn('[Returns Tracking] Menu click warning, attempting direct DOM anchor search:', navErr.message);
        }
    }

    // Direct DOM evaluate fallback for menu navigation (strictly via in-page link clicks matching Screenshot 2)
    if (!onTrackPage) {
        try {
            await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                // 1. Click Services (strictly excluding www.gst.gov.in logo)
                const sLink = links.find(a => {
                    const t = (a.innerText || a.textContent || '').trim();
                    const h = a.getAttribute('href') || '';
                    return t === 'Services' && !h.includes('www.gst.gov.in');
                });
                if (sLink) sLink.click();

                // 2. Click Returns tab in sub-navbar
                const rTab = links.find(a => {
                    const t = (a.innerText || a.textContent || '').trim();
                    const h = a.getAttribute('href') || '';
                    return (t === 'Returns' || h.includes('quicklinks/returns')) && !h.includes('dashboard') && !h.includes('track');
                });
                if (rTab) {
                    rTab.click();
                    rTab.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                }

                // 3. Click Track Return Status
                const trackLink = links.find(a => {
                    const t = (a.innerText || a.textContent || '').trim().toLowerCase();
                    const h = (a.getAttribute('href') || '').toLowerCase();
                    return t === 'track return status' || h.includes('trackreturnstatus');
                });
                if (trackLink) trackLink.click();
            });
            await page.waitForFunction(() => {
                const u = window.location.href;
                return u.includes('track') || !!document.querySelector('select#fin');
            }, { timeout: 10000 }).catch(() => {});
            if (page.url().includes('track')) {
                onTrackPage = true;
            }
        } catch (e) {}
    }

    // Validate that we are genuinely on the Track Return Status page
    if (!onTrackPage) {
        const bodyHasTrack = await page.evaluate(() => {
            const body = document.body.innerText || '';
            return body.includes('Track Return Status') || !!document.querySelector('select#fin');
        }).catch(() => false);
        if (bodyHasTrack) onTrackPage = true;
    }

    if (!onTrackPage) {
        throw new Error(`Unable to open Track Return Status automatically (current page: ${page.url()}). Please click Services -> Returns -> Track Return Status on the screen.`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PART 2 & 3: SELECT FINANCIAL YEAR & AUTOMATICALLY CLICK "SEARCH"
    // ─────────────────────────────────────────────────────────────────────────────
    onProgress('INSPECTING_TABLE', 'Configuring search criteria on Track Return Status...');
    await dismissPopups();
    console.log(`[Returns Tracking] Active page: ${page.url()}`);

    // Wait for the Track Return Status form and SEARCH button to be fully mounted
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1000);

    const searchBtnLocator = page.locator('button:has-text("SEARCH"), button:has-text("Search"), input[value*="search" i]').first();
    await searchBtnLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
        console.warn('[Returns Tracking] SEARCH button wait timed out, continuing...');
    });

    // Normalizes FY strings: "2026-2027" or "FY 2026-27" -> "2026-27"
    const normalizeFy = (fyStr) => {
        if (!fyStr) return financialYear;
        const clean = fyStr.trim();
        const parts = clean.match(/(\d{4})[^\d]*(\d{2,4})/);
        if (parts) {
            const start = parts[1];
            const end = parts[2].slice(-2);
            return `${start}-${end}`;
        }
        return clean;
    };

    // Robust Return Type extractor
    const extractReturnType = (text) => {
        if (!text) return null;
        const t = text.trim();
        if (/GSTR-?1/i.test(t) || /IFF/i.test(t)) return 'GSTR-1';
        if (/GSTR-?3B/i.test(t) || /GSTR3B/i.test(t)) return 'GSTR-3B';
        if (/CMP-?08/i.test(t)) return 'CMP-08';
        if (/GSTR-?9C?/i.test(t)) return 'GSTR-9';
        return null;
    };

    // Step A: Select Financial Year on Track Return Status
    try {
        // Wait for select element to appear
        await page.waitForSelector('select#fin, select[name="fin"], select[ng-model*="fin" i], select', { timeout: 10000 }).catch(() => {});

        // Prioritize canonical GST portal select#fin
        let fySelect = page.locator('select#fin, select[name="fin"], select[ng-model*="fin" i], select[ng-model*="fy" i], select[id*="fy" i]').first();
        if ((await fySelect.count()) === 0 || !(await fySelect.isVisible().catch(() => false))) {
            fySelect = page.locator('select').filter({
                has: page.locator('option').filter({ hasText: /\b20\d{2}[^\d]*\d{2,4}\b/ })
            }).first();
        }
        if ((await fySelect.count()) === 0) {
            fySelect = page.locator('select').first();
        }

        if (await fySelect.isVisible({ timeout: 5000 }).catch(() => false)) {
            // Wait for options to populate into dropdown (loaded asynchronously via AngularJS)
            await page.waitForFunction(() => {
                const el = document.querySelector('select#fin, select[name="fin"], select[ng-model*="fin" i], select');
                return el && el.options && el.options.length > 1;
            }, null, { timeout: 10000, polling: 100 }).catch(() => {});

            // Read all options currently populated in the portal dropdown
            const fyOptions = await fySelect.evaluate(el => {
                return Array.from(el.options).map((o, idx) => ({
                    index: idx,
                    text: (o.text || '').trim(),
                    value: (o.value || '').trim()
                }));
            }).catch(() => []);

            console.log(`[Returns Tracking] Available portal FY options (${fyOptions.length}):`, fyOptions.map(o => `[${o.index}] "${o.text}" (val: "${o.value}")`).join(', '));

            // Parse start and end years from input financialYear (e.g. "2024-25" -> start: 2024, end: 2025)
            const cleanFy = String(financialYear || '').trim();
            let startYear = null;
            let endYear = null;
            const partsMatch = cleanFy.match(/(\d{4})[^\d]*(\d{2,4})/);
            if (partsMatch) {
                startYear = parseInt(partsMatch[1], 10);
                const rawEnd = parseInt(partsMatch[2], 10);
                endYear = rawEnd < 100 ? (Math.floor(startYear / 100) * 100 + rawEnd) : rawEnd;
            }

            const targetFull = (startYear && endYear) ? `${startYear}-${endYear}` : null; // e.g. "2024-2025"
            const targetShort = (startYear && endYear) ? `${startYear}-${String(endYear).slice(-2)}` : null; // e.g. "2024-25"
            const targetDigitsFull = (startYear && endYear) ? `${startYear}${endYear}` : null; // "20242025"
            const targetDigitsShort = (startYear && endYear) ? `${startYear}${String(endYear).slice(-2)}` : null; // "202425"

            // Match against portal options with strict priority (exact text first)
            let matchedFy = fyOptions.find(o => {
                const t = o.text.trim();
                if (!t || t.toLowerCase().includes('select') || t.startsWith('--')) return false;
                if (targetShort && t === targetShort) return true;
                if (targetFull && t === targetFull) return true;
                if (targetShort && t === `FY ${targetShort}`) return true;
                if (targetFull && t === `FY ${targetFull}`) return true;
                return false;
            });

            // Fallback 1: Exact digits match (e.g. "202425" or "20242025")
            if (!matchedFy && (targetDigitsShort || targetDigitsFull)) {
                matchedFy = fyOptions.find(o => {
                    const t = o.text.trim();
                    if (!t || t.toLowerCase().includes('select') || t.startsWith('--')) return false;
                    const cleanDigits = t.replace(/[^0-9]/g, '');
                    return cleanDigits === targetDigitsShort || cleanDigits === targetDigitsFull;
                });
            }

            // Fallback 2: Substring match on text
            if (!matchedFy && (targetShort || targetFull)) {
                matchedFy = fyOptions.find(o => {
                    const t = o.text.trim();
                    if (!t || t.toLowerCase().includes('select') || t.startsWith('--')) return false;
                    return (targetShort && t.includes(targetShort)) || (targetFull && t.includes(targetFull));
                });
            }

            // Fallback 3: Option value match (cleans AngularJS "string:" prefix)
            if (!matchedFy && (targetShort || targetFull || targetDigitsShort)) {
                matchedFy = fyOptions.find(o => {
                    if (!o.value || o.value.toLowerCase().includes('select')) return false;
                    const cleanVal = o.value.replace(/^string:/, '').replace(/^number:/, '').trim();
                    if (targetShort && cleanVal === targetShort) return true;
                    if (targetFull && cleanVal === targetFull) return true;
                    const cleanValDigits = cleanVal.replace(/[^0-9]/g, '');
                    return cleanValDigits === targetDigitsShort || cleanValDigits === targetDigitsFull;
                });
            }

            if (matchedFy) {
                const currentIndex = await fySelect.evaluate(el => el.selectedIndex).catch(() => -1);
                console.log(`[Returns Tracking] Target FY: "${financialYear}" -> Matched Portal Option: [${matchedFy.index}] "${matchedFy.text}" (current index: ${currentIndex})`);

                // 1. Visually highlight the FY dropdown in green for user observation
                await fySelect.scrollIntoViewIfNeeded().catch(() => {});
                await fySelect.hover().catch(() => {});
                await fySelect.evaluate(el => {
                    el.style.outline = '3px solid #22c55e';
                    el.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.6)';
                }).catch(() => {});
                await page.waitForTimeout(200);

                // Step 1: Select via Playwright by index
                await fySelect.selectOption({ index: matchedFy.index }).catch(() => {});

                // Step 2: Direct DOM & AngularJS model synchronization
                await fySelect.evaluate((el, targetIdx) => {
                    el.selectedIndex = targetIdx;
                    const opt = el.options[targetIdx];
                    if (opt) el.value = opt.value;

                    // Standard DOM change & input events
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));

                    if (window.angular) {
                        try {
                            const ngEl = window.angular.element(el);
                            const sc = ngEl.scope();
                            const modelExpr = el.getAttribute('ng-model');

                            const rawVal = opt ? opt.value : '';
                            const cleanVal = rawVal.replace(/^string:/, '').replace(/^number:/, '');
                            const modelVal = cleanVal || (opt ? (opt.text || '').trim() : '');

                            // Update ngModel controller if bound
                            const ngModel = ngEl.controller('ngModel');
                            if (ngModel && typeof ngModel.$setViewValue === 'function') {
                                ngModel.$setViewValue(modelVal);
                                if (typeof ngModel.$commitViewValue === 'function') ngModel.$commitViewValue();
                            }

                            if (sc) {
                                // Direct $parse assignment to ng-model expression
                                if (modelExpr) {
                                    try {
                                        const setter = window.angular.element(document.body).injector()?.get('$parse')(modelExpr)?.assign;
                                        if (typeof setter === 'function') setter(sc, modelVal);
                                    } catch(e) {}
                                    try {
                                        sc.$eval(`${modelExpr} = ${JSON.stringify(modelVal)}`);
                                    } catch(e) {}
                                }

                                // Update common portal search model structures
                                if (sc.searchCriteria) {
                                    sc.searchCriteria.fy = modelVal;
                                    sc.searchCriteria.financialYear = modelVal;
                                    sc.searchCriteria.fin = modelVal;
                                }
                                if (sc.search) {
                                    sc.search.fy = modelVal;
                                    sc.search.financialYear = modelVal;
                                }
                                if ('fin' in sc) sc.fin = modelVal;
                                if ('fy' in sc) sc.fy = modelVal;
                                if ('financialYear' in sc) sc.financialYear = modelVal;
                                if ('selectedFy' in sc) sc.selectedFy = modelVal;

                                if (!sc.$$phase && !sc.$root.$$phase) {
                                    sc.$apply();
                                }
                            }
                        } catch(e) {}
                    }
                }, matchedFy.index).catch(() => {});

                // Step 3: Verify that portal selection stuck and was not reverted
                await page.waitForTimeout(300);
                const verification = await fySelect.evaluate(el => ({
                    selectedIndex: el.selectedIndex,
                    selectedText: el.options[el.selectedIndex] ? (el.options[el.selectedIndex].text || '').trim() : ''
                })).catch(() => null);

                if (verification && verification.selectedIndex !== matchedFy.index) {
                    console.warn(`[Returns Tracking] Portal reverted FY selection to "${verification.selectedText}". Forcing index ${matchedFy.index}...`);
                    await fySelect.selectOption({ index: matchedFy.index }).catch(() => {});
                    await fySelect.evaluate((el, targetIdx) => {
                        el.selectedIndex = targetIdx;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }, matchedFy.index).catch(() => {});
                }

                const confirmedText = (await fySelect.evaluate(el => {
                    const sel = el.options[el.selectedIndex];
                    return sel ? (sel.text || '').trim() : '';
                }).catch(() => '')) || matchedFy.text;

                console.log(`[Returns Tracking] Confirmed dropdown selection on portal: "${confirmedText}"`);
                await updateBanner(`Financial Year confirmed: ${confirmedText}. Syncing portal...`, '#22c55e');
                onProgress('FY_SELECTED', `Financial Year selected: ${confirmedText}. Waiting before Search...`);

                await page.waitForTimeout(800);

                // Remove highlight from FY dropdown
                await fySelect.evaluate(el => {
                    el.style.outline = '';
                    el.style.boxShadow = '';
                }).catch(() => {});
            } else {
                console.warn(`[Returns Tracking] Could not find matching portal option for FY "${financialYear}". Available: ${fyOptions.map(o => o.text).join(', ')}`);
            }
        } else {
            console.warn('[Returns Tracking] FY select element was not visible on Track Return Status page.');
        }
    } catch (e) {
        console.warn('[Returns Tracking] FY selection note:', e.message);
    }

    // Step B: AUTOMATICALLY CLICK THE "SEARCH" BUTTON
    onProgress('CLICKING_SEARCH', 'Clicking Search button to fetch return status history...');
    console.log('[Returns Tracking] ⚡ Triggering Playwright click on SEARCH button...');
    await updateBanner('Clicking SEARCH button...', '#3b82f6');

    let searchClicked = false;
    try {
        await searchBtnLocator.scrollIntoViewIfNeeded().catch(() => {});
        await searchBtnLocator.hover().catch(() => {});
        await searchBtnLocator.evaluate(el => {
            el.style.outline = '3px solid #3b82f6';
            el.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.8)';
        }).catch(() => {});
        await page.waitForTimeout(300);
        await searchBtnLocator.click({ force: true, delay: 100 });
        searchClicked = true;
        console.log('[Returns Tracking] Playwright trusted click executed on SEARCH button');
    } catch (clkErr) {
        console.warn('[Returns Tracking] Playwright search button click warning:', clkErr.message);
    }

    if (!searchClicked) {
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
            const sBtn = buttons.find(b => {
                const t = (b.innerText || b.textContent || b.value || '').trim().toUpperCase();
                return t === 'SEARCH' || t.startsWith('SEARCH');
            });
            if (sBtn) sBtn.click();
        }).catch(() => {});
    }

    // Remove outline from Search button
    await searchBtnLocator.evaluate(el => {
        el.style.outline = '';
        el.style.boxShadow = '';
    }).catch(() => {});

    // Wait for table rows or "No record" confirmation to appear
    console.log('[Returns Tracking] Waiting for portal return history table rows to appear...');
    onProgress('WAITING_TABLE', 'Waiting for return filing history to load...');
    await page.waitForFunction(() => {
        const table = document.querySelector('table tbody tr td');
        const text = (document.body.innerText || '').toLowerCase();
        const noRecord = text.includes('no record') || text.includes('no data');
        return Boolean(table || noRecord);
    }, null, { timeout: 10000, polling: 150 }).catch(() => {});
    await page.waitForTimeout(400);
    onProgress('WAITING_TABLE', 'Waiting for return filing history to load...');
    await page.waitForSelector('table tbody tr td', { state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const allScrapedReturns = [];

    // Scrapes all rows currently visible in the data table
    const scrapeCurrentPage = async () => {
        const rows = await page.$$eval('table tbody tr', (trs) => {
            return trs.map(tr => {
                const tds = Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || td.textContent || '').trim());
                const link = tr.querySelector('td a');
                const linkText = link ? (link.innerText || link.textContent || '').trim() : '';
                return { tds, linkText };
            });
        }).catch(() => []);

        console.log(`[Returns Tracking] Found ${rows.length} rows on current portal table page`);

        for (const r of rows) {
            const tds = r.tds;
            if (!tds || tds.length < 5) continue;

            // Exact GST Portal Column Structure (from live screen):
            // Col 0: ARN (e.g. AA270926752695G, AC270826055665L)
            // Col 1: Return Type (e.g. GSTR-1/IFF, GSTR3B, TDS and TCS Credit Received)
            // Col 2: Financial Year (e.g. 2026-2027)
            // Col 3: Tax Period (e.g. September, August, July...)
            // Col 4: Date of filing (e.g. 09/10/2026, 19/09/2026)
            // Col 5: Status (e.g. Filed)
            // Col 6: Mode of filing (e.g. ONLINE)
            const rawArn = r.linkText || tds[0] || '';
            const rawType = tds[1] || '';
            const rawFy = tds[2] || financialYear;
            const rawPeriod = tds[3] || '';
            const rawDate = tds[4] || '';
            const rawStatus = tds[5] || 'Filed';
            const rawMode = tds[6] || 'ONLINE';

            const returnType = extractReturnType(rawType);
            if (!returnType) {
                // Ignore TDS or non-compliance rows
                continue;
            }

            const arnMatch = rawArn.match(/[A-Z0-9]{14,16}/i);
            const normalizedArn = arnMatch ? arnMatch[0] : rawArn;
            const normalizedFy = normalizeFy(rawFy);
            const monthKey = normalizeMonthKey(rawPeriod);
            const filingDate = normalizePortalDate(rawDate);

            if (monthKey && (normalizedArn || filingDate)) {
                const item = {
                    arn: normalizedArn,
                    returnType,
                    financialYear: normalizedFy,
                    taxPeriod: monthKey,
                    filingDate,
                    status: rawStatus,
                    mode: rawMode
                };
                const alreadyExists = allScrapedReturns.some(x => x.arn === item.arn && x.returnType === item.returnType && x.taxPeriod === item.taxPeriod);
                if (!alreadyExists) {
                    console.log(`[Returns Tracking] ✅ Captured: ${item.returnType} | ${item.taxPeriod} (${item.financialYear}) | ARN: ${item.arn} | Filed: ${item.filingDate} | Status: ${item.status}`);
                    allScrapedReturns.push(item);
                }
            }
        }
    };

    // Scrape Page 1 rows immediately
    onProgress('SCRAPING_TABLE', 'Scraping return filings from official portal table (Page 1)...');
    await scrapeCurrentPage();

    // ─────────────────────────────────────────────────────────────────────────────
    // MULTI-PAGE PAGINATION ENGINE: SCRAPES ALL PAGES (Page 1, 2, 3, 4...)
    // ─────────────────────────────────────────────────────────────────────────────
    for (let targetPage = 2; targetPage <= 10; targetPage++) {
        // Record current first row text to detect when table updates
        const prevFirstCell = await page.$eval('table tbody tr td', el => el.innerText.trim()).catch(() => '');

        console.log(`[Returns Tracking] Attempting to navigate to pagination Page ${targetPage}...`);
        onProgress('PAGINATING', `Loading return filings from Page ${targetPage}...`);

        let clicked = false;

        // 1. Playwright Locator exact match for targetPage (e.g. 2, 3, 4)
        const selectors = [
            `.pagination a:text-is("${targetPage}")`,
            `ul.pagination a:text-is("${targetPage}")`,
            `.pagination li a:text-is("${targetPage}")`,
            `.pagination *:text-is("${targetPage}")`,
            `[class*="pagination"] *:text-is("${targetPage}")`
        ];

        for (const sel of selectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
                await btn.scrollIntoViewIfNeeded().catch(() => {});
                await btn.click({ force: true }).catch(() => {});
                clicked = true;
                break;
            }
        }

        // 2. Direct DOM evaluation click fallback with AngularJS scope trigger
        if (!clicked) {
            clicked = await page.evaluate((pageNum) => {
                const candidates = Array.from(document.querySelectorAll('.pagination a, .pagination li a, .pagination span, .pagination li span, .pagination button, [class*="pagination"] a, [class*="pagination"] span'));
                const target = candidates.find(el => (el.innerText || el.textContent || '').trim() === String(pageNum));
                if (target) {
                    target.click();
                    if (window.angular) {
                        try {
                            const ngEl = window.angular.element(target);
                            ngEl.triggerHandler('click');
                            const scope = ngEl.scope();
                            if (scope) {
                                if (typeof scope.selectPage === 'function') scope.selectPage(pageNum);
                                if (!scope.$$phase && !scope.$root.$$phase) scope.$apply();
                            }
                        } catch(e) {}
                    }
                    return true;
                }
                return false;
            }, targetPage).catch(() => false);
        }

        // 3. If direct page number was found & clicked:
        if (clicked) {
            console.log(`[Returns Tracking] Clicked Page ${targetPage}, waiting for table refresh...`);
            if (prevFirstCell) {
                await page.waitForFunction((oldVal) => {
                    const firstCell = document.querySelector('table tbody tr td');
                    return firstCell && firstCell.innerText.trim() !== oldVal;
                }, prevFirstCell, { timeout: 4000 }).catch(() => {});
            }
            await page.waitForTimeout(600);
            await scrapeCurrentPage();
            continue;
        }

        // 4. If direct page number (e.g. Page 5) not found, check if Next button (») is active
        console.log(`[Returns Tracking] Page ${targetPage} button not directly visible, checking Next (») button...`);
        const clickedNext = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('.pagination a, .pagination li a, .pagination span, [class*="pagination"] a'));
            const nextLink = candidates.find(el => {
                const t = (el.innerText || el.textContent || '').trim();
                const parentLi = el.closest('li');
                const isDisabled = (parentLi && parentLi.classList.contains('disabled')) || el.classList.contains('disabled');
                if (isDisabled) return false;
                return t === '»' || t.includes('»') || t === '>' || t === 'Next' || t === '›';
            });
            if (nextLink) {
                nextLink.click();
                if (window.angular) {
                    try {
                        const ngEl = window.angular.element(nextLink);
                        ngEl.triggerHandler('click');
                        const scope = ngEl.scope();
                        if (scope) {
                            if (!scope.$$phase && !scope.$root.$$phase) scope.$apply();
                        }
                    } catch(e) {}
                }
                return true;
            }
            return false;
        }).catch(() => false);

        if (clickedNext) {
            console.log(`[Returns Tracking] Next button (») clicked for Page ${targetPage}, waiting for table refresh...`);
            if (prevFirstCell) {
                await page.waitForFunction((oldVal) => {
                    const firstCell = document.querySelector('table tbody tr td');
                    return firstCell && firstCell.innerText.trim() !== oldVal;
                }, prevFirstCell, { timeout: 4000 }).catch(() => {});
            }
            await page.waitForTimeout(600);
            await scrapeCurrentPage();
        } else {
            console.log(`[Returns Tracking] Reached end of pagination at Page ${targetPage - 1}. All available pages scraped.`);
            break;
        }
    }

    // Safety fallback: If table was empty, re-click Search button or try Return Filing Period radio
    if (allScrapedReturns.length === 0) {
        try {
            console.log('[Returns Tracking] Table returned 0 rows, re-clicking SEARCH button with force...');
            const sBtn = page.locator('button:has-text("SEARCH"), button:has-text("Search")').first();
            if (await sBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await sBtn.click({ force: true });
                await page.waitForTimeout(2000);
                await scrapeCurrentPage();
            }
            if (allScrapedReturns.length === 0) {
                console.log('[Returns Tracking] Still 0 rows, clicking Return Filing Period radio and re-searching...');
                const radioPeriod = page.locator('input[type="radio"][value*="Period" i], label:has-text("Return Filing Period")').first();
                if (await radioPeriod.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await radioPeriod.click({ force: true });
                    await page.waitForTimeout(500);
                    if (await sBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await sBtn.click({ force: true });
                        await page.waitForTimeout(2000);
                        await scrapeCurrentPage();
                    }
                }
            }
        } catch (e) {
            console.warn('[Returns Tracking] Search fallback warning:', e.message);
        }
    }

    onProgress('SAVING_RECORDS', `Scraped ${allScrapedReturns.length} return filings. Updating database...`);

    // ─────────────────────────────────────────────────────────────────────────────
    // INGEST & UPSERT INTO SQLITE `returns_tracking_records`
    // ─────────────────────────────────────────────────────────────────────────────
    const now = Date.now();

    for (const ret of allScrapedReturns) {
        const monthKey = ret.taxPeriod;
        if (!monthKey) continue;

        const isG1 = ret.returnType.toUpperCase().includes('GSTR-1') || ret.returnType.toUpperCase().includes('GSTR1');
        const isG3 = ret.returnType.toUpperCase().includes('GSTR-3B') || ret.returnType.toUpperCase().includes('GSTR3B');
        const recordFy = ret.financialYear || financialYear;

        const recordId = `${gstinUpper}_${recordFy}_${monthKey}`;
        const dueDate = getStatutoryDueDate(monthKey, recordFy, ret.returnType);
        const filingDate = ret.filingDate;

        let isOverdue = false;
        let daysOverdue = 0;
        let lateFee = 0;

        if (filingDate && dueDate) {
            const fD = new Date(filingDate);
            const dD = new Date(dueDate);
            if (fD > dD) {
                isOverdue = true;
                daysOverdue = Math.max(0, Math.ceil((fD.getTime() - dD.getTime()) / (1000 * 60 * 60 * 24)));
                lateFee = Math.min(10000, daysOverdue * 50);
            }
        }

        const matchStatus = isOverdue ? 'FILED_LATE' : 'FILED_ON_TIME';

        // Upsert into returns_tracking_records
        await new Promise((resolve) => {
            const stmt = `
                INSERT INTO returns_tracking_records (
                    id, gstin, client_name, financial_year, period, frequency,
                    gstr1_status, gstr1_arn, gstr1_filing_date,
                    gstr3b_status, gstr3b_arn, gstr3b_filing_date,
                    office_stage, remarks, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'Monthly', ?, ?, ?, ?, ?, ?, 'FILED', 'Official GSTN Portal Sync', ?)
                ON CONFLICT(gstin, financial_year, period) DO UPDATE SET
                    client_name = COALESCE(excluded.client_name, returns_tracking_records.client_name),
                    gstr1_status = CASE WHEN ? THEN excluded.gstr1_status ELSE returns_tracking_records.gstr1_status END,
                    gstr1_arn = CASE WHEN ? THEN excluded.gstr1_arn ELSE returns_tracking_records.gstr1_arn END,
                    gstr1_filing_date = CASE WHEN ? THEN excluded.gstr1_filing_date ELSE returns_tracking_records.gstr1_filing_date END,
                    gstr3b_status = CASE WHEN ? THEN excluded.gstr3b_status ELSE returns_tracking_records.gstr3b_status END,
                    gstr3b_arn = CASE WHEN ? THEN excluded.gstr3b_arn ELSE returns_tracking_records.gstr3b_arn END,
                    gstr3b_filing_date = CASE WHEN ? THEN excluded.gstr3b_filing_date ELSE returns_tracking_records.gstr3b_filing_date END,
                    office_stage = 'FILED',
                    updated_at = excluded.updated_at
            `;

            db.run(
                stmt,
                [
                    recordId,
                    gstinUpper,
                    clientName,
                    recordFy,
                    monthKey,
                    isG1 ? matchStatus : null,
                    isG1 ? ret.arn : null,
                    isG1 ? filingDate : null,
                    isG3 ? matchStatus : null,
                    isG3 ? ret.arn : null,
                    isG3 ? filingDate : null,
                    now,
                    isG1 ? 1 : 0,
                    isG1 ? 1 : 0,
                    isG1 ? 1 : 0,
                    isG3 ? 1 : 0,
                    isG3 ? 1 : 0,
                    isG3 ? 1 : 0
                ],
                () => resolve()
            );
        });
    }

        if (allScrapedReturns.length > 0) {
            onProgress('DONE', `Sync complete! Successfully tracked ${allScrapedReturns.length} return filings. Closing browser...`);
            console.log(`[Returns Tracking] Successfully scraped ${allScrapedReturns.length} records. Closing browser...`);
            await page.waitForTimeout(600).catch(() => {});
            if (browserState && browserState.current === browser) {
                browserState.current = null;
            }
            await browser.close().catch(() => {});
            browser = null;
        } else {
            onProgress('NO_DATA', 'No filings recorded for the selected period. Browser left open for verification.');
            console.log('[Returns Tracking] 0 records scraped; leaving browser open for user inspection.');
        }

        return {
            success: true,
            clientName,
            financialYear,
            totalReturnsScraped: allScrapedReturns.length,
            records: allScrapedReturns
        };
    } finally {
        if (browser && typeof allScrapedReturns !== 'undefined' && allScrapedReturns.length > 0) {
            console.log('[Returns Tracking] Automatically closing browser after scanning...');
            if (browserState && browserState.current === browser) {
                browserState.current = null;
            }
            try {
                await browser.close().catch(() => {});
            } catch (e) {}
        }
    }
}

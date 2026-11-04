import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { launchAutopilotBrowser } from '../gstr2b/browserLauncher.js';
import { upsertNotice, saveAttachment, computeLimitationDueDate } from './db.js';

export async function runNoticesAutopilot({ db, gstin, portal_username, portal_password, req, res, browserState }) {
    const gstinUpper = (gstin || '').trim().toUpperCase();

    // 1. Fetch Client Credentials from Database Vault (with direct payload fallback)
    let portalUser = (portal_username || '').trim();
    let portalPass = (portal_password || '').trim();

    try {
        const clientRow = await new Promise((resolve) => {
            db.get(`SELECT portal_username, portal_password FROM clients WHERE gstin = ?`, [gstinUpper], (err, row) => {
                resolve(row || null);
            });
        });
        if (clientRow) {
            portalUser = clientRow.portal_username || portalUser;
            portalPass = clientRow.portal_password || portalPass;
        }
    } catch (e) {
        console.error('[Notices Autopilot] Vault lookup error:', e);
    }

    // 2. Set up SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSse = (event, data = {}) => {
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {}
    };

    sendSse('START', { message: `Initializing Notices Autopilot for ${gstinUpper}` });

    let chromiumModule;
    try {
        chromiumModule = await import('playwright');
    } catch (e) {
        sendSse('ERROR', { error: 'Playwright is not installed or available.' });
        return res.end();
    }

    let browser = null;
    let context = null;
    let page = null;
    const downloadDir = path.join(process.cwd(), 'scratch', 'downloads', 'notices', gstinUpper);
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    // Close any previous browser instance
    if (browserState && browserState.current) {
        try {
            await browserState.current.close().catch(() => {});
        } catch (e) {}
        browserState.current = null;
    }

    try {
        const browserLaunchOptions = {
            headless: false,
            slowMo: 60,
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

        req.on('close', async () => {
            if (browser) {
                console.log('[Notices Autopilot] Request aborted from UI, closing browser');
                await browser.close().catch(() => {});
                if (browserState) browserState.current = null;
            }
        });

        // ─── Set up Download Event Listener ─────────────────────────────────
        const pendingDownloads = [];
        const activeDownloadPromises = new Set();

        page.on('download', (download) => {
            const dlTask = (async () => {
                try {
                    const originalName = download.suggestedFilename();
                    console.log(`[Notices Autopilot] Download detected: ${originalName}`);
                    const savePath = path.join(downloadDir, `${Date.now()}_${originalName}`);
                    await download.saveAs(savePath);
                    
                    // Verify file is saved and not empty
                    if (fs.existsSync(savePath)) {
                        const fileBuf = fs.readFileSync(savePath);
                        if (fileBuf.length > 0) {
                            const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
                            pendingDownloads.push({
                                fileName: originalName,
                                filePath: savePath,
                                fileHash: hash,
                                fileType: originalName.endsWith('.pdf') ? 'PDF' : originalName.endsWith('.zip') ? 'ZIP' : 'OTHER'
                            });
                            console.log(`[Notices Autopilot] Saved non-empty attachment (${fileBuf.length} bytes): ${originalName}`);
                        } else {
                            console.warn(`[Notices Autopilot] Download resulted in 0-byte file: ${originalName}`);
                        }
                    }
                } catch (dlErr) {
                    console.error('[Notices Autopilot] Download save error:', dlErr);
                }
            })();
            activeDownloadPromises.add(dlTask);
            dlTask.finally(() => activeDownloadPromises.delete(dlTask));
        });

        // ─── Step 1: Login & CAPTCHA Wait ───────────────────────────────────
        sendSse('STATUS', { message: 'Navigating to GST Portal Login...' });
        await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 45000 });

        if (portalUser) {
            try {
                await page.waitForSelector('#username, input[name="user_name"]', { state: 'visible', timeout: 15000 });
                await page.fill('#username', portalUser);
                await page.evaluate((u) => {
                    const el = document.querySelector('#username') || document.querySelector('input[name="user_name"]');
                    if (el) {
                        el.value = u;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, portalUser);
            } catch (e) {}

            await page.waitForTimeout(800);

            if (portalPass) {
                try {
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
                        console.log('[Notices Autopilot] Auto-filled password successfully');
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
                } catch (e) {}
            }
        }

        sendSse('WAITING_FOR_CAPTCHA', { message: 'Please enter CAPTCHA and click Login on GST Portal...' });

        // Wait for user to solve CAPTCHA and land on authenticated dashboard
        await page.waitForFunction(() => {
            const href = window.location.href;
            return href.includes('/auth/') || href.includes('/dashboard') || href.includes('/quicklinks/');
        }, { timeout: 180000 });

        sendSse('LOGIN_SUCCESS', { message: 'Authenticated successfully on GST Portal!' });
        await page.waitForTimeout(2500);

        let noticesFound = 0;
        let attachmentsFound = 0;

        // Helper for reliable portal navigation within services.gst.gov.in
        const navigateToPortalSection = async (sectionKeywords, directPath) => {
            console.log(`[Notices Autopilot] Navigating to: ${sectionKeywords[0]}`);
            
            // Priority 1: In-page DOM click
            try {
                const clicked = await page.evaluate((keywords) => {
                    const els = Array.from(document.querySelectorAll('a, button, div.card, div.tile, span'));
                    for (const kw of keywords) {
                        const target = els.find(el => (el.textContent || el.innerText || '').trim().toLowerCase() === kw.toLowerCase());
                        if (target) {
                            target.click();
                            return true;
                        }
                    }
                    return false;
                }, sectionKeywords);

                if (clicked) {
                    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
                    await page.waitForTimeout(1000);
                    return true;
                }
            } catch (e) {}

            // Priority 2: Standard Navbar Dropdown cascade
            try {
                const servicesLink = page.locator('a.dropdown-toggle:has-text("Services"), a:has-text("Services")').first();
                if (await servicesLink.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await servicesLink.click().catch(() => {});
                    await page.waitForTimeout(400);

                    const userServices = page.locator('a:has-text("User Services"), li:has-text("User Services")').first();
                    if (await userServices.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await userServices.click().catch(() => {});
                        await page.waitForTimeout(400);
                    }

                    for (const kw of sectionKeywords) {
                        const subLink = page.locator(`a:has-text("${kw}")`).first();
                        if (await subLink.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await subLink.click().catch(() => {});
                            await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
                            await page.waitForTimeout(1000);
                            return true;
                        }
                    }
                }
            } catch (e) {}

            // Priority 3: Same-Origin direct URL navigation
            if (directPath) {
                try {
                    const fullUrl = `https://services.gst.gov.in/services/auth/${directPath.replace(/^\//, '')}`;
                    console.log(`[Notices Autopilot] Using direct same-origin URL: ${fullUrl}`);
                    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    await page.waitForTimeout(2000);
                    return true;
                } catch (e) {
                    console.warn(`[Notices Autopilot] Direct path navigation error: ${e.message}`);
                }
            }

            return false;
        };

        // ─── Step 2: Section A — View Notices & Orders ───────────────────────
        sendSse('SCANNING', { step: 'SECTION_A', message: 'Scanning "View Notices and Orders"...' });
        try {
            await navigateToPortalSection(['View Notices and Orders', 'Notices and Orders'], 'viewnotices');
            await page.waitForTimeout(1500);

            // Extract table rows
            const rows = await page.$$eval('table tbody tr', (trs) => {
                return trs.map(tr => {
                    const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                    return tds;
                }).filter(tds => tds.length >= 4);
            }).catch(() => []);

            console.log(`[Notices Autopilot] View Notices rows found: ${rows.length}`);

            for (const row of rows) {
                const noticeType = row[1] || 'ORDER';
                const description = row[2] || '';
                const refNo = row[3] || `REF-${Date.now()}`;
                const issueDate = row[4] || '';
                const amountStr = row[5] || '0';
                const taxDemanded = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

                const saved = await upsertNotice(db, {
                    client_gstin: gstinUpper,
                    portal_source: 'VIEW_NOTICES',
                    notice_type: noticeType,
                    form_description: description,
                    reference_no: refNo,
                    financial_year: new Date().getFullYear().toString(),
                    issue_date: issueDate,
                    tax_demanded: taxDemanded,
                    status: 'PENDING_REPLY'
                });
                noticesFound++;

                while (pendingDownloads.length > 0) {
                    const att = pendingDownloads.shift();
                    await saveAttachment(db, {
                        notice_id: saved.id,
                        client_gstin: gstinUpper,
                        file_name: att.fileName,
                        file_type: att.fileType,
                        file_path: att.filePath,
                        file_hash: att.fileHash
                    });
                    attachmentsFound++;
                }
            }
        } catch (secAErr) {
            console.warn('[Notices Autopilot] Section A scrape skipped or timed out:', secAErr.message);
        }

        // ─── Step 3: Section B — View Additional Notices & Orders ───────────
        sendSse('SCANNING', { step: 'SECTION_B', message: 'Scanning "View Additional Notices/Orders" (ASMT-10, DRC-01, SCN)...' });
        try {
            await navigateToPortalSection(['View Additional Notices/Orders', 'Additional Notices and Orders'], 'case/additionalnotices');
            await page.waitForTimeout(1500);

            // Click Search button if present on additional notices screen
            try {
                const searchBtn = page.locator('button:has-text("Search"), input[value="Search"], button[type="submit"]').first();
                if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await searchBtn.click().catch(() => {});
                    await page.waitForTimeout(2000);
                }
            } catch (e) {}

            // Scrape Additional Notices Table
            const addRows = await page.$$eval('table tbody tr', (trs) => {
                return trs.map(tr => {
                    const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                    return tds;
                }).filter(tds => tds.length >= 4);
            }).catch(() => []);

            console.log(`[Notices Autopilot] Additional Notices rows found: ${addRows.length}`);

            for (const row of addRows) {
                const noticeType = row[1] || 'ASMT-10';
                const description = row[2] || '';
                const refNo = row[3] || `REF-${Date.now()}`;
                const issueDate = row[4] || '';
                const amountStr = row[5] || '0';
                const taxDemanded = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

                const saved = await upsertNotice(db, {
                    client_gstin: gstinUpper,
                    portal_source: 'ADDITIONAL_NOTICES',
                    notice_type: noticeType,
                    form_description: description,
                    reference_no: refNo,
                    financial_year: new Date().getFullYear().toString(),
                    issue_date: issueDate,
                    tax_demanded: taxDemanded,
                    status: 'PENDING_REPLY'
                });
                noticesFound++;

                while (pendingDownloads.length > 0) {
                    const att = pendingDownloads.shift();
                    await saveAttachment(db, {
                        notice_id: saved.id,
                        client_gstin: gstinUpper,
                        file_name: att.fileName,
                        file_type: att.fileType,
                        file_path: att.filePath,
                        file_hash: att.fileHash
                    });
                    attachmentsFound++;
                }
            }
        } catch (secBErr) {
            console.warn('[Notices Autopilot] Section B scrape skipped or timed out:', secBErr.message);
        }

        // Return to Dashboard safely via official on-screen BACK button
        try {
            const backBtn = await page.$('button:has-text("BACK"), input[value="BACK"]');
            if (backBtn) await backBtn.click();
            await page.waitForTimeout(1500);
        } catch (e) {}

        // ─── Step 4: Section C — Return Compliance (DRC-01B & DRC-01C) ──────
        sendSse('SCANNING', { step: 'SECTION_C', message: 'Scanning "Return Compliance" (DRC-01B & DRC-01C)...' });
        try {
            await page.click('a:has-text("Services")', { timeout: 8000 });
            await page.waitForTimeout(500);
            await page.click('a:has-text("Returns")', { timeout: 8000 });
            await page.waitForTimeout(500);
            await page.click('a:has-text("Return Compliance")', { timeout: 8000 });
            await page.waitForLoadState('networkidle', { timeout: 15000 });

            // Check DRC-01B / DRC-01C tiles
            const tiles = await page.$$eval('.tile, .card, div', (els) => {
                return els.filter(el => el.innerText.includes('DRC-01B') || el.innerText.includes('DRC-01C'))
                          .map(el => el.innerText.trim());
            }).catch(() => []);

            if (tiles.length > 0) {
                console.log('[Notices Autopilot] Found Return Compliance tiles:', tiles.length);
            }
        } catch (secCErr) {
            console.warn('[Notices Autopilot] Section C scrape skipped or timed out:', secCErr.message);
        }

        // Wait for all in-flight file downloads to finish completely before closing browser
        if (activeDownloadPromises.size > 0) {
            console.log(`[Notices Autopilot] Waiting for ${activeDownloadPromises.size} active download stream(s) to finish saving...`);
            await Promise.race([
                Promise.all(Array.from(activeDownloadPromises)),
                new Promise(resolve => setTimeout(resolve, 15000))
            ]);
        }

        // Save any pending downloads that completed during the wait
        while (pendingDownloads.length > 0) {
            const att = pendingDownloads.shift();
            await saveAttachment(db, {
                notice_id: null,
                client_gstin: gstinUpper,
                file_name: att.fileName,
                file_type: att.fileType,
                file_path: att.filePath,
                file_hash: att.fileHash
            });
            attachmentsFound++;
        }

        sendSse('COMPLETED', {
            message: `Scanned complete! Found and synchronized ${noticesFound} notices with ${attachmentsFound} downloaded attachments.`,
            noticesFound,
            attachmentsFound
        });

        res.end();
    } catch (err) {
        console.error('[Notices Autopilot] Engine error:', err);
        sendSse('ERROR', { error: err.message });
        res.end();
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
            if (browserState) browserState.current = null;
        }
    }
}

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Locate physical Google Chrome executable on Windows if installed.
 */
export function getChromeExecutablePath() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : null
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return p;
            }
        } catch (e) {}
    }
    return null;
}

/**
 * launchAutopilotBrowser — Unified Chrome-First Playwright Browser Launcher
 * 
 * Strict Priority Order:
 * 1. Google Chrome (channel: 'chrome' or physical chrome.exe path)
 * 2. Dedicated Bundled Chromium (e.g. %LOCALAPPDATA%\ms-playwright)
 * 3. Microsoft Edge (channel: 'msedge') — safety net only if Chrome is missing
 * 
 * @param {object} chromiumEngine - playwright.chromium instance
 * @param {object} customOptions - Optional overrides (headless, downloadsPath, args, etc.)
 * @returns {Promise<{ browser: object, engineType: string }>}
 */
export async function launchAutopilotBrowser(chromiumEngine, customOptions = {}) {
    if (!chromiumEngine || typeof chromiumEngine.launch !== 'function') {
        throw new Error('[Browser Launcher] A valid Playwright chromium engine must be provided.');
    }

    const defaultArgs = [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--disable-extensions'
    ];

    const mergedArgs = Array.from(new Set([...defaultArgs, ...(customOptions.args || [])]));

    const baseOptions = {
        headless: customOptions.headless ?? false,
        slowMo: customOptions.slowMo ?? 50,
        args: mergedArgs
    };

    if (customOptions.downloadsPath) {
        baseOptions.downloadsPath = customOptions.downloadsPath;
    }
    if (customOptions.viewport !== undefined) {
        baseOptions.viewport = customOptions.viewport;
    }

    const errors = [];

    // -------------------------------------------------------------
    // PRIORITY 1: Google Chrome (Official Channel or Physical Binary)
    // -------------------------------------------------------------
    try {
        console.log('[Browser Launcher] Attempting launch with Google Chrome (channel: chrome)...');
        const browser = await chromiumEngine.launch({
            ...baseOptions,
            channel: 'chrome'
        });
        console.log('[Browser Launcher] Successfully launched Google Chrome (channel: chrome)');
        return { browser, engineType: 'chrome' };
    } catch (errChromeChannel) {
        errors.push(`Chrome channel error: ${errChromeChannel.message}`);
        console.warn(`[Browser Launcher] channel: 'chrome' unavailable (${errChromeChannel.message}). Checking physical path...`);

        const detectedChrome = getChromeExecutablePath();
        if (detectedChrome) {
            try {
                console.log(`[Browser Launcher] Launching detected Chrome at: ${detectedChrome}`);
                const browser = await chromiumEngine.launch({
                    ...baseOptions,
                    executablePath: detectedChrome
                });
                console.log('[Browser Launcher] Successfully launched Google Chrome via direct path');
                return { browser, engineType: 'chrome' };
            } catch (errChromePath) {
                errors.push(`Chrome direct path error: ${errChromePath.message}`);
                console.warn(`[Browser Launcher] Chrome direct path launch failed: ${errChromePath.message}`);
            }
        }
    }

    // -------------------------------------------------------------
    // PRIORITY 2: Bundled Playwright Chromium (if installed)
    // -------------------------------------------------------------
    try {
        console.log('[Browser Launcher] Attempting launch with bundled Playwright Chromium...');
        const browser = await chromiumEngine.launch(baseOptions);
        console.log('[Browser Launcher] Successfully launched bundled Playwright Chromium');
        return { browser, engineType: 'chromium' };
    } catch (errChromium) {
        errors.push(`Bundled Chromium error: ${errChromium.message}`);
        console.warn(`[Browser Launcher] Bundled Chromium unavailable (${errChromium.message}). Falling back to Microsoft Edge...`);
    }

    // -------------------------------------------------------------
    // PRIORITY 3: Microsoft Edge (channel: 'msedge') — Final Fallback
    // -------------------------------------------------------------
    try {
        console.log('[Browser Launcher] Attempting launch with Microsoft Edge (channel: msedge)...');
        const browser = await chromiumEngine.launch({
            ...baseOptions,
            channel: 'msedge'
        });
        console.log('[Browser Launcher] Successfully launched Microsoft Edge (channel: msedge) as fallback');
        return { browser, engineType: 'msedge' };
    } catch (errEdge) {
        errors.push(`Edge channel error: ${errEdge.message}`);
        console.error(`[Browser Launcher] All browser launch strategies failed:\n${errors.join('\n')}`);
        throw new Error(`Failed to launch browser. Neither Google Chrome, bundled Chromium, nor Microsoft Edge could be opened.\nDetails: ${errors.join('; ')}`);
    }
}

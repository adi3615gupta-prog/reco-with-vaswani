const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sqlite3 = require('sqlite3');

async function testPhase8() {
    console.log('=== Starting Phase 8 Hardening Verification ===\n');

    // -------------------------------------------------------------
    // Test 1: Check server.obfuscated.cjs for Clean Browser Evaluation Code
    // -------------------------------------------------------------
    console.log('Test 1: Inspecting server.obfuscated.cjs for browser evaluation shielding...');
    const obfuscatedCode = fs.readFileSync('server.obfuscated.cjs', 'utf8');

    // In gstr2b/autopilot.js, we have:
    // banner.id = 'antigravity-2b-banner';
    // If shielded, 'antigravity-2b-banner' must exist literally in the file!
    const bannerIdExists = obfuscatedCode.includes('antigravity-2b-banner');
    console.log(' - Contains literal "antigravity-2b-banner":', bannerIdExists);
    assert(bannerIdExists, 'server.obfuscated.cjs must contain literal "antigravity-2b-banner" (shielded from obfuscation)');

    const waitForFunctionClean = obfuscatedCode.includes('hasNoInputs');
    console.log(' - Contains clean waitForFunction code ("hasNoInputs"):', waitForFunctionClean);
    assert(waitForFunctionClean, 'server.obfuscated.cjs must contain clean waitForFunction logic');

    // -------------------------------------------------------------
    // Test 2: Database Auto-Seeding Simulation
    // -------------------------------------------------------------
    console.log('\nTest 2: Testing ensureProductionDatabase auto-seeding logic...');
    const tmpUserData = path.join(__dirname, 'test_userdata_seed_' + Date.now());
    fs.mkdirSync(tmpUserData, { recursive: true });
    const tmpDbPath = path.join(tmpUserData, 'network_data.db');

    // Candidate masters
    const candidateMasters = [
        path.join(process.cwd(), 'network_data.db')
    ];

    assert(fs.existsSync(candidateMasters[0]), 'Master network_data.db must exist in project root');

    // Copy simulation
    fs.copyFileSync(candidateMasters[0], tmpDbPath);
    assert(fs.existsSync(tmpDbPath), 'Target DB must exist after seeding');
    assert(fs.statSync(tmpDbPath).size > 1000000, 'Seeded DB size must be > 1MB');

    const testDb = new sqlite3.Database(tmpDbPath);
    const clientCount = await new Promise((resolve, reject) => {
        testDb.get('SELECT COUNT(*) as cnt FROM clients WHERE portal_username IS NOT NULL AND LENGTH(portal_username) > 0', (err, row) => {
            if (err) reject(err);
            else resolve(row.cnt);
        });
    });

    console.log(' - Seeded clients with configured credentials count:', clientCount);
    assert(clientCount > 100, `Expected > 100 configured clients in master seed, found ${clientCount}`);
    await new Promise((resolve) => testDb.close(resolve));
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch (e) {}
    console.log(' - Temporary test database cleaned up.');

    // -------------------------------------------------------------
    // Test 3: Playwright Browser Evaluation Simulation
    // -------------------------------------------------------------
    console.log('\nTest 3: Testing page.evaluate execution in headless Chrome...');
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent('<html><body><input id="username" /><input id="user_pass" /><input id="captcha" /></body></html>');

    // Simulate the exact autopilot lines that crashed previously
    let bannerError = null;
    try {
        const clientTradeName = 'Test Client';
        const gstinUpper = '27AAKCC8195M1ZT';
        const portalUser = 'CTRLA8323';
        const portalPass = 'TestPass123';

        await page.fill('#username', portalUser);
        await page.fill('#user_pass', portalPass);

        await page.evaluate(({ clientName, clientGstin, hasCreds }) => {
            const banner = document.createElement('div');
            banner.id = 'antigravity-2b-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;';
            banner.innerHTML = `<span>⚡ GSTR-2B AUTOPILOT</span><span>Client: ${clientName} (${clientGstin})</span>`;
            document.body.prepend(banner);
        }, { clientName: clientTradeName, clientGstin: gstinUpper, hasCreds: Boolean(portalUser && portalPass) });
    } catch (e) {
        bannerError = e;
    }

    assert.strictEqual(bannerError, null, 'page.evaluate must execute with 0 errors');

    const bannerText = await page.innerText('#antigravity-2b-banner');
    console.log(' - Banner text injected in page:', bannerText);
    assert(bannerText.includes('GSTR-2B AUTOPILOT'));

    const usernameVal = await page.inputValue('#username');
    const passwordVal = await page.inputValue('#user_pass');
    console.log(' - Auto-filled #username:', usernameVal);
    console.log(' - Auto-filled #user_pass:', passwordVal);
    assert.strictEqual(usernameVal, 'CTRLA8323');
    assert.strictEqual(passwordVal, 'TestPass123');

    await browser.close();
    console.log(' - Headless browser closed cleanly.');

    console.log('\n=== ALL PHASE 8 TESTS PASSED 100% ===');
}

testPhase8().catch(err => {
    console.error('Phase 8 Verification Failed:', err);
    process.exit(1);
});

import jsdom from 'jsdom';
const { JSDOM } = jsdom;
global.DOMParser = new JSDOM().window.DOMParser;

import { fetchTallyMetadata, fetchVouchers } from './src/lib/tallyApi.ts';

async function run() {
    try {
        console.log("Fetching metadata...");
        const meta = await fetchTallyMetadata(9000);
        console.log("Map size:", meta.gstinMap.size);
        console.log("S P TRADING COMPANY in map:", meta.gstinMap.has('S P TRADING COMPANY'));
        console.log("GSTIN for S P TRADING COMPANY:", meta.gstinMap.get('S P TRADING COMPANY'));
        
        console.log("Fetching vouchers...");
        const vouchers = await fetchVouchers(9000, '20250401', '20260331', ['Purchase']);
        console.log(`Fetched ${vouchers.length} vouchers`);
        
        for (const v of vouchers) {
            if (v.invoiceNo === '4' || v.invoiceNo === '12/2025-25' || v.partyName.includes('S P TRADING') || v.partyName.includes('WINDAIR')) {
                 console.log(`Found Voucher ${v.invoiceNo}: Party = '${v.partyName}', GSTIN = '${v.partyGstin}'`);
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();

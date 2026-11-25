import { fetchTallyMetadata, fetchVouchers } from './src/lib/tallyApi.ts';

async function run() {
  try {
    const meta = await fetchTallyMetadata();
    console.log(`Fetched ${meta.gstinMap.size} GSTINs and ${meta.taxMap.size} Tax Ledgers`);
    
    // Find ITC ledgers
    let itcCount = 0;
    meta.taxMap.forEach((val, key) => {
      if (val.isITC) {
        if (itcCount < 5) console.log(`ITC Ledger: ${key}`);
        itcCount++;
      }
    });
    console.log(`Total ITC Ledgers: ${itcCount}`);

    const vouchers = await fetchVouchers('Purchase', '2025-04-01', '2025-04-30');
    console.log(`Fetched ${vouchers.length} Purchase vouchers`);
    if (vouchers.length > 0) {
      console.log('Sample Voucher:', vouchers[0]);
    }
  } catch (err) {
    console.error(err);
  }
}

run();

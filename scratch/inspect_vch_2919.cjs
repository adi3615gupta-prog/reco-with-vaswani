const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.USERPROFILE || 'C:\\Users\\Dell05', 'Downloads', 'DYP INFRAPROJECTS PVT.LTD._Tally_Import_2025-04-01_to_2026-03-31.xlsx');

if (fs.existsSync(filePath)) {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets['Journal'];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const matched = rows.filter(r => String(r['Voucher No']) === '2919');
    console.log("=== Rows with Voucher No 2919 ===");
    console.log(JSON.stringify(matched, null, 2));
} else {
    console.log("File does not exist");
}

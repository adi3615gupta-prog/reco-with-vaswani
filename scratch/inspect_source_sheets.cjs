const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.USERPROFILE || 'C:\\Users\\Dell05', 'Downloads', 'DYP INFRAPROJECTS PVT.LTD._Tally_Import_2025-04-01_to_2026-03-31.xlsx');

if (fs.existsSync(filePath)) {
    console.log("Reading file:", filePath);
    const wb = XLSX.readFile(filePath);
    
    ['Purchase', 'Journal'].forEach(sheetName => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) {
            console.log(`Sheet '${sheetName}' not found.`);
            return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        const matched = rows.filter(r => {
            return Object.values(r).some(val => String(val).toUpperCase().includes('KABIN'));
        });
        console.log(`=== Matches in sheet '${sheetName}' ===`);
        console.log("Count:", matched.length);
        if (matched.length > 0) {
            console.log("Headers:", Object.keys(rows[0]));
            console.log(JSON.stringify(matched.slice(0, 3), null, 2));
        }
    });
} else {
    console.log("File does not exist:", filePath);
}

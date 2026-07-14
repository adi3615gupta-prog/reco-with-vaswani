const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.USERPROFILE || 'C:\\Users\\Dell05', 'Downloads', 'SHRIPAD MULTIPRODUCT LLP 2024-26_Tally_Import_2025-04-01_to_2026-03-31 (2).xlsx');

if (fs.existsSync(filePath)) {
    console.log("Reading file:", filePath);
    const wb = XLSX.readFile(filePath);
    console.log("Sheets:", wb.SheetNames);
    
    wb.SheetNames.forEach(sheetName => {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        const matched = rows.filter(r => {
            return Object.values(r).some(val => String(val).toUpperCase().includes('KABIN'));
        });
        console.log(`Sheet '${sheetName}' matches count:`, matched.length);
        if (matched.length > 0) {
            console.log(JSON.stringify(matched.slice(0, 5), null, 2));
        }
    });
} else {
    console.log("File does not exist:", filePath);
}

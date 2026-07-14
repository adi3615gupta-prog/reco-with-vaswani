const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.USERPROFILE || 'C:\\Users\\Dell05', 'Downloads', 'DYP INFRAPROJECTS PVT.LTD._Tally_Import_2025-04-01_to_2026-03-31.xlsx');

if (fs.existsSync(filePath)) {
    console.log("Reading file:", filePath);
    const wb = XLSX.readFile(filePath);
    console.log("Sheets in workbook:", wb.SheetNames);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    
    // We parse with raw: false to match what the browser does
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    console.log("Total rows in sheet:", rows.length);
    
    const matched = rows.filter(r => {
        return Object.values(r).some(val => String(val).toUpperCase().includes('KABIN'));
    });
    
    console.log("=== Matching rows found ===");
    console.log("Count:", matched.length);
    if (matched.length > 0) {
        console.log("Headers:", Object.keys(matched[0]));
        console.log(JSON.stringify(matched.slice(0, 10), null, 2));
    }
} else {
    console.log("File does not exist:", filePath);
}

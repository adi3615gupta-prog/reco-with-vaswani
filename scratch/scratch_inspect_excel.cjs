const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'TDS_Reconciliation_1782284300192.xlsx');
console.log('Reading file:', filePath);

try {
    const wb = XLSX.readFile(filePath);
    console.log('Sheet names:', wb.SheetNames);
    
    wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        console.log(`\n=== Sheet: ${sheetName} (First 20 rows) ===`);
        data.slice(0, 30).forEach((row, i) => {
            console.log(`Row ${i + 1}:`, row.slice(0, 8));
        });
    });
} catch (e) {
    console.error('Error reading excel:', e);
}

const XLSX = require('xlsx');
const fs = require('fs');

if (fs.existsSync('test_out.xlsx')) {
    console.log("Reading test_out.xlsx...");
    const wb = XLSX.readFile('test_out.xlsx');
    console.log("Sheets:", wb.SheetNames);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log("Rows count:", data.length);
    console.log("First 3 rows:");
    console.log(data.slice(0, 3));
    console.log("Headers:", Object.keys(data[0] || {}));
} else {
    console.log("test_out.xlsx does not exist.");
}

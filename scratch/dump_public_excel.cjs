const xlsx = require('xlsx');

function dumpExcel(filePath) {
    console.log('--- ' + filePath + ' ---');
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // Print first 15 rows
        for (let i = 0; i < Math.min(15, data.length); i++) {
            console.log(JSON.stringify(data[i]));
        }
    } catch (e) {
        console.error(e);
    }
    console.log('\n');
}

dumpExcel('public/FAR Export_DYP INFRAPROJECTS PRIVATE LIMITED.xlsx');
dumpExcel('public/incomet tax.xlsx');

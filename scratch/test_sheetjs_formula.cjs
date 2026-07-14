const XLSX = require('xlsx-js-style');

const rows = [
  ["A", "B", "C"],
  [10, 20, { f: "A2+B2" }],
  [30, 40, { f: "A3+B3" }],
  ["Total", null, { f: "SUM(C2:C3)" }]
];

const ws = XLSX.utils.aoa_to_sheet(rows);
console.log(ws['C2']);
console.log(ws['C4']);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Test");
XLSX.writeFile(wb, "scratch_test_formula.xlsx");
console.log("File written successfully!");

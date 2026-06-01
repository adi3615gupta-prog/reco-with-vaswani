const fs = require('fs');
let t = fs.readFileSync('src/pages/TallyDirectImport.tsx', 'utf8');
t = t.replace(
  '{/* Table Preview */}',
  `{fetchedData.some(v => v.debugLog) && (<div className="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-lg max-h-48 overflow-y-auto"><p className="text-xs font-semibold text-slate-400 mb-2">TAX ENGINE DEBUG LOGS (First 50 Vouchers)</p><pre className="text-[10px] text-slate-500 font-mono whitespace-pre-wrap">{fetchedData.slice(0, 50).map(v => \`Voucher: \${v.voucherNumber}\\n\${v.debugLog}\`).filter(l => l.includes('Amt')).join('\\n\\n')}</pre></div>)}
  {/* Table Preview */}`
);
fs.writeFileSync('src/pages/TallyDirectImport.tsx', t);

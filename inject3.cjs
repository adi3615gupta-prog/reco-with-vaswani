const fs = require('fs');
let t = fs.readFileSync('src/pages/TallyDirectImport.tsx', 'utf8');

const replacement = `            {/* Custom Tax Groups */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
                <span className="w-4 h-4 text-emerald-400">🛡</span>
                Step 3: Custom Tax Groups Mapping
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Specify which Ledger Groups Tally should look inside to find your Input/Output GST ledgers.
                You can provide multiple groups separated by commas.
              </p>
              
              <div className="grid gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Input Tax Groups (Purchases)</label>
                  <input
                    type="text"
                    value={customInputTaxGroups}
                    onChange={e => handleInputTaxGroupsChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                    placeholder="e.g. ITC, DUTIES & TAXES"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Output Tax Groups (Sales)</label>
                  <input
                    type="text"
                    value={customOutputTaxGroups}
                    onChange={e => handleOutputTaxGroupsChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                    placeholder="e.g. OUTPUT, DUTIES & TAXES"
                  />
                </div>
              </div>
            </div>

            {/* Step 4: Preview & Export */}`;

t = t.replace('{/* Step 4: Preview & Export */}', replacement);
fs.writeFileSync('src/pages/TallyDirectImport.tsx', t);

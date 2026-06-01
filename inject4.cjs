const fs = require('fs');
let t = fs.readFileSync('src/pages/TallyDirectImport.tsx', 'utf8');

// I will just use regex to replace everything between "Step 3" and "Step 4"
const startStr = '<h2 className="text-sm font-bold mb-4 flex items-center gap-2">\\n                <span className="w-4 h-4 text-emerald-400">🛡</span>\\n                Step 3: Custom Tax Mapping\\n              </h2>';
const endStr = '{/* ─── Step 4: Preview & Export ─── */}';

const replacement = `<h2 className="text-sm font-bold mb-4 flex items-center gap-2">
                <span className="w-4 h-4 text-emerald-400">🛡</span>
                Step 3: Custom Tax Mapping
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Explicitly define your Tax Ledgers here if the auto-detection is not picking up the values. If you add ledgers here, it will guarantee they are classified correctly.
              </p>
              
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-semibold text-slate-300">Explicit Ledger Mapping Table</label>
                  <button onClick={addCustomTaxLedger} className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1 rounded transition-colors">
                    + Add Ledger
                  </button>
                </div>
                
                {customTaxLedgers.length > 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Exact Ledger Name (in Tally)</th>
                          <th className="px-3 py-2 font-medium w-32">Tax Category</th>
                          <th className="px-3 py-2 font-medium w-32">Tax Type</th>
                          <th className="px-3 py-2 font-medium w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {customTaxLedgers.map(ledger => (
                          <tr key={ledger.id}>
                            <td className="px-3 py-2">
                              <input 
                                type="text" 
                                value={ledger.name} 
                                onChange={e => updateCustomTaxLedger(ledger.id, 'name', e.target.value)} 
                                className="w-full bg-transparent border-none outline-none text-slate-200" 
                                placeholder="e.g. CGST @ 9% Input" 
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select 
                                value={ledger.category} 
                                onChange={e => updateCustomTaxLedger(ledger.id, 'category', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 outline-none"
                              >
                                <option value="CGST">CGST</option>
                                <option value="SGST">SGST</option>
                                <option value="IGST">IGST</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select 
                                value={ledger.type} 
                                onChange={e => updateCustomTaxLedger(ledger.id, 'type', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 outline-none"
                              >
                                <option value="Input">Input</option>
                                <option value="Output">Output</option>
                                <option value="RCM">RCM</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => removeCustomTaxLedger(ledger.id)} className="text-red-400 hover:text-red-300">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500">
                    No explicit ledgers defined. Auto-detection via Groups will be used.
                  </div>
                )}
              </div>

              <div className="grid gap-4 pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500 col-span-full">Or map entire Ledger Groups (Fallback Auto-Detection):</p>
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

            {/* Fetch Button */}
            <button
              onClick={handleFetchVouchers}
              disabled={isFetching || voucherTypes.every((v) => !v.enabled)}
              className="w-full h-12 bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-black text-sm rounded-xl hover:from-cyan-500 hover:to-teal-500 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
            >
              {isFetching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Fetching from Tally...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Fetch Vouchers from Tally
                </>
              )}
            </button>

            {/* Progress log */}
            {fetchProgress.length > 0 && (
              <div className="mt-4 bg-slate-800/50 rounded-xl p-3 max-h-40 overflow-y-auto">
                {fetchProgress.map((msg, i) => (
                  <p key={i} className="text-[11px] text-slate-300 font-mono py-0.5">
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Step 4: Preview & Export ─── */}`;

const sIdx = t.indexOf('<h2 className="text-sm font-bold mb-4 flex items-center gap-2">\\n                <span className="w-4 h-4 text-emerald-400">🛡</span>\\n                Step 3: Custom Tax Mapping\\n              </h2>');
// Wait, index of with \n is brittle. I'll just regex.
t = t.replace(/<h2 className="text-sm font-bold mb-4 flex items-center gap-2">[\s\S]*?{\/\* ─── Step 4: Preview & Export ─── \*\/}/m, replacement);
fs.writeFileSync('src/pages/TallyDirectImport.tsx', t);

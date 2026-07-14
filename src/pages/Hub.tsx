import React from 'react';
import { 
  Sparkles, Users, Lock, GitCompare, FileCode2, Database, Activity, 
  FileSpreadsheet, ShieldCheck, Search, Server, Send, ImageIcon 
} from 'lucide-react';

interface HubProps {
  moduleConfig: Record<string, number>;
  setAppRoute: (route: any) => void;
  setMode: (mode: any) => void;
  setStep: (step: any) => void;
}

export default function Hub({ moduleConfig, setAppRoute, setMode, setStep }: HubProps) {
  return (
    <div className="space-y-12 max-w-6xl mx-auto w-full animate-slow-reveal">
      
                 
                 {/* INTUITIVE GRAPHIC DESIGN HERO */}
                 <div className="text-center space-y-4 max-w-3xl mx-auto mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                       <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Interactive Compliance Hub
                    </div>
                 <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                       Unified Workspace Suite
                    </h2>
                 <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
                       Access high-performance compliance modules directly from this command console. All local data is processed and kept strictly on-premise.
                    </p>
                 </div>

                 {/* 3x2 SYMMETRICAL COMPLIANCE TOOLS GRID */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    
                    {/* Card 1: Practice Dashboard (Amber Accent) */}
                    <div 
                      onClick={() => moduleConfig['Dashboard'] !== 0 && setAppRoute('dashboard')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-amber p-6 rounded-2xl ${moduleConfig['Dashboard'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Dashboard'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Users className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-amber-500 transition-colors uppercase tracking-widest">Control Suite</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">Practice Dashboard</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Manage clients list, track filing due dates, and securely back up database tables to Google Drive.</p>
                       </div>
                    </div>

                    {/* Card 2: Consolidate Ledgers (Blue Accent) */}
                    <div 
                      onClick={() => moduleConfig['Consolidator'] !== 0 && setAppRoute('consolidation')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-blue p-6 rounded-2xl ${moduleConfig['Consolidator'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Consolidator'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Database className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-blue-500 transition-colors uppercase tracking-widest">Organization</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">Consolidate Ledgers</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Merge decentralized multi-branch sales or purchase ledgers into a clean consolidated sheet format.</p>
                       </div>
                    </div>

                    {/* Card 3: GST Reconciliation (Emerald Accent) */}
                    <div 
                      onClick={() => { if (moduleConfig['RecoEngine'] !== 0) { setAppRoute('reco'); setMode(null); setStep('upload'); } }}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-emerald p-6 rounded-2xl ${moduleConfig['RecoEngine'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['RecoEngine'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <ShieldCheck className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-emerald-500 transition-colors uppercase tracking-widest">Audit Engine</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">GST Reconciliation</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">High-performance matching engine with custom thresholds, debit notes parsing, and automatic discrepancy alerts.</p>
                       </div>
                    </div>

                    {/* Card 4: GSTIN Scan & Duplicate Logic */}
                    <div 
                      onClick={() => setAppRoute('gstin-scan')}
                      className="glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-emerald p-6 rounded-2xl cursor-pointer flex flex-col justify-between min-h-[220px] relative"
                    >
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center transition-transform hover:scale-110 duration-300">
                             <Search className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">GSTIN Audit</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">GSTIN Scan</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Run duplicate-GSTIN and wrong-GSTIN checks, view conflicts found by the reconciliation engine, and understand fuzzy-match thresholds.</p>
                       </div>
                    </div>

                    {/* Card 4: Tally XML Converter (Pink Accent) */}
                    <div 
                      onClick={() => moduleConfig['TallyConverter'] !== 0 && setAppRoute('tally')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-pink p-6 rounded-2xl ${moduleConfig['TallyConverter'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['TallyConverter'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-pink-500/10 border border-pink-500/20 text-pink-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <FileCode2 className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-pink-500 transition-colors uppercase tracking-widest">Extraction</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-pink-500 dark:group-hover:text-pink-400 transition-colors">Tally XML Converter</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Dual-engine parser that decodes raw Tally XML files into perfectly styled Excel books in 500ms.</p>
                       </div>
                    </div>

                    {/* Card 4b: Tally Direct Import (Teal Accent) */}
                    <div 
                      onClick={() => moduleConfig['TallyDirect'] !== 0 && setAppRoute('tally-direct')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-teal p-6 rounded-2xl ${moduleConfig['TallyDirect'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['TallyDirect'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-teal-500/10 border border-teal-500/20 text-teal-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Server className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-teal-500 transition-colors uppercase tracking-widest">Live API</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors">Tally Direct Import</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Connect directly to TallyPrime via XML API. Auto-fetch purchase, sales, journal & credit/debit notes.</p>
                       </div>
                    </div>

                     {/* Card 4c: GSTR-2B & 3B Compliance Tracker (Yellow Accent) */}
                     <div 
                       onClick={() => moduleConfig['Tracker'] !== 0 && setAppRoute('tracker')}
                       className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-yellow p-6 rounded-2xl ${moduleConfig['Tracker'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                     >
                        {moduleConfig['Tracker'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <Search className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-black text-slate-500 group-hover:text-yellow-500 transition-colors uppercase tracking-widest">ITC Suite</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors">GSTR-2B & 3B Tracker</h3>
                           <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Invoice-wise GSTR-2B matching & monthly GSTR-3B summary returns analysis for full financial year (April to March).</p>
                        </div>
                     </div>

                    {/* Card 5: Returns Prep & Filing (Purple Accent) */}
                    <div 
                      onClick={() => moduleConfig['Returns'] !== 0 && setAppRoute('returns')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-purple p-6 rounded-2xl ${moduleConfig['Returns'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['Returns'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 text-purple-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <Send className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-purple-500 transition-colors uppercase tracking-widest">Taxation Suite</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">Returns Preparation</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Validate compliance registers offline, prepare draft filings, and auto-upload JSON returns safely.</p>
                       </div>
                    </div>

                    {/* Card 6: AI Vision OCR Engine (Yellow Accent) */}
                    <div 
                      onClick={() => moduleConfig['OCR'] !== 0 && setAppRoute('ocr')}
                      className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-yellow p-6 rounded-2xl ${moduleConfig['OCR'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                    >
                       {moduleConfig['OCR'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                       <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                             <ImageIcon className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-black text-slate-500 group-hover:text-yellow-500 transition-colors uppercase tracking-widest">Intelligence</span>
                       </div>
                       <div className="mt-8">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors">AI Deep-Vision OCR</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Upload raw invoice pictures or screenshot slices. Vision models extract and format tabular rows instantly.</p>
                       </div>
                    </div>

                     {/* Card 7: Financial Statements (Cyan Accent) */}
                     <div 
                       onClick={() => moduleConfig['FinStatements'] !== 0 && setAppRoute('fin-statements')}
                       className={`glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-blue p-6 rounded-2xl ${moduleConfig['FinStatements'] !== 0 ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[220px] relative`}
                       style={{ '--card-hover-border': 'rgba(6, 182, 212, 0.3)', '--card-glow': 'rgba(6, 182, 212, 0.15)' } as React.CSSProperties}
                     >
                        {moduleConfig['FinStatements'] === 0 && <div className="absolute top-4 right-4"><Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /></div>}
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <FileSpreadsheet className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-black text-slate-500 group-hover:text-cyan-500 transition-colors uppercase tracking-widest">Schedule III</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors">Financial Statements</h3>
                           <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Automated BS, P&L, Cash Flow & Notes to Accounts compliant with the Companies Act, 2013.</p>
                        </div>
                     </div>

                     {/* Card 8: TDS Reconciliation */}
                     <div 
                       onClick={() => setAppRoute('tds-reco')}
                       className="glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-purple p-6 rounded-2xl cursor-pointer group flex flex-col justify-between min-h-[220px] relative"
                     >
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 text-purple-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <FileSpreadsheet className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-bold text-slate-500 group-hover:text-purple-500 transition-colors uppercase tracking-widest">Tax Deducted</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">TDS Reconciliation</h3>
                           <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Match Tally Books against Form 26Q. Auto-detect nature of expense and entity types to identify short deductions.</p>
                        </div>
                     </div>

                     {/* Card 9: CMA Data & Project Report */}
                     <div 
                       onClick={() => setAppRoute('cma')}
                       className="glass-card-np bg-white/50 dark:bg-[rgba(15,23,42,0.45)] neon-blue p-6 rounded-2xl cursor-pointer group flex flex-col justify-between min-h-[220px] relative"
                       style={{ '--card-hover-border': 'rgba(6, 182, 212, 0.3)', '--card-glow': 'rgba(6, 182, 212, 0.15)' } as React.CSSProperties}
                     >
                        <div className="flex justify-between items-start">
                           <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                              <FileSpreadsheet className="w-6 h-6" />
                           </div>
                           <span className="text-[10px] font-bold text-slate-500 group-hover:text-cyan-500 transition-colors uppercase tracking-widest">Credit Audit</span>
                        </div>
                        <div className="mt-8">
                           <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors">CMA Data & Report</h3>
                           <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">Automate credit monitoring arrangement reports with Tandon 2nd method, repayment amortization schedules, and dynamic forecast formulas.</p>
                        </div>
                     </div>

                 </div>

                 {/* FOOTER TEXT */}
                 <div className="text-center pt-8 border-t border-slate-800/80">
                    <p className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">OFFLINE COMPLIANCE PLATFORM â€¢ RECO WITH VASWANI â€¢ ALL RIGHTS SECURED</p>
                 </div>
              
    </div>
  );
}

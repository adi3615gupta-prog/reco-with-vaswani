import React, { useState } from 'react';
import { 
  Sparkles, Users, Lock, FileCode2, Database, 
  FileSpreadsheet, ShieldCheck, Search, Server, Send, ImageIcon,
  Zap, ShieldAlert, Landmark, ChevronRight, ArrowLeft
} from 'lucide-react';

interface HubProps {
  moduleConfig: Record<string, number>;
  setAppRoute: (route: any) => void;
  setMode: (mode: any) => void;
  setStep: (step: any) => void;
}

export default function Hub({ moduleConfig, setAppRoute, setMode, setStep }: HubProps) {
  const [activeCategoryCard, setActiveCategoryCard] = useState<'wip' | 'reco' | 'collector' | 'audit' | 'tax' | null>(null);

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

      {/* MAIN CONTENT AREA: 5 SUITE CARDS OR SELECTED SUITE DRILL-DOWN */}
      {activeCategoryCard === null ? (
        /* 5 MAIN CATEGORY CARDS - CLICK TO EXPAND */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Card 01: Work In Progress (WIP) Suite */}
          <div 
            onClick={() => setActiveCategoryCard('wip')}
            className="glass-card-np neon-amber p-6 md:p-7 rounded-3xl border border-amber-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-5 cursor-pointer hover:border-amber-500/60 hover:scale-[1.02] transition-all group flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/5">
                  <Zap className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                  7 Modules
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest font-bold">Suite 01</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1 group-hover:text-amber-400 transition-colors">
                  Work In Progress (WIP) Suite
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Comprehensive practice control, GSTIN auditing, returns tracking, AI vision OCR &amp; financial reports.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {['01. Practice Dashboard', '02. GSTIN Scan', '03. 2B/3B Tracker', '04. Return Prep', '05. AI OCR', '06. Financial Statements', '07. CMA Report'].map((mod, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-amber-500/20 text-slate-300">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-amber-500/15 flex items-center justify-between text-amber-400 text-xs font-bold">
              <span>Open Suite 01</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 02: Reconciliation Engine Hub */}
          <div 
            onClick={() => setActiveCategoryCard('reco')}
            className="glass-card-np neon-emerald p-6 md:p-7 rounded-3xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-5 cursor-pointer hover:border-emerald-500/60 hover:scale-[1.02] transition-all group flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/5">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  3 Modules
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Suite 02</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1 group-hover:text-emerald-400 transition-colors">
                  Reconciliation Engine Hub
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  High-performance matching engines for GST ledgers, debit note parsing &amp; Form 26Q TDS reconciliation.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {['01. GST Consolidator', '02. GST Reco Engine', '03. TDS Reconciliation'].map((mod, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-emerald-500/20 text-slate-300">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-emerald-500/15 flex items-center justify-between text-emerald-400 text-xs font-bold">
              <span>Open Suite 02</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 03: Data Collector & Connectors */}
          <div 
            onClick={() => setActiveCategoryCard('collector')}
            className="glass-card-np neon-pink p-6 md:p-7 rounded-3xl border border-pink-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-5 cursor-pointer hover:border-pink-500/60 hover:scale-[1.02] transition-all group flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform shadow-lg shadow-pink-500/5">
                  <Server className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-black uppercase tracking-widest">
                  2 Modules
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-pink-400 uppercase tracking-widest font-bold">Suite 03</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1 group-hover:text-pink-400 transition-colors">
                  Data Collector &amp; Connectors
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Fast XML parsing &amp; real-time TallyPrime XML API direct data extractions.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {['01. Tally XML Converter', '02. Tally Direct Import'].map((mod, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-pink-500/20 text-slate-300">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-pink-500/15 flex items-center justify-between text-pink-400 text-xs font-bold">
              <span>Open Suite 03</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 04: Statutory Audit Modules */}
          <div 
            onClick={() => setActiveCategoryCard('audit')}
            className="glass-card-np neon-indigo p-6 md:p-7 rounded-3xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-5 cursor-pointer hover:border-indigo-500/60 hover:scale-[1.02] transition-all group flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/5">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                  3 Modules
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold">Suite 04</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1 group-hover:text-indigo-400 transition-colors">
                  Statutory Audit Modules
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Dual depreciation (Schedule II &amp; Sec 32), Form 3CD Clause 44 &amp; analytical audit sampling.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {['01. Dual Depreciation', '02. Tax Audit Clause 44', '03. Analytical Audit Module'].map((mod, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-indigo-500/20 text-slate-300">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-indigo-500/15 flex items-center justify-between text-indigo-400 text-xs font-bold">
              <span>Open Suite 04</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 05: Taxation & Calculator Suite */}
          <div 
            onClick={() => setActiveCategoryCard('tax')}
            className="glass-card-np neon-blue p-6 md:p-7 rounded-3xl border border-blue-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-5 cursor-pointer hover:border-blue-500/60 hover:scale-[1.02] transition-all group flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/5">
                  <Landmark className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                  1 Module
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest font-bold">Suite 05</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1 group-hover:text-blue-400 transition-colors">
                  Taxation &amp; Calculator Suite
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Tax liability calculation for FY 2025-26 &amp; FY 2026-27 with Old vs New regime optimization.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {['01. Income Tax Calculator'].map((mod, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-blue-500/20 text-slate-300">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-blue-500/15 flex items-center justify-between text-blue-400 text-xs font-bold">
              <span>Open Suite 05</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>
      ) : (
        /* SELECTED CATEGORY CARD DRILL-DOWN VIEW */
        <div className="space-y-6 animate-fadeIn">
          
          {/* BACK NAVIGATION BAR */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <button
              onClick={() => setActiveCategoryCard(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700/80 shadow-md hover:scale-[1.02]"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>← Back to All Suites</span>
            </button>

            <div className="text-xs text-slate-400 font-mono">
              Active Suite: <span className="text-amber-400 font-bold uppercase">{activeCategoryCard}</span>
            </div>
          </div>

          {/* CARD 1 DRILL-DOWN: WIP SUITE */}
          {activeCategoryCard === 'wip' && (
            <div className="glass-card-np neon-amber p-6 md:p-8 rounded-3xl border border-amber-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/5">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                      Suite 01 • 7 Modules
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">Work In Progress (WIP) Suite</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                  Comprehensive practice control, GSTIN auditing, returns tracking, AI vision OCR &amp; financial reports.
                </p>
              </div>

              {/* Modules inside Card 1 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* 01. Practice Dashboard */}
                <div
                  onClick={() => moduleConfig['Dashboard'] !== 0 && setAppRoute('dashboard')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-amber-500/20 hover:border-amber-500/50 transition-all group ${moduleConfig['Dashboard'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                >
                  {moduleConfig['Dashboard'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest">Module 1.1</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                      01. Practice Dashboard <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-amber-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Manage client lists, track filing due dates, and back up database tables.</p>
                  </div>
                </div>

                {/* 02. GSTIN Smart Scanner */}
                <div
                  onClick={() => setAppRoute('gstin-scan')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Search className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 1.2</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                      02. GSTIN Smart Scanner <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Run duplicate &amp; wrong-GSTIN checks and review matching rules.</p>
                  </div>
                </div>

                {/* 03. GSTR-2B & 3B Tracker */}
                <div
                  onClick={() => moduleConfig['Tracker'] !== 0 && setAppRoute('tracker')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-yellow-500/20 hover:border-yellow-500/50 transition-all group ${moduleConfig['Tracker'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                >
                  {moduleConfig['Tracker'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Search className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-yellow-500/80 uppercase tracking-widest">Module 1.3</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-yellow-400 transition-colors flex items-center gap-1.5">
                      03. GSTR-2B &amp; 3B Tracker <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-yellow-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Invoice-wise 2B matching &amp; monthly GSTR-3B summary analysis.</p>
                  </div>
                </div>

                {/* 04. Offline Return Preparation */}
                <div
                  onClick={() => moduleConfig['Returns'] !== 0 && setAppRoute('returns')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/50 transition-all group ${moduleConfig['Returns'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                >
                  {moduleConfig['Returns'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Send className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-purple-500/80 uppercase tracking-widest">Module 1.4</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                      04. Offline Return Preparation <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-purple-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Validate registers offline &amp; auto-generate uploadable JSON returns.</p>
                  </div>
                </div>

                {/* 05. AI Deep-Vision OCR */}
                <div
                  onClick={() => moduleConfig['OCR'] !== 0 && setAppRoute('ocr')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-yellow-500/20 hover:border-yellow-500/50 transition-all group ${moduleConfig['OCR'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                >
                  {moduleConfig['OCR'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-yellow-500/80 uppercase tracking-widest">Module 1.5</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-yellow-400 transition-colors flex items-center gap-1.5">
                      05. AI Deep-Vision OCR <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-yellow-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Extract invoice data from pictures and screenshots instantly.</p>
                  </div>
                </div>

                {/* 06. Financial Statements */}
                <div
                  onClick={() => moduleConfig['FinStatements'] !== 0 && setAppRoute('fin-statements')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-cyan-500/20 hover:border-cyan-500/50 transition-all group ${moduleConfig['FinStatements'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[170px] relative`}
                >
                  {moduleConfig['FinStatements'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-cyan-500/80 uppercase tracking-widest">Module 1.6</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                      06. Financial Statements Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-cyan-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Automated BS, P&amp;L, Cash Flow compliant with Companies Act.</p>
                  </div>
                </div>

                {/* 07. CMA Data & Project Report */}
                <div
                  onClick={() => setAppRoute('cma')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[170px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 1.7</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                      07. CMA Data &amp; Project Report <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Credit monitoring arrangement reports &amp; amortization schedules.</p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* CARD 2 DRILL-DOWN: RECONCILIATION HUB */}
          {activeCategoryCard === 'reco' && (
            <div className="glass-card-np neon-emerald p-6 md:p-8 rounded-3xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                      Suite 02 • 3 Modules
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">Reconciliation Engine Hub</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                  High-performance matching engines for GST ledgers, debit note parsing &amp; Form 26Q TDS reconciliation.
                </p>
              </div>

              {/* Sub-groups inside Card 2 */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 2.1 — GST Ledger Reconciliation
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* 01. GST Data Consolidator */}
                  <div
                    onClick={() => moduleConfig['Consolidator'] !== 0 && setAppRoute('consolidation')}
                    className={`p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all group ${moduleConfig['Consolidator'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                  >
                    {moduleConfig['Consolidator'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Database className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 2.1.1</span>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                        01. GST Data Consolidator <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Merge decentralized multi-branch sales/purchase ledgers into a clean format.</p>
                    </div>
                  </div>

                  {/* 02. GST Reconciliation Engine */}
                  <div
                    onClick={() => { if (moduleConfig['RecoEngine'] !== 0) { setAppRoute('reco'); setMode(null); setStep('upload'); } }}
                    className={`p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all group ${moduleConfig['RecoEngine'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                  >
                    {moduleConfig['RecoEngine'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 2.1.2</span>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                        02. GST Reconciliation Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">High-performance matching engine with custom thresholds &amp; debit note parsing.</p>
                    </div>
                  </div>

                </div>

                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 pt-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span> 2.2 — TDS Deductions Audit
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* 03. TDS Reconciliation */}
                  <div
                    onClick={() => setAppRoute('tds-reco')}
                    className="p-5 rounded-2xl bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-black text-purple-500/80 uppercase tracking-widest">Module 2.2.1</span>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-purple-400 transition-colors flex items-center gap-1.5">
                        03. TDS Form 26Q Reconciliation <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-purple-400" />
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Match Tally Books against Form 26Q &amp; detect short deductions automatically.</p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* CARD 3 DRILL-DOWN: DATA COLLECTOR */}
          {activeCategoryCard === 'collector' && (
            <div className="glass-card-np neon-pink p-6 md:p-8 rounded-3xl border border-pink-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-pink-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 shadow-lg shadow-pink-500/5">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-black uppercase tracking-widest">
                      Suite 03 • 2 Modules
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">Data Collector &amp; Connectors</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                  Fast XML parsing &amp; real-time TallyPrime XML API direct data extractions.
                </p>
              </div>

              {/* Modules inside Card 3 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* 01. Tally Dual-Engine Converter */}
                <div
                  onClick={() => moduleConfig['TallyConverter'] !== 0 && setAppRoute('tally')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-pink-500/20 hover:border-pink-500/50 transition-all group ${moduleConfig['TallyConverter'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                >
                  {moduleConfig['TallyConverter'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileCode2 className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-pink-500/80 uppercase tracking-widest">Module 3.1</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-pink-400 transition-colors flex items-center gap-1.5">
                      01. Tally Dual-Engine XML Converter <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-pink-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Decode raw Tally XML files into styled Excel workbooks in 500ms.</p>
                  </div>
                </div>

                {/* 02. Tally Direct Import */}
                <div
                  onClick={() => moduleConfig['TallyDirect'] !== 0 && setAppRoute('tally-direct')}
                  className={`p-5 rounded-2xl bg-slate-950/60 border border-teal-500/20 hover:border-teal-500/50 transition-all group ${moduleConfig['TallyDirect'] !== 0 ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-50 cursor-not-allowed'} flex flex-col justify-between min-h-[160px] relative`}
                >
                  {moduleConfig['TallyDirect'] === 0 && <div className="absolute top-3 right-3"><Lock className="w-3.5 h-3.5 text-slate-500" /></div>}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Server className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-teal-500/80 uppercase tracking-widest">Module 3.2</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-teal-400 transition-colors flex items-center gap-1.5">
                      02. Tally Direct XML API Import <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-teal-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Connect directly to TallyPrime via XML API to auto-fetch ledgers &amp; vouchers.</p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* CARD 4 DRILL-DOWN: STATUTORY AUDIT */}
          {activeCategoryCard === 'audit' && (
            <div className="glass-card-np neon-indigo p-6 md:p-8 rounded-3xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/5">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                      Suite 04 • 3 Modules
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">Statutory Audit Modules</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                  Dual depreciation (Schedule II &amp; Sec 32), Form 3CD Clause 44 &amp; analytical audit sampling.
                </p>
              </div>

              {/* Modules inside Card 4 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* 01. Dual Depreciation */}
                <div
                  onClick={() => setAppRoute('depreciation')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Module 4.1</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                      01. Dual Depreciation Engine <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-emerald-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Automate Companies Act (Schedule II) &amp; Income Tax (Sec 32) depreciation.</p>
                  </div>
                </div>

                {/* 02. Tax Audit Clause 44 */}
                <div
                  onClick={() => setAppRoute('clause44')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-violet-500/20 hover:border-violet-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-violet-500/80 uppercase tracking-widest">Module 4.2</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-violet-400 transition-colors flex items-center gap-1.5">
                      02. Tax Audit — Clause 44 Parser <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-violet-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Bifurcate expenses into GST &amp; Non-GST buckets for Winman Form 3CD.</p>
                  </div>
                </div>

                {/* 03. Analytical Audit Module */}
                <div
                  onClick={() => setAppRoute('audit')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-indigo-500/20 hover:border-indigo-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-indigo-500/80 uppercase tracking-widest">Module 4.3</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                      03. Analytical Audit &amp; Sampling <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Integrated analytical audits, FIFO ageing &amp; SA 530 audit sampling.</p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* CARD 5 DRILL-DOWN: TAXATION */}
          {activeCategoryCard === 'tax' && (
            <div className="glass-card-np neon-blue p-6 md:p-8 rounded-3xl border border-blue-500/20 bg-slate-900/60 backdrop-blur-xl relative overflow-hidden space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-blue-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/5">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                      Suite 05 • 1 Module
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">Taxation &amp; Calculator Suite</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
                  Tax liability calculation for FY 2025-26 &amp; FY 2026-27 with Old vs New regime optimization.
                </p>
              </div>

              {/* Modules inside Card 5 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* 01. Income Tax Calculator */}
                <div
                  onClick={() => setAppRoute('income-tax')}
                  className="p-5 rounded-2xl bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer group hover:scale-[1.02] flex flex-col justify-between min-h-[160px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">Module 5.1</span>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                      01. Income Tax Calculator <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-blue-400" />
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">Compare Old vs New regimes, optimize deductions &amp; compute surcharge with marginal relief.</p>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* FOOTER TEXT */}
      <div className="text-center pt-8 border-t border-slate-800/80">
        <p className="text-[9px] font-mono tracking-[0.3em] text-slate-500 uppercase">OFFLINE COMPLIANCE PLATFORM • AUDIT WITH VASWANI • ALL RIGHTS SECURED</p>
      </div>

    </div>
  );
}

import React, { useState } from 'react';
import { 
  Sparkles, Users, Lock, FileCode2, Database, 
  FileSpreadsheet, ShieldCheck, Search, Server, Send, ImageIcon,
  Zap, ShieldAlert, Landmark, ChevronRight, ArrowLeft, ArrowRight, Calculator,
  AlertTriangle, CalendarClock, RotateCcw
} from 'lucide-react';

interface HubProps {
  moduleConfig: Record<string, number>;
  setAppRoute: (route: any) => void;
  setMode: (mode: any) => void;
  setStep: (step: any) => void;
  companyName?: string;
  loginUser?: string;
  setReturnsInitialTab?: (tab: any) => void;
}

export default function Hub({ 
  moduleConfig, 
  setAppRoute, 
  setMode, 
  setStep, 
  companyName = 'DYP INFRAPROJECTS', 
  loginUser = 'CA Vipul Patel', 
  setReturnsInitialTab = () => {} 
}: HubProps) {
  const [activeCategoryCard, setActiveCategoryCard] = useState<'returns' | 'wip' | 'reco' | 'collector' | 'audit' | 'tax' | 'cma-bank' | null>(null);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full animate-slow-reveal relative">

      {/* Ambient Luminous Gradient Mesh */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[920px] h-[320px] bg-gradient-to-b from-blue-100/40 via-slate-100/30 to-transparent blur-3xl pointer-events-none -z-10 rounded-full opacity-70" />

      {activeCategoryCard === null ? (
                  <>
                    {/* 1. Executive Welcome & Operational KPI Strip (1:1 Stitch Blueprint) */}
                    <section className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                      {/* Left: Greeting */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h1 className="text-[20px] font-bold text-slate-900 tracking-tight leading-none">
                            Welcome back, {loginUser || 'CA Vipul Patel'}
                          </h1>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>verified</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[13px] flex-wrap">
                          <span className="font-medium text-slate-800">Partner</span>
                          <span>·</span>
                          <span>VCAN &amp; Associates LLP, CAs</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[12px] font-mono text-blue-600 font-medium">Firm Reg: 104522W</span>
                        </div>
                      </div>

                      {/* Right: 3 Operational KPI Pills */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Amber: IMS Actions */}
                        <div 
                          onClick={() => { setReturnsInitialTab('ims2b'); setAppRoute('returns'); }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50/70 border border-amber-200/70 hover:bg-amber-100/70 transition-colors cursor-pointer"
                          title="Open GST IMS Actions"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-amber-700/80 font-semibold leading-none">IMS Actions</span>
                            <span className="text-[12px] font-mono font-semibold text-amber-700 leading-tight">18 Pending Review</span>
                          </div>
                        </div>

                        {/* Rose: GSTR-3B Deadlines */}
                        <div 
                          onClick={() => { setReturnsInitialTab('working3b'); setAppRoute('returns'); }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-50/70 border border-pink-200/70 hover:bg-pink-100/70 transition-colors cursor-pointer"
                          title="Open GSTR-3B Working Sheet"
                        >
                          <CalendarClock className="w-4 h-4 text-pink-600" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-pink-700/80 font-semibold leading-none">GSTR-3B Deadlines</span>
                            <span className="text-[12px] font-mono font-semibold text-pink-600 leading-tight">28 Due (7 Days)</span>
                          </div>
                        </div>

                        {/* Emerald: Tally LAN Sync */}
                        <div 
                          onClick={() => setAppRoute('tally-direct')}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 hover:bg-emerald-100/70 transition-colors cursor-pointer"
                          title="Tally Port 9000 Status"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-emerald-800/80 font-semibold leading-none">Tally LAN Sync</span>
                            <span className="text-[12px] font-mono font-semibold text-emerald-700 leading-tight">Port 9000 Online</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 2. Primary Compliance Operations Header Strip */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                          <h2 className="text-[16px] font-bold text-slate-900 tracking-tight uppercase">Primary Compliance Operations</h2>
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-semibold uppercase tracking-wider">
                            High Frequency Workflows
                          </span>
                        </div>
                        <div className="text-slate-500 text-[12px] font-mono flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Real-Time GSTN Engine Connected</span>
                        </div>
                      </div>

                      {/* Top 2 Flagship Suites in 2-Column Wide Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Suite 04: Returns Preparation & Filing (Purple Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('returns')}
                          className="relative rounded-xl bg-white p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500"></div>
                          <div>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <Send className="w-6 h-6" />
                                </div>
                                <div>
                                  <span className="font-mono text-indigo-600 text-[10px] block uppercase tracking-wider font-semibold">SUITE 04</span>
                                  <h3 className="text-[18px] text-slate-900 font-bold leading-tight group-hover:text-indigo-600 transition-colors">
                                    Returns Preparation &amp; Filing
                                  </h3>
                                </div>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-[11px] font-semibold uppercase tracking-wider">
                                6 Modules
                              </span>
                            </div>

                            {/* Subtext */}
                            <p className="text-slate-600 text-[13px] mb-5 leading-relaxed">
                              Autonomous 12-month return cycles, Rule 88A set-off cascade, and Invoice Management System hub.
                            </p>

                            {/* 5 Clickable Module Rows */}
                            <div className="flex flex-col gap-2 mb-6">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('working3b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">GSTR-3B Working Sheet &amp; Rule 88A</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-indigo-700 border border-slate-200 font-semibold shadow-2xs">Ready</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('matrix'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">12-Month FY Comparative Matrix</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">13-Cols Aligned</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('ims2b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50/50 hover:bg-amber-50 border border-amber-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-amber-800 transition-colors">GST IMS &amp; 2B Recipient Decision Hub</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-amber-100/80 text-amber-800 border border-amber-300/60 font-semibold shadow-2xs">18 Pending</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('gstr2b_downloader'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-indigo-700 transition-colors">GSTR-2B 12-Month Inward Autopilot</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">8 Sheets Sync</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('gstr1_downloader'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-emerald-700 transition-colors">GSTR-1 Outward Harvester &amp; Table 12</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shadow-2xs">Zero-Merge</span>
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-400">Suite 04 · /returns-hub</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('returns'); }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-xs group-hover:translate-x-0.5"
                            >
                              <span>Launch Returns Workspace</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 02: Core GST & TDS Reco Engine (Emerald Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('reco')}
                          className="relative rounded-xl bg-white p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600"></div>
                          <div>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <ShieldCheck className="w-6 h-6" />
                                </div>
                                <div>
                                  <span className="font-mono text-emerald-700 text-[10px] block uppercase tracking-wider font-semibold">SUITE 02</span>
                                  <h3 className="text-[18px] text-slate-900 font-bold leading-tight group-hover:text-emerald-700 transition-colors">
                                    GST &amp; TDS Reconciliation Engine
                                  </h3>
                                </div>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold uppercase tracking-wider">
                                3 Modules
                              </span>
                            </div>

                            {/* Subtext */}
                            <p className="text-slate-600 text-[13px] mb-5 leading-relaxed">
                              Purchase Register vs GSTR-2B matching with ±₹2 tolerance, CDNR pairing, and Form 26Q matching.
                            </p>

                            {/* 4 Clickable Module Rows */}
                            <div className="flex flex-col gap-2 mb-6">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-emerald-700 transition-colors">GST Multi-Pass Reco (PR vs 2B)</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-emerald-100/90 text-emerald-800 border border-emerald-300/60 font-semibold shadow-2xs">±₹2.00 Tol</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-slate-900 transition-colors">Party-Wise Vendor Dispute Center</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-slate-700 border border-slate-200 font-medium shadow-2xs">WhatsApp / Mail Dispatch</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tds-reco'); }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors cursor-pointer group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  <span className="text-[13px] text-slate-800 font-medium group-hover/item:text-amber-800 transition-colors">TRACES Form 26Q TDS Consolidator</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-amber-700 border border-slate-200 font-medium shadow-2xs">194C/J/I/Q Auto-Tiers</span>
                              </div>

                              <div 
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 transition-colors group/item"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span className="text-[13px] text-slate-800 font-medium">Zero-Merge Corporate 12-Tab Excel</span>
                                </div>
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-white text-emerald-700 border border-slate-200 font-semibold shadow-2xs">100% Sort Safe</span>
                              </div>
                            </div>
                          </div>

                          {/* Footer CTA */}
                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-400">Suite 02 · /reconciliation</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setMode('2b-to-pr'); setAppRoute('reco'); }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 transition-colors shadow-xs group-hover:translate-x-0.5"
                            >
                              <span>Open Reco Workspace</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </article>

                      </div>
                    </div>

                    {/* 3. Secondary Compliance & Advisory Suites (4-Column Clean Grid) */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Secondary Compliance &amp; Advisory Suites</span>
                          <span className="text-slate-300">|</span>
                          <span className="font-mono text-[11px] text-slate-400">Firm Operations &amp; Diagnostic Modules</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

                        {/* Suite 01: Work In Progress & Practice Hub (Amber Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('wip')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Zap className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-amber-700 uppercase">SUITE 01</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-amber-700 transition-colors">
                              Work In Progress &amp; Practice Hub
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Practice management, roster metrics, and checksum validators.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-amber-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Practice Dashboard</span>
                                <span className="font-mono text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">342 Clients</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('gstin-scan'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-amber-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">GSTIN Smart Scanner</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Mod-36</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tracker'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">12M Filing Tracker</span>
                                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">96.4% Filed</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('fin-statements'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-cyan-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate font-semibold text-slate-900">1.6 Financial Statements Engine</span>
                                <span className="font-mono text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded">Sch III & Non-Corp</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/dashboard</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                              className="inline-flex items-center gap-1 text-amber-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Open Hub</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 03: Tally Connectors & XML Bridge (Pink Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('collector')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Server className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-pink-700 uppercase">SUITE 03</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-pink-700 transition-colors">
                              Tally Connectors &amp; XML Bridge
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Direct HTTP Port 9000 connector and real-time XML parsers.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally-direct'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Direct HTTP Port 9000 Link</span>
                                <span className="font-mono text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Connected</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Daybook &amp; TB XML Converter</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Fast Ingest</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('ledger-import'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-pink-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Active Company Auto-Detect</span>
                                <span className="font-mono text-[10px] text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded">Auto-Detect</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/tally-bridge</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('tally'); }}
                              className="inline-flex items-center gap-1 text-pink-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Launch Bridge</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 05: Statutory & Tax Audit Suite (Indigo Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('audit')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Landmark className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-indigo-700 uppercase">SUITE 05</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-indigo-700 transition-colors">
                              Statutory &amp; Tax Audit Suite
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Statutory audit sampling, 3CD reporting, and tax balance schedules.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">SA 530 Monetary Unit Sampling</span>
                                <span className="font-mono text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">SA 530</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('clause44'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Form 3CD Clause 44 Spend</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Reg vs Unreg</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('depreciation'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Dual Depreciation &amp; DTA/DTL</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Co Act vs IT</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/stat-audit</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                              className="inline-flex items-center gap-1 text-indigo-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Open Audit</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                        {/* Suite 06 & 07: Taxation & Bank CMA Credit (Blue/Cyan Theme) */}
                        <article 
                          onClick={() => setActiveCategoryCard('cma-bank')}
                          className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <Calculator className="w-5 h-5" />
                              </div>
                              <span className="font-mono text-[10px] font-semibold text-blue-700 uppercase">SUITE 06 &amp; 07</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-slate-900 leading-snug mb-1 group-hover:text-blue-700 transition-colors">
                              Taxation &amp; Bank CMA Credit
                            </h3>
                            <p className="text-slate-500 text-[12px] mb-4">Direct tax regime optimizer, working capital MPBF, and ratios.</p>
                            
                            <ul className="flex flex-col gap-1.5 mb-5 text-[12px]">
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">IT Regime Optimizer (115BAC)</span>
                                <span className="font-mono text-[10px] font-semibold text-blue-700 bg-sky-50 px-1.5 py-0.5 rounded">AY 25-26</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                                className="flex items-center justify-between text-slate-700 py-1 border-b border-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">Bank CMA Credit MPBF Method II</span>
                                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Method II</span>
                              </li>
                              <li 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('cma'); }}
                                className="flex items-center justify-between text-slate-700 py-1 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                <span className="truncate">10 Financial Ratios</span>
                                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">DSCR 1.84x</span>
                              </li>
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">/cma-advisory</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                              className="inline-flex items-center gap-1 text-blue-600 font-semibold text-[12px] group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Launch Advisory</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>

                      </div>
                    </section>

                    {/* 4. Docked Bottom Operational Telemetry Status Bar */}
                    <div className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-3 shadow-xs">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          SQLite LAN Active (342 Clients Loaded)
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Zero-Merge Architecture Guaranteed
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                        <span>Core Daemon v2.4.0</span>
                        <span>•</span>
                        <span className="text-slate-700 font-semibold">Vaswani &amp; Associates</span>
                      </div>
                    </div>
                  </>
      ) : (
        /* SELECTED CATEGORY CARD DRILL-DOWN VIEW */
        <div className="space-y-6 animate-fadeIn">
          {/* BACK NAVIGATION BAR */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <button
              onClick={() => setActiveCategoryCard(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all border border-slate-200 shadow-xs hover:scale-[1.02]"
            >
              <ArrowLeft className="w-4 h-4 text-blue-600" />
              <span>← Back to All Suites</span>
            </button>

            <div className="text-xs text-slate-500 font-mono">
              Active Suite: <span className="text-blue-700 font-bold uppercase">{activeCategoryCard}</span>
            </div>
          </div>

          {activeCategoryCard === 'wip' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div 
                onClick={() => setAppRoute('dashboard')}
                className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md cursor-pointer group transition-all"
              >
                <div className="text-amber-600 font-bold text-xs uppercase mb-1 font-mono">Module 1.1</div>
                <h4 className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Practice Dashboard</h4>
                <p className="text-xs text-slate-500 mt-1">Practice management, client roster, and filing metrics.</p>
              </div>
              <div 
                onClick={() => setAppRoute('gstin-scan')}
                className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md cursor-pointer group transition-all"
              >
                <div className="text-amber-600 font-bold text-xs uppercase mb-1 font-mono">Module 1.2</div>
                <h4 className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">GSTIN Smart Scanner</h4>
                <p className="text-xs text-slate-500 mt-1">Mod-36 checksum validator and taxpayer profile inspector.</p>
              </div>
              <div 
                onClick={() => setAppRoute('tracker')}
                className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-md cursor-pointer group transition-all"
              >
                <div className="text-emerald-600 font-bold text-xs uppercase mb-1 font-mono">Module 1.3</div>
                <h4 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">12M Filing Tracker</h4>
                <p className="text-xs text-slate-500 mt-1">Full-year compliance matrix across 12 periods.</p>
              </div>
              <div 
                onClick={() => setAppRoute('fin-statements')}
                className="p-5 rounded-xl bg-cyan-50/50 border-2 border-cyan-500/30 shadow-xs hover:shadow-md cursor-pointer group transition-all"
              >
                <div className="text-cyan-700 font-bold text-xs uppercase mb-1 font-mono flex items-center justify-between">
                  <span>Module 1.6</span>
                  <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.2 rounded text-[9px]">Schedule III</span>
                </div>
                <h4 className="font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">Financial Statements Engine</h4>
                <p className="text-xs text-slate-600 mt-1">Schedule III & Non-Corporate, AS-3 CFS, 11 Ratios, 35+ IFC Rules & Zero-Merge Export.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

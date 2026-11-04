import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, Users, Lock, FileCode2, Database, 
  FileSpreadsheet, ShieldCheck, Search, Server, Send, ImageIcon,
  Zap, ShieldAlert, Landmark, ChevronRight, ArrowLeft, ArrowRight, Calculator, Receipt,
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

const hubContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.03
    }
  }
};

const hubCardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 280,
      damping: 24,
      mass: 0.8
    }
  }
};

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

                    {/* 2. Enterprise Compliance & Advisory Suites (Series 01 – 08 Standardized) */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                          </span>
                          <h2 className="text-[15px] font-bold text-slate-900 tracking-tight uppercase flex items-center gap-2">
                            Enterprise Compliance &amp; Advisory Suites
                          </h2>
                          <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/70 text-[10px] font-semibold uppercase tracking-wider shadow-2xs">
                            Series 01 – 08 Standardized
                          </span>
                        </div>
                        <div className="text-slate-500 text-[11px] font-mono flex items-center gap-2 hidden sm:flex bg-slate-50/80 px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs">
                          <RotateCcw className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />
                          <span>8 Autonomous Suites Connected</span>
                        </div>
                      </div>

                      {/* Unified 8-Card Motion Grid: Compact, Series-wise 1 to 8 with Advanced Corporate Animation */}
                      <motion.div 
                        variants={hubContainerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                      >

                        {/* SUITE 01: Work In Progress & Practice Hub */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('wip')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-amber-300"
                        >
                          {/* Ambient radial highlight on hover */}
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent -z-0" />
                          {/* Top accent stripe with expansion on hover */}
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-600 shadow-2xs group-hover:scale-110 group-hover:shadow-amber-100/50 transition-all duration-200 flex items-center justify-center">
                                <Zap className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-amber-50/80 text-amber-700 border border-amber-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                SUITE 01
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-amber-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Practice &amp; WIP Hub
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              Practice roster metrics, checksum validators, and 12M filing tracker.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-amber-50/80 hover:border-amber-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-amber-900 transition-colors">Practice Dashboard</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-indigo-700 border border-slate-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-amber-200/80 transition-colors">342 Clients</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('gstin-scan'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-amber-50/80 hover:border-amber-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-amber-900 transition-colors">GSTIN Smart Scanner</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-amber-200/80 transition-colors">Mod-36</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tracker'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-amber-50/80 hover:border-amber-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-amber-900 transition-colors">12M Filing Tracker</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-emerald-300 transition-colors">96.4% Filed</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/dashboard</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('dashboard'); }}
                              className="inline-flex items-center gap-1.5 text-amber-700 font-semibold text-[11.5px] hover:text-amber-800 transition-all duration-200 group/btn"
                            >
                              <span>Open Hub</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 02: GST & TDS Reconciliation Engine */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('reco')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-emerald-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-emerald-500 via-teal-400 to-teal-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-emerald-600 shadow-2xs group-hover:scale-110 group-hover:shadow-emerald-100/50 transition-all duration-200 flex items-center justify-center">
                                <ShieldCheck className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-emerald-50/80 text-emerald-700 border border-emerald-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                SUITE 02
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-emerald-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              GST &amp; TDS Reco Engine
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              PR vs 2B matching (&le; ₹2 tol), party dispute hub, and TRACES 26Q TDS.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('input'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50/60 hover:bg-emerald-50 hover:border-emerald-300/80 border border-emerald-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-emerald-900 transition-colors">GST Reco (PR vs 2B)</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-100/90 text-emerald-800 border border-emerald-300/60 font-semibold shrink-0 ml-1.5 shadow-2xs">&plusmn;₹2.00 Tol</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setMode('input'); setAppRoute('reco'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-emerald-50/80 hover:border-emerald-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-emerald-900 transition-colors">Party Dispute Center</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-emerald-200/80 transition-colors">WhatsApp/Mail</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tds-reco'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-emerald-50/80 hover:border-emerald-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-emerald-900 transition-colors">TRACES Form 26Q TDS</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-amber-700 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-amber-300 transition-colors">194C/J/I/Q</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/reconciliation</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setMode('input'); setAppRoute('reco'); }}
                              className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-[11.5px] hover:text-emerald-800 transition-all duration-200 group/btn"
                            >
                              <span>Open Reco</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 03: Tally Connectors & XML Bridge */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('collector')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-rose-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-pink-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-rose-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-pink-500 via-rose-400 to-rose-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-pink-50/90 border border-pink-200/80 text-pink-600 shadow-2xs group-hover:scale-110 group-hover:shadow-pink-100/50 transition-all duration-200 flex items-center justify-center">
                                <Server className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-pink-50/80 text-pink-700 border border-pink-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span>
                                SUITE 03
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-pink-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Tally Connectors &amp; Bridge
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              Direct HTTP Port 9000 connector, real-time XML parsers &amp; auto-detect.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally-direct'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-pink-50/80 hover:border-pink-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-pink-900 transition-colors">Direct Port 9000 Link</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-emerald-300 transition-colors">Port 9000</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('tally'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-pink-50/80 hover:border-pink-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-pink-900 transition-colors">Daybook &amp; TB XML Parse</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-pink-200/80 transition-colors">Fast Ingest</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('ledger-import'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-pink-50/80 hover:border-pink-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-pink-900 transition-colors">Active Company Detect</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-pink-300 transition-colors">Auto-Detect</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/tally-bridge</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('tally-direct'); }}
                              className="inline-flex items-center gap-1.5 text-pink-700 font-semibold text-[11.5px] hover:text-pink-800 transition-all duration-200 group/btn"
                            >
                              <span>Launch Bridge</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 04: Returns Preparation & 12M Filing */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('returns')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-indigo-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50/90 border border-indigo-200/80 text-indigo-600 shadow-2xs group-hover:scale-110 group-hover:shadow-indigo-100/50 transition-all duration-200 flex items-center justify-center">
                                <Send className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-indigo-50/80 text-indigo-700 border border-indigo-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                SUITE 04
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-indigo-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Returns Prep &amp; 12M Filing
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              12-month return cycles, Rule 88A set-off cascade &amp; IMS recipient hub.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('working3b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-indigo-50/80 hover:border-indigo-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-indigo-900 transition-colors">GSTR-3B Sheet &amp; 88A</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-indigo-300 transition-colors">Ready</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('matrix'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-indigo-50/80 hover:border-indigo-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-indigo-900 transition-colors">12-Month FY Matrix</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-indigo-200/80 transition-colors">13-Cols Aligned</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setReturnsInitialTab('ims2b'); setAppRoute('returns'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50/60 hover:bg-amber-50 hover:border-amber-200/80 border border-amber-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-amber-900 transition-colors">GST IMS &amp; 2B Decision</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100/90 text-amber-800 border border-amber-300/60 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-amber-400 transition-colors">18 Pending</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/returns-hub</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('returns'); }}
                              className="inline-flex items-center gap-1.5 text-indigo-700 font-semibold text-[11.5px] hover:text-indigo-800 transition-all duration-200 group/btn"
                            >
                              <span>Launch Returns</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 05: Statutory & Tax Audit Suite */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('audit')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-blue-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-blue-50/90 border border-blue-200/80 text-blue-600 shadow-2xs group-hover:scale-110 group-hover:shadow-blue-100/50 transition-all duration-200 flex items-center justify-center">
                                <Landmark className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-blue-50/80 text-blue-700 border border-blue-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                SUITE 05
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-blue-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Statutory &amp; Tax Audit
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              SA 530 Monetary Unit Sampling, Form 3CD Clause 44 &amp; Dual Depreciation.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-blue-50/80 hover:border-blue-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-blue-900 transition-colors">SA 530 Monetary Sampling</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-blue-300 transition-colors">SA 530</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('clause44'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-blue-50/80 hover:border-blue-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-blue-900 transition-colors">Form 3CD Clause 44 Spend</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-blue-200/80 transition-colors">Reg vs Unreg</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('depreciation'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-blue-50/80 hover:border-blue-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-blue-900 transition-colors">Dual Depreciation &amp; DTA</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-indigo-200/80 transition-colors">Co Act vs IT</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/stat-audit</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('audit'); }}
                              className="inline-flex items-center gap-1.5 text-blue-700 font-semibold text-[11.5px] hover:text-blue-800 transition-all duration-200 group/btn"
                            >
                              <span>Open Audit</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 06: Bank CMA Credit & Financials */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('cma-bank')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-teal-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-teal-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-teal-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-teal-500 via-emerald-400 to-emerald-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-teal-50/90 border border-teal-200/80 text-teal-600 shadow-2xs group-hover:scale-110 group-hover:shadow-teal-100/50 transition-all duration-200 flex items-center justify-center">
                                <Calculator className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-teal-50/80 text-teal-700 border border-teal-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                                SUITE 06
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Bank CMA Credit &amp; Ratios
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              Tandon Committee Method II MPBF, 10 financial ratios &amp; Schedule III.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-teal-50/80 hover:border-teal-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-teal-900 transition-colors">Bank CMA MPBF Method II</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-teal-300 transition-colors">Method II</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('cma'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-teal-50/80 hover:border-teal-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-teal-900 transition-colors">10 Financial Ratios</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-emerald-300 transition-colors">DSCR 1.84x</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('fin-statements'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-teal-50/80 hover:border-teal-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-teal-900 transition-colors">Schedule III Financials</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-teal-200/80 transition-colors">Schedule III</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/cma-credit</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('bank-cma'); }}
                              className="inline-flex items-center gap-1.5 text-teal-700 font-semibold text-[11.5px] hover:text-teal-800 transition-all duration-200 group/btn"
                            >
                              <span>Open CMA</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 07: Income Tax Liability & Regime Optimizer */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setActiveCategoryCard('tax')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-violet-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-violet-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-violet-600 via-purple-500 to-purple-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-violet-50/90 border border-violet-200/80 text-violet-600 shadow-2xs group-hover:scale-110 group-hover:shadow-violet-100/50 transition-all duration-200 flex items-center justify-center">
                                <Receipt className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-violet-50/80 text-violet-700 border border-violet-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                                SUITE 07
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-violet-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Income Tax &amp; Regime Engine
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              Section 115BAC New vs Old regime, 25% surcharge cap &amp; 87A rebate.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-violet-50/80 hover:border-violet-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-violet-900 transition-colors">IT Regime Optimizer (115BAC)</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-violet-300 transition-colors">AY 25-26</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-violet-50/80 hover:border-violet-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-violet-900 transition-colors">Surcharge 25% Cap &amp; Rebates</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-purple-700 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-purple-300 transition-colors">87A Relief</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-violet-50/80 hover:border-violet-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-violet-900 transition-colors">Tax Computation Sheet</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-indigo-200/80 transition-colors">Computation</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/income-tax</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('income-tax'); }}
                              className="inline-flex items-center gap-1.5 text-violet-700 font-semibold text-[11.5px] hover:text-violet-800 transition-all duration-200 group/btn"
                            >
                              <span>Open Tax</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                        {/* SUITE 08: Monthly Audit Working Paper */}
                        <motion.article 
                          variants={hubCardVariants}
                          whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] } }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setAppRoute('monthly-audit')}
                          className="relative rounded-xl bg-white p-4 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 flex flex-col justify-between overflow-hidden group cursor-pointer hover:border-indigo-300"
                        >
                          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent -z-0" />
                          <div className="absolute inset-x-0 top-0 h-1 group-hover:h-1.5 transition-all duration-300 bg-gradient-to-r from-indigo-500 via-blue-500 to-blue-600"></div>
                          
                          <div className="relative z-10">
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50/90 border border-indigo-200/80 text-indigo-600 shadow-2xs group-hover:scale-110 group-hover:shadow-indigo-100/50 transition-all duration-200 flex items-center justify-center">
                                <FileSpreadsheet className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-[-4deg]" />
                              </div>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-indigo-50/80 text-indigo-700 border border-indigo-200/80 shadow-2xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                SUITE 08
                              </span>
                            </div>

                            <h3 className="text-[14.5px] font-bold text-slate-900 group-hover:text-indigo-700 transition-colors duration-200 leading-snug line-clamp-1 mb-1 tracking-tight">
                              Monthly Audit Working Paper
                            </h3>
                            <p className="text-slate-500 text-[11.5px] leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              Standardized firm format, Maker-Checker review &amp; Zero-Merge Excel.
                            </p>

                            <div className="flex flex-col gap-1.5 mb-3.5 text-[11.5px]">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('monthly-audit'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-indigo-50/80 hover:border-indigo-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-indigo-900 transition-colors">5 Sections &amp; 8 Checklists</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-indigo-300 transition-colors">Standard</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('monthly-audit'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-indigo-50/80 hover:border-indigo-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-indigo-900 transition-colors">Maker-Checker 4-Eye Flow</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80 font-medium shrink-0 ml-1.5 shadow-2xs group-hover/item:border-amber-300 transition-colors">Draft &rarr; Released</span>
                              </div>

                              <div 
                                onClick={(e) => { e.stopPropagation(); setAppRoute('monthly-audit'); }}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-indigo-50/80 hover:border-indigo-200/80 border border-slate-200/60 transition-all duration-200 cursor-pointer group/item hover:translate-x-1 hover:shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 transition-transform group-hover/item:scale-125"></span>
                                  <span className="truncate text-slate-700 font-medium group-hover/item:text-indigo-900 transition-colors">Work Pending Continuity</span>
                                </div>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold shrink-0 ml-1.5 shadow-2xs group-hover/item:border-emerald-300 transition-colors">Continuity</span>
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">/monthly-audit</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setAppRoute('monthly-audit'); }}
                              className="inline-flex items-center gap-1.5 text-indigo-700 font-semibold text-[11.5px] hover:text-indigo-800 transition-all duration-200 group/btn"
                            >
                              <span>Launch Suite 08</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform duration-200" />
                            </button>
                          </div>
                        </motion.article>

                      </motion.div>
                    </div>

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
                        <span className="text-slate-700 font-semibold">VCAN &amp; Associates LLP</span>
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

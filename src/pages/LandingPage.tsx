import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PerspectiveTunnelHero, { type TunnelImage } from "@/components/ui/perspective-tunnel-hero";
import { WorksWheel, type WorksWheelHandle, type WorksWheelItem } from "@/components/ui/works-wheel";

// Photos are bundled in public/suites so they show offline in the packaged app.
const LOCAL_PHOTO: Record<string, string> = {
  "1554224155-6726b3ff858f": "suite-01.jpg",
  "1460925895917-afdab827c52f": "suite-02.jpg",
  "1551288049-bebda4e38f71": "suite-03.jpg",
  "1454165804606-c3d57bc86b40": "suite-04.jpg",
  "1450101499163-c8848c66ca85": "suite-05.jpg",
  "1504868584819-f8e8b4b6d7e3": "suite-06.jpg",
  "1579621970563-ebec7560ff3e": "suite-07.jpg",
  "1486406146926-c627a92ad1ab": "suite-08.jpg",
  "1521791136064-7986c2920216": "suite-09.jpg",
};
const unsplash = (id: string) => `/suites/${LOCAL_PHOTO[id]}`;

// Module-level so the tunnel's card layout isn't rebuilt on every render.
const TUNNEL_IMAGES: TunnelImage[] = [
  { src: unsplash("1554224155-6726b3ff858f"), title: "GST Reco" },
  { src: unsplash("1460925895917-afdab827c52f"), title: "2B Autopilot" },
  { src: unsplash("1551288049-bebda4e38f71"), title: "GSTR-3B" },
  { src: unsplash("1454165804606-c3d57bc86b40"), title: "Tally XML" },
  { src: unsplash("1450101499163-c8848c66ca85"), title: "GST Notices" },
  { src: unsplash("1504868584819-f8e8b4b6d7e3"), title: "CMA Appraisal" },
  { src: unsplash("1579621970563-ebec7560ff3e"), title: "TDS & TRACES" },
  { src: unsplash("1486406146926-c627a92ad1ab"), title: "Tax Audit" },
  { src: unsplash("1521791136064-7986c2920216"), title: "Monthly Audit" },
];

// Short names + cover art for the suite wheel, keyed by CORE_SUITES id. The
// wheel prints the front title large beside the card, so long names won't fit.
const WHEEL_ART: Record<string, { title: string; photo: string }> = {
  "suite-01": { title: "GST & TDS Reco", photo: "1554224155-6726b3ff858f" },
  "suite-02": { title: "Tally Bridge", photo: "1454165804606-c3d57bc86b40" },
  "suite-03": { title: "Returns Autopilot", photo: "1460925895917-afdab827c52f" },
  "suite-04": { title: "Tax Audit", photo: "1486406146926-c627a92ad1ab" },
  "suite-05": { title: "Income Tax", photo: "1579621970563-ebec7560ff3e" },
  "suite-06": { title: "Monthly Audit", photo: "1521791136064-7986c2920216" },
  "suite-07": { title: "Entries Maker", photo: "1551288049-bebda4e38f71" },
  "notices-ai": { title: "GST Notices", photo: "1450101499163-c8848c66ca85" },
};
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Gavel,
  Layers,
  Lock,
  Mail,
  MessageCircle,
  Moon,
  Phone,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  AUDIENCE_ROLES,
  CORE_SUITES,
  HERO_FIGURES,
  PAIN_TO_FIX_PAIRS,
  PresentationSuite,
  SuiteVisualType,
  UPCOMING_ROADMAP,
  WIP_MODULES,
} from "../data/landingModules";

const SUITE_WHEEL_ITEMS: WorksWheelItem[] = CORE_SUITES.map((s) => ({
  title: WHEEL_ART[s.id]?.title ?? s.suiteCode,
  image: unsplash(WHEEL_ART[s.id]?.photo ?? "1554224155-6726b3ff858f"),
}));

interface LandingPageProps {
  onNext?: () => void;
  feedbackList?: any[];
  setFeedbackList?: React.Dispatch<React.SetStateAction<any[]>>;
}

const ACCENT_STYLES: Record<string, { badge: string; bar: string; border: string; iconBg: string }> = {
  emerald: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    bar: "bg-emerald-500",
    border: "border-emerald-200 dark:border-emerald-800/70",
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
  },
  rose: {
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    bar: "bg-rose-500",
    border: "border-rose-200 dark:border-rose-800/70",
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400",
  },
  indigo: {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
    bar: "bg-indigo-500",
    border: "border-indigo-200 dark:border-indigo-800/70",
    iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400",
  },
  blue: {
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    bar: "bg-blue-500",
    border: "border-blue-200 dark:border-blue-800/70",
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800",
    bar: "bg-violet-500",
    border: "border-violet-200 dark:border-violet-800/70",
    iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/70 dark:text-violet-400",
  },
  sky: {
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
    bar: "bg-sky-500",
    border: "border-sky-200 dark:border-sky-800/70",
    iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-950/70 dark:text-sky-400",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    bar: "bg-amber-500",
    border: "border-amber-200 dark:border-amber-800/70",
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400",
  },
  teal: {
    badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
    bar: "bg-teal-500",
    border: "border-teal-200 dark:border-teal-800/70",
    iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/70 dark:text-teal-400",
  },
};

function SuiteIcon({ type }: { type: SuiteVisualType }) {
  const cls = "w-5 h-5";
  switch (type) {
    case "reco":
      return <ShieldCheck className={cls} />;
    case "tally":
      return <Server className={cls} />;
    case "returns":
      return <Layers className={cls} />;
    case "audit":
      return <Calculator className={cls} />;
    case "tax":
      return <FileSpreadsheet className={cls} />;
    case "monthlyAudit":
      return <ClipboardCheck className={cls} />;
    case "tallyXml":
      return <Database className={cls} />;
    case "noticesAi":
      return <Gavel className={cls} />;
  }
}

/** Visual workflow diagram / sample preview tailored per suite for live demos */
function SuiteVisualWidget({ suite }: { suite: PresentationSuite }) {
  const cardCls =
    "rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 space-y-4";

  switch (suite.visualType) {
    case "reco":
      return (
        <div className={cardCls} data-testid="visual-widget-reco">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>SAMPLE MATCH SUMMARY (ILLUSTRATIVE)</span>
            <span className="text-emerald-600 dark:text-emerald-400">8-Pass Smart Match</span>
          </div>
          {[
            { label: "Perfect Match & ±₹2 Rounded", pct: 91, color: "bg-emerald-500" },
            { label: "Tax / Date Mismatch (Flagged)", pct: 6, color: "bg-amber-500" },
            { label: "Missing in Vendor GSTR-2B", pct: 3, color: "bg-rose-500" },
          ].map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                <span>{row.label}</span>
                <span className="font-bold">{row.pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 dark:text-slate-300">Party-Wise Follow-up Ready</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
              WhatsApp / Email + Zero-Merge Excel
            </span>
          </div>
        </div>
      );

    case "tally":
      return (
        <div className={cardCls} data-testid="visual-widget-tally">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            DIRECT TALLY BRIDGE DIAGRAM
          </div>
          <div className="grid grid-cols-3 gap-2 items-center text-center">
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <Server className="w-5 h-5 text-rose-500 mx-auto mb-1" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">TallyPrime</div>
              <div className="text-[11px] text-slate-500">Port 9000 Local</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Live XML Sync</span>
              <div className="w-full h-0.5 bg-rose-300 dark:bg-rose-700" />
              <span className="text-[10px] text-slate-500">Auto-Detect Co.</span>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Ready Data</div>
              <div className="text-[11px] text-slate-500">Daybook / TB / Reco</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
            {["Purchase Register", "Ledger Vouchers", "Trial Balance"].map((item) => (
              <div
                key={item}
                className="rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 py-2 font-medium text-slate-700 dark:text-slate-300"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      );

    case "returns":
      return (
        <div className={cardCls} data-testid="visual-widget-returns">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>1-LOGIN 12-MONTH PORTAL AUTOPILOT</span>
            <span className="text-indigo-600 dark:text-indigo-400">Apr – Mar Sync</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((m) => (
              <div
                key={m}
                className="rounded-lg bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-800/80 py-1.5 text-center"
              >
                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{m}</div>
                <div className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">Synced</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              Rule 88A Tax Set-Off Cascade
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">
                1. IGST Credit First
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold">
                2. Balance CGST &amp; SGST
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                3B Working PDF
              </span>
            </div>
          </div>
        </div>
      );

    case "audit":
      return (
        <div className={cardCls} data-testid="visual-widget-audit">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            CLAUSE 44 &amp; DUAL DEPRECIATION MODEL
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400">Form 3CD Clause 44</div>
              <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>GST Registered</span>
                  <span className="font-bold text-slate-900 dark:text-white">Auto-Bifurcated</span>
                </div>
                <div className="flex justify-between">
                  <span>Composition / Exempt</span>
                  <span className="font-bold text-slate-900 dark:text-white">Separated</span>
                </div>
                <div className="flex justify-between">
                  <span>Unregistered Vendors</span>
                  <span className="font-bold text-slate-900 dark:text-white">Flagged</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Dual Fixed Assets</div>
              <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Companies Act (Sch II)</span>
                  <span className="font-bold text-slate-900 dark:text-white">SLM / WDV</span>
                </div>
                <div className="flex justify-between">
                  <span>Income Tax (Sec 32)</span>
                  <span className="font-bold text-slate-900 dark:text-white">Block WDV</span>
                </div>
                <div className="flex justify-between">
                  <span>Timing Difference</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Auto DTA/DTL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case "tax":
      return (
        <div className={cardCls} data-testid="visual-widget-tax">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            SIDE-BY-SIDE REGIME COMPARISON VIEW
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
              <div className="text-xs font-bold text-slate-500">Old Regime</div>
              <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">With Deductions</div>
              <div className="text-[11px] text-slate-500 mt-1">80C, 80D, HRA, Home Loan</div>
            </div>
            <div className="rounded-xl bg-violet-50/70 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-700 p-3.5">
              <div className="text-xs font-bold text-violet-700 dark:text-violet-300">New Regime (115BAC)</div>
              <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">Lower Slabs</div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
                87A Rebate &amp; 25% Surcharge Cap
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">Advisor Summary</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              Highlights Best Regime Instantly
            </span>
          </div>
        </div>
      );

    case "monthlyAudit":
      return (
        <div className={cardCls} data-testid="visual-widget-monthly-audit">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            MAKER-CHECKER AUDIT WORKFLOW
          </div>
          <div className="space-y-2.5">
            {[
              { step: "1", title: "Junior Fills Working Paper", sub: "5 Standard Sections & 8 Checklists", badge: "Maker" },
              { step: "2", title: "Pending Points Tracked", sub: "Unresolved points auto-carry to next month", badge: "Continuity" },
              { step: "3", title: "Senior Reviews & Locks", sub: "Final signed PDF & Zero-Merge Excel Pack", badge: "Approved" },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0">
                    {item.step}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-500">{item.sub}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "tallyXml":
      return (
        <div className={cardCls} data-testid="visual-widget-tally-xml">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>EXCEL TO TALLY VERIFICATION PIPELINE</span>
            <span className="text-emerald-600 dark:text-emerald-400">Dr = Cr Check</span>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden text-[11px]">
            <div className="grid grid-cols-4 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 font-bold text-slate-600 dark:text-slate-300">
              <span>Date</span>
              <span>Ledger</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Credit</span>
            </div>
            <div className="grid grid-cols-4 px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <span>01-Apr</span>
              <span>Bank A/c</span>
              <span className="text-right">₹50,000</span>
              <span className="text-right">—</span>
            </div>
            <div className="grid grid-cols-4 px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <span>01-Apr</span>
              <span>Client A/c</span>
              <span className="text-right">—</span>
              <span className="text-right">₹50,000</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">Balance Difference: ₹0</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">1-Click Tally Push / XML</span>
          </div>
        </div>
      );

    case "noticesAi":
      return (
        <div className={cardCls} data-testid="visual-widget-notices-ai">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            NOTICE DEFENSE &amp; SOURAV AI WORKFLOW
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <Gavel className="w-5 h-5 text-teal-600 mx-auto mb-1" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Portal Notice</div>
              <div className="text-[10px] text-slate-500">ASMT-10 / DRC-01</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <Bot className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Sourav AI</div>
              <div className="text-[10px] text-slate-500">Summary &amp; Guide</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Reply Pack</div>
              <div className="text-[10px] text-slate-500">Editable Legal Draft</div>
            </div>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>Always-available built-in AI assistant</span>
            <span className="font-bold text-teal-600 dark:text-teal-400">Due Dates Tracked</span>
          </div>
        </div>
      );
  }
}

/** Explanation beside the front card of the suite wheel — what the old static
    Module Presenter showed, one suite at a time as the wheel turns. */
function SuiteDetail({
  suite,
  index,
  count,
  goTo,
  onLaunch,
}: {
  suite: PresentationSuite;
  index: number;
  count: number;
  goTo: (index: number) => void;
  onLaunch: () => void;
}) {
  const accent = ACCENT_STYLES[suite.accent] || ACCENT_STYLES.blue;
  return (
    <div className="rounded-3xl bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-lg space-y-4 text-left font-normal tracking-normal">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent.iconBg}`}>
          <SuiteIcon type={suite.visualType} />
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${accent.badge}`}>{suite.suiteCode}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Best for: <strong className="text-slate-800 dark:text-slate-200">{suite.bestFor}</strong>
        </span>
      </div>

      <div>
        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">{suite.title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{suite.tagline}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {suite.steps.map((st) => (
          <div
            key={st.label}
            className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5"
          >
            <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-0.5">{st.label}</div>
            <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug">{st.text}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {suite.subModules.map((mod) => (
          <div key={mod} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{mod}</span>
          </div>
        ))}
      </div>

      {/* The per-suite diagram only where there is height for it */}
      <div className="hidden [@media(min-height:820px)]:block">
        <SuiteVisualWidget suite={suite} />
      </div>

      <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
        <strong className="text-blue-700 dark:text-blue-300">Practical Example: </strong>
        {suite.realExample}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onLaunch}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
        >
          <span>Open Software &amp; Use {suite.suiteCode}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous suite"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            className="p-2 rounded-full border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono font-bold px-1.5 text-slate-500 dark:text-slate-400">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            aria-label="Next suite"
            disabled={index === count - 1}
            onClick={() => goTo(index + 1)}
            className="p-2 rounded-full border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onNext }: LandingPageProps) {
  const navigate = useNavigate();
  const wheelRef = useRef<WorksWheelHandle>(null);
  const [activeRole, setActiveRole] = useState<"partner" | "staff" | "business">("partner");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("np_landing_theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {}
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem("np_landing_theme", isDarkMode ? "dark" : "light");
    } catch {}
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  const handleLaunchApp = () => {
    if (onNext) onNext();
    else navigate("/");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleLaunchApp();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  /** Turn the suite wheel to `index` (scrolls the page to that point of it). */
  const selectSuiteAndScroll = (index: number) => {
    wheelRef.current?.goTo(index);
  };

  const activeRoleData = AUDIENCE_ROLES.find((r) => r.id === activeRole) || AUDIENCE_ROLES[0];

  return (
    <div
      className={`${
        isDarkMode ? "dark" : ""
      } min-h-screen bg-[#FBFBFD] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased relative overflow-x-clip`}
    >
      {/* Subtle Projector-Safe Ambient Gradient & Dot-Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-45 dark:opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-24 left-1/2 -translate-x-1/2 w-[760px] h-[340px] rounded-full bg-blue-400/15 dark:bg-blue-600/15 blur-3xl -z-10"
      />
      {/* 1. CLEAN PRESENTATION HEADER */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-2xs">
              <img src="./logo.png" alt="Finpulse Consulting Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                AUDIT WITH VASWANI
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Finpulse Consulting</div>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800 text-xs font-medium">
            {[
              { label: "Overview", id: "overview" },
              { label: "Suites", id: "suites" },
              { label: "WIP & Future Updates", id: "wip-updates" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="px-3.5 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="p-2 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleLaunchApp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-sm cursor-pointer transition-colors"
            >
              <span>Enter Software</span>
              <span className="hidden sm:inline text-[10px] font-mono bg-blue-500/60 px-1.5 py-0.5 rounded">⌘K</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 1b. IMMERSIVE MODULE TUNNEL — full-screen, pinned while the page scrolls
          through 3 screens of track, then the sections below scroll in as usual */}
      <PerspectiveTunnelHero
        images={TUNNEL_IMAGES}
        eyebrow="Audit with Vaswani"
        title={
          <>
            ONE DESK.
            <br />
            EVERY RETURN.
          </>
        }
        description="GST, Tally, TDS and audit suites in one local software. Keep scrolling to fly through them."
        scrollPrompt="Scroll to explore"
        headingAs="h2"
        scrollLength={3}
        className="bg-transparent dark:bg-transparent"
      />

      {/* 1c. SUITE WHEEL — pinned below the 4rem header; page scroll opens the
          ring into a drum and turns one suite to the front at a time, with that
          suite's explanation beside it (replaces the old static Module Presenter
          and suite grid). */}
      <WorksWheel
        ref={wheelRef}
        id="suites"
        items={SUITE_WHEEL_ITEMS}
        label="8 Suites"
        scrollLength={8}
        renderDetail={(_, i, nav) => (
          <SuiteDetail
            suite={CORE_SUITES[i]}
            index={i}
            count={nav.count}
            goTo={nav.goTo}
            onLaunch={handleLaunchApp}
          />
        )}
        className="bg-transparent font-extrabold"
        style={{ "--works-wheel-top": "4rem" } as React.CSSProperties}
      />

      {/* 2. SIMPLE EXECUTIVE HERO + ARCHITECTURE FLOW DIAGRAM */}
      <section id="overview" className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-14">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-5">
            <Lock className="w-3.5 h-3.5" />
            <span>100% Local on Your Office PC &amp; LAN • Zero Cloud Data Upload</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight mb-4">
            Every GST, Tally &amp; Audit Workflow —{" "}
            <span className="text-blue-600 dark:text-blue-400">Simplified in One Software</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-7">
            Built for CA firms, audit teams, and businesses. Replace manual Excel VLOOKUPs, portal downloads, and
            repetitive Tally entry with clean automated workflows — while keeping all client data strictly on your own PC.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <button
              type="button"
              onClick={handleLaunchApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md cursor-pointer transition-colors"
            >
              <span>Enter Software</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => selectSuiteAndScroll(0)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Walk Through Modules</span>
            </button>
          </div>
        </div>

        {/* 4 Key Headline Figures (Frosted Glass Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {HERO_FIGURES.map((fig) => (
            <div
              key={fig.value}
              className="rounded-2xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-4 text-center shadow-sm"
            >
              <div className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">{fig.value}</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">{fig.label}</div>
            </div>
          ))}
        </div>

        {/* Visual End-to-End Flow Model */}
        <div className="rounded-3xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm mb-8">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-5 text-center">
            How the Entire Software Works — End to End
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">STEP 1 • CONNECT DATA</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mb-2">Your Existing Sources</div>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <li>• TallyPrime Live Link (Port 9000)</li>
                <li>• Purchase / Sales Excel &amp; XML Files</li>
                <li>• GST Portal (1-Login 12-Month Sync)</li>
              </ul>
            </div>

            <div className="rounded-2xl bg-blue-50/80 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800 p-5">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">STEP 2 • AUTO-VERIFY</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mb-2">Local PC Engine Checks</div>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                <li>• Smart 2B vs Books Matching (±₹2 Tol.)</li>
                <li>• Rule 88A, Clause 44 &amp; Tax Optimization</li>
                <li>• Runs 100% Privately on Office PC / LAN</li>
              </ul>
            </div>

            <div className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 p-5">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">STEP 3 • READY OUTPUT</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mb-2">Client-Ready Deliverables</div>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                <li>• Clean Zero-Merge Excel &amp; PDF Working</li>
                <li>• Direct Tally Voucher &amp; Master XML Push</li>
                <li>• Vendor WhatsApp/Email &amp; Notice Drafts</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Pain -> Fix Comparison + Interactive Role Highlight */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 2-Column Before vs After Comparison */}
          <div className="lg:col-span-7 rounded-3xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Before vs With AUDIT WITH VASWANI
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Hours of Manual Work &rarr; Minutes • Zero Staff Error
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/60 p-4 space-y-2.5">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-300">Before (Manual Process)</div>
                {PAIN_TO_FIX_PAIRS.map((pair) => (
                  <div key={pair.topic} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                    <span className="text-rose-500 font-bold shrink-0">✕</span>
                    <span>
                      <strong className="text-slate-900 dark:text-white">{pair.topic}:</strong> {pair.pain}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 p-4 space-y-2.5">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">With Our Software</div>
                {PAIN_TO_FIX_PAIRS.map((pair) => (
                  <div key={pair.topic} className="text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{pair.fix}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Role-Based Tailored Pitch Card */}
          <div className="lg:col-span-5 rounded-3xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
                Tailor Demo For Your Audience
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {AUDIENCE_ROLES.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setActiveRole(role.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                      activeRole === role.id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-300"
                    }`}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mb-2.5">{activeRoleData.headline}</div>
              <ul className="space-y-2">
                {activeRoleData.points.map((pt) => (
                  <li key={pt} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SUITE 08 (WIP) & UPCOMING FUTURE UPDATES SECTION */}
      <section id="wip-updates" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-3xl bg-amber-50/50 dark:bg-amber-950/15 border border-amber-200 dark:border-amber-800/70 p-6 sm:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-bold mb-3 border border-amber-300/70 dark:border-amber-700">
                <Rocket className="w-3.5 h-3.5" />
                <span>Suite 08 • Work In Progress (WIP) &amp; Upcoming Updates</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Expanding Modules &amp; Future Roadmap
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl mt-1.5">
                These tools inside <strong>Suite 08 (Practice &amp; WIP Hub)</strong> are open for use today and are
                actively upgraded with regular updates, additional formats, and deeper automation in future releases.
              </p>
            </div>
          </div>

          {/* WIP Modules with Progress Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WIP_MODULES.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {item.stage}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.summary}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-slate-500">Module Readiness</span>
                    <span className="text-amber-600 dark:text-amber-400">{item.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${item.progress}%` }} />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    <strong className="text-amber-700 dark:text-amber-400">Next Update:</strong> {item.nextUpdate}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Upcoming Future Updates Timeline Model */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {UPCOMING_ROADMAP.map((rm) => (
              <div
                key={rm.stage}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800/60 p-4"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {rm.stage}
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{rm.title}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{rm.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. SIMPLE FINAL CTA + HONEST FOOTER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
        <div className="rounded-3xl bg-blue-600 text-white p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-lg">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">Ready to Start the Live Demo?</h2>
            <p className="text-sm text-blue-100 mt-1.5 max-w-xl">
              Enter the full AUDIT WITH VASWANI workspace — all 8 Suites, Multi-PC LAN support, and offline local processing ready out of the box.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs sm:text-sm font-medium text-blue-50">
              <a
                href="tel:+918989998663"
                className="inline-flex items-center gap-1.5 hover:text-white underline-offset-4 hover:underline"
              >
                <Phone className="w-4 h-4" />
                <span>+91 8989998663</span>
              </a>
              <a
                href="https://wa.me/918989998663"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp for Demo</span>
              </a>
              <a
                href="mailto:sourav.vaswani01@gmail.com"
                className="inline-flex items-center gap-1.5 hover:text-white underline-offset-4 hover:underline"
              >
                <Mail className="w-4 h-4" />
                <span>sourav.vaswani01@gmail.com</span>
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLaunchApp}
            className="shrink-0 inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm shadow-md cursor-pointer transition-colors"
          >
            <span>Enter Software (⌘K)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 7. MULTI-COLUMN PRESENTATION FOOTER */}
      <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Brand Summary */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-2xs">
                  <img src="./logo.png" alt="Finpulse Consulting Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">AUDIT WITH VASWANI</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Finpulse Consulting</div>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
                Complete GST reconciliation, 12-month portal autopilot, TallyPrime XML sync, and audit working papers — designed for Indian CA firms and businesses.
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  100% Local PC &amp; LAN
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  Tally Port 9000 XML
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  Zero-Merge Excel
                </span>
              </div>
            </div>

            {/* Col 1: Core Suites */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Core Suites
              </h4>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {CORE_SUITES.slice(0, 5).map((s, idx) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectSuiteAndScroll(idx)}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left cursor-pointer"
                    >
                      {s.suiteCode}: {s.title.split("&")[0].trim()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 2: Audit, Tally XML & WIP */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Audit, XML &amp; WIP
              </h4>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {CORE_SUITES.slice(5).map((s, idx) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectSuiteAndScroll(idx + 5)}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left cursor-pointer"
                    >
                      {s.suiteCode}: {s.title.split("&")[0].trim()}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("wip-updates")}
                    className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-left cursor-pointer font-semibold"
                  >
                    Suite 08: WIP &amp; Roadmap
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Contact & Data Privacy */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
                Contact &amp; Support
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a
                    href="tel:+918989998663"
                    className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>+91 8989998663</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://wa.me/918989998663"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp for Demo</span>
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:sourav.vaswani01@gmail.com"
                    className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-all"
                  >
                    <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>sourav.vaswani01@gmail.com</span>
                  </a>
                </li>
                <li className="pt-1 border-t border-slate-100 dark:border-slate-800">
                  100% Offline Local Storage
                </li>
                <li>Multi-PC Office LAN Sync</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>
              &copy; {new Date().getFullYear()} Finpulse Consulting • AUDIT WITH VASWANI. All rights reserved.
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => selectSuiteAndScroll(0)}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                Suites
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => scrollToSection("wip-updates")}
                className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
              >
                WIP Updates
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={handleLaunchApp}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Enter Software (⌘K)
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

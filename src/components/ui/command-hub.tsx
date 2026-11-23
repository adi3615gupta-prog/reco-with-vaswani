import * as React from "react";
import {
  ArrowRight,
  Banknote,
  Calculator,
  ClipboardList,
  Landmark,
  Layers,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  Zap,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type HubCardId = "reco" | "collector" | "returns" | "audit" | "tax" | "wip";

export interface CommandHubCounts {
  r1Pending: number;
  gstr3bPending: number;
  monthlyAuditPending: number;
}

export interface CommandHubItem {
  label: string;
  badge: string;
  /** App route opened when the row is clicked. */
  route?: string;
  /** Tone of the status dot and badge. */
  tone?: "emerald" | "rose" | "indigo" | "blue" | "violet" | "amber" | "slate";
  /** Highlights the row as a pending action (amber). */
  pending?: boolean;
}

export interface CommandHubCard {
  id: string;
  suite: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "rose" | "indigo" | "blue" | "violet" | "amber";
  path: string;
  cta: string;
  /** Opens a drill-down (HubCardId) when set, otherwise navigates to `route`. */
  drill?: HubCardId;
  route?: string;
  items: CommandHubItem[];
}

const TONE: Record<CommandHubCard["tone"], { bar: string; iconWrap: string; text: string; hover: string; ctaText: string; pill: string }> = {
  emerald: { bar: "from-emerald-500 via-teal-400 to-teal-600", iconWrap: "bg-emerald-50 border-emerald-200 text-emerald-600", text: "group-hover:text-emerald-700", hover: "hover:shadow-emerald-500/5", ctaText: "text-emerald-700", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rose: { bar: "from-pink-500 via-rose-400 to-rose-600", iconWrap: "bg-rose-50 border-rose-200 text-rose-600", text: "group-hover:text-pink-700", hover: "hover:shadow-rose-500/5", ctaText: "text-rose-700", pill: "bg-rose-50 text-rose-700 border-rose-200" },
  indigo: { bar: "from-indigo-600 via-violet-500 to-fuchsia-500", iconWrap: "bg-indigo-50 border-indigo-200 text-indigo-600", text: "group-hover:text-indigo-700", hover: "hover:shadow-indigo-500/5", ctaText: "text-indigo-700", pill: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  blue: { bar: "from-blue-600 via-sky-400 to-blue-500", iconWrap: "bg-blue-50 border-blue-200 text-blue-600", text: "group-hover:text-blue-700", hover: "hover:shadow-blue-500/5", ctaText: "text-blue-700", pill: "bg-blue-50 text-blue-700 border-blue-200" },
  violet: { bar: "from-violet-600 via-purple-400 to-violet-500", iconWrap: "bg-violet-50 border-violet-200 text-violet-600", text: "group-hover:text-violet-700", hover: "hover:shadow-violet-500/5", ctaText: "text-violet-700", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  amber: { bar: "from-amber-500 via-yellow-400 to-orange-500", iconWrap: "bg-amber-50 border-amber-200 text-amber-600", text: "group-hover:text-amber-700", hover: "hover:shadow-amber-500/5", ctaText: "text-amber-700", pill: "bg-amber-50 text-amber-700 border-amber-200" },
};

const DOT: Record<NonNullable<CommandHubItem["tone"]>, string> = {
  emerald: "bg-emerald-600",
  rose: "bg-rose-500",
  indigo: "bg-indigo-600",
  blue: "bg-blue-600",
  violet: "bg-violet-600",
  amber: "bg-amber-500",
  slate: "bg-slate-400",
};

export const COMMAND_HUB_CARDS: CommandHubCard[] = [
  {
    id: "reco",
    suite: "Suite 01",
    title: "GST & TDS Reco Engine",
    description: "PR vs 2B matching (≤ ₹2 tol), party dispute hub, and TRACES 26Q TDS.",
    icon: ShieldCheck,
    tone: "emerald",
    path: "/reconciliation",
    cta: "Open Reco",
    route: "reco",
    items: [
      { label: "GST Reco (PR vs 2B)", badge: "±₹2.00 Tol", route: "reco", tone: "emerald" },
      { label: "Party Dispute Center", badge: "WhatsApp/Mail", route: "reco", tone: "slate" },
      { label: "TRACES Form 26Q TDS", badge: "194C/J/I/Q", route: "tds-reco", tone: "amber" },
    ],
  },
  {
    id: "collector",
    suite: "Suite 02",
    title: "Tally Connectors & Bridge",
    description: "Direct HTTP Port 9000 connector, real-time XML parsers & auto-detect.",
    icon: Server,
    tone: "rose",
    path: "/tally-bridge",
    cta: "Launch Bridge",
    drill: "collector",
    items: [
      { label: "Direct Port 9000 Link", badge: "Port 9000", route: "tally-direct", tone: "emerald" },
      { label: "Daybook & TB XML Parse", badge: "Fast Ingest", route: "tally", tone: "slate" },
      { label: "Active Company Detect", badge: "Auto-Detect", route: "ledger-import", tone: "rose" },
    ],
  },
  {
    id: "returns",
    suite: "Suite 03",
    title: "Returns Prep & 12M Filing",
    description: "12-month return cycles, Rule 88A set-off cascade & IMS recipient hub.",
    icon: Send,
    tone: "indigo",
    path: "/returns-hub",
    cta: "Launch Returns",
    drill: "returns",
    items: [
      { label: "GSTR-3B Sheet & 88A", badge: "Ready", route: "returns", tone: "indigo" },
      { label: "12-Month FY Matrix", badge: "13-Cols Aligned", route: "returns", tone: "slate" },
      { label: "GSTR-1 12M Autopilot", badge: "12-Sheet Excel", route: "returns", tone: "indigo" },
      { label: "GST IMS & 2B Decision", badge: "18 Pending", route: "returns", tone: "amber", pending: true },
    ],
  },
  {
    id: "audit",
    suite: "Suite 04",
    title: "Statutory & Tax Audit",
    description: "SA 530 Monetary Unit Sampling, Form 3CD Clause 44 & Dual Depreciation.",
    icon: Landmark,
    tone: "blue",
    path: "/stat-audit",
    cta: "Open Audit",
    drill: "audit",
    items: [
      { label: "SA 530 Monetary Sampling", badge: "SA 530", route: "audit", tone: "blue" },
      { label: "Form 3CD Clause 44 Sp...", badge: "Reg vs Unreg", route: "clause44", tone: "slate" },
      { label: "Dual Depreciation & DTA", badge: "Co Act vs IT", route: "depreciation", tone: "indigo" },
    ],
  },
  {
    id: "tax",
    suite: "Suite 05",
    title: "Income Tax & Regime Engine",
    description: "Section 115BAC New vs Old regime, 25% surcharge cap & 87A rebate.",
    icon: Banknote,
    tone: "violet",
    path: "/income-tax",
    cta: "Open Tax",
    drill: "tax",
    items: [
      { label: "IT Regime Optimizer (115BAC)", badge: "AY 25-26", route: "income-tax", tone: "indigo" },
      { label: "Surcharge 25% Cap & Rebate", badge: "87A Relief", route: "income-tax", tone: "violet" },
      { label: "Tax Computation Sheet", badge: "Computation", route: "income-tax", tone: "indigo" },
    ],
  },
  {
    id: "monthly-audit",
    suite: "Suite 06",
    title: "Monthly Audit Working Paper",
    description: "Standardized firm format, Maker-Checker review & Zero-Merge Excel.",
    icon: FileText,
    tone: "indigo",
    path: "/monthly-audit",
    cta: "Launch Suite 06",
    route: "monthly-audit",
    items: [
      { label: "5 Sections & 8 Checklists", badge: "Standard", route: "monthly-audit", tone: "indigo" },
      { label: "Maker-Checker 4-E...", badge: "Draft → Released", route: "monthly-audit", tone: "amber" },
      { label: "Work Pending Continuity", badge: "Continuity", route: "monthly-audit", tone: "emerald" },
    ],
  },
  {
    id: "tally-xml",
    suite: "Suite 07",
    title: "Tally Entries Maker",
    description: "Voucher ingestion, zero-telemetry XML generator & Port 9000 bridge.",
    icon: Layers,
    tone: "rose",
    path: "/tally-xml",
    cta: "Launch Suite 07",
    route: "tally-xml",
    items: [
      { label: "Dual & Multi Vouchers", badge: "Batch Dr/Cr", route: "tally-xml", tone: "rose" },
      { label: "Masters & Extraction", badge: "Auto-Group", route: "tally-xml", tone: "amber" },
      { label: "Direct Port 9000 & XML", badge: "Local Socket", route: "tally-xml", tone: "emerald" },
    ],
  },
  {
    id: "wip",
    suite: "Suite 08",
    title: "Practice & WIP Hub",
    description: "Practice roster, 12M filing tracker, Financials & Bank CMA Credit & Ratios.",
    icon: Zap,
    tone: "amber",
    path: "/dashboard",
    cta: "Open Hub",
    drill: "wip",
    items: [
      { label: "Practice Dashboard", badge: "342 Clients", route: "dashboard", tone: "amber" },
      { label: "12M Filing Tracker", badge: "96.4% Filed", route: "tracker", tone: "emerald" },
      { label: "Bank CMA Credit & Ratios", badge: "MPBF II", route: "bank-cma", tone: "blue" },
    ],
  },
];

export interface CommandHubProps extends React.ComponentProps<"section"> {
  userName?: string;
  designation?: string;
  department?: string;
  firm?: string;
  firmReg?: string;
  counts: CommandHubCounts;
  /** Called with an app route id, e.g. "reco" or "tally-xml". */
  onNavigate?: (route: string) => void;
  /** Called when a card's CTA opens a drill-down. */
  onOpenDrill?: (drill: HubCardId) => void;
  cards?: CommandHubCard[];
}

export function CommandHub({
  userName = "CA Vipul Patel",
  designation,
  department,
  firm = "VCAN & Associates LLP, CAs",
  firmReg = "104522W",
  counts,
  onNavigate,
  onOpenDrill,
  cards = COMMAND_HUB_CARDS,
  className,
  ...rest
}: CommandHubProps) {
  const kpis = [
    { label: "Clients R1 Pending", value: `${counts.r1Pending} Clients Pending`, tone: "amber" as const, icon: ClipboardList },
    { label: "3B Pending", value: `${counts.gstr3bPending} Clients Pending`, tone: "rose" as const, icon: Calculator },
    { label: "Monthly Audit Pending", value: `${counts.monthlyAuditPending} ${counts.monthlyAuditPending === 1 ? "Audit" : "Audits"} Pending`, tone: "indigo" as const, icon: ClipboardList },
  ];
  const kpiTone = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-pink-200 bg-pink-50 text-pink-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  } as const;

  const open = (card: CommandHubCard) => {
    if (card.drill) onOpenDrill?.(card.drill);
    else if (card.route) onNavigate?.(card.route);
  };

  return (
    <section {...rest} className={cn("mx-auto w-full max-w-7xl space-y-3.5 text-slate-900", className)}>
      {/* Welcome and KPI strip */}
      <div className="flex flex-col justify-between gap-3.5 rounded-xl border border-slate-200/90 bg-white px-5 py-3 shadow-xs xl:flex-row xl:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[19px] font-bold leading-none tracking-tight text-slate-900">
              Welcome back, {userName}
              {designation && (
                <span className="ml-2 text-xs font-semibold text-slate-500">
                  ({designation}{department ? ` • ${department}` : ""})
                </span>
              )}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              verified
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            <span className="font-medium text-slate-800">Partner</span>
            <span>·</span>
            <span>{firm}</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono text-[11.5px] font-medium text-blue-600">Firm Reg: {firmReg}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-1.5", kpiTone[kpi.tone])}>
              <kpi.icon className="size-4 shrink-0 opacity-80" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase leading-none tracking-wider opacity-80">{kpi.label}</span>
                <span className="font-mono text-[13px] font-bold leading-tight">{kpi.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section heading */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-blue-600" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-800">Enterprise Compliance &amp; Advisory Suites</h2>
          <span className="rounded-full border border-blue-200/70 bg-gradient-to-r from-blue-50 to-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
            Series 01 – 08 Standardized
          </span>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/80 px-2.5 py-1 font-mono text-[11px] text-slate-500 sm:flex">
          <RotateCcw className="size-3.5 text-blue-600" />
          <span>{cards.length} Autonomous Suites Connected</span>
        </div>
      </div>

      {/* Suite grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const tone = TONE[card.tone];
          const Icon = card.icon;
          return (
            <article
              key={card.id}
              role="button"
              tabIndex={0}
              onClick={() => open(card)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(card);
                }
              }}
              className={cn(
                "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-4.5",
                tone.hover,
              )}
            >
              <div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r transition-all duration-300 group-hover:h-1.5", tone.bar)} />

              <div className="relative z-10">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className={cn("flex size-9 items-center justify-center rounded-xl border shadow-2xs transition-transform duration-200 group-hover:scale-110", tone.iconWrap)}>
                    <Icon className="size-[18px]" />
                  </div>
                  <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider", tone.pill)}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {card.suite}
                  </span>
                </div>

                <h3 className={cn("mb-1 line-clamp-1 text-[14.5px] font-bold leading-snug tracking-tight text-slate-900 transition-colors duration-200", tone.text)}>
                  {card.title}
                </h3>
                <p className="mb-3 line-clamp-2 min-h-[32px] text-[11.5px] leading-relaxed text-slate-500">{card.description}</p>

                <ul className="mb-3.5 flex flex-col gap-1.5 text-[11.5px]">
                  {card.items.map((item) => (
                    <li
                      key={item.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.route) onNavigate?.(item.route);
                      }}
                      className={cn(
                        "group/item flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 transition-all duration-200 hover:-translate-y-px",
                        item.pending ? "border-amber-200/80 bg-amber-50/70 hover:bg-amber-50" : "border-slate-200/60 bg-slate-50/80 hover:bg-white hover:shadow-2xs",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("size-1.5 shrink-0 rounded-full transition-transform group-hover/item:scale-125", DOT[item.tone ?? "slate"])} />
                        <span className="truncate font-medium text-slate-700">{item.label}</span>
                      </div>
                      <span className="ml-1.5 shrink-0 rounded border border-slate-200/80 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 shadow-2xs">
                        {item.badge}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative z-10 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="font-mono text-[10px] text-slate-400 transition-colors group-hover:text-slate-600">{card.path}</span>
                <span className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-semibold transition-all duration-200", tone.ctaText)}>
                  {card.cta}
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default CommandHub;

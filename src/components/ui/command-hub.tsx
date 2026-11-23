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

const ICON_TONE: Record<CommandHubCard["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
};

const CTA_TONE: Record<CommandHubCard["tone"], string> = {
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  indigo: "text-indigo-700",
  blue: "text-blue-700",
  violet: "text-violet-700",
  amber: "text-amber-700",
};

const DOT_TONE: Record<NonNullable<CommandHubItem["tone"]>, string> = {
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  slate: "bg-slate-300",
};

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
  const stats = [
    { label: "Clients pending R1", value: counts.r1Pending, unit: "clients", tone: "bg-amber-400" },
    { label: "Clients pending 3B", value: counts.gstr3bPending, unit: "clients", tone: "bg-rose-400" },
    { label: "Monthly audits pending", value: counts.monthlyAuditPending, unit: counts.monthlyAuditPending === 1 ? "audit" : "audits", tone: "bg-indigo-400" },
  ];

  const open = (card: CommandHubCard) => {
    if (card.drill) onOpenDrill?.(card.drill);
    else if (card.route) onNavigate?.(card.route);
  };

  return (
    <section {...rest} className={cn("mx-auto w-full max-w-7xl space-y-8 px-1 text-slate-900", className)}>
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Command Hub</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Welcome back, {userName}</h1>
          <p className="text-sm text-slate-500">
            {designation ? `${designation}${department ? ` · ${department}` : ""} · ` : ""}
            {firm} · Firm Reg {firmReg}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          <ShieldCheck className="size-3.5" />
          Verified
        </span>
      </header>

      {/* Pending KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className={cn("size-2 rounded-full", stat.tone)} />
              {stat.label}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold tracking-tight text-slate-900">{stat.value}</span>
              <span className="text-sm text-slate-500">{stat.unit} pending</span>
            </div>
          </div>
        ))}
      </div>

      {/* Suites */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Compliance & advisory suites</h2>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <RotateCcw className="size-3.5 text-blue-500" />
            {cards.length} suites connected
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
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
                className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={cn("flex size-10 items-center justify-center rounded-xl ring-1", ICON_TONE[card.tone])}>
                    <Icon className="size-5" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">{card.suite}</span>
                </div>

                <h3 className="mt-4 text-[15px] font-semibold leading-snug text-slate-900">{card.title}</h3>
                <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">{card.description}</p>

                <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4">
                  {card.items.map((item) => (
                    <li
                      key={item.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.route) onNavigate?.(item.route);
                      }}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-slate-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[item.tone ?? "slate"])} />
                        <span className={cn("truncate", item.pending ? "font-medium text-amber-700" : "text-slate-700")}>{item.label}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs", item.pending ? "font-semibold text-amber-700" : "text-slate-400")}>{item.badge}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-center justify-between pt-5">
                  <span className="font-mono text-[11px] text-slate-400">{card.path}</span>
                  <span className={cn("inline-flex items-center gap-1 text-sm font-medium", CTA_TONE[card.tone])}>
                    {card.cta}
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default CommandHub;

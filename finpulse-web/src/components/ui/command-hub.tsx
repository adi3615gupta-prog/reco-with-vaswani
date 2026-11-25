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
import { IS_WEB_BUILD } from "@/lib/webBuild";
import { WorksWheel, type WorksWheelItem } from "@/components/ui/works-wheel";

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
    drill: "reco",
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

/** Landing-page photos, one per suite on the rail. */
const SUITE_PHOTOS = [
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
];

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

  const SUITE_BADGES: Record<string, string> = {
    reco: "±₹2.00 Tol Active",
    collector: "Port 9000 Ready",
    returns: "12M Autopilot",
    audit: "SA 530 Sampling",
    tax: "115BAC Active",
    "monthly-audit": "4-Eye Review",
    "tally-xml": "Port 9000 XML",
    wip: "342 Clients Active",
  };

  const wheelItems: WorksWheelItem[] = cards.map((card, index) => ({
    title: card.title,
    image: SUITE_PHOTOS[index % SUITE_PHOTOS.length] as string,
    suite: card.suite,
    badge: SUITE_BADGES[card.id] || card.items?.[0]?.badge || "Active",
    tone: card.tone,
    subtitle: card.description,
    items: card.items,
  }));

  const open = (card: CommandHubCard) => {
    if (card.drill) onOpenDrill?.(card.drill);
    else if (card.route) onNavigate?.(card.route);
  };

  // Fill whatever is left of the window below the wheel's top edge, so the
  // page never needs to scroll whatever the surrounding chrome measures.
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = React.useState<number | undefined>(undefined);
  React.useLayoutEffect(() => {
    const read = () => {
      const el = boxRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setBoxH(Math.max(360, window.innerHeight - top));
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return (
    <section {...rest} className={cn("relative w-full text-slate-900 overflow-hidden", className)}>
      {/* The wheel fills the rest of the window */}
      <div ref={boxRef} className="relative min-h-[24rem] w-full overflow-hidden" style={{ height: boxH }}>
        {/* Header in top-left corner: 2 compact clean lines to never overlap center cards */}
        {!IS_WEB_BUILD && (
        <div className="pointer-events-none absolute top-3.5 left-4 z-20 max-w-[21rem]">
          <div className="flex flex-col gap-1 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/70 dark:border-slate-800/70 shadow-2xs">
            {/* Line 1: User name, designation badge & verified tag */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {userName}
              </span>
              {(designation || department) ? (
                <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
                  {designation}{department ? ` · ${department}` : ""}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60">
                <ShieldCheck className="size-3" />
                Verified
              </span>
            </div>

            {/* Line 2: Firm name & Registration number */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate max-w-[13.5rem] font-medium text-slate-600 dark:text-slate-300">{firm}</span>
              {firmReg ? (
                <>
                  <span className="text-slate-300 dark:text-slate-700 select-none">·</span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">Reg {firmReg}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        )}
        <div className="h-full">
        <WorksWheel
          items={wheelItems}
          label="8 suites"
          action="Open"
          onItemClick={(_item, index) => {
            const card = cards[index];
            if (card) open(card);
          }}
          onSubModuleClick={(route) => {
            onNavigate?.(route);
          }}
        />
        </div>
      </div>
    </section>
  );
}

export default CommandHub;

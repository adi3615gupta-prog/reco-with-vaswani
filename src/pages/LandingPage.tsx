import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Sparkles, FileSpreadsheet, Users, Database, FileCode2, Send,
  ChevronRight, CalendarClock, GitCompare, Star, MessageSquare, X, Phone, Mail, MapPin,
  CheckCircle2, AlertTriangle, Lightbulb, Zap, Laptop, Settings, Activity, Check,
  ExternalLink, Lock, Server, Layers, Table, Calculator, Landmark, BookOpen,
  ArrowRight, Search, Building2, Terminal, RefreshCw, BarChart3, HelpCircle, HardDrive
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────── AMBIENT LIGHT PARTICLE CANVAS ───────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationId: number;
    let particles: { x: number; y: number; vx: number; vy: number; size: number; a: number; color: string; char: string }[] = [];

    // Subtle enterprise palette: Deep trust navy, royal blue, compliance emerald, indigo
    const colors = [
      'rgba(30, 58, 138,',  // Navy
      'rgba(37, 99, 235,',  // Blue
      'rgba(5, 150, 105,',  // Emerald
      'rgba(79, 70, 229,',  // Indigo
    ];
    const chars = ['₹', '%', 'Σ', 'ITC', '2B', '3B', '₹', 'R1', 'PAN', 'TALLY', 'DRC'];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.body.scrollHeight || window.innerHeight * 4;
    };

    const init = () => {
      resize();
      const count = Math.min(Math.floor(canvas.width * canvas.height / 25000), 85);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25 - 0.15,
        size: Math.random() * 12 + 10,
        a: Math.random() * 0.10 + 0.03, // Low opacity for pristine light background
        color: colors[Math.floor(Math.random() * colors.length)],
        char: chars[Math.floor(Math.random() * chars.length)]
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -40) p.x = canvas.width + 40;
        if (p.x > canvas.width + 40) p.x = -40;
        if (p.y < -40) p.y = canvas.height + 40;
        if (p.y > canvas.height + 40) p.y = -40;

        ctx.font = `600 ${p.size}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `${p.color}${p.a})`;
        ctx.fillText(p.char, p.x, p.y);
      }
      if (!prefersReducedMotion) {
        animationId = requestAnimationFrame(draw);
      }
    };

    init();
    draw();
    window.addEventListener('resize', init);
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', init);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ─────────────── 3D TILT CARD WRAPPER ───────────────
function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg)');
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * 8;
    const rotateX = (0.5 - y) * 6;
    setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`);
    setGlarePos({ x: x * 100, y: y * 100 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    setIsHovered(false);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      style={{
        transform,
        transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {/* Light sheen glare overlay */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none z-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(ellipse at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.4) 0%, transparent 60%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />
    </div>
  );
}

// ─────────────── SCROLL REVEAL WRAPPER ───────────────
function ScrollReveal({
  children,
  delay = 0,
  className = '',
  direction = 'up'
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'left' | 'right';
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  const initial = direction === 'up'
    ? { opacity: 0, y: 40 }
    : direction === 'left'
    ? { opacity: 0, x: -40 }
    : { opacity: 0, x: 40 };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : initial}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.16, 1, 0.3, 1]
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────── INTERACTIVE LIVE FINANCIAL COCKPIT (HERO DEMO) ───────────────
function LiveFinancialCockpitDemo() {
  const [activeTab, setActiveTab] = useState<'reco' | 'tally' | 'autopilot'>('reco');
  const [isSimulating, setIsSimulating] = useState(false);
  const [matchedCount, setMatchedCount] = useState(1420);
  const [matchRate, setMatchRate] = useState(99.8);

  const triggerLiveSimulation = () => {
    setIsSimulating(true);
    setMatchedCount(prev => prev + 15);
    setMatchRate(99.9);
    setTimeout(() => {
      setIsSimulating(false);
      toast.success('Waterfall Solver Simulation: 15 additional PR vouchers matched with ₹0 discrepancy!');
    }, 900);
  };

  return (
    <div className="w-full bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/60 p-6 md:p-8 space-y-6 relative overflow-hidden">
      {/* Decorative subtle header badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-mono font-bold text-slate-700 tracking-wider uppercase">Live Runtime Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold flex items-center gap-1">
            <Server className="w-3 h-3 text-blue-600" /> Port 9000: Connected
          </span>
          <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-emerald-600" /> SQLite WAL
          </span>
        </div>
      </div>

      {/* Simulator Switcher */}
      <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60">
        <button
          onClick={() => setActiveTab('reco')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'reco'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ITC Waterfall Matcher
        </button>
        <button
          onClick={() => setActiveTab('tally')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'tally'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tally Prime Bridge
        </button>
        <button
          onClick={() => setActiveTab('autopilot')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'autopilot'
              ? 'bg-white text-blue-900 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          12M Autopilot Telemetry
        </button>
      </div>

      {/* Dynamic Tab Body */}
      {activeTab === 'reco' && (
        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">Matched ITC vs GSTR-2B</p>
              <h4 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-mono mt-0.5">
                ₹ 4,82,40,910<span className="text-sm font-normal text-slate-500">.45</span>
              </h4>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold font-mono">
                {matchRate}% Rate
              </span>
              <p className="text-[10px] text-slate-400 font-mono mt-1">₹0.00 Double-Counting</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${matchRate}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-full rounded-full"
            />
          </div>

          {/* 4 Waterfall metric pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] text-slate-500 font-mono block">Pass 1: Exact</span>
              <span className="text-xs font-bold text-slate-900 font-mono">{matchedCount} Bills</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] text-slate-500 font-mono block">Pass 2: ≤ ₹2 Round</span>
              <span className="text-xs font-bold text-slate-900 font-mono">184 Bills</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] text-slate-500 font-mono block">Pass 5: Core Inv</span>
              <span className="text-xs font-bold text-slate-900 font-mono">62 Bills</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
              <span className="text-[10px] text-amber-700 font-mono block">Debit Solver</span>
              <span className="text-xs font-bold text-amber-900 font-mono">28 Paired</span>
            </div>
          </div>

          <button
            onClick={triggerLiveSimulation}
            disabled={isSimulating}
            className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Evaluating 6-Pass Waterfall...' : 'Simulate Live Waterfall Reconciler'}
          </button>
        </div>
      )}

      {activeTab === 'tally' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Target Company:</span>
              <span className="font-bold text-slate-900">DYP INFRAPROJECTS PVT LTD</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Direct XML Port:</span>
              <span className="font-mono font-bold text-emerald-600">http://127.0.0.1:9000</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Ledgers Extracted:</span>
              <span className="font-mono font-bold text-slate-900">4,382 Vouchers (0.34s)</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Zero export/import manual files required — direct live sync active.</span>
          </div>
        </div>
      )}

      {activeTab === 'autopilot' && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">12-Month GSTR-2B Sync Status</p>
          <div className="grid grid-cols-6 gap-1.5 text-center">
            {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, idx) => (
              <div key={m} className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] font-bold text-slate-700 block">{m}</span>
                <Check className="w-3 h-3 text-emerald-600 mx-auto mt-0.5" />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 text-center font-medium pt-1">
            1-Login loop executed without CAPTCHA repeats · 8-Sheet consolidated Zero-Merge Excel generated.
          </p>
        </div>
      )}

      {/* Bottom shortcut reminder banner */}
      <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 font-medium">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          Universal PC Loco Pilot
        </span>
        <span className="font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
          Ctrl + Alt + S
        </span>
      </div>
    </div>
  );
}

// ─────────────── MAIN LANDING PAGE COMPONENT ───────────────
interface LandingPageProps {
  onNext: () => void;
  feedbackList: { name: string; rating: number; message: string; date: string }[];
  setFeedbackList: React.Dispatch<React.SetStateAction<{ name: string; rating: number; message: string; date: string }[]>>;
}

export default function LandingPage({ onNext, feedbackList, setFeedbackList }: LandingPageProps) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbName, setFbName] = useState('');
  const [fbRating, setFbRating] = useState(5);
  const [fbMessage, setFbMessage] = useState('');
  const [fbHoverRating, setFbHoverRating] = useState(0);
  const [moduleCategory, setModuleCategory] = useState<'all' | 'audit' | 'returns' | 'tally' | 'finance' | 'autopilot'>('all');

  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -25]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.98]);

  const handleSubmitFeedback = () => {
    if (!fbMessage.trim()) return;
    const newFb = {
      name: fbName.trim() || 'Chartered Accountant',
      rating: fbRating,
      message: fbMessage.trim(),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    };
    setFeedbackList(prev => [newFb, ...prev]);
    setShowFeedbackModal(false);
    setFbName('');
    setFbRating(5);
    setFbMessage('');
    toast.success('Thank you for your valuable feedback! Your submission has been saved.');
  };

  // ─────────────── 8 SUITES + AUTOPILOT CANONICAL SPECIFICATIONS ───────────────
  const enterpriseSuites = [
    {
      id: 'suite-01',
      category: 'audit',
      num: 'Suite 01',
      title: 'GST Multi-Tier Reconciliation & Debit Note Solver',
      badge: 'Core Engine · Section 16(2)(aa)',
      color: 'blue',
      icon: <GitCompare className="w-5 h-5 text-blue-600" />,
      description: 'Industrial-grade Purchase Register vs GSTR-2B matching audit engine. Implements exact, ₹2 tolerance, date proximity, fuzzy invoice cleaning, core prefix stripping, and an advanced 6-pass debit note subset-sum batch solver.',
      capabilities: [
        'Multi-tier waterfall matching (Pass 1 to Pass 8) with zero false mismatches from rounding',
        '6-Pass Debit Note reconciler: Pairs standalone Books & 2B notes side-by-side with value/tax tolerance',
        'Subset-sum batch solver resolving 1-to-many consolidated PR notes against split portal records',
        'Mathematical invariant guarantee: Σ Reconciled Rows = Σ Raw Input Rows across all tax heads'
      ],
      problems: [
        'Manual reconciliation of 10,000+ invoices takes days with high human error risk',
        'Rounding differences of ₹1–2 create thousands of false mismatches in standard tools',
        'Unpaired debit notes lead to severe ITC disallowances and audit notices under Sec 16'
      ],
      guarantee: 'Processes 50,000+ rows in under 8 seconds with strict zero-merge audit output.'
    },
    {
      id: 'suite-02',
      category: 'returns',
      num: 'Suite 02',
      title: 'GSTR-1 Outward Return Preparation & V2.2 Excel Export',
      badge: 'Statutory Preparation · 32-Sheet Export',
      color: 'indigo',
      icon: <FileSpreadsheet className="w-5 h-5 text-indigo-600" />,
      description: 'Prepare outward supply registers with automated classification (B2B, B2CL > ₹1L, B2CS, Table 12 HSN B2B/B2C, Table 14/15 ECO). Generates official V2.2 32-sheet Excel workbooks, offline JSON utilities, and DRC-01B audit defense reports.',
      capabilities: [
        'Automatic routing of inter-state unregistered supplies > ₹1 Lakh (post-Aug 2024 rule) to Table 5',
        'Bifurcated Table 12 HSN summary into separate B2B and B2C schedules with digit validation',
        '1-Click JSON generator identical to GST Offline Tool v3.2.4 schema with 19,000 row chunking',
        'TaxPower DRC-01B/C comparative workbooks comparing GSTR-1 vs GSTR-3B vs Books'
      ],
      problems: [
        'GST Offline Tool freezes, crashes on large datasets, and rejects invalid headers',
        'Manual B2B vs B2C HSN splitting requires tedious sorting and macro scripting',
        'DRC-01B scrutiny notices triggered due to un-reconciled outward turnover differences'
      ],
      guarantee: 'Generates 100% portal-uploadable JSON and 32-sheet Excel workbooks in seconds.'
    },
    {
      id: 'suite-03',
      category: 'tally',
      num: 'Suite 03',
      title: 'Tally Prime Direct XML Integration (Port 9000)',
      badge: 'Live Bridge · Zero File Exports',
      color: 'emerald',
      icon: <Server className="w-5 h-5 text-emerald-600" />,
      description: 'Connect directly to Tally Prime running on localhost or office LAN via native Port 9000 XML communication. Extract purchase registers, sales books, journal vouchers, and master party ledgers with zero manual Excel/XML export steps.',
      capabilities: [
        'Direct HTTP communication with Tally Prime Port 9000 with live connectivity diagnostics',
        'Two-way ledger extraction: Automatically parses vouchers, tax rates, GSTINs, and party names',
        'Tally UQC dictionary mapping and Table 13 document serial number gap analyzer',
        'Sub-500ms processing time even for enterprise ledgers with 100,000+ transaction lines'
      ],
      problems: [
        'Clients struggle to export XML from Tally in proper formats, wasting hours',
        'Exported XML files crash external converters or corrupt Unicode account headers',
        'No direct link between live accounting vouchers and statutory GST filing figures'
      ],
      guarantee: 'Zero file exports: 1-click live sync directly from active Tally Prime company.'
    },
    {
      id: 'suite-04',
      category: 'returns',
      num: 'Suite 04',
      title: 'GSTR-3B Working Sheet & 12-Month FY Tax Matrix',
      badge: 'Tax Set-Off · Rule 88A Engine',
      color: 'amber',
      icon: <Table className="w-5 h-5 text-amber-600" />,
      description: 'Complete 28-line GSTR-3B computation sheet with automated Table 4 ITC allocation, Rule 88A mathematical cash liability set-off optimization, unutilized cash credit rollover, and full 12-month FY comparative difference matrices.',
      capabilities: [
        'In-place 2B drill-down on Table 4 Inward ITC with voucher-level statutory allocation',
        'Rule 88A mathematical cash liability set-off optimizer strictly exhausting IGST credit first',
        'Tracking unutilized Electronic Cash Ledger TDS/TCS credits rolled forward to future months',
        'Full 12-month FY comparison matrix (3B vs 2B vs Books) with zero merged cells'
      ],
      problems: [
        'Incorrect tax set-off orders lead to unnecessary cash tax payments and interest liability',
        'Reconciliation differences between Table 4B reversals and Books go unnoticed',
        'Manual consolidation of 12 separate monthly returns for annual returns (GSTR-9) is painful'
      ],
      guarantee: 'Guarantees minimal cash tax payout via Rule 88A mathematical optimization.'
    },
    {
      id: 'suite-05',
      category: 'audit',
      num: 'Suite 05',
      title: 'Statutory Audit & Tax Audit Clause 44 Scrutiny',
      badge: 'Form 3CD · Statutory Audit',
      color: 'purple',
      icon: <BookOpen className="w-5 h-5 text-purple-600" />,
      description: 'Comprehensive audit examination module designed for Tax Audit Form 3CD Clause 44 compliance. Scrutinizes expenditure incurred regarding entities registered under GST vs unregistered entities, with daybook sampling and risk filters.',
      capabilities: [
        'Automated bifurcation of expenditure under Clause 44 into registered, composition, and unregistered',
        'Daybook transaction scrutiny with high-value anomaly detection and sample selection',
        'Voucher reclassification engine with persistent audit trail justifications',
        'Statutory working papers formatted with zero merged cells for audit file preservation'
      ],
      problems: [
        'Tagging thousands of ledger expenses as registered or unregistered takes weeks per client',
        'Lack of documented audit trails for Form 3CD Clause 44 leads to peer review concerns',
        'Inconsistent treatment of RCM transactions and exempt supplier purchases'
      ],
      guarantee: 'Auto-generates verified Clause 44 expenditure breakdowns directly from Tally ledgers.'
    },
    {
      id: 'suite-06',
      category: 'finance',
      num: 'Suite 06',
      title: 'Income Tax Liability & Regime Comparison Sandbox',
      badge: 'Section 115BAC · Deduction Sandbox',
      color: 'rose',
      icon: <Calculator className="w-5 h-5 text-rose-600" />,
      description: 'Interactive sandbox comparing Old Tax Regime vs New Tax Regime (Section 115BAC) across all assessment years. Computes Chapter VI-A deductions (80C, 80D, 80CCD), marginal relief, surcharge, and effective tax rates with side-by-side delta cards.',
      capabilities: [
        'Instant Old vs New Regime tax calculation with automated optimal regime recommendation',
        'Reactive deduction sliders for Section 80C, 80D, 80CCD, 80G, and standard deduction',
        'Marginal relief calculations for high-income earners exceeding surcharge thresholds',
        'Printable tax computation sheet ready for client tax planning consultations'
      ],
      problems: [
        'Clients frequently ask which regime is beneficial, requiring repetitive manual calculation',
        'Complex slab changes and varying rebate thresholds make manual comparison error-prone',
        'Marginal relief formulas on surcharge transition zones are complicated to calculate'
      ],
      guarantee: 'Provides instantaneous tax delta analysis with 100% statutory precision.'
    },
    {
      id: 'suite-07',
      category: 'finance',
      num: 'Suite 07',
      title: 'Bank CMA Appraisal & Financial Statement Projections',
      badge: 'MPBF II · Credit Appraisal',
      color: 'teal',
      icon: <Landmark className="w-5 h-5 text-teal-600" />,
      description: 'Audit-grade Credit Monitoring Arrangement (CMA) report engine. Generates multi-year Balance Sheets, P&L statements, Maximum Permissible Bank Finance (MPBF II Tandon/Chore committee), fund flow statements, and 11 MCA financial ratios.',
      capabilities: [
        'Multi-year historical and projected Balance Sheet and Profit & Loss statement compilation',
        'Tandon/Chore Committee MPBF Method II working capital bank limit assessment',
        '11 statutory financial ratios (Current Ratio, DSCR, TOL/TNW) with audit variance checks',
        'Banker-ready Zero-Merge Excel model preserving all formula cross-references'
      ],
      problems: [
        'CMA spreadsheets frequently have broken formula circular references and unreadable formatting',
        'Bankers reject loan proposals due to improper MPBF calculations or distorted ratios',
        'Manual creation of multi-year financial forecasts takes days per loan application'
      ],
      guarantee: 'Produces flawless, banker-vetted CMA reports with valid dynamic formulas.'
    },
    {
      id: 'suite-08',
      category: 'audit',
      num: 'Suite 08',
      title: 'Monthly Audit Working Paper Verification Suite',
      badge: 'Firm Format · Quality Review',
      color: 'cyan',
      icon: <Layers className="w-5 h-5 text-cyan-600" />,
      description: 'Standardized monthly internal and statutory audit verification suite modeled on leading firm working papers. Features 8 specialized verification sheets, 5 multi-source auto-populators, and base64 Excel serialization.',
      capabilities: [
        '8 specialized working paper sheets: Revenue, Inward ITC, Cash/Bank, RCM, TDS, Reversals, Inventory',
        '5 multi-source auto-populators gathering data from Tally Port 9000, 2B, 3B, and PR',
        'Cross-month pending points tracker with responsible team member assignment',
        'Zero-merge audit binder export preserving complete documentation trail'
      ],
      problems: [
        'Inconsistent monthly audit checks across different audit teams and trainees',
        'Pending audit queries get lost in email threads instead of being tracked month-to-month',
        'No standardized working paper format for senior partner review and client sign-off'
      ],
      guarantee: 'Standardizes monthly audit documentation across your entire firm.'
    },
    {
      id: 'suite-autopilot',
      category: 'autopilot',
      num: 'Autonomous Suite',
      title: 'Autonomous Autopilot Bots & In-App AI Copilot',
      badge: '1-Login 12M Sync · In-App AI Copilot',
      color: 'violet',
      icon: <Sparkles className="w-5 h-5 text-violet-600" />,
      description: 'Intelligent automation suite: 1-Login 12-Month GSTR-2B & GSTR-1 downloader with non-blocking resilience, GST IMS client action portal, Notice Shield AI PII sanitizer, and In-App Sourav AI Copilot.',
      capabilities: [
        '1-Login 12-Month loop downloading all periods (Apr–Mar) with official back-button navigation',
        'GST IMS Inward package requester with client action review links (Accept, Reject, Pending)',
        'Notice Shield AI: Zero-trust PII sanitization and courtroom-grade statutory legal reply drafter',
        'Built-in in-app Sourav AI copilot providing statutory compliance insights and direct module control'
      ],
      problems: [
        'Logging into GST portal 12 times per client with CAPTCHA delays wastes hours',
        'Manual drafting of notice replies (ASMT-10, DRC-01) without exact legal section citations',
        'Switching between Excel, Tally, and browser windows interrupts the accountant workflow'
      ],
      guarantee: 'Automates repetitive portal tasks completely locally without exposing client credentials.'
    }
  ];

  // Category counts
  const categoryCounts = {
    all: enterpriseSuites.length,
    audit: enterpriseSuites.filter(s => s.category === 'audit').length,
    returns: enterpriseSuites.filter(s => s.category === 'returns').length,
    tally: enterpriseSuites.filter(s => s.category === 'tally').length,
    finance: enterpriseSuites.filter(s => s.category === 'finance').length,
    autopilot: enterpriseSuites.filter(s => s.category === 'autopilot').length,
  };

  const filteredSuites = moduleCategory === 'all'
    ? enterpriseSuites
    : enterpriseSuites.filter(s => s.category === moduleCategory);

  return (
    <>
      {/* ═══════════ FEEDBACK MODAL (EXECUTIVE WHITE THEME) ═══════════ */}
      <AnimatePresence>
        {showFeedbackModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
            onClick={() => setShowFeedbackModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowFeedbackModal(false)}
                aria-label="Close feedback modal"
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
                  <MessageSquare className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Practitioner Feedback</h3>
                <p className="text-xs text-slate-500 mt-1">Help us continuously advance AUDIT WITH VASWANI for your practice</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Your Name / CA Firm (Optional)
                  </label>
                  <input
                    type="text"
                    value={fbName}
                    onChange={(e) => setFbName(e.target.value)}
                    placeholder="e.g. CA Rajesh Sharma & Associates"
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Rating
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        type="button"
                        className="p-1 hover:scale-110 transition-transform"
                        onMouseEnter={() => setFbHoverRating(s)}
                        onMouseLeave={() => setFbHoverRating(0)}
                        onClick={() => setFbRating(s)}
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            (fbHoverRating || fbRating) >= s
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-600 ml-2 font-mono">
                      {fbHoverRating || fbRating} / 5 Stars
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Your Feedback & Feature Requests
                  </label>
                  <textarea
                    value={fbMessage}
                    onChange={(e) => setFbMessage(e.target.value)}
                    placeholder="Tell us about your reconciliation workflows, performance experience, or ideas..."
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                  />
                </div>

                <button
                  onClick={handleSubmitFeedback}
                  disabled={!fbMessage.trim()}
                  className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/20 active:scale-[0.99] flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit Feedback <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ MAIN ROOT (EXECUTIVE ENTERPRISE WHITE THEME) ═══════════ */}
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans select-none relative overflow-x-hidden">

        {/* Ambient Canvas Particles */}
        <ParticleField />

        {/* Subtle Ambient Trust Gradients */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[3%] left-[10%] w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-[140px]" />
          <div className="absolute top-[30%] right-[8%] w-[500px] h-[500px] bg-indigo-100/30 rounded-full blur-[130px]" />
          <div className="absolute bottom-[20%] left-[20%] w-[550px] h-[550px] bg-emerald-100/30 rounded-full blur-[150px]" />
        </div>

        {/* ═══════════ FROSTED STICKY NAVIGATION BAR ═══════════ */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
            
            {/* Logo Emblem */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                <img src="./logo.png" alt="Vaswani Logo" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-slate-900 tracking-tight">AUDIT WITH VASWANI</h1>
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold">v2.2</span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono font-semibold uppercase tracking-wider">
                  Enterprise GST & Statutory Audit Suite
                </p>
              </div>
            </div>

            {/* Quick Navigation Anchor Links */}
            <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600">
              <a href="#suites" className="hover:text-blue-600 transition-colors">8 Platform Suites</a>
              <a href="#stats" className="hover:text-blue-600 transition-colors">Audit Telemetry</a>
              <a href="#architecture" className="hover:text-blue-600 transition-colors">Zero-Merge Architecture</a>
              <a href="#security" className="hover:text-blue-600 transition-colors">Air-Gapped Privacy</a>
              <a href="#testimonials" className="hover:text-blue-600 transition-colors">CA Testimonials</a>
            </nav>

            {/* Right Quick Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFeedbackModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 text-xs font-bold text-slate-700 transition-all shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> Feedback
              </button>

              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-600">
                <Terminal className="w-3.5 h-3.5 text-blue-600" />
                <kbd className="font-bold text-slate-800">Ctrl+Alt+S</kbd>
              </div>

              <button
                onClick={onNext}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
              >
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* ═══════════ MAIN CONTENT CONTAINER ═══════════ */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-16 space-y-24">

          {/* ═══════════ HERO SECTION (HIGH IMPACT SPLIT COCKPIT) ═══════════ */}
          <motion.div
            style={{ y: heroY, scale: heroScale }}
            className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center"
          >
            {/* Left Hero Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Trust Pill */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Industrial-Grade On-Premise CA Suite · Zero Cloud Exposure</span>
              </div>

              {/* Headline */}
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.08]">
                Enterprise Statutory Audit &amp;{' '}
                <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                  GST Intelligence
                </span>
              </h2>

              {/* Value Proposition */}
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
                Engineered specifically for Chartered Accountants, Tax Consultants, and Corporate Finance Heads. Reconcile 50,000+ invoices in seconds, prepare 100% portal-compliant GSTR-1 and GSTR-3B returns, and generate audit-grade analytical workbooks with guaranteed zero merged cells.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onNext}
                  className="px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/25 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2.5"
                >
                  Enter Practice Hub <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#suites"
                  className="px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold transition-all shadow-2xs hover:border-slate-300 flex items-center gap-2"
                >
                  Explore All 8 Suites
                </a>
              </div>

              {/* Trust Metric Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-200/80">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Storage</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 100% Local SQLite
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Spreadsheets</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Zero Merged Cells
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Speed</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sub-500ms Matching
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Autopilot</span>
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 1-Login 12M Loop
                  </span>
                </div>
              </div>
            </div>

            {/* Right Hero Column: Interactive Live Financial Cockpit */}
            <div className="lg:col-span-5">
              <LiveFinancialCockpitDemo />
            </div>
          </motion.div>

          {/* ═══════════ LIVE KPI TELEMETRY BAR ═══════════ */}
          <div id="stats">
            <ScrollReveal>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
                <div className="p-4 text-center sm:text-left space-y-1">
                  <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Processing Speed</p>
                  <h3 className="text-3xl font-black text-slate-900 font-mono tracking-tight">50,000+</h3>
                  <p className="text-xs text-slate-500 font-medium">Invoices / sec Reconciled</p>
                </div>
                <div className="p-4 text-center sm:text-left space-y-1 border-t sm:border-t-0 sm:border-l border-slate-100">
                  <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Accounting Invariant</p>
                  <h3 className="text-3xl font-black text-emerald-600 font-mono tracking-tight">₹0.00</h3>
                  <p className="text-xs text-slate-500 font-medium">Double-Counting Discrepancy</p>
                </div>
                <div className="p-4 text-center sm:text-left space-y-1 border-t md:border-t-0 md:border-l border-slate-100">
                  <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Statutory Suites</p>
                  <h3 className="text-3xl font-black text-blue-600 font-mono tracking-tight">8 + 1</h3>
                  <p className="text-xs text-slate-500 font-medium">Integrated Compliance Suites</p>
                </div>
                <div className="p-4 text-center sm:text-left space-y-1 border-t sm:border-t-0 md:border-l border-slate-100">
                  <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Data Privacy</p>
                  <h3 className="text-3xl font-black text-slate-900 font-mono tracking-tight">100%</h3>
                  <p className="text-xs text-slate-500 font-medium">Air-Gapped On-Premise Execution</p>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* ═══════════ 8 SUITES INTERACTIVE SHOWCASE & NAVIGATOR ═══════════ */}
          <div id="suites" className="space-y-8">
            <ScrollReveal>
              <div className="text-center space-y-3 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>The Complete Statutory Ecosystem</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  8 Powerful Enterprise Suites, One Local Platform
                </h2>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                  Every suite is built from the ground up to eliminate specific high-friction compliance bottlenecks faced by accounting and tax practitioners across India.
                </p>
              </div>
            </ScrollReveal>

            {/* Interactive Category Filter Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {[
                { id: 'all', label: 'All Suites', count: categoryCounts.all },
                { id: 'audit', label: 'Audit & Reco', count: categoryCounts.audit },
                { id: 'returns', label: 'Returns & Filing', count: categoryCounts.returns },
                { id: 'tally', label: 'Tally & Integration', count: categoryCounts.tally },
                { id: 'finance', label: 'Financial & Tax', count: categoryCounts.finance },
                { id: 'autopilot', label: 'Autonomous AI', count: categoryCounts.autopilot },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setModuleCategory(cat.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    moduleCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {cat.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    moduleCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Suites Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {filteredSuites.map((suite, idx) => (
                <ScrollReveal key={suite.id} delay={idx * 0.05}>
                  <TiltCard className="h-full bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* Card Top Pill */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold text-blue-600 uppercase tracking-wider">
                          {suite.num}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/80 text-[10px] font-medium text-slate-600">
                          {suite.badge}
                        </span>
                      </div>

                      {/* Header with Icon */}
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 flex-shrink-0">
                          {suite.icon}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                            {suite.title}
                          </h3>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {suite.description}
                      </p>

                      {/* Key Capabilities */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                          Key Capabilities
                        </span>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {suite.capabilities.slice(0, 3).map((cap, i) => (
                            <li key={i} className="flex items-start gap-2 leading-relaxed">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span className="text-slate-600 text-[11px]">{cap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Problem Eliminated */}
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1">
                        <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500" /> Problem Eliminated
                        </span>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {suite.problems[0]}
                        </p>
                      </div>
                    </div>

                    {/* Launch Button */}
                    <div className="pt-5 mt-4 border-t border-slate-100">
                      <button
                        onClick={onNext}
                        className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-800 hover:text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-2 group shadow-2xs"
                      >
                        Launch Module <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      </button>
                    </div>
                  </TiltCard>
                </ScrollReveal>
              ))}
            </div>
          </div>

          {/* ═══════════ ARCHITECTURAL PRINCIPLES & ZERO-MERGE DEFENSE ═══════════ */}
          <div id="architecture" className="space-y-8">
            <ScrollReveal>
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Audit-Grade Engineering Standards</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  Architectural Rigor: Built for Audit Defense
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  Designed around mathematical invariants, air-gapped security, and strict spreadsheet integrity.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Pillar 1: Zero-Merge Excel Architecture */}
              <ScrollReveal delay={0.05}>
                <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                      <Table className="w-6 h-6 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Strict Zero-Merge Architecture
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Merged cells in Excel completely block column filtering, multi-column sorting, pivot tables, and formula lookups (<code className="text-amber-700 font-mono bg-amber-50 px-1 py-0.5 rounded">VLOOKUP</code>, <code className="text-amber-700 font-mono bg-amber-50 px-1 py-0.5 rounded">XLOOKUP</code>).
                    </p>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
                      <div className="text-emerald-600 font-bold">✓ ws['!merges'] = []</div>
                      <div className="text-slate-500">Every single row is an independent, filterable data record ready for audit scrutiny.</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider pt-2">
                    Guaranteed across all 12 modules
                  </div>
                </div>
              </ScrollReveal>

              {/* Pillar 2: 100% Air-Gapped Local Privacy */}
              <ScrollReveal delay={0.1}>
                <div id="security" className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      100% Air-Gapped Local Execution
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Financial ledgers and GST portal credentials never leave your office network. All computation occurs in local multi-threaded Web Workers and an encrypted on-premise SQLite database.
                    </p>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
                      <div className="text-blue-600 font-bold">✓ Zero Cloud Leakage</div>
                      <div className="text-slate-500">Runs completely offline with local LAN multi-workstation sync and automatic backup vaults.</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider pt-2">
                    Zero third-party cloud dependence
                  </div>
                </div>
              </ScrollReveal>

              {/* Pillar 3: Multi-Tier Reconciliation Invariants */}
              <ScrollReveal delay={0.15}>
                <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Mathematical Invariant Proof
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Our multi-tier reconciliation engine enforces zero double counting across Exact, Rounding, Fuzzy, Core Serial, and Debit Note passes.
                    </p>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 space-y-1">
                      <div className="text-emerald-600 font-bold">✓ Σ Reconciled = Σ Raw Inputs</div>
                      <div className="text-slate-500">Total taxable value and tax heads strictly reconcile down to the exact rupee without drop-offs.</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider pt-2">
                    Section 16(2)(aa) audit proof
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>

          {/* ═══════════ TESTIMONIALS & CA FEEDBACK ═══════════ */}
          <div id="testimonials" className="space-y-8">
            <ScrollReveal>
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Trusted by Chartered Accountants</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  What Tax &amp; Audit Practitioners Say
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  Tested under intense tax filing deadlines across hundreds of corporate clients.
                </p>
              </div>
            </ScrollReveal>

            {/* Testimonials Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  name: 'CA Rajesh Agarwal',
                  role: 'Senior Partner, Agarwal & Co.',
                  city: 'Mumbai',
                  rating: 5,
                  comment: 'The 6-pass debit note solver paired with Tally Port 9000 integration transformed our GSTR-9 annual filing. We reconciled 35,000 transactions in under a minute with zero duplicate rows.'
                },
                {
                  name: 'CA Priya Sundaram',
                  role: 'Direct Tax & GST Head, Sundaram Associates',
                  city: 'Bengaluru',
                  rating: 5,
                  comment: 'Strict zero merged cells in the exported workbooks is a game-changer. My audit trainees can immediately apply VLOOKUP and pivot tables without fixing broken merged headers.'
                },
                {
                  name: 'CA Vikramjit Singh',
                  role: 'Partner, V. Singh & Partners',
                  city: 'Delhi NCR',
                  rating: 5,
                  comment: 'The 1-login 12-month GSTR-2B autopilot saved us countless hours. One CAPTCHA session and our entire annual inward register was saved locally in SQLite.'
                }
              ].map((testi, i) => (
                <ScrollReveal key={i} delay={i * 0.08}>
                  <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-3">
                      <div className="flex items-center gap-1">
                        {[...Array(testi.rating)].map((_, s) => (
                          <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed italic">
                        "{testi.comment}"
                      </p>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{testi.name}</h4>
                        <p className="text-[10px] text-slate-500 font-medium">{testi.role}</p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                        {testi.city}
                      </span>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            {/* User Submitted Feedback Stream */}
            {feedbackList.length > 0 && (
              <div className="pt-6">
                <ScrollReveal>
                  <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-3xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider font-mono">
                        Recent User Reviews ({feedbackList.length})
                      </h4>
                      <button
                        onClick={() => setShowFeedbackModal(true)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        + Write a Review
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {feedbackList.slice(0, 6).map((fb, idx) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200/80 rounded-2xl text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[11px]">{fb.name}</span>
                            <span className="text-[9px] font-mono text-slate-400">{fb.date}</span>
                          </div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`w-3 h-3 ${fb.rating >= s ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                            ))}
                          </div>
                          <p className="text-[11px] text-slate-600 italic">"{fb.message}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            )}
          </div>

          {/* ═══════════ FINAL CALL TO ACTION ═══════════ */}
          <ScrollReveal>
            <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-3 text-center md:text-left max-w-xl">
                <span className="px-3 py-1 rounded-full bg-white/10 text-white text-[10px] font-mono font-bold tracking-wider uppercase inline-block">
                  On-Premise Ready
                </span>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                  Ready to Transform Your CA &amp; Tax Practice?
                </h3>
                <p className="text-sm text-blue-100 leading-relaxed font-normal">
                  Start processing live client reconciliations, Tally Prime extractions, and statutory filings right on your local PC.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <button
                  onClick={onNext}
                  className="px-8 py-4 rounded-xl bg-white hover:bg-slate-100 text-blue-900 text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-black/10 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Enter Practice Hub <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="px-6 py-4 rounded-xl bg-blue-800/80 hover:bg-blue-800 border border-white/20 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                >
                  Give Feedback
                </button>
              </div>
            </div>
          </ScrollReveal>

          {/* ═══════════ PROFESSIONAL FOOTER ═══════════ */}
          <footer id="contact" className="border-t border-slate-200 pt-12 pb-6 space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Col 1: Brand Info */}
              <div className="col-span-2 md:col-span-1 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-2xs">
                    <img src="./logo.png" alt="Logo" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-sm font-black text-slate-900">AUDIT WITH VASWANI</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enterprise-grade GST compliance, automated reconciliation, and statutory audit platform built for Chartered Accountants and Tax Consultants across India.
                </p>
                <div className="text-[11px] font-mono text-slate-400">
                  Runs 100% locally on your network.
                </div>
              </div>

              {/* Col 2: Platform Suites */}
              <div className="space-y-3">
                <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider font-mono">
                  Platform Suites
                </h5>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li><a href="#suites" className="hover:text-blue-600 transition-colors">Suite 01: GST Reco &amp; Debit Notes</a></li>
                  <li><a href="#suites" className="hover:text-blue-600 transition-colors">Suite 02: GSTR-1 Outward Prep</a></li>
                  <li><a href="#suites" className="hover:text-blue-600 transition-colors">Suite 03: Tally Prime Live Bridge</a></li>
                  <li><a href="#suites" className="hover:text-blue-600 transition-colors">Suite 04: GSTR-3B Tax Matrix</a></li>
                  <li><a href="#suites" className="hover:text-blue-600 transition-colors">Suite 08: Monthly Audit Suite</a></li>
                </ul>
              </div>

              {/* Col 3: Audit Defense */}
              <div className="space-y-3">
                <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider font-mono">
                  Audit Defense
                </h5>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li><a href="#architecture" className="hover:text-blue-600 transition-colors">Zero-Merge Excel Architecture</a></li>
                  <li><a href="#architecture" className="hover:text-blue-600 transition-colors">Local Air-Gapped Privacy</a></li>
                  <li><a href="#architecture" className="hover:text-blue-600 transition-colors">Multi-Tier Matching Invariants</a></li>
                  <li><a href="#stats" className="hover:text-blue-600 transition-colors">Sub-500ms Worker Telemetry</a></li>
                  <li><button onClick={() => setShowFeedbackModal(true)} className="hover:text-blue-600 transition-colors">Submit CA Feedback</button></li>
                </ul>
              </div>

              {/* Col 4: Support & Security */}
              <div className="space-y-3">
                <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider font-mono">
                  Technical Support
                </h5>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Laptop className="w-3.5 h-3.5 text-blue-600" /> Windows 10 / 11 64-bit
                  </li>
                  <li className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-emerald-600" /> Tally Prime 2.0+ (Port 9000)
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" /> Zero Cloud Dependency
                  </li>
                  <li className="flex items-center gap-2 font-mono text-[11px] text-slate-500 pt-1">
                    <Terminal className="w-3 h-3 text-slate-400" /> Hotkey: Ctrl+Alt+S
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom Copyright & Version */}
            <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
              <p className="font-mono text-[11px]">
                © {new Date().getFullYear()} AUDIT WITH VASWANI. All rights reserved. On-Premise Enterprise Edition.
              </p>
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                  System Status: Online
                </span>
                <span>Vaswani Return Enterprise v2.3.0</span>
              </div>
            </div>
          </footer>

        </div>
      </div>
    </>
  );
}

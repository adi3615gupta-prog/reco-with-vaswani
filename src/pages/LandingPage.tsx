import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Sparkles, FileSpreadsheet,
  Users, Database, FileCode2, Send, ImageIcon,
  ChevronRight, CalendarClock, GitCompare,
  Star, MessageSquare, X, Phone, Mail, MapPin,
  CheckCircle2, AlertTriangle, Lightbulb, Zap,
  Laptop, Settings
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────── PARTICLE CANVAS BACKGROUND ───────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;
    let particles: { x: number; y: number; vx: number; vy: number; size: number; a: number; color: string; char: string }[] = [];

    const colors = [
      'rgba(59,130,246,', // blue
      'rgba(139,92,246,', // purple
      'rgba(16,185,129,', // emerald
      'rgba(245,158,11,', // amber
    ];
    const chars = ['₹', '₹', '%', '+', '-', '₹', 'GST', 'TAX', '₹'];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.body.scrollHeight || window.innerHeight * 5;
    };

    const init = () => {
      resize();
      const count = Math.min(Math.floor(canvas.width * canvas.height / 18000), 120);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3 - 0.2, // slight upward float for a stock ticker feel
        size: Math.random() * 14 + 10, // font size
        a: Math.random() * 0.3 + 0.05, // transparency
        color: colors[Math.floor(Math.random() * colors.length)],
        char: chars[Math.floor(Math.random() * chars.length)]
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        
        // Screen wrapping with a buffer to prevent popping
        if (p.x < -50) p.x = canvas.width + 50;
        if (p.x > canvas.width + 50) p.x = -50;
        if (p.y < -50) p.y = canvas.height + 50;
        if (p.y > canvas.height + 50) p.y = -50;
        
        ctx.font = `bold ${p.size}px "Inter", sans-serif`;
        ctx.fillStyle = `${p.color}${p.a})`;
        ctx.fillText(p.char, p.x, p.y);
      }
      animationId = requestAnimationFrame(draw);
    };

    init();
    draw();
    window.addEventListener('resize', init);
    return () => {
      cancelAnimationFrame(animationId);
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
    const rotateY = (x - 0.5) * 12;
    const rotateX = (0.5 - y) * 8;
    setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015,1.015,1.015)`);
    setGlarePos({ x: x * 100, y: y * 100 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
    setIsHovered(false);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      style={{
        transform,
        transition: isHovered ? 'transform 0.08s ease-out' : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {/* Glare overlay */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none z-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(ellipse at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.06) 0%, transparent 60%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />
    </div>
  );
}

// ─────────────── SCROLL-TRIGGERED SECTION ───────────────
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
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const initial = direction === 'up'
    ? { opacity: 0, y: 60 }
    : direction === 'left'
    ? { opacity: 0, x: -60 }
    : { opacity: 0, x: 60 };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : initial}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.16, 1, 0.3, 1]
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────── STAGGERED COLUMN REVEAL ───────────────
function StaggeredColumns({ children }: { children: React.ReactNode[] }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div ref={ref} className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800/40">
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{
            duration: 0.7,
            delay: i * 0.2,
            ease: [0.16, 1, 0.3, 1]
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────── 3D ISOMETRIC ILLUSTRATION ───────────────
function Iso3DIcon({ color, imageSrc }: { color: string; imageSrc: string }) {
  const colorMap: Record<string, string> = {
    amber: 'rgba(245,158,11,0.15)',
    blue: 'rgba(59,130,246,0.15)',
    emerald: 'rgba(16,185,129,0.15)',
    pink: 'rgba(236,72,153,0.15)',
    purple: 'rgba(139,92,246,0.15)',
    yellow: 'rgba(234,179,8,0.15)',
  };
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <div
        className="absolute inset-0 rounded-2xl blur-xl animate-pulse"
        style={{ background: colorMap[color] || colorMap.blue, animationDuration: '4s' }}
      />
      <img
        src={imageSrc}
        alt=""
        className="relative w-20 h-20 object-contain drop-shadow-lg"
        style={{ filter: 'brightness(1.1) contrast(1.05)' }}
      />
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

  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -40]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.97]);

  const handleSubmitFeedback = () => {
    if (!fbMessage.trim()) return;
    const newFb = {
      name: fbName.trim() || 'Anonymous User',
      rating: fbRating,
      message: fbMessage.trim(),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    };
    setFeedbackList(prev => [newFb, ...prev]);
    setShowFeedbackModal(false);
    setFbName('');
    setFbRating(5);
    setFbMessage('');
    toast.success('Thank you for your feedback!');
  };

  const toolsData = [
    {
      num: '01', title: 'Practice Dashboard',
      color: 'amber', gradient: 'from-amber-500/20 to-amber-600/5',
      image: './iso_calendar.png',
      description: 'Centralize client metadata in an offline SQLite database. Access live GSTR due-dates calendars, manage client portfolios, and send automatic reminder logs via custom SMTP/SMS gateways — all running securely on your local machine.',
      functions: [
        'Store & manage unlimited client profiles with GSTIN, PAN, and contact details',
        'Auto-generate GSTR-1, GSTR-3B, and annual return filing calendars',
        'Send bulk reminder notifications via SMTP email and SMS gateways',
        'Track filing history with color-coded compliance status indicators'
      ],
      problems: [
        "Manually tracking 100+ clients' due dates leads to missed deadlines and penalties",
        'Scattered client data across Excel sheets wastes hours during filing season',
        'No centralized system to send timely reminders to clients'
      ],
      solutions: [
        'Automated calendar with real-time countdown alerts — never miss a deadline again',
        'Single-source-of-truth database with instant search and filtering',
        'One-click bulk reminder dispatch via integrated email/SMS gateway'
      ]
    },
    {
      num: '02', title: 'Ledger Consolidator',
      color: 'blue', gradient: 'from-blue-500/20 to-blue-600/5',
      image: './iso_ledger.png',
      description: 'Standardize decentralized ledgers from multiple branches. Align column mappings, clean inconsistent records, and combine multi-branch transactions into a single master sheet automatically — ready for audit or further processing.',
      functions: [
        'Upload multiple Excel/CSV files from different branches simultaneously',
        'Auto-detect and align column mappings across different file formats',
        'Merge and de-duplicate records with intelligent matching algorithms',
        'Export a single, clean, consolidated master ledger in seconds'
      ],
      problems: [
        'Multi-branch firms maintain ledgers in different formats — merging takes days',
        'Manual consolidation introduces copy-paste errors and duplicate entries',
        'Column headers vary across branches making cross-referencing painful'
      ],
      solutions: [
        'Smart column auto-detection maps fields even when headers differ',
        'One-click merge with built-in duplicate detection and resolution',
        'Produces audit-ready master sheets with traceable source references'
      ]
    },
    {
      num: '03', title: 'GST Reconciliation Engine',
      color: 'emerald', gradient: 'from-emerald-500/20 to-emerald-600/5',
      image: './iso_reconciliation.png',
      description: 'Industrial-grade Purchase Register vs GSTR-2B matching audit engine. Implements precise matching logic based on GSTIN, PAN, invoice number, and fuzzy name matching with custom rounding tolerances for complete ITC reconciliation.',
      functions: [
        'Match PR entries with GSTR-2B data using multi-field comparison (GSTIN + Invoice + Amount)',
        'Configurable rounding tolerance (₹1, ₹2, ₹5) to handle minor discrepancies',
        'Generate Monthly Comparison and Party-Wise reconciliation reports',
        'Support for Credit/Debit note adjustments in final reconciliation output'
      ],
      problems: [
        'Manual ITC reconciliation for 10,000+ invoices takes weeks per client',
        'Rounding differences of ₹1-2 create thousands of false mismatches',
        'No visibility into which suppliers have unclaimed or excess ITC'
      ],
      solutions: [
        'Engine processes 50,000+ records in under 10 seconds with 99.9% accuracy',
        'Smart tolerance matching eliminates false positives from rounding differences',
        'Party-wise breakdown instantly shows ITC gaps per supplier for follow-up'
      ]
    },
    {
      num: '04', title: 'Tally XML Converter',
      color: 'pink', gradient: 'from-pink-500/20 to-pink-600/5',
      image: './iso_xml.png',
      description: 'Decode raw Tally XML voucher exports into perfectly formatted, totalized Excel workbooks. Supports Sales, Purchase, Journal, and all other voucher types with bold headers, freeze panes, and auto-column-width styling.',
      functions: [
        'Parse Tally Prime & Tally ERP 9 XML exports of any voucher type',
        'Auto-generate styled Excel books with bold headers, borders, and freeze panes',
        'Separate worksheets per voucher type with individual totals and grand totals',
        'Sub-500ms processing time even for files with 100,000+ entries'
      ],
      problems: [
        "Tally XML files are unreadable — clients can't share data in usable format",
        'Converting XML to Excel manually requires writing complex macros or scripts',
        'Large Tally exports crash most tools or take hours to process'
      ],
      solutions: [
        'One-click conversion: drag XML → get styled Excel in under a second',
        'Zero scripting needed — production-quality output with proper accounting format',
        'Optimized engine handles 100K+ vouchers without freezing or crashing'
      ]
    },
    {
      num: '05', title: 'Returns Preparation Suite',
      color: 'purple', gradient: 'from-purple-500/20 to-purple-600/5',
      image: './iso_returns.png',
      description: 'Prepare outward supply registers for GST returns filing. Run offline schema validations, preview draft returns before submission, and compile portal-ready JSON/Excel files that can be directly uploaded to the GST portal.',
      functions: [
        'Validate data against official GST return schemas before filing',
        'Preview draft GSTR-1 and GSTR-3B returns with detailed summaries',
        'Generate portal-uploadable JSON files that pass all government validations',
        'Maintain version history of prepared returns for audit trail purposes'
      ],
      problems: [
        'Preparing returns on the GST portal is slow and error-prone for large datasets',
        'Portal timeouts and crashes during peak filing hours waste entire working days',
        'Schema validation errors discovered only at upload time — requires rework'
      ],
      solutions: [
        'Prepare everything offline at your own pace — no dependency on portal uptime',
        'Pre-validate against government schemas — catch errors before uploading',
        'One-click JSON generation — upload to portal in seconds, not hours'
      ]
    },
    {
      num: '06', title: 'AI Deep-Vision OCR',
      color: 'yellow', gradient: 'from-yellow-500/20 to-yellow-600/5',
      image: './iso_ocr.png',
      description: 'High-fidelity invoice scanning powered by deep vision AI. Upload scanned invoices, handwritten documents, or screenshot slices — the OCR engine extracts tabular data, maps it to standard columns, and produces clean Excel output instantly.',
      functions: [
        'Extract tabular data from scanned invoices, bills, and handwritten documents',
        'AI-powered column recognition maps data to standard accounting fields',
        'Batch processing — upload multiple images and get consolidated output',
        'Auto-correct common OCR errors with built-in spell-check and validation'
      ],
      problems: [
        'Clients send invoices as photos or scans — manual data entry takes hours',
        'Handwritten bills are nearly impossible to process with standard OCR tools',
        'Extracting tables from images loses structure and requires manual reformatting'
      ],
      solutions: [
        'AI vision model reads even handwritten or low-quality scans with high accuracy',
        'Table structure is preserved — output is a clean, properly aligned Excel sheet',
        'Batch mode processes 50+ invoice images in one go — 10x faster than manual entry'
      ]
    }
  ];

  const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-500', glow: 'shadow-amber-500/10' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-500', glow: 'shadow-blue-500/10' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500', glow: 'shadow-emerald-500/10' },
    pink: { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-500', glow: 'shadow-pink-500/10' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-500', glow: 'shadow-purple-500/10' },
    yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-500', glow: 'shadow-yellow-500/10' }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float3D {
          0%, 100% { transform: translateY(0px) rotateX(2deg) rotateY(-1deg); }
          33% { transform: translateY(-8px) rotateX(-1deg) rotateY(2deg); }
          66% { transform: translateY(-4px) rotateX(1deg) rotateY(-2deg); }
        }
        .float-3d-hero {
          animation: float3D 8s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        .float-3d-hero:hover {
          animation-duration: 4s;
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-animate {
          background-size: 200% 200%;
          animation: gradientShift 6s ease infinite;
        }

        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(59,130,246,0.1), 0 0 60px rgba(139,92,246,0.05); }
          50% { box-shadow: 0 0 40px rgba(59,130,246,0.2), 0 0 80px rgba(139,92,246,0.1); }
        }
        .glow-pulse { animation: glowPulse 4s ease-in-out infinite; }

        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -15px) scale(1.05); }
          50% { transform: translate(-10px, -25px) scale(0.95); }
          75% { transform: translate(-20px, -10px) scale(1.02); }
        }
        .orb-float { animation: orbFloat 12s ease-in-out infinite; }
        .orb-float-delayed { animation: orbFloat 15s ease-in-out infinite; animation-delay: -5s; }
        .orb-float-slow { animation: orbFloat 20s ease-in-out infinite; animation-delay: -10s; }

        .fb-modal-overlay { background: rgba(0,0,0,0.75); backdrop-filter: blur(16px); }
        .star-btn { transition: all 0.15s ease; }
        .star-btn:hover { transform: scale(1.25); }

        .hero-grid-line {
          position: absolute;
          background: linear-gradient(to bottom, transparent, rgba(59,130,246,0.03), transparent);
        }

        @keyframes scanLine {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(59,130,246,0.15), transparent);
          animation: scanLine 8s linear infinite;
        }

        .finance-grid-bg {
          background-image: 
            linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
          -webkit-mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
          animation: gridScroll 20s linear infinite;
        }
        @keyframes gridScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 50px; }
        }
      `}} />

      {/* FEEDBACK MODAL */}
      <AnimatePresence>
        {showFeedbackModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] fb-modal-overlay flex items-center justify-center p-6"
            onClick={() => setShowFeedbackModal(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setShowFeedbackModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                  <MessageSquare className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Share Your Feedback</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Help us improve RECO WITH VASWANI</p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Your Name (Optional)</label>
                  <input type="text" value={fbName} onChange={(e) => setFbName(e.target.value)} placeholder="Enter your name" className="w-full h-11 bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button" className="star-btn" onMouseEnter={() => setFbHoverRating(s)} onMouseLeave={() => setFbHoverRating(0)} onClick={() => setFbRating(s)}>
                        <Star className={`w-7 h-7 ${(fbHoverRating || fbRating) >= s ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300 dark:text-slate-600'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Your Feedback</label>
                  <textarea value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} placeholder="Tell us what you think..." rows={4} className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors resize-none" />
                </div>
                <button onClick={handleSubmitFeedback} disabled={!fbMessage.trim()} className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-sm transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02] flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed">
                  Submit Feedback <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-[#E4EEF8] select-none relative overflow-x-hidden">

        {/* PARTICLE CANVAS */}
        <ParticleField />

        {/* AMBIENT ORB GLOWS */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[5%] left-[15%] w-[550px] h-[550px] bg-blue-600/[0.06] rounded-full blur-[160px] orb-float" />
          <div className="absolute top-[35%] right-[10%] w-[450px] h-[450px] bg-purple-600/[0.06] rounded-full blur-[140px] orb-float-delayed" />
          <div className="absolute bottom-[15%] left-[25%] w-[500px] h-[500px] bg-emerald-600/[0.04] rounded-full blur-[150px] orb-float-slow" />
          {/* Subtle scan line */}
          <div className="scan-line" />
        </div>

        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-12 space-y-24">

          {/* ═══════════ HEADER BAR ═══════════ */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800/60 pb-8"
          >
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shadow-lg glow-pulse">
                <img src="./logo.png" alt="Logo" className="w-8 h-8 object-contain dark:invert-0 invert" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">RECO WITH VASWANI</h1>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em] font-bold mt-0.5 font-mono">GST Compliance & Automation Suite</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowFeedbackModal(true)} className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-purple-500/30 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-purple-500 dark:hover:text-purple-300 uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm dark:shadow-none">
                <MessageSquare className="w-3.5 h-3.5" /> Feedback
              </button>
              <button onClick={onNext} className="btn-np-primary text-xs uppercase tracking-widest gap-2 flex items-center justify-center py-2.5 px-6 shadow-lg shadow-blue-500/10 hover:scale-[1.03] transition-transform duration-300">
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

          {/* ═══════════ HERO SECTION (3D FLOATING) ═══════════ */}
          <motion.div
            style={{ y: heroY, scale: heroScale }}
            className="grid lg:grid-cols-12 gap-10 items-center bg-white/50 dark:bg-slate-900/25 border border-slate-200 dark:border-slate-800/40 rounded-3xl p-10 backdrop-blur-xl shadow-2xl glow-pulse relative overflow-hidden"
          >
            {/* Decorative grid lines */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="hero-grid-line" style={{ left: `${15 + i * 15}%`, top: 0, bottom: 0, width: '1px' }} />
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7 space-y-6 relative z-10"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Trusted by 200+ CA Firms
              </div>

              {/* 3D FLOATING TITLE */}
              <div className="float-3d-hero">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  Enterprise-Grade<br />
                  <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent gradient-animate">
                    GST Compliance Automation
                  </span>
                </h2>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Built for Chartered Accountants, Tax Consultants, and finance professionals who demand accuracy, speed, and security. RECO WITH VASWANI runs 100% offline on your local network — your data never leaves your premises.
              </p>

              <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-500 dark:text-slate-400 pt-2">
                {[
                  { icon: <Laptop className="w-4 h-4 text-blue-400" />, text: '100% Offline' },
                  { icon: <Zap className="w-4 h-4 text-yellow-400" />, text: 'Sub-500ms Processing' },
                  { icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, text: 'VPN-Secured' },
                ].map((badge, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.12, duration: 0.5 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800/60 shadow-sm dark:shadow-none"
                  >
                    {badge.icon} {badge.text}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5 relative flex items-center justify-center p-8 hidden lg:flex"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.06] to-purple-500/[0.06] blur-3xl rounded-full orb-float" />
              <div className="relative float-3d-hero w-full max-w-[480px]" style={{ animationDelay: '-2s' }}>
                 <div className="relative w-full rounded-[2rem] border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.15)] flex flex-col">
                   
                   <div className="relative w-full aspect-video">
                     <div className="absolute inset-0 finance-grid-bg opacity-60 z-0 pointer-events-none"></div>
                     <video 
                       src="./finance-bg.mp4" 
                       className="absolute inset-0 w-full h-full object-cover opacity-70 mix-blend-screen"
                       autoPlay muted loop playsInline 
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent z-10 pointer-events-none"></div>
                     
                     <motion.div animate={{ y: [0, -8, 0], rotate: [0, 5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="absolute top-6 right-6 w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center z-20 backdrop-blur-md shadow-lg">
                       <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                     </motion.div>
                     <motion.div animate={{ y: [0, 6, 0], rotate: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }} className="absolute top-20 -left-4 w-10 h-10 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center z-20 backdrop-blur-md shadow-lg">
                       <ShieldCheck className="w-5 h-5 text-blue-400" />
                     </motion.div>
                   </div>

                   <div className="relative z-20 p-6 text-left w-full border-t border-slate-200 dark:border-slate-700/50 bg-slate-50/90 dark:bg-slate-900/60">
                     <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-mono text-blue-400 uppercase tracking-[0.3em] font-bold">Live Environment</p>
                       <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center animate-pulse"><Database className="w-3.5 h-3.5 text-blue-400" /></div>
                     </div>
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-2">Data streams<br/>synchronized</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">On-premise infrastructure securely processing 100,000+ rows instantly.</p>
                   </div>
                 </div>
              </div>
            </motion.div>
          </motion.div>

          {/* ═══════════ SECTION TITLE ═══════════ */}
          <ScrollReveal>
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                <Settings className="w-3.5 h-3.5" /> Complete Tool Suite
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">6 Powerful Modules, One Platform</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Each tool is engineered to solve a specific, high-pain compliance problem. Here's exactly what each one does, the problems it eliminates, and how it saves you hours every week.</p>
            </div>
          </ScrollReveal>

          {/* ═══════════ DETAILED 6 TOOLS (3D TILT + SCROLL REVEAL) ═══════════ */}
          <div className="space-y-14">
            {toolsData.map((tool, idx) => {
              const c = colorMap[tool.color];
              return (
                <ScrollReveal key={idx} delay={0.08}>
                  <TiltCard className="bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/50 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl">
                    {/* Tool Header */}
                    <div className={`p-8 bg-gradient-to-r ${tool.gradient} border-b border-slate-200 dark:border-slate-800/40`}>
                      <div className="flex items-start gap-5">
                        <Iso3DIcon color={tool.color} imageSrc={tool.image} />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[10px] font-black ${c.text} uppercase tracking-widest`}>{tool.num}</span>
                            <span className="w-8 h-px bg-slate-700"></span>
                          </div>
                          <h3 className="text-xl font-black text-slate-900 dark:text-white">{tool.title}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-3 max-w-3xl">{tool.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Tool Details — STAGGERED COLUMNS */}
                    <StaggeredColumns>
                      {/* Functions */}
                      <div className="p-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest">Key Functions</h4>
                        </div>
                        <ul className="space-y-2.5">
                          {tool.functions.map((f, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              <CheckCircle2 className={`w-3.5 h-3.5 ${c.text} flex-shrink-0 mt-0.5`} />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Problems */}
                      <div className="p-6 space-y-4 bg-rose-500/[0.02]">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest">Common Problems</h4>
                        </div>
                        <ul className="space-y-2.5">
                          {tool.problems.map((p, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500/60 flex-shrink-0 mt-1.5"></span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Solutions */}
                      <div className="p-6 space-y-4 bg-emerald-500/[0.02]">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest">How We Solve It</h4>
                        </div>
                        <ul className="space-y-2.5">
                          {tool.solutions.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </StaggeredColumns>
                  </TiltCard>
                </ScrollReveal>
              );
            })}
          </div>

          {/* ═══════════ FEEDBACK CTA ═══════════ */}
          <ScrollReveal>
            <div className="text-center bg-white dark:bg-transparent bg-gradient-to-r from-blue-500/5 via-purple-500/10 to-blue-500/5 border border-slate-200 dark:border-slate-800/50 rounded-3xl p-10 space-y-4 shadow-sm dark:shadow-none">
              <MessageSquare className="w-10 h-10 text-purple-400 mx-auto" />
              <h3 className="text-xl font-black text-slate-900 dark:text-white">We Value Your Opinion</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">Your feedback shapes the future of RECO WITH VASWANI. Tell us what you love and what we can improve.</p>
              <button onClick={() => setShowFeedbackModal(true)} className="mt-2 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-purple-500/20 hover:scale-[1.02] flex items-center gap-2 mx-auto">
                <Star className="w-4 h-4" /> Share Your Feedback
              </button>
            </div>
          </ScrollReveal>

          {/* ═══════════ FEEDBACK DISPLAY ═══════════ */}
          {feedbackList.length > 0 && (
            <ScrollReveal>
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">What Our Users Say</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Real feedback from professionals using RECO WITH VASWANI</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {feedbackList.slice(0, 9).map((fb, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08, duration: 0.5 }}
                      className="p-5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50 rounded-2xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700/60 transition-colors shadow-sm dark:shadow-none"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{fb.name}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{fb.date}</span>
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-3.5 h-3.5 ${fb.rating >= s ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200 dark:text-slate-700'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">"{fb.message}"</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* ═══════════ CTA + BOTTOM NEXT BUTTON ═══════════ */}
          <ScrollReveal>
            <div className="border-t border-slate-200 dark:border-slate-800/50 pt-10 flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-100/50 dark:bg-slate-900/20 p-8 rounded-3xl">
              <div className="text-center sm:text-left space-y-2">
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Ready to Transform Your Practice?</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md">Activate your license key and start processing compliance data in minutes. No cloud dependency. No learning curve.</p>
              </div>
              <button onClick={onNext} className="btn-np-primary h-12 text-xs uppercase tracking-widest gap-2 flex items-center justify-center py-3 px-8 shadow-lg shadow-blue-600/10 hover:scale-[1.02] transition-transform duration-300 flex-shrink-0">
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </ScrollReveal>

          {/* ═══════════ CONTACT FOOTER ═══════════ */}
          <ScrollReveal>
            <footer className="border-t border-slate-200 dark:border-slate-800/40 pt-10 pb-4 space-y-6">
              <div className="grid sm:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden">
                      <img src="./logo.png" alt="Logo" className="w-5 h-5 object-contain dark:invert-0 invert" />
                    </div>
                    <span className="text-sm font-black text-slate-900 dark:text-white">RECO WITH VASWANI</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">Professional GST compliance and automation suite for Chartered Accountants, Tax Consultants, and finance professionals across India.</p>
                </div>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Links</h5>
                  <ul className="space-y-2">
                    <li><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Back to Top</button></li>
                    <li><button onClick={() => setShowFeedbackModal(true)} className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Give Feedback</button></li>
                    <li><button onClick={onNext} className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Activate License</button></li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Us</h5>
                  <ul className="space-y-2.5">
                    <li className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-blue-400" /> +91 1234567890
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-purple-400" /> abc@gmail.com
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" /> India
                    </li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800/40 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[9px] font-mono text-slate-600 uppercase tracking-[0.2em]">© {new Date().getFullYear()} RECO WITH VASWANI. All rights reserved.</p>
                <div className="flex items-center gap-4 text-[9px] text-slate-600">
                  <span>Contact: +91 1234567890</span>
                  <span className="w-px h-3 bg-slate-800"></span>
                  <span>Email: abc@gmail.com</span>
                </div>
              </div>
            </footer>
          </ScrollReveal>

        </div>
      </div>
    </>
  );
}

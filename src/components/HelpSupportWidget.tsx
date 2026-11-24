import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  X,
  Search,
  ChevronDown,
  Phone,
  Mail,
  CheckCircle2,
  Server,
  Globe,
  ShieldAlert,
  FileSpreadsheet,
  Key,
  Sliders,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

interface HelpSupportWidgetProps {
  isPinned?: boolean;
  activeModule?: string;
}

interface ProblemSolution {
  id: string;
  category: 'Tally' | 'Portal' | 'Reco' | 'Excel' | 'License';
  icon: React.ComponentType<{ className?: string }>;
  problem: string;
  symptom: string;
  steps: string[];
  settingsTab?: 'tally' | 'gateway' | 'reco' | 'storage';
  settingsLabel?: string;
}

const PREDEFINED_PROBLEMS: ProblemSolution[] = [
  {
    id: 'tally-offline',
    category: 'Tally',
    icon: Server,
    problem: 'Tally Prime shows Offline / Cannot connect to Port 9000',
    symptom: 'Direct Tally import or voucher fetch fails with connection timeout.',
    steps: [
      'Open TallyPrime on your Windows machine and press F1 (Help) → Settings → Connectivity.',
      'Select Client/Server Configuration and set "TallyPrime acts as" to Both or Server.',
      'Confirm the Port is set strictly to 9000, save (Ctrl+A), and restart TallyPrime.',
      'Ensure your company is open inside TallyPrime, then click Test Tally Bridge in Settings.'
    ],
    settingsTab: 'tally',
    settingsLabel: 'Check Tally Bridge Settings'
  },
  {
    id: 'autopilot-fail',
    category: 'Portal',
    icon: Globe,
    problem: '12-Month GSTR-2B / GSTR-1 Autopilot stopped or failed on a month',
    symptom: 'Status shows "FAILED" or "Access Denied" mid-download.',
    steps: [
      'Do not worry — existing downloaded months and invoices are automatically preserved.',
      'If GST Portal shows "Access Denied", close the browser popup and avoid pressing Back in browser.',
      'Wait 30 seconds if GSTN JSON generation is busy, then re-run Autopilot with the same active FY.',
      'Enter CAPTCHA within 60 seconds when prompted so the portal session stays authenticated.'
    ]
  },
  {
    id: 'not-in-2b',
    category: 'Reco',
    icon: Sliders,
    problem: 'Valid vendor invoices showing "Not in 2B" or "Value Mismatch"',
    symptom: 'Supplier claims GSTR-1 was filed, yet invoice appears unmatched.',
    steps: [
      'Open Party-Wise Report to inspect all Books and Portal invoices for that vendor side-by-side.',
      'Check if FY prefixes (e.g. 24-25/INV-01 vs INV-01) or invoice dates slipped across months.',
      'Verify GSTIN accuracy — vendors with multi-state registrations sometimes upload under wrong state code.',
      'Adjust tolerance (₹2–₹10) in GST Reco Rules or click "Manual Match / Force Match" in Party-Wise Report.'
    ],
    settingsTab: 'reco',
    settingsLabel: 'Adjust Reco Tolerance'
  },
  {
    id: 'debit-notes',
    category: 'Reco',
    icon: Sliders,
    problem: 'Credit / Debit Notes (CDNR) not pairing cleanly with Books',
    symptom: 'Standalone PR debit notes and 2B credit notes appear separately.',
    steps: [
      'Select the dedicated "Debit Notes" category filter tab or "Has Debit Notes" in Party-Wise Report.',
      'Verify that taxable/tax columns are mapped cleanly during column mapping without negative double-inversion.',
      'Use "1-Click Auto Match Party" or select two unpaired rows to manually reconcile them.'
    ]
  },
  {
    id: 'excel-sort',
    category: 'Excel',
    icon: FileSpreadsheet,
    problem: 'Excel filtering, sorting, or XLOOKUP formulas show issues',
    symptom: 'Downloaded sheet cannot sort a single column or shows #NAME? errors.',
    steps: [
      'Always use the built-in Excel Export buttons inside the app (never copy-paste HTML tables directly).',
      'Built-in exports enforce Zero-Merge Architecture so every cell stays unmerged for sorting and PivotTables.',
      'For XLOOKUP formulas, ensure you open the workbook in Microsoft Excel 2021/365 or LibreOffice Calc 24+.'
    ]
  },
  {
    id: 'license-limit',
    category: 'License',
    icon: Key,
    problem: 'Serial Key says "License Limit Reached" or PC seat bound',
    symptom: 'Unable to activate Finpulse Consulting on a new office workstation.',
    steps: [
      'Each Serial Key is licensed for a specific number of active PC/browser seats.',
      'If you replaced a PC or cleared browser storage, open Admin Panel → Multi-PC License Management.',
      'Unbind unused devices or contact Finpulse Support directly below to expand your office seat limit.'
    ]
  },
  {
    id: 'smtp-fail',
    category: 'Excel',
    icon: Mail,
    problem: 'Vendor WhatsApp / Email Mismatch Notices fail to send',
    symptom: 'Clicking Send Email returns authentication error from Gmail SMTP.',
    steps: [
      'Google blocks regular Gmail passwords for automated apps.',
      'Enable 2-Step Verification on your Google Account and generate a 16-character App Password.',
      'Paste that 16-character App Password inside System Settings → SMTP & Gateway and run Test Connection.'
    ],
    settingsTab: 'gateway',
    settingsLabel: 'Configure SMTP Gateway'
  },
  {
    id: 'server-offline',
    category: 'License',
    icon: ShieldAlert,
    problem: 'Host Server Offline / Express Port 3001 Disconnected',
    symptom: 'App displays "Host Server Offline" banner or fails saving client data.',
    steps: [
      'If using Desktop App, check Windows System Tray (bottom-right) and ensure Finpulse Engine is running.',
      'If using LAN Server mode, verify the primary host PC is powered on and connected to the same Wi-Fi/LAN.',
      'Check Windows Defender Firewall to ensure TCP Port 3001 is permitted for local network access.'
    ],
    settingsTab: 'storage',
    settingsLabel: 'View Server & Storage Status'
  }
];

// Direct Finpulse Support contact channels
const SUPPORT_CONTACT = {
  email: 'sourav.vaswani01@gmail.com',
  phone: '+91 8989998663',
  telHref: 'tel:+918989998663',
  waDigits: '918989998663',
};

// Crisp WhatsApp icon SVG so it renders authentically without external assets
function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.188.109-1.922-.125-.453-.141-1.031-.328-1.766-.656-3.094-1.328-5.109-4.453-5.266-4.656-.156-.203-1.266-1.672-1.266-3.188 0-1.516.797-2.266 1.078-2.578.281-.313.609-.391.813-.391.203 0 .406 0 .594.016.188.016.438-.078.688.531.25.609.859 2.094.938 2.25.078.156.125.344.031.547-.094.203-.141.328-.297.5-.156.172-.313.391-.453.516-.156.141-.313.297-.141.594.172.297.766 1.266 1.656 2.047 1.141 1.016 2.094 1.328 2.391 1.484.297.156.469.125.641-.078.172-.203.75-.875.953-1.172.203-.297.406-.25.672-.141.266.109 1.703.797 2 .953.297.156.484.219.563.344.078.125.078.734-.172 1.438z" />
    </svg>
  );
}

export function HelpSupportWidget({ isPinned = false, activeModule = 'hub' }: HelpSupportWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<string | null>('tally-offline');
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(() => {
    try {
      return localStorage.getItem('np_help_compact') === 'true';
    } catch {
      return false;
    }
  });

  // Listen for global open/toggle events (e.g. from top header)
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('open-help-support', handleOpen);
    window.addEventListener('toggle-help-support', handleToggle);
    return () => {
      window.removeEventListener('open-help-support', handleOpen);
      window.removeEventListener('toggle-help-support', handleToggle);
    };
  }, []);

  const supportPhone = SUPPORT_CONTACT.phone;
  const supportEmail = SUPPORT_CONTACT.email;

  const categories = ['All', 'Tally', 'Portal', 'Reco', 'Excel', 'License'];

  const filteredProblems = PREDEFINED_PROBLEMS.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    if (!matchesCat) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.problem.toLowerCase().includes(q) ||
      item.symptom.toLowerCase().includes(q) ||
      item.steps.some((s) => s.toLowerCase().includes(q))
    );
  });

  const activeIssueTitle =
    PREDEFINED_PROBLEMS.find((p) => p.id === expandedId)?.problem || 'General Support Query';

  const handleCopy = (label: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedType(label);
    toast.success(`${label} copied: ${val}`);
    setTimeout(() => setCopiedType(null), 1800);
  };

  const handlePhoneClick = () => {
    window.location.href = SUPPORT_CONTACT.telHref;
  };

  const handleWhatsAppClick = () => {
    const text = encodeURIComponent(
      `Hi Finpulse Support Team,\nI need assistance in module "${activeModule}".\nIssue: ${activeIssueTitle}`
    );
    window.open(`https://wa.me/${SUPPORT_CONTACT.waDigits}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmailClick = () => {
    const subject = encodeURIComponent(`[Support] Finpulse Consulting — ${activeModule}`);
    const body = encodeURIComponent(
      `Hello Finpulse Support Team,\n\nI tried the troubleshooting steps for:\n"${activeIssueTitle}"\n\nPlease assist further.\nActive Module: ${activeModule}`
    );
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <>
      {/* 1. FLOATING BOTTOM-LEFT HELP BUTTON (Positioned higher at bottom-20 with compact toggle so toolbars behind are clear) */}
      <div
        data-floating-widget
        className={`fixed bottom-20 z-40 transition-all duration-300 ${
          isPinned ? 'left-[18.25rem]' : 'left-[5.75rem]'
        }`}
      >
        {isCompact ? (
          <div className="relative group/compact">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="w-11 h-11 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 hover:border-blue-500 shadow-md hover:shadow-lg flex items-center justify-center transition-all cursor-pointer"
              title="Help & Support (Click to open)"
              aria-label="Open Help and Support"
            >
              <HelpCircle className="w-5 h-5 text-blue-600" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCompact(false);
                try { localStorage.setItem('np_help_compact', 'false'); } catch {}
              }}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] opacity-0 group-hover/compact:opacity-100 transition-opacity shadow-xs cursor-pointer border border-slate-700"
              title="Expand label"
            >
              +
            </button>
          </div>
        ) : (
          <div className="relative group/pill flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 hover:border-blue-500 shadow-md hover:shadow-lg active:scale-95 transition-all duration-300 cursor-pointer group"
              title="Troubleshooting & Direct Support (Phone, WhatsApp, Email)"
              aria-label="Open Help and Support"
            >
              <div className="relative flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-blue-600 group-hover:rotate-12 transition-transform" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
              </div>
              <span className="text-xs font-bold tracking-tight text-slate-800">Help &amp; Support</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCompact(true);
                try { localStorage.setItem('np_help_compact', 'true'); } catch {}
              }}
              className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center text-[10px] transition-all opacity-0 group-hover/pill:opacity-100 shadow-xs cursor-pointer border border-slate-700"
              title="Minimize to small icon (so buttons behind are clear)"
            >
              —
            </button>
          </div>
        )}
      </div>

      {/* 2. PREDEFINED PROBLEMS, SOLUTIONS & DIRECT ESCALATION MODAL */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[88vh] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-scaleUp"
          >
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 via-white to-slate-50 border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Help &amp; Troubleshooting Hub
                  </h3>
                  <p className="text-xs text-slate-500">
                    Instant step-by-step solutions for common issues — or reach us directly below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close Help"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search & Category Filter Strip */}
            <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200/70 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search problems (e.g. Port 9000, Autopilot, Not in 2B, Excel, Serial Key)..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Problems & Solutions Accordion List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 bg-slate-50/30">
              {filteredProblems.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-700">No predefined issue matched "{searchQuery}"</p>
                  <p className="text-xs text-slate-500">
                    Use the direct Phone, WhatsApp, or Email support buttons below to reach us immediately.
                  </p>
                </div>
              ) : (
                filteredProblems.map((item) => {
                  const Icon = item.icon;
                  const isExpanded = expandedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isExpanded
                          ? 'bg-white border-blue-300 shadow-sm'
                          : 'bg-white/90 border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isExpanded ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs sm:text-sm font-bold text-slate-900 block truncate">
                              {item.problem}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {item.symptom}
                            </span>
                          </div>
                        </div>

                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-blue-600' : ''
                          }`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-slate-50/40">
                          <div className="space-y-2 pt-2">
                            {item.steps.map((step, idx) => (
                              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>

                          {item.settingsTab && (
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsOpen(false);
                                  window.dispatchEvent(
                                    new CustomEvent('open-settings', { detail: { tab: item.settingsTab } })
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{item.settingsLabel}</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Contact Escalation Bar (Phone, WhatsApp, Email with Icons) */}
            <div className="px-6 py-4 bg-slate-900 text-white border-t border-slate-800 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Still not satisfied or issue unresolved?</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Reach our team directly via Phone, WhatsApp, or Email for live assistance.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Phone Call Icon Button */}
                  <div className="inline-flex items-center rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={handlePhoneClick}
                      className="px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer"
                      title={supportPhone ? `Call ${supportPhone}` : 'Call Direct Support'}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{supportPhone ? supportPhone : 'Call'}</span>
                    </button>
                    {supportPhone && (
                      <button
                        type="button"
                        onClick={() => handleCopy('Phone', supportPhone)}
                        className="px-2 py-2 border-l border-blue-400/30 hover:bg-blue-700 text-blue-100 cursor-pointer"
                        title="Copy phone number"
                      >
                        {copiedType === 'Phone' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {/* WhatsApp Icon Button */}
                  <button
                    type="button"
                    onClick={handleWhatsAppClick}
                    className="px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title={supportPhone ? `WhatsApp ${supportPhone}` : 'Message on WhatsApp'}
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>

                  {/* Mail Icon Button */}
                  <div className="inline-flex items-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors overflow-hidden">
                    <button
                      type="button"
                      onClick={handleEmailClick}
                      className="px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer"
                      title={`Email ${supportEmail}`}
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('Email', supportEmail)}
                      className="px-2 py-2 border-l border-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
                      title={`Copy ${supportEmail}`}
                    >
                      {copiedType === 'Email' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


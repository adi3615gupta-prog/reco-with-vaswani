import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, BookOpen, Search, Download, ChevronRight, Users, Database, ShieldCheck, 
  FileCode2, Server, Send, ImageIcon, FileSpreadsheet, Info, Lightbulb, Zap, Sparkles 
} from 'lucide-react';
import { downloadUserGuide } from '../lib/userGuide';

interface UserGuideCenterProps {
  isOpen: boolean;
  onClose: () => void;
  initialModule?: string;
}

interface GuideContent {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  accentClass: string;
  glowClass: string;
  bgClass: string;
  tag: string;
  overview: string;
  inputs: string[];
  steps: string[];
  outputs: string[];
  tips: string[];
}

const guides: GuideContent[] = [
  {
    id: 'intro',
    title: 'Introduction & Architecture',
    icon: Sparkles,
    accentClass: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    glowClass: 'shadow-purple-500/10',
    bgClass: 'from-purple-500/10 to-indigo-500/5',
    tag: 'Platform Overview',
    overview: 'Welcome to RECO WITH VASWANI. This enterprise compliance suite is designed to process client registries, reconcile GST logs, convert Tally data, and generate financial reports. All operations are processed locally and securely on-premise.',
    inputs: [
      'Raw Tally Exports (XML & HTML format)',
      'GSTR-2B & GSTR-1 Excel/JSON sheets',
      'Supplemental Journals & Debit/Credit Notes',
      'Excel Trial Balance sheets'
    ],
    steps: [
      'Select a compliance module from the Hub dashboard.',
      'Check the inline guide at the top of each page for module-specific requirements.',
      'Drag and drop the appropriate registers and map the column headers.',
      'Run verification models, audit issues, and export formatted Excel sheets.'
    ],
    outputs: [
      'Perfectly formatted Schedule III Financial Statements',
      'Clean GSTR-1/3B JSON return drafts',
      'Reconciliation reports with variance metrics'
    ],
    tips: [
      'Ensure your computer is connected to the database server (Server Mode or active Client Mode).',
      'Back up database tables regularly to your configured Google Drive account.'
    ]
  },
  {
    id: 'dashboard',
    title: 'Practice Dashboard',
    icon: Users,
    accentClass: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    glowClass: 'shadow-amber-500/10',
    bgClass: 'from-amber-500/10 to-orange-500/5',
    tag: 'Control Suite',
    overview: 'Central management console to organize your clients list, keep track of critical filing due dates, compute automatic compliance grades, and execute database backups.',
    inputs: [
      'Client Details (GSTIN, trade name, email, phone number)',
      'Optionally upload Client Excel template for bulk importing records',
      'Configured SMTP gateway details for email alerts'
    ],
    steps: [
      'Navigate to the Clients tab to manually add clients or upload a spreadsheet.',
      'Use the Return Calendar Generator in the Tasks tab to map return periods and due dates.',
      'Track filing rates and overall practice health scores in the Analytics view.',
      'Click "Google Drive Backup" to secure SQLite tables in the cloud.'
    ],
    outputs: [
      'Active Client Master directory loaded in SQLite',
      'Color-coded GSTR due-date calendar',
      'Dispatched email reminder logs'
    ],
    tips: [
      'The software parses GSTINs to extract PAN automatically (characters 3-12).',
      'Configure a custom SMTP account in settings to ensure reliable email delivery to clients.'
    ]
  },
  {
    id: 'consolidation',
    title: 'Consolidate Ledgers',
    icon: Database,
    accentClass: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    glowClass: 'shadow-blue-500/10',
    bgClass: 'from-blue-500/10 to-cyan-500/5',
    tag: 'Organization',
    overview: 'Combine decentralized multi-branch sales or purchase ledgers into a single consolidated register.',
    inputs: [
      'Multiple branch Excel ledger files (sales/purchase registers)',
      'Company Header Info (Name, GSTIN, period)'
    ],
    steps: [
      'Enter organization details and continue to the upload zone.',
      'Upload two or more branch ledger files.',
      'Map columns for each file individually to verify header compatibility.',
      'Preview the merged table rows and click "Consolidate" to download the merged spreadsheet.'
    ],
    outputs: [
      'Consolidated multi-branch Excel spreadsheet',
      'Clean dataset containing Category references for each source branch'
    ],
    tips: [
      'You can save consolidated workspaces directly to the server to reload them later.',
      'Click "Send to Reco" after consolidating purchase registers to push the merged books data directly into the Reconciliation engine.'
    ]
  },
  {
    id: 'reco',
    title: 'GST Reconciliation',
    icon: ShieldCheck,
    accentClass: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    glowClass: 'shadow-emerald-500/10',
    bgClass: 'from-emerald-500/10 to-teal-500/5',
    tag: 'Audit Engine',
    overview: 'High-performance matching engine that compares internal Purchase/Sales registers with Government downloads (GSTR-2B or GSTR-1) to claim maximum ITC and discover discrepancies.',
    inputs: [
      'Books Register: Purchase Register (PR) or Sales Register (SR) file',
      'Portal Data: GSTR-2B file (for ITC) or GSTR-1/B2B files (for sales checks)',
      'Optional: PR/Portal Debit Note files, multiple Journal Excel books'
    ],
    steps: [
      'Choose the reconciliation mode: "Input Tax Credit" or "Output Tax Liability".',
      'Drag and drop files. Select appropriate roles (e.g. Primary Book, Supplemental Journal).',
      'Map column headers for all data streams. Save mappings as template defaults if desired.',
      'Adjust tolerance parameters and fuzzy string matching rules in advanced options.',
      'Execute match engine. Resolve suggested wrong-GSTIN items and download final reports.'
    ],
    outputs: [
      'Detailed Monthly Comparison Report (.xlsx) with Perfect Matches, Value Mismatches, and Not in 2B.',
      'Party-wise Audit Report (.xlsx) highlighting discrepancies per supplier.'
    ],
    tips: [
      'Always download GSTR-2B for the exact period matching your books register.',
      'Utilize "Fuzzy Match" strictness parameters when supplier invoice sequences differ slightly (e.g., slash prefix / leading zeros).'
    ]
  },
  {
    id: 'gstin-scan',
    title: 'GSTIN Scan & Audit',
    icon: Search,
    accentClass: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    glowClass: 'shadow-emerald-500/10',
    bgClass: 'from-emerald-500/10 to-cyan-500/5',
    tag: 'GSTIN Audit',
    overview: 'Audits supplier details to catch incorrect GSTINs, duplicate registrations under different names, and mismatch recommendations.',
    inputs: [
      'Latest Reconciliation results data (must run GST Reconciliation first)'
    ],
    steps: [
      'Run the GST Reconciliation engine on your files.',
      'Open GSTIN Scan to check duplicate GSTIN groups.',
      'Examine wrong-GSTIN suggestions where names matched but tax numbers differed.',
      'Correct the discrepancies in your ERP or Tally master list.'
    ],
    outputs: [
      'Detailed duplicate registration breakdowns',
      'Fuzzy-matched supplier suggestions'
    ],
    tips: [
      'Export the suggestions list to clean up accounting masters. Having clean masters speeds up future matches.'
    ]
  },
  {
    id: 'tally',
    title: 'Tally XML Converter',
    icon: FileCode2,
    accentClass: 'text-pink-400 border-pink-500/20 bg-pink-500/10',
    glowClass: 'shadow-pink-500/10',
    bgClass: 'from-pink-500/10 to-purple-500/5',
    tag: 'Extraction',
    overview: 'Converts raw Tally XML exports into styled Excel spreadsheets within 500ms using a unique dual HTML-XML mapping structure.',
    inputs: [
      'Tally XML export file',
      'Corresponding Tally HTML print export file (used to map dynamic columns)'
    ],
    steps: [
      'Select the register type (Purchase, Sales, or Journal).',
      'Drag and drop the XML file and the HTML structural print file.',
      'Name your export file and click "Generate Excel Report".',
      'The file downloads locally with color-coded, frozen header columns and grand totals.'
    ],
    outputs: [
      'Professional Excel Workbook (.xlsx) with auto-computed widths, custom headers, and styled rows'
    ],
    tips: [
      'To export from Tally: open the register, click Export (Alt+E), select XML, set encoding to UTF-16, and print/export the view as HTML to get the structure map.'
    ]
  },
  {
    id: 'tally-direct',
    title: 'Tally Direct Import',
    icon: Server,
    accentClass: 'text-teal-400 border-teal-500/20 bg-teal-500/10',
    glowClass: 'shadow-teal-500/10',
    bgClass: 'from-teal-500/10 to-emerald-500/5',
    tag: 'Live API',
    overview: 'Establishes a connection to your running TallyPrime application via XML API to fetch registers directly without manually exporting files.',
    inputs: [
      'Tally XML Port number (configured in TallyPrime)',
      'Active company selected in TallyPrime'
    ],
    steps: [
      'Ensure TallyPrime is open with the active company loaded.',
      'Enter the Port (default is 9000) and click "Fetch Active Company".',
      'Select the ledger, date ranges, and registers to import.',
      'Click "Import directly to Reconciliation" to push registers into the audit engine.'
    ],
    outputs: [
      'Fetched Purchase, Sales, Debit Note, and Journal datasets loaded into memory'
    ],
    tips: [
      'Make sure "Enable ODBC/XML server" is turned on in TallyPrime configuration (F12 → Advanced Configuration).'
    ]
  },
  {
    id: 'tracker',
    title: 'GSTR-2B & 3B Compliance Tracker',
    icon: FileSpreadsheet,
    accentClass: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    glowClass: 'shadow-yellow-500/10',
    bgClass: 'from-yellow-500/10 to-amber-500/5',
    tag: 'ITC Suite',
    overview: 'Track dynamic ITC flows, eligible credits, monthly tax liabilities, and compare year-to-date filing returns (April to March).',
    inputs: [
      'GSTR-2B portal Excel books (monthly)',
      'GSTR-3B filed files'
    ],
    steps: [
      'Choose the Financial Year (FY) in the header dropdown.',
      'Upload the monthly GSTR-2B / GSTR-3B records.',
      'Review monthly breakdowns showing claimed vs eligible ITC values.',
      'Export the compliance overview sheet.'
    ],
    outputs: [
      'Filing compliance summaries per month',
      'YTD ITC comparison reports'
    ],
    tips: [
      'Check the GSTR-3B summary values against monthly calculations to ensure no excess ITC is claimed.'
    ]
  },
  {
    id: 'returns',
    title: 'Returns Preparation',
    icon: Send,
    accentClass: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    glowClass: 'shadow-purple-500/10',
    bgClass: 'from-purple-500/10 to-indigo-500/5',
    tag: 'Taxation Suite',
    overview: 'Audit compliance registers offline and generate formatted JSON drafts ready for upload to the GST Common Portal.',
    inputs: [
      'Validated Sales Register (SR) / Purchase records',
      'Required portal fields mapping template'
    ],
    steps: [
      'Load your sales transactions into the module.',
      'Run automatic offline validations to capture structure errors (missing GSTIN, wrong tax rates).',
      'Review discrepancies on the diagnostic screen.',
      'Click "Export JSON Draft" to download portal-ready returns.'
    ],
    outputs: [
      'GSTR-1 GST Portal JSON upload packages',
      'Diagnostic validation logs'
    ],
    tips: [
      'Validate missing GSTIN errors first. Uploading JSONs with structure errors will result in portal errors.'
    ]
  },
  {
    id: 'ocr',
    title: 'AI Deep-Vision OCR',
    icon: ImageIcon,
    accentClass: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    glowClass: 'shadow-yellow-500/10',
    bgClass: 'from-yellow-500/10 to-orange-500/5',
    tag: 'Intelligence',
    overview: 'Extract tables and invoice lines directly from screenshots or scans into clean Excel tables.',
    inputs: [
      'Image files (PNG, JPEG) or scan PDFs of supplier invoices'
    ],
    steps: [
      'Drop your invoice screenshot or scan in the upload panel.',
      'Wait for the OCR engine to detect columns and values (CGST, SGST, IGST, invoice number).',
      'Examine parsed items in the editable table view.',
      'Verify results and click "Download formatted Excel" to export.'
    ],
    outputs: [
      'Structured Excel sheets containing clean invoice entries'
    ],
    tips: [
      'For best results, upload clear, high-resolution scans or cropped screenshots of invoice table grids.'
    ]
  },
  {
    id: 'fin-statements',
    title: 'Financial Statements',
    icon: FileSpreadsheet,
    accentClass: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    glowClass: 'shadow-blue-500/10',
    bgClass: 'from-blue-500/10 to-cyan-500/5',
    tag: 'Schedule III',
    overview: 'Automates the generation of Company Balance Sheets, Profit & Loss Statements, Cash Flow, and Notes to Accounts compliant with Schedule III of the Companies Act, 2013.',
    inputs: [
      'Standard Trial Balance register (Excel format)'
    ],
    steps: [
      'Upload your Trial Balance document.',
      'Map Trial Balance accounts to standard Schedule III tax categories.',
      'Examine automatic adjustments and grouped totals.',
      'Download the final audited Excel package.'
    ],
    outputs: [
      'Schedule III compliant Excel Financial Statement packages'
    ],
    tips: [
      'Map account codes correctly. Mapping balances to wrong groups will cause Trial Balance mismatch.'
    ]
  }
];

export default function UserGuideCenter({ isOpen, onClose, initialModule }: UserGuideCenterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    if (initialModule) {
      const match = guides.find(g => g.id === initialModule);
      if (match) return initialModule;
    }
    return 'intro';
  });

  const filteredGuides = guides.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.overview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeGuide = guides.find(g => g.id === activeTab) || guides[0];
  const GuideIcon = activeGuide.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6 md:p-10 select-text">
          {/* Backdrop blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
            className="relative z-10 w-full max-w-6xl h-[85vh] bg-[#0c1220] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

            {/* Sidebar Column */}
            <div className="w-full md:w-80 border-r border-slate-800/80 bg-slate-950/40 flex flex-col shrink-0">
              <div className="p-5 border-b border-slate-800/80">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-sm tracking-tight">Help & Documentation</h3>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Vaswani Return Deck</p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search user guides..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Guide items list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                {filteredGuides.map((g) => {
                  const Icon = g.icon;
                  const isActive = activeTab === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setActiveTab(g.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 text-left border ${
                        isActive 
                          ? 'bg-slate-900/80 border-slate-700/60 shadow-lg text-white font-bold' 
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isActive ? g.accentClass : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs truncate">{g.title}</p>
                          <p className="text-[8px] uppercase tracking-wider text-slate-500 mt-0.5">{g.tag}</p>
                        </div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'translate-x-0.5 text-indigo-400' : 'text-slate-600'}`} />
                    </button>
                  );
                })}
                {filteredGuides.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-8">No results found.</p>
                )}
              </div>

              {/* Sticky bottom pdf export */}
              <div className="p-4 border-t border-slate-800/80 bg-slate-950/30 text-center">
                <button
                  onClick={downloadUserGuide}
                  className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" /> Download User Guide PDF
                </button>
              </div>
            </div>

            {/* Guide Content Column */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#090d16]/30">
              {/* Top bar header */}
              <div className="h-16 px-6 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">User Manual</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-xs font-bold text-indigo-400">{activeGuide.title}</span>
                </div>
                <button 
                  onClick={onClose} 
                  className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Guide Contents */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                
                {/* Header card banner */}
                <div className={`p-6 rounded-2xl border bg-gradient-to-br ${activeGuide.bgClass} border-slate-800 relative overflow-hidden shadow-2xl`}>
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-slate-500/5 rounded-full blur-2xl"></div>
                  <div className="flex gap-4 items-start relative z-10">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${activeGuide.accentClass} ${activeGuide.glowClass} shadow-lg`}>
                      <GuideIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{activeGuide.tag}</span>
                      <h2 className="text-xl font-extrabold text-white mt-1">{activeGuide.title}</h2>
                      <p className="text-xs text-slate-400 mt-3 leading-relaxed">{activeGuide.overview}</p>
                    </div>
                  </div>
                </div>

                {/* Main grids: Steps & details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Steps */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Operating Steps</h4>
                    <div className="space-y-2.5">
                      {activeGuide.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-3 bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl">
                          <span className="text-xs font-black text-slate-500 font-mono shrink-0 w-5 h-5 bg-slate-950 rounded-full flex items-center justify-center">{idx + 1}</span>
                          <p className="text-xs text-slate-300 leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Inputs & Outputs */}
                  <div className="space-y-6">
                    {/* Required inputs */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2"><Info className="w-4 h-4 text-blue-400" /> Required Inputs</h4>
                      <ul className="space-y-1.5 pl-2">
                        {activeGuide.inputs.map((input, idx) => (
                          <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                            <span>{input}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Outputs */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Result Outputs</h4>
                      <ul className="space-y-1.5 pl-2">
                        {activeGuide.outputs.map((out, idx) => (
                          <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                            <span>{out}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Bottom: Pro Tips */}
                <div className="bg-indigo-950/20 border border-indigo-500/20 p-5 rounded-2xl">
                  <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-400 fill-yellow-400/20" /> Troubleshooting & Pro Tips</h4>
                  <ul className="mt-3 space-y-2">
                    {activeGuide.tips.map((tip, idx) => (
                      <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                        <span className="text-yellow-400 font-bold shrink-0 mt-0.5">•</span>
                        <span className="leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

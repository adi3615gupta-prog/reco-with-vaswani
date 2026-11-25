export type SuiteVisualType =
  | 'reco'
  | 'tally'
  | 'returns'
  | 'audit'
  | 'tax'
  | 'monthlyAudit'
  | 'tallyXml'
  | 'noticesAi';

export interface PresentationSuite {
  id: string;
  suiteCode: string;
  title: string;
  tagline: string;
  bestFor: string;
  accent: string;
  visualType: SuiteVisualType;
  steps: { label: string; text: string }[];
  subModules: string[];
  realExample: string;
}

export interface WipUpdateItem {
  id: string;
  title: string;
  stage: 'Active WIP' | 'Usable Beta';
  progress: number;
  summary: string;
  nextUpdate: string;
}

export const HERO_FIGURES = [
  { value: '8 Suites', label: 'Complete Practice & Tax Tools' },
  { value: '1-Login 12M', label: 'Full-Year GSTR-2B & 1 Download' },
  { value: '±₹2 Match', label: '8-Pass Smart Invoice Matching' },
  { value: '100% Local', label: 'Runs on Your Office PC / LAN' },
];

export const CORE_SUITES: PresentationSuite[] = [
  {
    id: 'suite-01',
    suiteCode: 'Suite 01',
    title: 'GST & TDS Reconciliation Engine',
    tagline: 'Match purchase books with GSTR-2B and Form 26Q in seconds — no manual VLOOKUP needed.',
    bestFor: 'GST Teams & Audit Staff',
    accent: 'emerald',
    visualType: 'reco',
    steps: [
      { label: '1. Input', text: 'Upload Tally Purchase Register + GSTR-2B (or Form 26Q TDS).' },
      { label: '2. Software Does', text: 'Auto-cleans invoice numbers, checks ±₹2 rounding & vendor PAN.' },
      { label: '3. You Get', text: 'Clean Zero-Merge Excel + 1-click WhatsApp/Email vendor notice.' },
    ],
    subModules: [
      'GST Data Consolidator (Multi-Branch)',
      'GST Reco Engine (PR vs GSTR-2B)',
      'Party Dispute Center (WhatsApp / Email)',
      'TRACES Form 26Q TDS Reconciliation',
    ],
    realExample:
      'Match 5,000 purchase bills against 12 months of GSTR-2B, instantly see missing vendor bills, and send a party-wise reminder on WhatsApp.',
  },
  {
    id: 'suite-02',
    suiteCode: 'Suite 02',
    title: 'Tally Connectors & XML Bridge',
    tagline: 'Connect live to TallyPrime on Port 9000 or convert raw Tally XML into clean Excel.',
    bestFor: 'Accountants & Tally Users',
    accent: 'rose',
    visualType: 'tally',
    steps: [
      { label: '1. Input', text: 'Keep TallyPrime open on PC (or drop exported Tally XML file).' },
      { label: '2. Software Does', text: 'Detects active company & pulls Daybook, Ledgers & Trial Balance.' },
      { label: '3. You Get', text: 'Structured Excel sheets or direct data inside Reco & Audit.' },
    ],
    subModules: [
      'Direct Port 9000 Live Tally Link',
      'Daybook & Trial Balance XML Parser',
      'Active Company Auto-Detector',
      'Tally Ledger Voucher Importer',
    ],
    realExample:
      'Skip manual Excel exports from Tally — pull all party vouchers and trial balance directly into the software in one click.',
  },
  {
    id: 'suite-03',
    suiteCode: 'Suite 03',
    title: 'Returns Prep & 12M Autopilot',
    tagline: 'Single-login 12-month GSTR-2B/GSTR-1 downloader, IMS actions & GSTR-3B working sheet.',
    bestFor: 'Monthly GST Filing Teams',
    accent: 'indigo',
    visualType: 'returns',
    steps: [
      { label: '1. Input', text: 'Log in once on GST Portal inside the built-in browser.' },
      { label: '2. Software Does', text: 'Downloads Apr–Mar returns automatically & computes Rule 88A set-off.' },
      { label: '3. You Get', text: '12-Month Comparison Matrix, GSTR-3B PDF/Excel & IMS actions.' },
    ],
    subModules: [
      'GSTR-3B Working Sheet & Rule 88A',
      '12-Month FY Matrix (2B vs 3B vs Books)',
      'GST IMS Recipient Action Manager',
      '1-Login 12M GSTR-2B & GSTR-1 Autopilot',
      'Returns Compliance Tracker',
    ],
    realExample:
      'Enter GST CAPTCHA just once — the software downloads all 12 months of GSTR-2B/1 data and prepares your 3B tax liability sheet.',
  },
  {
    id: 'suite-04',
    suiteCode: 'Suite 04',
    title: 'Statutory & Tax Audit Suite',
    tagline: 'Automate Clause 44 GST expense split, Dual Depreciation & SA 530 audit sampling.',
    bestFor: 'Tax Audit & Statutory Teams',
    accent: 'blue',
    visualType: 'audit',
    steps: [
      { label: '1. Input', text: 'Load Tally Daybook / Fixed Assets register for the financial year.' },
      { label: '2. Software Does', text: 'Splits GST vs Non-GST spend and calculates Co. Act + IT Act depreciation.' },
      { label: '3. You Get', text: 'Form 3CD Clause 44 table, Dual FA schedule & SA 530 sample list.' },
    ],
    subModules: [
      'SA 530 Monetary Unit Sampling',
      'Form 3CD Clause 44 Expense Parser',
      'Dual Depreciation & Deferred Tax (Sch II vs Sec 32)',
    ],
    realExample:
      'Generate complete Form 3CD Clause 44 bifurcation (Registered vs Unregistered vs Composition vendors) in minutes instead of days.',
  },
  {
    id: 'suite-05',
    suiteCode: 'Suite 05',
    title: 'Income Tax & Regime Optimizer',
    tagline: 'Instant Old vs New Regime (Sec 115BAC) tax comparison with 87A & surcharge relief.',
    bestFor: 'Direct Tax & Client Advisory',
    accent: 'violet',
    visualType: 'tax',
    steps: [
      { label: '1. Input', text: 'Enter client income heads and deductions (80C, 80D, HRA, etc.).' },
      { label: '2. Software Does', text: 'Calculates tax under both Old & New regimes with marginal relief.' },
      { label: '3. You Get', text: 'Clear side-by-side comparison showing exact tax savings.' },
    ],
    subModules: [
      'Section 115BAC Regime Optimizer',
      '25% Surcharge Cap & 87A Rebate Engine',
      'Printable Tax Computation Summary',
    ],
    realExample:
      'Show clients live during meetings exactly how much tax they save under Old vs New regime without manual slab formulas.',
  },
  {
    id: 'suite-06',
    suiteCode: 'Suite 06',
    title: 'Monthly Audit Working Paper',
    tagline: 'Standardized monthly audit checklists with Junior-to-Senior Maker-Checker sign-off.',
    bestFor: 'CA Partners & Audit Managers',
    accent: 'sky',
    visualType: 'monthlyAudit',
    steps: [
      { label: '1. Input', text: 'Junior selects client & month and fills 5 sections & 8 checklists.' },
      { label: '2. Software Does', text: 'Tracks observations & carries forward pending points to next month.' },
      { label: '3. You Get', text: 'Senior-approved audit working paper pack in PDF & Clean Excel.' },
    ],
    subModules: [
      '5 Audit Sections & 8 Standard Checklists',
      'Junior Maker -> Senior Checker Review Flow',
      'Auto Carry-Forward Pending Points Tracker',
    ],
    realExample:
      'Every article assistant follows the exact same firm audit checklist, and seniors review & lock monthly files cleanly.',
  },
  {
    id: 'suite-07',
    suiteCode: 'Suite 07',
    title: 'Tally Entries Maker',
    tagline: 'Paste hundreds of entries from Excel, verify Dr = Cr balance, and push directly to Tally.',
    bestFor: 'Bulk Accounting & Bookkeeping',
    accent: 'amber',
    visualType: 'tallyXml',
    steps: [
      { label: '1. Input', text: 'Copy-paste rows from Excel (Receipts, Payments, Journals or Ledgers).' },
      { label: '2. Software Does', text: 'Validates Dr = Cr zero difference & detects missing ledger masters.' },
      { label: '3. You Get', text: '1-Click Direct Push to TallyPrime or offline Tally XML file.' },
    ],
    subModules: [
      'Dual, Multi-Ledger & Quick Columnar Grids',
      'Real-Time Debit/Credit Zero-Diff Check',
      'Ledger Masters Auto-Creator & Direct Push',
    ],
    realExample:
      'Import an entire month of bank statements or sales sheets into Tally in 60 seconds with zero voucher mismatch errors.',
  },
  {
    id: 'notices-ai',
    suiteCode: 'Notices & AI',
    title: 'GST Notices Hub & Sourav AI Guide',
    tagline: 'Download GST portal notices, draft legal replies faster, and ask Sourav AI anytime.',
    bestFor: 'Litigation, Notices & Quick Help',
    accent: 'teal',
    visualType: 'noticesAi',
    steps: [
      { label: '1. Input', text: 'Fetch GST notices from portal or upload notice PDF.' },
      { label: '2. Software Does', text: 'Extracts notice summary, due date & assists with legal reply draft.' },
      { label: '3. You Get', text: 'Notice tracker + editable ASMT-10 / DRC-01 reply document.' },
    ],
    subModules: [
      'GST Notices Portal Downloader & Tracker',
      'ASMT-10 / DRC-01 Reply Drafter',
      'Sourav AI In-App Assistant & Desktop Copilot',
    ],
    realExample:
      'Track pending ASMT-10 / DRC-01 notice deadlines across all clients and prepare first-draft replies in minutes.',
  },
];

export const WIP_MODULES: WipUpdateItem[] = [
  {
    id: 'wip-dashboard',
    title: 'Practice Dashboard & Client Master',
    stage: 'Active WIP',
    progress: 80,
    summary: 'Central client directory with GST credentials vault and multi-PC office LAN sync.',
    nextUpdate: 'Scheduled background sync & quicker bulk client import.',
  },
  {
    id: 'wip-trackers',
    title: '12M Filing & 2B/3B Trackers',
    stage: 'Active WIP',
    progress: 75,
    summary: 'Client-wise 12-month filing status matrix with late-fee alerts and working-sheet jump.',
    nextUpdate: 'One-click automated overdue status alerts across all clients.',
  },
  {
    id: 'wip-scanner',
    title: 'GSTIN Smart Scanner',
    stage: 'Active WIP',
    progress: 70,
    summary: 'Detects duplicate vendor entries, PAN mismatches, and invalid/wrong state GSTINs.',
    nextUpdate: 'Deeper vendor compliance checks and automated fix suggestions.',
  },
  {
    id: 'wip-schedule3',
    title: 'Schedule III Financial Statements',
    stage: 'Usable Beta',
    progress: 85,
    summary: 'Corporate & Non-Corporate Balance Sheet, P&L and Cash Flow mapping from Trial Balance.',
    nextUpdate: 'Additional ICAI disclosure notes & auto comparative FY columns.',
  },
  {
    id: 'wip-cma',
    title: 'Bank CMA Credit & MPBF Ratios',
    stage: 'Usable Beta',
    progress: 80,
    summary: 'Converts Tally TB into Bank CMA formats with 10 key financial ratios & Tandon Method II.',
    nextUpdate: 'More bank-specific CMA Excel templates & projection presets.',
  },
  {
    id: 'wip-reclass',
    title: 'Tally Voucher Re-classifier',
    stage: 'Active WIP',
    progress: 72,
    summary: 'Batch move Tally voucher entries from wrong ledgers to correct heads cleanly.',
    nextUpdate: 'Saved smart rules for recurring monthly ledger cleanups.',
  },
];

export const UPCOMING_ROADMAP = [
  {
    stage: 'Available Today (WIP)',
    title: 'Core Practice Hub & Bank CMA',
    detail: 'All Suite 08 modules are open for live use inside the Practice & WIP Hub.',
  },
  {
    stage: 'Next Update',
    title: 'Auto-Sync & Bulk Filing Alerts',
    detail: 'Faster multi-client portal checks and automatic reminder queues.',
  },
  {
    stage: 'Future Release',
    title: 'GSTR-9 / 9C Annual Helper & More Formats',
    detail: 'Annual reconciliation packs, expanded bank CMA templates & deeper AI review.',
  },
];

export interface AudienceRoleHighlight {
  id: 'partner' | 'staff' | 'business';
  label: string;
  headline: string;
  points: string[];
}

export const AUDIENCE_ROLES: AudienceRoleHighlight[] = [
  {
    id: 'partner',
    label: 'CA Partners',
    headline: 'Standardized quality, maker-checker sign-offs, and multi-PC LAN control.',
    points: [
      'Review Junior-prepared Monthly Audit files before final lock',
      'Track client filing gaps, notices & due dates in one practice view',
      'Zero external cloud exposure — data stays in your office server',
    ],
  },
  {
    id: 'staff',
    label: 'Audit & GST Staff',
    headline: 'Skip repetitive VLOOKUPs, 12 portal logins, and manual Tally punching.',
    points: [
      'Download full 12 months GSTR-2B & GSTR-1 in a single login',
      'Generate Clause 44, Dual Depreciation & Zero-Merge Excel in seconds',
      'Bulk paste Excel sheets into Tally XML with instant Dr = Cr check',
    ],
  },
  {
    id: 'business',
    label: 'Business Owners',
    headline: 'Protect ITC, avoid vendor defaults, and compare Income Tax savings clearly.',
    points: [
      'Spot vendors missing GSTR-1 filings & send WhatsApp follow-ups fast',
      'Compare Old vs New Tax Regime side-by-side before year-end',
      'Ready-to-share Bank CMA & Financial Statements in one workspace',
    ],
  },
];

export interface PainFixPair {
  topic: string;
  pain: string;
  fix: string;
}

export const PAIN_TO_FIX_PAIRS: PainFixPair[] = [
  {
    topic: 'GSTR-2B vs Purchase Reco',
    pain: 'Manual VLOOKUP breaks on prefixes, leading zeros & Debit Notes',
    fix: '8-Pass Smart Reco Engine (±₹2) + Strict Zero-Merge Excel',
  },
  {
    topic: 'GSTR-3B & Rule 88A Working',
    pain: 'Manual Excel sheet causes ITC, RCM & Rule 88A set-off mistakes',
    fix: 'Automated GSTR-3B Working + 12-Month FY Comparison Matrix',
  },
  {
    topic: 'Tally Entry & Exports',
    pain: 'Repetitive voucher punching & slow manual Tally exports',
    fix: 'Direct Port 9000 Live Sync + Excel-to-Tally XML Push',
  },
  {
    topic: 'Client Data Security',
    pain: 'Risk of uploading confidential client books to external clouds',
    fix: '100% Air-Gapped Local Processing on Office PC & LAN',
  },
  {
    topic: 'Audit Working Papers',
    pain: 'Unorganized staff files with no structured review trail',
    fix: 'Standardized Monthly Audit Checklists + Maker-Checker Lock',
  },
];


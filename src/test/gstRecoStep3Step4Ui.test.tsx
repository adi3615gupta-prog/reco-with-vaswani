import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GSTVerification } from '@/components/GSTVerification';
import { SummaryCards } from '@/components/SummaryCards';
import { OutputDashboard } from '@/components/OutputDashboard';
import { PartyWiseReport } from '@/components/PartyWiseReport';
import Reconciliation from '@/pages/Reconciliation';
import { getSummary, type GstinIssue, type ReconciliationResult } from '@/lib/reconciliation';

// Polyfill ResizeObserver for Recharts ResponsiveContainer & @tanstack/react-virtual in JSDOM
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock as any;
}

vi.mock('@/lib/idbStorage', () => ({
  idbSet: vi.fn().mockResolvedValue(undefined),
  idbGet: vi.fn().mockResolvedValue(null),
  idbRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/gdrive', () => ({
  uploadRecoSnapshotToDrive: vi.fn(),
  checkGDriveStatus: vi.fn().mockResolvedValue({ configured: false }),
  saveLocalRecoSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api', () => ({
  safeApiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, runs: [] }) }),
  getSessionUserFromToken: vi.fn().mockReturnValue(null),
}));

const SAMPLE_RESULTS: ReconciliationResult[] = [
  {
    status: 'Perfect Match',
    gstDiff: 0,
    taxableDiff: 0,
    prRecord: {
      supplierName: 'Alpha Traders Pvt Ltd',
      gstin: '27AAACA1111A1Z5',
      invoiceNo: 'INV-001',
      invoiceDate: '12-04-2026',
      taxableValue: 100000,
      igst: 18000,
      cgst: 0,
      sgst: 0,
      source: 'PR',
    },
    twoBRecord: {
      supplierName: 'ALPHA TRADERS PRIVATE LIMITED',
      gstin: '27AAACA1111A1Z5',
      invoiceNo: 'INV-001',
      invoiceDate: '12-04-2026',
      taxableValue: 100000,
      igst: 18000,
      cgst: 0,
      sgst: 0,
      source: '2B',
    },
  },
  {
    status: 'Value Mismatch',
    gstDiff: 1200,
    cgstDiff: 600,
    sgstDiff: 600,
    igstDiff: 0,
    taxableDiff: 0,
    prRecord: {
      supplierName: 'Beta Logistics LLP',
      gstin: '24AABCB2222B1Z2',
      invoiceNo: 'INV-002',
      invoiceDate: '18-05-2026',
      taxableValue: 50000,
      igst: 0,
      cgst: 4500,
      sgst: 4500,
      source: 'PR',
    },
    twoBRecord: {
      supplierName: 'BETA LOGISTICS LLP',
      gstin: '24AABCB2222B1Z2',
      invoiceNo: 'INV-002',
      invoiceDate: '18-05-2026',
      taxableValue: 50000,
      igst: 0,
      cgst: 3900,
      sgst: 3900,
      source: '2B',
    },
  },
  {
    status: 'Not in 2B',
    gstDiff: 9000,
    taxableDiff: 50000,
    prRecord: {
      supplierName: 'Gamma Supplies',
      gstin: '27AACCG3333C1Z8',
      invoiceNo: 'INV-003',
      invoiceDate: '25-05-2026',
      taxableValue: 50000,
      igst: 9000,
      cgst: 0,
      sgst: 0,
      source: 'PR',
    },
  },
];

const SAMPLE_SUMMARY = getSummary(SAMPLE_RESULTS);

const SAMPLE_ISSUES: { suggested: GstinIssue[]; conflicts: GstinIssue[] } = {
  suggested: [
    {
      id: 'issue-1',
      supplierName: 'Delta Hardware',
      source: 'PR',
      originalGstin: '',
      currentGstin: '',
      suggestedGstin: '27AABCD4444D1Z9',
      suggestedName: 'DELTA HARDWARE INDIA PVT LTD',
      issueType: 'Missing GSTIN',
    },
    {
      id: 'issue-2',
      supplierName: 'Epsilon Steel',
      source: 'PR',
      originalGstin: '24AABCE5555E1Z1',
      currentGstin: '24AABCE5555E1Z1',
      suggestedGstin: '27AABCE5555E1Z5',
      suggestedName: 'EPSILON STEEL MUMBAI',
      issueType: 'Wrong GSTIN',
    },
  ],
  conflicts: [
    {
      id: 'conflict-1',
      supplierName: 'Omega Corp | Omega India',
      source: 'PR',
      originalGstin: '27AABCO6666O1Z3',
      currentGstin: '27AABCO6666O1Z3',
      issueType: 'Duplicate GSTIN',
      relatedParties: ['Omega Corp', 'Omega India'],
    },
  ],
};

describe('Step 3: GSTVerification UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts user to run match engine when no results exist yet', () => {
    const onBack = vi.fn();
    render(
      <GSTVerification
        issues={{ suggested: [], conflicts: [] }}
        hasResults={false}
        onProceed={vi.fn()}
        onBack={onBack}
      />
    );

    expect(screen.getByText(/Run Match Engine First to Verify GSTINs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Go to Step 2: Pipeline/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders clean 3-pillar verification summary and applied log when 0 issues exist', () => {
    const onProceed = vi.fn();
    render(
      <GSTVerification
        issues={{ suggested: [], conflicts: [] }}
        hasResults={true}
        totalRecords={125}
        uniqueGstinsCount={18}
        appliedGstins={[
          { partyName: 'Delta Hardware', originalGstin: 'Missing', appliedGstin: '27AABCD4444D1Z9', status: 'Missing GSTIN' },
        ]}
        onProceed={onProceed}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/All Party GSTINs & State Mappings Verified/i)).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('Delta Hardware')).toBeInTheDocument();
    expect(screen.getByText('27AABCD4444D1Z9')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Dashboard/i }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('filters GSTIN issues, highlights same-PAN branch mismatch, and applies suggestions', () => {
    const onApply = vi.fn();
    const onApplyAll = vi.fn();
    render(
      <GSTVerification
        issues={SAMPLE_ISSUES}
        hasResults={true}
        onApply={onApply}
        onApplyAll={onApplyAll}
        onProceed={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('Delta Hardware')).toBeInTheDocument();
    expect(screen.getByText('Epsilon Steel')).toBeInTheDocument();
    expect(screen.getByText(/Same PAN · State 24 → 27/i)).toBeInTheDocument();
    expect(screen.getByText('Omega Corp')).toBeInTheDocument();

    // Filter to Wrong / Branch GSTIN only
    fireEvent.click(screen.getByRole('button', { name: /Wrong \/ Branch GSTIN/i }));
    expect(screen.queryByText('Delta Hardware')).not.toBeInTheDocument();
    expect(screen.getByText('Epsilon Steel')).toBeInTheDocument();

    // Apply all from All Issues
    fireEvent.click(screen.getByRole('button', { name: /All Issues/i }));
    fireEvent.click(screen.getByRole('button', { name: /Apply All Suggestions/i }));
    expect(onApplyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        'Delta Hardware': '27AABCD4444D1Z9',
        'Epsilon Steel': '27AABCE5555E1Z5',
      })
    );
  });
});

describe('Step 4: SummaryCards, Reconciliation Dashboard & OutputDashboard UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays financial ITC totals and routes KPI card click to filter callback', () => {
    const onFilterSelect = vi.fn();
    render(<SummaryCards summary={SAMPLE_SUMMARY} results={SAMPLE_RESULTS} onFilterSelect={onFilterSelect} />);

    expect(screen.getByText(/Books Total ITC/i)).toBeInTheDocument();
    expect(screen.getByText(/Portal Available ITC/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹36,000').length).toBeGreaterThan(0); // 18000 + 9000 + 9000
    expect(screen.getByText('₹25,800')).toBeInTheDocument(); // 18000 + 7800

    fireEvent.click(screen.getAllByRole('button', { name: /Value Mismatch/i })[0]);
    expect(onFilterSelect).toHaveBeenCalledWith('valueMismatch');
  });

  it('switches cleanly across Step 4 Dashboard workspace tabs and jumps from KPI card to filtered ledger', () => {
    render(
      <Reconciliation
        setAppRoute={vi.fn()}
        mode="input"
        setMode={vi.fn()}
        step="results"
        setStep={vi.fn()}
        companyName="Vaswani Trading Co"
        tolerance={2}
        fuzzyStrictness="medium"
        results={SAMPLE_RESULTS}
        setResults={vi.fn()}
        summary={SAMPLE_SUMMARY}
        setSummary={vi.fn()}
        parsedDebitNotes={{ pr: [], twoB: [] }}
        setParsedDebitNotes={vi.fn()}
        gstr3bData={null}
        prMapping={{}}
        twoBMapping={{}}
        journals={[]}
        appliedGstins={[]}
        setAppliedGstins={vi.fn()}
        gstIssues={{ suggested: [], conflicts: [] }}
        setGstIssues={vi.fn()}
        portalMappings={{}}
        portalQueue={[]}
        booksQueue={[]}
        isMappingComplete={() => true}
      />
    );

    // Overview tab active initially
    expect(screen.getByText('Vaswani Trading Co')).toBeInTheDocument();
    expect(screen.getByText(/Priority Vendors by Tax Variance/i)).toBeInTheDocument();
    expect(screen.getByText(/Actionable Compliance Briefing/i)).toBeInTheDocument();

    // Clicking KPI card jumps straight to unified Invoice Audit Ledger with 1 filtered invoice
    fireEvent.click(screen.getAllByRole('button', { name: /Value Mismatch/i })[0]);
    expect(screen.getByText(/Search any invoice, vendor, or GSTIN/i)).toBeInTheDocument();
    expect(screen.getByText('1 invoice')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search invoice, party or GSTIN/i)).toBeInTheDocument();

    // Switch to Party-Wise Studio tab
    fireEvent.click(screen.getByText(/Party-Wise Studio/i));
    expect(screen.getByText(/Party-Wise Intelligence/i)).toBeInTheDocument();

    // Switch to Monthly 3-Way Matrix tab
    fireEvent.click(screen.getByText(/Monthly 3-Way Matrix/i));
    expect(screen.getByText(/Monthly Reconciliation Suite/i)).toBeInTheDocument();
  }, 20000);

  it('renders simplified Party-Wise Studio master-detail directory, tax split toggle, and status filters', () => {
    render(
      <PartyWiseReport
        results={SAMPLE_RESULTS}
        companyName="Vaswani Trading Co"
        onResultsChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Party-Wise Intelligence/i)).toBeInTheDocument();
    // Highest variance party (Gamma Supplies: ₹9,000) is selected initially -> INV-003 visible
    expect(screen.getAllByText('INV-003').length).toBeGreaterThan(0);

    // Compact 1-line tax column by default; toggling reveals IGST/CGST/SGST split
    expect(screen.queryByText(/IGST \(PR \/ 2B\)/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Show IGST\/CGST\/SGST Split/i));
    expect(screen.getByText(/IGST \(PR \/ 2B\)/i)).toBeInTheDocument();

    // Selecting Alpha Traders in directory switches right inspector to INV-001
    fireEvent.click(screen.getByText('Alpha Traders Pvt Ltd'));
    expect(screen.getAllByText('INV-001').length).toBeGreaterThan(0);

    // Filtering by Mismatch leaves Beta Logistics LLP visible and hides matched Alpha Traders
    fireEvent.click(screen.getByText('Mismatch'));
    expect(screen.getAllByText('Beta Logistics LLP').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alpha Traders Pvt Ltd')).not.toBeInTheDocument();
  });

  it('renders OutputDashboard cleanly across Matrix, Party, and Cross-Check views', () => {
    const taxZero = { taxable: 0, igst: 0, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
    const taxSample = { taxable: 200000, igst: 36000, cgst: 0, sgst: 0, nilRated: 0, nonTaxable: 0 };
    render(
      <OutputDashboard
        companyName="Vaswani Exports"
        onDownload={vi.fn()}
        results={{
          buffer: new ArrayBuffer(8),
          monthlySummaries: [
            {
              month: 'April',
              booksSales: taxSample,
              booksCn: taxZero,
              booksNet: taxSample,
              portalB2b: taxSample,
              portalExport: taxZero,
              portalB2c: taxZero,
              portalCn: taxZero,
              portalNil: taxZero,
              portalNet: taxSample,
              variance: taxZero,
            },
          ],
          partySummaries: [
            {
              month: 'April',
              booksPartyName: 'Global Buyer Ltd',
              portalPartyName: 'GLOBAL BUYER LTD',
              booksGstNo: '27AAACG1234G1Z1',
              portalGstNo: '27AAACG1234G1Z1',
              booksNet: taxSample,
              portalNet: taxSample,
              variance: taxZero,
            },
          ],
          crossCheckTotals: {
            isBalanced: true,
            masterBooksNet: 200000,
            masterPortalNet: 200000,
            masterNetVar: 0,
            detailBooksNet: 200000,
            detailPortalNet: 200000,
            detailNetVar: 0,
            difference: 0,
          },
        }}
      />
    );

    expect(screen.getByText(/Vaswani Exports — Outward Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/100% Three-Way Mathematical Invariant Verified/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Party-Wise Working/i }));
    expect(screen.getByText(/Annual Consolidated Customer Summary/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cross-Check Tie-Out/i }));
    expect(screen.getByText(/Table 1: Four-Way Totality Audit Confirmation/i)).toBeInTheDocument();
  });
});

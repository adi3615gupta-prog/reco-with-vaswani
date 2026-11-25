import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { TallyXmlSuite } from '@/pages/TallyXmlSuite';

// Mock tallyApi to simulate offline or online Tally
vi.mock('@/lib/tallyApi', () => ({
  pingTally: vi.fn().mockResolvedValue(true),
  fetchCompanyInfo: vi.fn().mockResolvedValue({
    companyName: 'Test Vaswani Enterprise',
    formalName: 'Vaswani & Co LLP',
    guid: 'TEST-GUID-123',
    booksFrom: '20260401',
    lastVoucherDate: '20261101',
  }),
  sendTallyRequest: vi.fn().mockResolvedValue('<RESPONSE><CREATED>5</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>'),
  fetchAllLedgerNames: vi.fn().mockResolvedValue([]),
}));

describe('TallyXmlSuite UI Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Suite 09 header and executive branding', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });
    expect(screen.getByText('SUITE 09')).toBeInTheDocument();
    expect(screen.getByText('Tally Entries Maker')).toBeInTheDocument();
  });

  it('renders all 5 navigation tabs', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });
    expect(screen.getByText('Vouchers (Dual Entry)')).toBeInTheDocument();
    expect(screen.getByText('Vouchers (Multi Entry)')).toBeInTheDocument();
    expect(screen.getByText('Vouchers (Quick Columnar)')).toBeInTheDocument();
    expect(screen.getByText('Masters (Ledgers)')).toBeInTheDocument();
    expect(screen.getByText('Impact Report')).toBeInTheDocument();
  });

  it('switches between tabs when clicked', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    // Click Multi Entry Tab
    const multiTab = screen.getByText('Vouchers (Multi Entry)');
    await act(async () => {
      fireEvent.click(multiTab);
    });
    expect(screen.getByText(/Multi-Entry Vouchers/i)).toBeInTheDocument();

    // Click Masters Tab
    const mastersTab = screen.getByText('Masters (Ledgers)');
    await act(async () => {
      fireEvent.click(mastersTab);
    });
    expect(screen.getAllByText(/Ledger Masters/i).length).toBeGreaterThan(0);

    // Click Impact Report Tab
    const impactTab = screen.getByText('Impact Report');
    await act(async () => {
      fireEvent.click(impactTab);
    });
    expect(screen.getByText(/Pre-Import Financial Scrutiny/i)).toBeInTheDocument();
  });

  it('validates rows on Validate Rows button click', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    const validateBtn = screen.getByText('Validate Rows');
    await act(async () => {
      fireEvent.click(validateBtn);
    });

    // Initial sample data is valid, so no error banner is displayed
    expect(screen.queryByText(/validation item\(s\) to review/i)).not.toBeInTheDocument();
  });

  it('fetches ledgers from vouchers into Masters table', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    const fetchBtn = screen.getByText('Fetch Ledgers to Masters');
    await act(async () => {
      fireEvent.click(fetchBtn);
    });

    // Should switch to Masters tab
    expect(screen.getAllByText(/Ledger Masters/i).length).toBeGreaterThan(0);
  });

  it('displays Tally telemetry status pill when manually connected', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    const connectBtn = screen.getByText(/Connect Tally/i);
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Tally Connected/i)).toBeInTheDocument();
    });
  });

  it('detects missing ledgers and displays the auto-creation dialog when pushing', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    // Connect tally first
    const connectBtn = screen.getByText(/Connect Tally/i);
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    // Add a voucher row with a new ledger
    const addRowBtn = screen.getByText('Add Row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    // Populate debit and credit ledgers
    const debitInput = screen.getByPlaceholderText('Debit Ledger');
    const creditInput = screen.getByPlaceholderText('Credit Ledger');
    await act(async () => {
      fireEvent.change(debitInput, { target: { value: 'New Test Supplier' } });
      fireEvent.change(creditInput, { target: { value: 'Cash' } });
    });

    // Click Push to Tally
    const pushBtn = screen.getByText('Push to Tally');
    await act(async () => {
      fireEvent.click(pushBtn);
    });

    // Should open the auto-create dialog
    await waitFor(() => {
      expect(screen.getByText(/Missing Ledgers Detected in TallyPrime/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Create Ledgers & Push Vouchers/i).length).toBeGreaterThan(0);
    });
  });

  it('renders high-volume enterprise upload, template download, and search filter', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    expect(screen.getAllByText('Upload Excel / CSV').length).toBeGreaterThan(0);
    expect(screen.getByText('Download Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search ledger, vch no...')).toBeInTheDocument();
  });

  it('renders the Top-Level Mode Switcher for Data Entry Studio and Data Modifier Studio', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    expect(screen.getByText('Data Entry Studio')).toBeInTheDocument();
    expect(screen.getByText('Data Modifier Studio')).toBeInTheDocument();
  });

  it('switches to Data Modifier Studio and displays alteration controls & bulk tools', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    // Click Data Modifier Studio
    const modifierTab = screen.getByText('Data Modifier Studio');
    await act(async () => {
      fireEvent.click(modifierTab);
    });

    // Verify Modifier specific toolbar and controls appear
    expect(screen.getAllByText(/Live DayBook & Alteration Hub/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fetch from Tally DayBook').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Upload Excel to Modify').length).toBeGreaterThan(0);
    expect(screen.getByText('Alteration Template')).toBeInTheDocument();
    expect(screen.getByText(/Bulk Find & Replace & Batch Modifiers/i)).toBeInTheDocument();
    expect(screen.getByText('Replace Ledger:')).toBeInTheDocument();
    expect(screen.getByText('Bulk Date:')).toBeInTheDocument();
    expect(screen.getByText('Push Alterations')).toBeInTheDocument();
  });

  it('adds rows in Data Modifier Studio and performs bulk find & replace on ledgers', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    // Switch to Modifier Studio
    const modifierTab = screen.getByText('Data Modifier Studio');
    await act(async () => {
      fireEvent.click(modifierTab);
    });

    // Add a row in modifier studio
    const addRowBtn = screen.getByText('Add Row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    // Fill in voucher row details
    const debitInput = screen.getByPlaceholderText('Debit Ledger');
    const creditInput = screen.getByPlaceholderText('Credit Ledger');
    await act(async () => {
      fireEvent.change(debitInput, { target: { value: 'Suspense Account' } });
      fireEvent.change(creditInput, { target: { value: 'Cash' } });
    });

    expect(debitInput).toHaveValue('Suspense Account');

    // Use Bulk Find & Replace
    const findInput = screen.getByPlaceholderText('Find Ledger (e.g. Suspense)');
    const replaceInput = screen.getByPlaceholderText('Replace With (e.g. HDFC Bank)');
    const replaceAllBtn = screen.getByText('Replace All');

    await act(async () => {
      fireEvent.change(findInput, { target: { value: 'Suspense Account' } });
      fireEvent.change(replaceInput, { target: { value: 'HDFC Bank A/c' } });
      fireEvent.click(replaceAllBtn);
    });

    // Debit ledger should now be replaced!
    expect(screen.getByPlaceholderText('Debit Ledger')).toHaveValue('HDFC Bank A/c');
  });

  it('pushes alterations from Data Modifier Studio to TallyPrime via Port 9000', async () => {
    await act(async () => {
      render(<TallyXmlSuite />);
    });

    const tallyApi = await import('@/lib/tallyApi');
    (tallyApi.fetchAllLedgerNames as any).mockResolvedValue([
      { name: 'Rent Expense' },
      { name: 'Bank' },
    ]);

    // Connect Tally
    const connectBtn = screen.getByText(/Connect Tally/i);
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    // Switch to Modifier Studio
    const modifierTab = screen.getByText('Data Modifier Studio');
    await act(async () => {
      fireEvent.click(modifierTab);
    });

    // Add a row
    const addRowBtn = screen.getByText('Add Row');
    await act(async () => {
      fireEvent.click(addRowBtn);
    });

    // Fill in row details
    const vchNoInput = screen.getByPlaceholderText('Vch No. (Key)');
    const debitInput = screen.getByPlaceholderText('Debit Ledger');
    const creditInput = screen.getByPlaceholderText('Credit Ledger');
    const amtInput = screen.getByPlaceholderText('0.00');

    await act(async () => {
      fireEvent.change(vchNoInput, { target: { value: 'PV-101' } });
      fireEvent.change(debitInput, { target: { value: 'Rent Expense' } });
      fireEvent.change(creditInput, { target: { value: 'Bank' } });
      fireEvent.change(amtInput, { target: { value: '15000' } });
    });

    // Click Push Alterations
    const pushAltBtn = screen.getByText('Push Alterations');
    await act(async () => {
      fireEvent.click(pushAltBtn);
    });

    // Verify it sent request with ACTION="Alter"
    await waitFor(() => {
      expect(tallyApi.sendTallyRequest).toHaveBeenCalled();
    });
  });

  it('fetches live vouchers from Tally DayBook into Data Modifier Studio', async () => {
    const tallyApi = await import('@/lib/tallyApi');
    const mockDayBookXml = `
      <ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <VOUCHER REMOTEID="vch-live-1" VCHTYPE="Payment">
                <DATE TYPE="Date">20260401</DATE>
                <GUID>guid-live-1</GUID>
                <NARRATION TYPE="String">Office Rent Payment</NARRATION>
                <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PV-2026-99</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME TYPE="String">Office Rent A/c</LEDGERNAME>
                  <ISDEEMEDPOSITIVE TYPE="Logical">Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT TYPE="Amount">-30000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME TYPE="String">HDFC Bank</LEDGERNAME>
                  <ISDEEMEDPOSITIVE TYPE="Logical">No</ISDEEMEDPOSITIVE>
                  <AMOUNT TYPE="Amount">30000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;

    (tallyApi.sendTallyRequest as any).mockResolvedValueOnce(mockDayBookXml);

    await act(async () => {
      render(<TallyXmlSuite />);
    });

    // Connect Tally
    const connectBtn = screen.getByText(/Connect Tally/i);
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    // Switch to Modifier Studio
    const modifierTab = screen.getByText('Data Modifier Studio');
    await act(async () => {
      fireEvent.click(modifierTab);
    });

    // Click "Fetch from Tally DayBook"
    const fetchDayBookBtns = screen.getAllByText('Fetch from Tally DayBook');
    await act(async () => {
      fireEvent.click(fetchDayBookBtns[0]);
    });

    // Verify vouchers are populated in the modifier table
    await waitFor(() => {
      expect(screen.getByDisplayValue('PV-2026-99')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Office Rent A/c')).toBeInTheDocument();
      expect(screen.getByDisplayValue('HDFC Bank')).toBeInTheDocument();
    });
  });
});

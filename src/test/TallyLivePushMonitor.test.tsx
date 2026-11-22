import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TallyLivePushMonitor, LivePushState } from '../components/TallyLivePushMonitor';

describe('TallyLivePushMonitor', () => {
  it('renders collapsed progress bar by default and expands on click', () => {
    const mockState: LivePushState = {
      isActive: true,
      isCompleted: false,
      stage: 'vouchers',
      stageTitle: 'Stage 2/3: Pushing Inward Vouchers into Tally',
      stageSubtext: 'Batch 1/2: Processing 25 vouchers...',
      progressPercent: 50,
      totalVouchers: 50,
      processedVouchers: 25,
      totalMasters: 10,
      processedMasters: 10,
      createdVouchers: 25,
      rejectedVouchers: 0,
      currentVoucherInfo: 'Inv #INV-001 (Yogi Enterprises)',
      startTime: Date.now() - 5000,
      logs: [
        {
          id: 'step-1',
          timestamp: '14:20:00',
          type: 'master',
          status: 'success',
          title: 'Master: Yogi Enterprises',
          supplierName: 'Yogi Enterprises',
          supplierGstin: '27ANHPV5126E1ZV',
          state: 'Maharashtra',
        },
        {
          id: 'step-2',
          timestamp: '14:20:02',
          type: 'voucher',
          status: 'success',
          title: 'Purchase PUR-0001 (Bill #INV-001)',
          supplierName: 'Yogi Enterprises',
          supplierGstin: '27ANHPV5126E1ZV',
          amount: 2826,
          legs: [
            { ledgerName: 'Yogi Enterprises', amount: 2826, isDebit: false },
            { ledgerName: 'Purchase @ 18%', amount: 2395, isDebit: true },
            { ledgerName: 'Input CGST', amount: 215.5, isDebit: true },
            { ledgerName: 'Input SGST', amount: 215.5, isDebit: true },
          ],
        },
      ],
    };

    render(
      <TallyLivePushMonitor
        state={mockState}
        tallyCompany="SOURAV"
        tallyPort={9000}
      />
    );

    // Default collapsed view checks
    expect(screen.getByText(/50% Completed/i)).toBeDefined();
    expect(screen.getByText(/SOURAV/i)).toBeDefined();
    expect(screen.getByText(/View Steps Log/i)).toBeDefined();

    // Click to expand
    fireEvent.click(screen.getByText(/View Steps Log/i));

    // After expanding, full breakdown is visible
    expect(screen.getByText(/Collapse Log/i)).toBeDefined();
    expect(screen.getByText(/1\. Supplier & Tax Masters/i)).toBeDefined();
    expect(screen.getByText(/2\. Inward Voucher XML Push/i)).toBeDefined();
    expect(screen.getAllByText(/Yogi Enterprises/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/27ANHPV5126E1ZV/i).length).toBeGreaterThan(0);
  });
});

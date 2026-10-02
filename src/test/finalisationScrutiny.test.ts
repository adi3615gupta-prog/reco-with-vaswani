import { describe, it, expect } from 'vitest';
import { runCreditorFinalisationScrutiny } from '../lib/auditEngine';
import type { TallyFinalisationData } from '../lib/tallyApi';

describe('Creditor & Debtor Finalisation Scrutiny Engine', () => {
  it('should flag cash payments > 10,000 u/s 40A(3)', () => {
    const mockData: TallyFinalisationData = {
      parties: new Map([
        [
          'JAI GANESH ENTERPRISES',
          {
            partyName: 'Jai Ganesh Enterprises',
            parentGroup: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: 15000,
            vouchers: [
              {
                date: '2024-05-10',
                voucherType: 'Payment',
                voucherNumber: 'PAY-101',
                amount: 15000,
                isDebit: true,
                counterpartyLedger: 'Cash',
                narration: 'Cash payment for supplies'
              }
            ]
          }
        ]
      ]),
      allVouchers: []
    };

    const observations = runCreditorFinalisationScrutiny(mockData);
    const cashObs = observations.find(o => o.category === 'Cash Payment / Sec 40A(3)' && o.severity === 'High');
    expect(cashObs).toBeDefined();
    expect(cashObs?.partyName).toBe('Jai Ganesh Enterprises');
    expect(cashObs?.queryDescription).toContain('Single Cash payment of ₹15,000');
  });

  it('should flag Transporter 194C(6) declaration requirements', () => {
    const mockData: TallyFinalisationData = {
      parties: new Map([
        [
          'ATUL TRANSPORT PVT LTD',
          {
            partyName: 'Atul Transport Pvt Ltd',
            parentGroup: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: 45000,
            vouchers: [
              {
                date: '2024-06-12',
                voucherType: 'Purchase',
                voucherNumber: 'PUR-88',
                amount: 45000,
                isDebit: false,
                counterpartyLedger: 'Freight Expenses',
                narration: 'Freight charges'
              }
            ]
          }
        ]
      ]),
      allVouchers: []
    };

    const observations = runCreditorFinalisationScrutiny(mockData);
    const transObs = observations.find(o => o.category === 'Transporter Sec 194C(6) Declaration');
    expect(transObs).toBeDefined();
    expect(transObs?.suggestedAction).toContain('Check if Transporter Declaration');
  });

  it('should flag residual small balances under 500 for discount write-off', () => {
    const mockData: TallyFinalisationData = {
      parties: new Map([
        [
          'SHEETAL ENTERPRISES',
          {
            partyName: 'Sheetal Enterprises',
            parentGroup: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: 484,
            vouchers: []
          }
        ]
      ]),
      allVouchers: []
    };

    const observations = runCreditorFinalisationScrutiny(mockData);
    const writeOffObs = observations.find(o => o.category === 'Small Balance Write-Off (< ₹500)');
    expect(writeOffObs).toBeDefined();
    expect(writeOffObs?.amount).toBe(484);
  });

  it('should flag advance payments pending bill booking', () => {
    const mockData: TallyFinalisationData = {
      parties: new Map([
        [
          'RAVI RAMU RATHOD',
          {
            partyName: 'Ravi Ramu Rathod',
            parentGroup: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: -197000,
            vouchers: [
              {
                date: '2024-07-20',
                voucherType: 'Payment',
                voucherNumber: 'PAY-909',
                amount: 197000,
                isDebit: true,
                counterpartyLedger: 'HDFC Bank',
                narration: 'Advance for site work'
              }
            ]
          }
        ]
      ]),
      allVouchers: []
    };

    const observations = runCreditorFinalisationScrutiny(mockData);
    const advObs = observations.find(o => o.category === 'Advance Pending Bill Booking');
    expect(advObs).toBeDefined();
    expect(advObs?.amount).toBe(197000);
  });

  it('should flag duplicate bills booked on consecutive dates', () => {
    const mockData: TallyFinalisationData = {
      parties: new Map([
        [
          'SHARANYA ENTERPRISES',
          {
            partyName: 'Sharanya Enterprises',
            parentGroup: 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: 50000,
            vouchers: [
              {
                date: '2024-12-24',
                voucherType: 'Purchase',
                voucherNumber: 'PUR-101',
                amount: 25000,
                isDebit: false,
                counterpartyLedger: 'Purchase',
                narration: 'Bill 101'
              },
              {
                date: '2024-12-25',
                voucherType: 'Purchase',
                voucherNumber: 'PUR-102',
                amount: 25000,
                isDebit: false,
                counterpartyLedger: 'Purchase',
                narration: 'Bill 102'
              }
            ]
          }
        ]
      ]),
      allVouchers: []
    };

    const observations = runCreditorFinalisationScrutiny(mockData);
    const dupObs = observations.find(o => o.category === 'Duplicate Invoice Risk');
    expect(dupObs).toBeDefined();
    expect(dupObs?.severity).toBe('High');
  });
});

export type ReconciliationMode = 'input' | 'output';

export interface ModeTerminology {
  mode: ReconciliationMode;
  title: string;
  subtitle: string;
  primaryBookLabel: string;       // e.g. "Purchase Register" / "Sales Register"
  primaryBookDesc: string;
  secondaryBookLabel: string;     // e.g. "Journal Register" / "Sales Book"
  secondaryBookDesc: string;
  govtLabel: string;              // "GSTR-2B" / "GSTR-1"
  govtDesc: string;
  partyLabel: string;             // "Supplier" / "Customer"
  partyTradeLabel: string;        // "Trade / Legal Name"
  primaryShort: string;           // "PR" / "Sales"
  govtShort: string;              // "2B" / "GSTR-1"
  riskLabel: string;              // "at ITC risk" / "tax liability gap"
  missingInGovtAction: string;
  missingInBookAction: string;
  valueMismatchAction: string;
  exportPrefix: string;           // "Input" / "Output"
}

export const TERMS: Record<ReconciliationMode, ModeTerminology> = {
  input: {
    mode: 'input',
    title: 'Input Reconciliation',
    subtitle: 'Purchase Register ↔ GSTR-2B',
    primaryBookLabel: 'Purchase Register',
    primaryBookDesc: 'Your books / Tally export',
    secondaryBookLabel: 'Journal Register',
    secondaryBookDesc: 'Optional — combined with Purchase Register and compared to GSTR-2B',
    govtLabel: 'GSTR-2B Data',
    govtDesc: 'Downloaded from GST Portal',
    partyLabel: 'Supplier',
    partyTradeLabel: 'Trade / Legal Name',
    primaryShort: 'PR',
    govtShort: '2B',
    riskLabel: 'at ITC risk',
    missingInGovtAction: 'Follow up with Vendor / Hold GST Payment.',
    missingInBookAction: 'Possible vendor entry — verify and book in PR.',
    valueMismatchAction: 'Verify Taxable Value with Vendor.',
    exportPrefix: 'Input',
  },
  output: {
    mode: 'output',
    title: 'Output Reconciliation',
    subtitle: 'Sales Register ↔ GSTR-1',
    primaryBookLabel: 'Sales Register',
    primaryBookDesc: 'Your sales books / Tally export',
    secondaryBookLabel: 'Sales Book',
    secondaryBookDesc: 'Optional — extra sales books combined with Sales Register and compared to GSTR-1',
    govtLabel: 'GSTR-1 Data',
    govtDesc: 'Downloaded from GST Portal',
    partyLabel: 'Customer',
    partyTradeLabel: 'Trade / Legal Name',
    primaryShort: 'Sales',
    govtShort: 'GSTR-1',
    riskLabel: 'tax liability gap',
    missingInGovtAction: 'File in next GSTR-1 / amend return.',
    missingInBookAction: 'Possible unrecorded sale — verify with customer.',
    valueMismatchAction: 'Verify Taxable Value & tax with Customer.',
    exportPrefix: 'Output',
  },
};

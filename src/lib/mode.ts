export type ReconciliationMode = 'input' | 'output';

export const getTerminology = (mode: ReconciliationMode) => {
  return {
    primaryRecord: mode === 'input' ? 'Purchase Register' : 'Sales Register',
    secondaryRecord: mode === 'input' ? 'GSTR-2B' : 'GSTR-1',
    additionalBooks: mode === 'input' ? 'Journals' : 'Additional Sales Books',
    partyName: mode === 'input' ? 'Supplier' : 'Customer/Recipient',
    missingInPrimary: mode === 'input' ? 'Missing in PR' : 'Missing in Sales',
    missingInSecondary: mode === 'input' ? 'Missing in 2B' : 'Missing in GSTR-1',
    actionMissingPrimary: mode === 'input' 
      ? 'Follow up with supplier / Verify invoices' 
      : 'Verify with customer; possible unrecorded sale',
    actionMissingSecondary: mode === 'input' 
      ? 'Check if filed in next period / Claim ITC later' 
      : 'File in next GSTR-1 / amend',
    actionValueMismatch: mode === 'input'
      ? 'Verify ITC amount with supplier'
      : 'Verify Taxable Value & tax with customer',
    primaryShorthand: mode === 'input' ? 'PR' : 'Sales',
    secondaryShorthand: mode === 'input' ? '2B' : 'GSTR-1',
  };
};

export const TERMS = {
  input: {
    primaryBookLabel: 'Purchase Register',
    primaryBookDesc: 'Upload your Purchase Register (PR) Excel',
    govtLabel: 'GSTR-2B',
    govtDesc: 'Upload GSTR-2B downloaded from GST Portal',
    partyLabel: 'Supplier Name',
    primaryShort: 'PR',
    govtShort: '2B'
  },
  output: {
    primaryBookLabel: 'Sales Register',
    primaryBookDesc: 'Upload your Sales Register Excel',
    govtLabel: 'GSTR-1',
    govtDesc: 'Upload GSTR-1 downloaded from GST Portal',
    partyLabel: 'Customer/Recipient Name',
    primaryShort: 'Sales',
    govtShort: 'GSTR-1'
  }
};
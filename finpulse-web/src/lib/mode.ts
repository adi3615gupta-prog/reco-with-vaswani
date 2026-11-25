export type ReconciliationMode = 'input' | 'output' | '2b-to-pr';

export const normalizeMode = (mode?: string | null): 'input' | 'output' => {
  if (mode === 'output' || mode === 'gstr1' || mode === 'sales') return 'output';
  return 'input';
};

export const getTerminology = (mode?: string | null) => {
  const isInput = normalizeMode(mode) === 'input';
  return {
    primaryRecord: isInput ? 'Purchase Register' : 'Sales Register',
    secondaryRecord: isInput ? 'GSTR-2B' : 'GSTR-1',
    additionalBooks: isInput ? 'Journals' : 'Additional Sales Books',
    partyName: isInput ? 'Supplier' : 'Customer/Recipient',
    missingInPrimary: isInput ? 'Missing in PR' : 'Missing in Sales',
    missingInSecondary: isInput ? 'Missing in 2B' : 'Missing in GSTR-1',
    actionMissingPrimary: isInput 
      ? 'Follow up with supplier / Verify invoices' 
      : 'Verify with customer; possible unrecorded sale',
    actionMissingSecondary: isInput 
      ? 'Check if filed in next period / Claim ITC later' 
      : 'File in next GSTR-1 / amend',
    actionValueMismatch: isInput
      ? 'Verify ITC amount with supplier'
      : 'Verify Taxable Value & tax with customer',
    primaryShorthand: isInput ? 'PR' : 'Sales',
    secondaryShorthand: isInput ? '2B' : 'GSTR-1',
  };
};

export interface ModeTerms {
  primaryBookLabel: string;
  primaryBookDesc: string;
  govtLabel: string;
  govtDesc: string;
  partyLabel: string;
  primaryShort: string;
  govtShort: string;
}

const INPUT_TERMS: ModeTerms = {
  primaryBookLabel: 'Purchase Register',
  primaryBookDesc: 'Upload your Purchase Register (PR) Excel',
  govtLabel: 'GSTR-2B',
  govtDesc: 'Upload GSTR-2B downloaded from GST Portal',
  partyLabel: 'Supplier Name',
  primaryShort: 'PR',
  govtShort: '2B'
};

const OUTPUT_TERMS: ModeTerms = {
  primaryBookLabel: 'Sales Register',
  primaryBookDesc: 'Upload your Sales Register Excel',
  govtLabel: 'GSTR-1',
  govtDesc: 'Upload GSTR-1 downloaded from GST Portal',
  partyLabel: 'Customer/Recipient Name',
  primaryShort: 'Sales',
  govtShort: 'GSTR-1'
};

export const TERMS: Record<string, ModeTerms> = {
  input: INPUT_TERMS,
  output: OUTPUT_TERMS,
  '2b-to-pr': INPUT_TERMS,
  'pr-to-2b': INPUT_TERMS,
};

export const getTerms = (mode?: string | null): ModeTerms => {
  if (mode && TERMS[mode]) return TERMS[mode];
  return INPUT_TERMS;
};
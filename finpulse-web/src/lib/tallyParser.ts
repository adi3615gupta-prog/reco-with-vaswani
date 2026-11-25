import type { TrialBalanceEntry, MasterGroupCode } from './finStatements.types';
import { getSmartSuggestion } from './smartMapping';

export const generateTallyGroupRequest = (): string => {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>MyGroupExport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="MyGroupExport">
            <FORMS>MyGroupForm</FORMS>
          </REPORT>
          <FORM NAME="MyGroupForm">
            <PARTS>MyGroupPart</PARTS>
          </FORM>
          <PART NAME="MyGroupPart">
            <LINES>MyGroupLine</LINES>
            <REPEAT>MyGroupLine : MyGroupCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="MyGroupLine">
            <FIELDS>GroupName, GroupParent</FIELDS>
            <XMLTAG>"GROUP"</XMLTAG>
          </LINE>
          <FIELD NAME="GroupName">
            <SET>$Name</SET>
            <XMLTAG>"NAME"</XMLTAG>
          </FIELD>
          <FIELD NAME="GroupParent">
            <SET>$Parent</SET>
            <XMLTAG>"PARENT"</XMLTAG>
          </FIELD>
          <COLLECTION NAME="MyGroupCollection">
            <TYPE>Group</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
};

export const generateTallyLedgerRequest = (): string => {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Ledger</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
};

const parseTallyAmount = (val: string | null): number => {
  if (!val) return 0;
  const clean = val.replace(/,/g, '').trim();
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return num;
};

// Automatic mapping dictionary linking common Tally primary/parent groups to Schedule III Codes
// Automatic mapping dictionary linking common Tally primary/parent groups to Schedule III Codes
export const AUTO_MAPPING_DICT: Record<string, number> = {
  'Trade Receivables': 1112,
  'Sundry Debtors': 1112,
  'Sundry Creditors': 2212,
  'Trade Payables': 2212,
  'Bank Accounts': 1122,
  'Cash-in-Hand': 1121,
  'Cash': 1121,
  'Duties & Taxes': 2232,
  'Fixed Assets': 1003,
  'Sales Accounts': 3001,
  'Purchase Accounts': 4001,
  'Direct Expenses': 4021,
  'Indirect Expenses': 4061,
  'Capital Account': 2001,
  'Reserves & Surplus': 2013,
  'Provisions': 2243,
  'Loans (Liability)': 2101,
  'Unsecured Loans': 2102,
  'Secured Loans': 2101,
  'Investments': 1041,
  'Loans & Advances (Asset)': 1052,
  'Suspense A/c': 2233,
  'Current Assets': 1152,
  'Current Liabilities': 2233,
  'Direct Incomes': 3003,
  'Indirect Incomes': 3015,
  'Misc. Expenses (ASSET)': 1082,
  'Stock-in-Hand': 1101,
  'Closing Stock': 1101,
};

// Fallback dictionary to guess Primary Group from a known Sub-group (useful for Excel imports)
export const TALLY_SUB_TO_PRIMARY: Record<string, string> = {
  'Bank Accounts': 'Current Assets',
  'Bank OCC A/c': 'Loans (Liability)',
  'Bank OD A/c': 'Loans (Liability)',
  'Cash-in-Hand': 'Current Assets',
  'Deposits (Asset)': 'Current Assets',
  'Duties & Taxes': 'Current Liabilities',
  'Loans & Advances (Asset)': 'Current Assets',
  'Provisions': 'Current Liabilities',
  'Reserves & Surplus': 'Capital Account',
  'Secured Loans': 'Loans (Liability)',
  'Stock-in-Hand': 'Current Assets',
  'Sundry Creditors': 'Current Liabilities',
  'Sundry Debtors': 'Current Assets',
  'Trade Receivables': 'Current Assets',
  'Trade Payables': 'Current Liabilities',
};

export const getFallbackPrimaryGroup = (parentGroup: string, existingPrimary: string): string => {
  const knownPrimaryGroups = [
    'Branch / Divisions', 'Capital Account', 'Current Assets', 'Current Liabilities',
    'Direct Expenses', 'Direct Incomes', 'Fixed Assets', 'Indirect Expenses',
    'Indirect Incomes', 'Investments', 'Loans (Liability)', 'Misc. Expenses (ASSET)',
    'Purchase Accounts', 'Sales Accounts', 'Suspense A/c'
  ];
  
  // If the existing primary is already a valid known Tally primary group, keep it!
  if (existingPrimary && knownPrimaryGroups.some(g => g.toLowerCase() === existingPrimary.toLowerCase())) {
    return existingPrimary;
  }

  const searchStr1 = existingPrimary.trim().toLowerCase();
  const searchStr2 = parentGroup.trim().toLowerCase();

  // 1. Check direct lookup in TALLY_SUB_TO_PRIMARY
  for (const [sub, primary] of Object.entries(TALLY_SUB_TO_PRIMARY)) {
    if (searchStr1 === sub.toLowerCase() || searchStr2 === sub.toLowerCase()) return primary;
  }

  const combinedSearch = `${searchStr1} ${searchStr2}`;

  // 2. Keyword based matching for common custom groups
  if (combinedSearch.includes('computer') || combinedSearch.includes('furniture') || combinedSearch.includes('fixture') || 
      combinedSearch.includes('machinery') || combinedSearch.includes('vehicle') || combinedSearch.includes('land') || 
      combinedSearch.includes('building') || combinedSearch.includes('equipment') || combinedSearch.includes('fixed asset')) {
    return 'Fixed Assets';
  }

  if (combinedSearch.includes('esic') || combinedSearch.includes('pf ') || combinedSearch.includes('provident fund') ||
      combinedSearch.includes('payable') || combinedSearch.includes('creditor') || combinedSearch.includes('provision') ||
      combinedSearch.includes('outstanding') || combinedSearch.includes('tax') || combinedSearch.includes('duty') || combinedSearch.includes('duties')) {
    return 'Current Liabilities';
  }

  if (combinedSearch.includes('receivable') || combinedSearch.includes('debtor') || combinedSearch.includes('advance') ||
      combinedSearch.includes('cash') || combinedSearch.includes('bank') || combinedSearch.includes('deposit') ||
      combinedSearch.includes('prepaid')) {
    return 'Current Assets';
  }

  if (combinedSearch.includes('loan') || combinedSearch.includes('borrowing')) {
    return 'Loans (Liability)';
  }
  
  if (combinedSearch.includes('expense') || /\bexp\b/.test(combinedSearch) || 
      combinedSearch.includes('employee') || combinedSearch.includes('salary') || combinedSearch.includes('wage') ||
      combinedSearch.includes('finance') || combinedSearch.includes('depreciation') || combinedSearch.includes('amortization') ||
      combinedSearch.includes('fee') || combinedSearch.includes('charge') || combinedSearch.includes('cost') ||
      combinedSearch.includes('rent') || combinedSearch.includes('repair') || combinedSearch.includes('maintenance')) {
    
    // Some costs are typically direct if they involve material or manufacturing
    if (combinedSearch.includes('direct') || combinedSearch.includes('material') || combinedSearch.includes('manufacturing') || combinedSearch.includes('factory') || combinedSearch.includes('production') || combinedSearch.includes('freight inward')) {
      return 'Direct Expenses';
    }
    return 'Indirect Expenses';
  }
  
  if (combinedSearch.includes('income') || combinedSearch.includes('revenue')) {
    return combinedSearch.includes('direct') ? 'Direct Incomes' : 'Indirect Incomes';
  }

  // If we couldn't deduce it, just return the existing or parent
  return existingPrimary || parentGroup || '';
};

// Helper to auto-map based on parent or primary group
export const resolveMappingCode = (ledgerName: string, parentGroup: string, primaryGroup: string): number | null => {
  const name = ledgerName.toUpperCase().trim();
  
  // Specific Statutory & Corporate Mappings
  if (name.includes('GST PAYABLE')) return 2232;
  if (name.includes('TDS PAYABLE')) return 2232;
  if (name.includes('PROVIDENT FUND PAYABLE') || name.includes('PF PAYABLE')) return 2232;
  if (name.includes('ESIC PAYABLE') || name.includes('ESI PAYABLE')) return 2232;
  if (name.includes('DIRECTOR') && name.includes('SALARY PAYABLE')) return 2241;
  if (name.includes('SALARY PAYABLE') || name.includes('SALARIES PAYABLE')) return 2241;
  if (name.includes('RETENTION PAYABLE')) return 2212;
  if (name.includes('BUILDING ACCOUNT') || name === 'BUILDINGS' || name === 'BUILDING') return 1002;
  if (name.includes('PLANT AND EQUIPMENT') || name.includes('PLANT & EQUIPMENT') || name === 'PLANT AND MACHINERY') return 1003;
  if (name.includes('FURNITURE AND FIXTURES') || name.includes('FURNITURE & FIXTURES') || name.includes('FURNITURE & FITTING')) return 1004;

  if (AUTO_MAPPING_DICT[parentGroup]) return AUTO_MAPPING_DICT[parentGroup];
  if (AUTO_MAPPING_DICT[primaryGroup]) return AUTO_MAPPING_DICT[primaryGroup];
  return null;
};

export const parseTallyCollectionsToTrialBalance = (groupXmlStr: string, ledgerXmlStr: string, masterCodes: MasterGroupCode[] = []): TrialBalanceEntry[] => {
  const parser = new DOMParser();
  
  // 1. Build Group Tree
  const groupDoc = parser.parseFromString(groupXmlStr, 'text/xml');
  const groupNodes = Array.from(groupDoc.getElementsByTagName('GROUP'));
  
  const groupParents: Record<string, string> = {}; // child -> parent
  
  groupNodes.forEach(node => {
    const children = Array.from(node.getElementsByTagName('*'));
    const nameNode = children.find(el => el.tagName.toUpperCase() === 'NAME');
    const parentNode = children.find(el => el.tagName.toUpperCase() === 'PARENT');
    
    const nameStr = nameNode?.textContent?.trim() || node.getAttribute('NAME') || '';
    if (!nameStr) return;
    
    const parentName = parentNode?.textContent?.trim() || '';
    if (parentName) {
      groupParents[nameStr] = parentName;
    }
  });

  // Helper to resolve primary group by walking up the tree
  const getPrimaryGroup = (groupName: string): string => {
    let current = groupName;
    while (groupParents[current] && groupParents[current] !== current) {
      const parentName = groupParents[current];
      // Tally's root groups have a parent like "&#4; Primary". If we hit that, current is the primary group.
      if (parentName.toLowerCase().includes('primary')) {
        break;
      }
      current = parentName;
    }
    return current;
  };

  // 2. Parse Ledgers
  const ledgerDoc = parser.parseFromString(ledgerXmlStr, 'text/xml');
  const ledgerNodes = Array.from(ledgerDoc.getElementsByTagName('LEDGER'));
  
  const entries: TrialBalanceEntry[] = [];

  ledgerNodes.forEach(node => {
    const ledgerName = node.getAttribute('NAME');
    if (!ledgerName || ledgerName === 'Profit & Loss A/c') return;

    const children = Array.from(node.getElementsByTagName('*'));
    const parentNode = children.find(el => el.tagName.toUpperCase() === 'PARENT');
    const closingNode = children.find(el => el.tagName.toUpperCase() === 'CLOSINGBALANCE');
    const openingNode = children.find(el => el.tagName.toUpperCase() === 'TBALOPENING'); // Tally uses TBALOPENING or LEDOPENINGBALANCE

    const parentName = parentNode?.textContent?.trim() || '';
    let primaryGroup = getPrimaryGroup(parentName);
    primaryGroup = getFallbackPrimaryGroup(parentName, primaryGroup);
    
    const cyBal = -(parseTallyAmount(closingNode?.textContent || '0'));
    const pyBal = -(parseTallyAmount(openingNode?.textContent || '0'));

    if (cyBal === 0 && pyBal === 0) return;

    const mappedCode = resolveMappingCode(ledgerName, parentName, primaryGroup);

    let suggestedCode: number | undefined;
    let confidence: number | undefined;

    if (!mappedCode && masterCodes.length > 0) {
      const suggestion = getSmartSuggestion(ledgerName, masterCodes);
      if (suggestion) {
        suggestedCode = suggestion.group_code;
        confidence = suggestion.confidence;
      }
    }

    entries.push({
      id: `tb_${Date.now()}_${entries.length}`,
      client_id: 'default',
      ledger_name: ledgerName,
      cy_balance: cyBal,
      py_balance: pyBal,
      mapped_group_code: mappedCode,
      tally_parent_group: parentName,
      tally_primary_group: primaryGroup,
      suggested_group_code: suggestedCode,
      suggestion_confidence: confidence,
    });
  });

  return entries;
};

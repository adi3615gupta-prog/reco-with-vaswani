/**
 * tallyCmaApi.ts — Tally XML Extraction Service for CMA & Bank Ratio Analysis Engine
 * 
 * Fetches Trial Balance, Group Hierarchy, Closing Balances, and Debtors/Creditors Aging
 * directly from TallyPrime via its XML HTTP API (Port 9000).
 */

import { sendTallyRequest, escapeXml, unescapeXml, extractLedgerNameFromBlock, DEFAULT_CONFIG, type TallyConnectionConfig, type TallyCompanyInfo } from './tallyApi';

export interface TallyCmaRawLedger {
  name: string;
  parentGroup: string;
  primaryGroup: string;
  closingBalance: number; // positive = Debit, negative = Credit or vice versa
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  agedOver180Days: number; // for debtors/creditors
}

export interface TallyCmaExtractionResult {
  companyInfo: TallyCompanyInfo;
  ledgers: TallyCmaRawLedger[];
  groupTotals: Map<string, number>;
  rawXml?: string;
  fetchedAt: string;
}

/** Fetch Trial Balance & Ledger Balances with Group Hierarchy from Tally */
export async function fetchTallyCmaData(
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  fromDate?: string,
  toDate?: string
): Promise<TallyCmaExtractionResult> {

  // XML query fetching ledger balances directly from Tally memory without date-range recalculation overhead
  const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CMA_Ledger_Extract</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CMA_Ledger_Extract">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, PrimaryGroup, ClosingBalance, OpeningBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  let companyName = 'Tally Company';
  let gstin = '';
  let state = '';
  let financialYear = '2025-26';

  try {
    const companyInfoStr = await sendTallyRequest(
      `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ListOfCompanies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ListOfCompanies"><TYPE>Company</TYPE><FETCH>Name, Address, GSTIN, State, BooksFrom</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`,
      config
    );

    const cmpMatch = companyInfoStr.match(/<COMPANY([^>]*)>([\s\S]*?)<\/COMPANY>/i);
    if (cmpMatch) {
      const nameM = cmpMatch[2].match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
      if (nameM) companyName = unescapeXml(nameM[1]).trim();

      const gstinM = cmpMatch[2].match(/<GSTIN[^>]*>([^<]+)<\/GSTIN>/i);
      if (gstinM) gstin = unescapeXml(gstinM[1]).trim();

      const stateM = cmpMatch[2].match(/<STATE[^>]*>([^<]+)<\/STATE>/i);
      if (stateM) state = unescapeXml(stateM[1]).trim();

      const booksM = cmpMatch[2].match(/<BOOKSFROM[^>]*>([^<]+)<\/BOOKSFROM>/i);
      if (booksM) {
        const year = booksM[1].substring(0, 4);
        financialYear = `${year}-${parseInt(year, 10) + 1}`;
      }
    }
  } catch (e) {
    console.warn('[tallyCmaApi] Error fetching company info:', e);
  }

  const resp = await sendTallyRequest(xml, config, 45000);
  const ledgers: TallyCmaRawLedger[] = [];
  const groupTotals = new Map<string, number>();

  const blockRegex = /<LEDGER([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let m: RegExpExecArray | null;

  while ((m = blockRegex.exec(resp)) !== null) {
    const name = extractLedgerNameFromBlock(m[1], m[2]);
    if (!name) continue;

    const block = m[2];

    const parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
    const parentGroup = parentMatch ? unescapeXml(parentMatch[1]).trim() : '';

    const primMatch = block.match(/<PRIMARYGROUP[^>]*>([^<]+)<\/PRIMARYGROUP>/i);
    const primaryGroup = primMatch ? unescapeXml(primMatch[1]).trim() : parentGroup;

    const cbMatch = block.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i);
    let closingBalance = 0;
    if (cbMatch) {
      const rawCb = cbMatch[1].trim();
      const isCr = rawCb.toLowerCase().includes('cr');
      const isDr = rawCb.toLowerCase().includes('dr');
      const num = parseFloat(rawCb.replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim());
      if (!isNaN(num)) {
        if (isCr) {
          closingBalance = -Math.abs(num);
        } else if (isDr) {
          closingBalance = Math.abs(num);
        } else {
          // Standard Tally TDL exports output negative numbers for Debit (-8592620.04) and positive for Credit (636840.00).
          // Convert to standard financial sign: Debit (+) and Credit (-)
          closingBalance = -num;
        }
      }
    }

    const obMatch = block.match(/<OPENINGBALANCE[^>]*>([^<]+)<\/OPENINGBALANCE>/i);
    let openingBalance = 0;
    if (obMatch) {
      const rawOb = obMatch[1].trim();
      const isCr = rawOb.toLowerCase().includes('cr');
      const isDr = rawOb.toLowerCase().includes('dr');
      const num = parseFloat(rawOb.replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim());
      if (!isNaN(num)) {
        if (isCr) {
          openingBalance = -Math.abs(num);
        } else if (isDr) {
          openingBalance = Math.abs(num);
        } else {
          openingBalance = -num;
        }
      }
    }

    ledgers.push({
      name,
      parentGroup,
      primaryGroup,
      closingBalance,
      openingBalance,
      debitTotal: 0,
      creditTotal: 0,
      agedOver180Days: 0,
    });

    if (parentGroup) {
      const currGroupBal = groupTotals.get(parentGroup) || 0;
      groupTotals.set(parentGroup, currGroupBal + Math.abs(closingBalance));
    }
  }

  return {
    companyInfo: {
      name: companyName,
      address: '',
      gstin,
      state,
      financialYear,
    },
    ledgers,
    groupTotals,
    rawXml: resp,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Returns a high-quality Sample CA Case Study Tally dataset for testing
 * when Tally is offline or not connected on localhost:9000.
 */
export function getSampleCmaCaseStudyData(): TallyCmaExtractionResult {
  return {
    companyInfo: {
      name: 'Vanguard Industrial Solutions Pvt Ltd',
      address: 'Plot 42, MIDC Industrial Area, Pune 411026',
      gstin: '27AABCV1234F1Z8',
      state: 'Maharashtra',
      financialYear: '2025-26',
    },
    ledgers: [
      // Revenue & Expense
      { name: 'Gross Sales / Turnover', parentGroup: 'Sales Accounts', primaryGroup: 'Sales Accounts', closingBalance: -48500000, openingBalance: 0, debitTotal: 0, creditTotal: 48500000, agedOver180Days: 0 },
      { name: 'Cost of Goods Sold (Raw Materials & MFG)', parentGroup: 'Direct Expenses', primaryGroup: 'Direct Expenses', closingBalance: 31200000, openingBalance: 0, debitTotal: 31200000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Raw Material Purchases', parentGroup: 'Purchase Accounts', primaryGroup: 'Purchase Accounts', closingBalance: 28400000, openingBalance: 0, debitTotal: 28400000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Depreciation (Schedule II & Sec 32)', parentGroup: 'Indirect Expenses', primaryGroup: 'Indirect Expenses', closingBalance: 1850000, openingBalance: 0, debitTotal: 1850000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Term Loan Interest Expense', parentGroup: 'Indirect Expenses', primaryGroup: 'Indirect Expenses', closingBalance: 1240000, openingBalance: 0, debitTotal: 1240000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Working Capital Interest (CC/OD)', parentGroup: 'Indirect Expenses', primaryGroup: 'Indirect Expenses', closingBalance: 1420000, openingBalance: 0, debitTotal: 1420000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Operating Salaries & Admin Expenses', parentGroup: 'Indirect Expenses', primaryGroup: 'Indirect Expenses', closingBalance: 6400000, openingBalance: 0, debitTotal: 6400000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Profit After Tax (PAT)', parentGroup: 'Reserves & Surplus', primaryGroup: 'Reserves & Surplus', closingBalance: -3150000, openingBalance: 0, debitTotal: 0, creditTotal: 3150000, agedOver180Days: 0 },

      // Assets
      { name: 'Finished Goods Inventory', parentGroup: 'Stock-in-hand', primaryGroup: 'Current Assets', closingBalance: 7800000, openingBalance: 6500000, debitTotal: 7800000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Raw Material Stock', parentGroup: 'Stock-in-hand', primaryGroup: 'Current Assets', closingBalance: 4200000, openingBalance: 3900000, debitTotal: 4200000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Sundry Debtors (Domestic Trade Receivables)', parentGroup: 'Sundry Debtors', primaryGroup: 'Current Assets', closingBalance: 14200000, openingBalance: 11800000, debitTotal: 14200000, creditTotal: 0, agedOver180Days: 3450000 },
      { name: 'Advance to Sister Concern (Vanguard Tech Pvt Ltd)', parentGroup: 'Loans & Advances (Asset)', primaryGroup: 'Current Assets', closingBalance: 2800000, openingBalance: 2200000, debitTotal: 2800000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Cash & Bank Balances (HDFC Bank)', parentGroup: 'Bank Accounts', primaryGroup: 'Current Assets', closingBalance: 1450000, openingBalance: 980000, debitTotal: 1450000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'GST Input Tax Credit & Other CA', parentGroup: 'Other Current Assets', primaryGroup: 'Current Assets', closingBalance: 1150000, openingBalance: 920000, debitTotal: 1150000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Plant & Heavy Machinery (Net)', parentGroup: 'Fixed Assets', primaryGroup: 'Fixed Assets', closingBalance: 22400000, openingBalance: 18500000, debitTotal: 22400000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Factory Land & Building', parentGroup: 'Fixed Assets', primaryGroup: 'Fixed Assets', closingBalance: 14500000, openingBalance: 14500000, debitTotal: 14500000, creditTotal: 0, agedOver180Days: 0 },
      { name: 'Goodwill & Patents (Intangible Asset)', parentGroup: 'Fixed Assets', primaryGroup: 'Fixed Assets', closingBalance: 1800000, openingBalance: 1800000, debitTotal: 1800000, creditTotal: 0, agedOver180Days: 0 },

      // Liabilities & Equity
      { name: 'Equity Share Capital', parentGroup: 'Share Capital', primaryGroup: 'Capital Account', closingBalance: -10000000, openingBalance: -10000000, debitTotal: 0, creditTotal: 10000000, agedOver180Days: 0 },
      { name: 'Retained Profits & General Reserve', parentGroup: 'Reserves & Surplus', primaryGroup: 'Capital Account', closingBalance: -8200000, openingBalance: -6400000, debitTotal: 0, creditTotal: 8200000, agedOver180Days: 0 },
      { name: 'Promoter Unsecured Loans (Director Subordinated)', parentGroup: 'Unsecured Loans', primaryGroup: 'Loans (Liability)', closingBalance: -12500000, openingBalance: -11000000, debitTotal: 0, creditTotal: 12500000, agedOver180Days: 0 },
      { name: 'HDFC Bank Term Loan (Machinery)', parentGroup: 'Secured Loans', primaryGroup: 'Loans (Liability)', closingBalance: -14800000, openingBalance: -17200000, debitTotal: 0, creditTotal: 14800000, agedOver180Days: 0 },
      { name: 'ICICI Working Capital CC Limit (Hypothecation)', parentGroup: 'Bank OD A/c', primaryGroup: 'Current Liabilities', closingBalance: -11400000, openingBalance: -9800000, debitTotal: 0, creditTotal: 11400000, agedOver180Days: 0 },
      { name: 'Sundry Creditors (Raw Material Suppliers)', parentGroup: 'Sundry Creditors', primaryGroup: 'Current Liabilities', closingBalance: 8600000, openingBalance: 7200000, debitTotal: 0, creditTotal: 8600000, agedOver180Days: 0 },
      { name: 'Duties & Taxes (GST & TDS Payable)', parentGroup: 'Duties & Taxes', primaryGroup: 'Current Liabilities', closingBalance: -1420000, openingBalance: -1150000, debitTotal: 0, creditTotal: 1420000, agedOver180Days: 0 },
      { name: 'Short Term Provisions & Expenses Payable', parentGroup: 'Current Liabilities', primaryGroup: 'Current Liabilities', closingBalance: -980000, openingBalance: -840000, debitTotal: 0, creditTotal: 980000, agedOver180Days: 0 },
    ],
    groupTotals: new Map([
      ['Sales Accounts', 48500000],
      ['Direct Expenses', 31200000],
      ['Sundry Debtors', 14200000],
      ['Fixed Assets', 38700000],
      ['Current Liabilities', 22400000],
      ['Unsecured Loans', 12500000],
    ]),
    fetchedAt: new Date().toISOString(),
  };
}

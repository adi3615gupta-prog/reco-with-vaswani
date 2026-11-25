import { Decimal } from './decimal.ts';

export enum AssetClass {
  EQUITY_SHARES_LISTED = 'EQUITY_SHARES_LISTED', // STCG 111A, LTCG 112A
  EQUITY_ORIENTED_FUND = 'EQUITY_ORIENTED_FUND', // STCG 111A, LTCG 112A
  UNLISTED_SHARES = 'UNLISTED_SHARES',           // LTCG 112
  REAL_ESTATE = 'REAL_ESTATE',                   // Land, Building
  DEBT_MUTUAL_FUND = 'DEBT_MUTUAL_FUND',         // Always STCG (Sec 50AA)
  SLUMP_SALE_UNDERTAKING = 'SLUMP_SALE_UNDERTAKING', // Sec 50B
  OTHER_ASSET = 'OTHER_ASSET'
}

export enum TransferType {
  NORMAL_SALE = 'NORMAL_SALE',
  BUY_BACK = 'BUY_BACK', // Domestic company buy-back w.e.f 1 Oct 2024
  COMPULSORY_ACQUISITION = 'COMPULSORY_ACQUISITION',
  INSURANCE_CLAIM = 'INSURANCE_CLAIM'
}

export interface CapitalAssetRecord {
  id: string;
  assetClass: AssetClass;
  transferType: TransferType;
  
  // Dates
  acquisitionDate: string; // YYYY-MM-DD
  transferDate: string;    // YYYY-MM-DD
  
  // Values
  fullValueConsideration: number; // Sale price
  transferExpenses: number;
  costOfAcquisition: number;
  costOfImprovement: number;
  
  // Specific Overrides
  stampDutyValue?: number; // Sec 50C for Real Estate
  fmvOn31Jan2018?: number; // Grandfathering for 112A
  
  // For Exemptions
  investmentInNewResidentialHouse54?: number; // Sec 54 / 54F
  investmentInSpecifiedBonds54EC?: number;    // Sec 54EC
}

export interface ComputedCapitalGain {
  id: string;
  assetClass: AssetClass;
  isLongTerm: boolean;
  applicableSection: '111A' | '112A' | '112' | 'STCG_NORMAL';
  
  fullValueConsideration: Decimal;
  netConsideration: Decimal;
  costOfAcquisition: Decimal; // Indexed or Non-Indexed
  costOfImprovement: Decimal;
  
  grossCapitalGain: Decimal;
  exemption54: Decimal;
  exemption54EC: Decimal;
  exemption54F: Decimal;
  
  netTaxableGain: Decimal;
  computationNotes: string[];
}

export interface TotalCapitalGainsResult {
  assets: ComputedCapitalGain[];
  totalSTCGNormal: Decimal;
  totalSTCG111A: Decimal;
  totalLTCG112A: Decimal;
  totalLTCG112: Decimal;
  totalLossToCarryForward: Decimal;
  globalNotes: string[];
}

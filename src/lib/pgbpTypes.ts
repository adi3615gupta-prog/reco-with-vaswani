import { Decimal } from './decimal.ts';
import { EntityType, RegimeType } from './incomeTaxTypes.ts';

export enum PgbpSection {
  REGULAR = 'REGULAR',
  SEC_44AD = 'SEC_44AD',
  SEC_44ADA = 'SEC_44ADA',
  SEC_44AE = 'SEC_44AE'
}

export interface PresumptiveBusinessRecord {
  id: string;
  section: PgbpSection.SEC_44AD | PgbpSection.SEC_44ADA | PgbpSection.SEC_44AE;
  
  // For 44AD / 44ADA
  totalTurnoverOrReceipts: number;
  digitalTurnoverOrReceipts: number; // For 44AD 6% rate
  cashTurnoverOrReceipts: number;    // For 44AD 8% rate
  
  // For 44AE
  heavyGoodsVehiclesMonths: number; // total months of ownership across all heavy vehicles
  otherVehiclesMonths: number;      // total months of ownership across all other vehicles
  heavyVehiclesTonnage: number[];   // array of weights in tons for heavy vehicles
  
  // If assessee declared higher income
  declaredIncome?: number; 
}

export interface AssetBlock {
  blockId: string;
  assetClass: 'BUILDING' | 'FURNITURE' | 'PLANT_MACHINERY' | 'INTANGIBLE';
  depreciationRate: number; // e.g., 10, 15, 40
  
  openingWdv: number;
  
  // Additions
  additionsMoreThan180Days: number;
  additionsLessThan180Days: number;
  
  // Sales
  moneysPayableFromSales: number; // Sale price of assets transferred

  // For Additional Depreciation
  isEligibleForAdditionalDepreciation: boolean; 
  additionsMoreThan180DaysEligibleForAddlDep?: number;
  additionsLessThan180DaysEligibleForAddlDep?: number;
}

export interface RegularBusinessRecord {
  id: string;
  netProfitAsPerBooks: number;
  
  // Additions (Disallowances)
  depreciationAsPerBooks: number;
  incomeTaxPaidOrProvided: number;
  personalExpensesDebited: number;
  capitalExpenditureDebited: number;
  
  // Specific Disallowances
  cashPaymentsOver10k_40A3: number;
  unpaidTaxesDutyCess_43B: number;
  unpaidEmployerPF_43B: number;
  delayedPaymentsToMSME_43B: number;
  
  // Subtractions (Income credited to P&L but exempt or taxable under other heads)
  dividendIncomeCredited: number;
  agriculturalIncomeCredited: number;
  capitalGainsCredited: number;
  housePropertyRentCredited: number;
  incomeTaxRefundCredited: number;
  
  // Section 32 Tax Depreciation
  assetBlocks: AssetBlock[];
  
  // Deemed Incomes
  badDebtsRecovered_41_4: number;
  remissionOfTradingLiability_41_1: number;
}

export interface ComputedPgbpDetails {
  id: string;
  section: PgbpSection;
  computedIncome: Decimal;
  computationNotes: string[];
}

export interface TotalPgbpResult {
  businesses: ComputedPgbpDetails[];
  totalPgbpIncome: Decimal;
  totalLossToSetOff: Decimal;
  carriedForwardLoss: Decimal;
  globalNotes: string[];
}

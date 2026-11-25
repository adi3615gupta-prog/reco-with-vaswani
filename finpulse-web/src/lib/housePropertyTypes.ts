import { Decimal } from './decimal.ts';
import { EntityType, RegimeType } from './incomeTaxTypes.ts';

export enum PropertyType {
  SOP = 'SOP',   // Self-Occupied Property
  LOP = 'LOP',   // Let-Out Property
  DLOP = 'DLOP'  // Deemed Let-Out Property
}

export interface HousePropertyRecord {
  id: string;
  type: PropertyType;
  ownershipShare: number; // e.g., 50 for 50% co-owner

  // GAV Inputs (Annualized)
  municipalValue: number;
  fairRent: number;
  standardRent: number;
  actualRentReceived: number;
  unrealizedRent: number; // Must satisfy Rule 4
  vacancyMonths: number;

  // Deductions
  municipalTaxesPaid: number; // Must be paid by owner in PY
  interestOnLoan: number;
  preConstructionInterest: number; // 1/5th allowed per year

  // Loan Details
  loanTakenDate: string; // ISO Date e.g., '2020-05-15'
  loanPurpose: 'PURCHASE_CONSTRUCTION' | 'REPAIR_RENEWAL';
}

export interface HousePropertyComputation {
  id: string;
  finalType: PropertyType; // Will show DLOP if it was a 3rd SOP
  
  grossAnnualValue: Decimal;
  municipalTaxesDeducted: Decimal;
  netAnnualValue: Decimal;
  
  standardDeduction24a: Decimal;
  interestDeduction24b: Decimal;
  
  netIncome: Decimal;
  computationNotes: string[];
}

export interface TotalHousePropertyResult {
  properties: HousePropertyComputation[];
  totalIncome: Decimal;
  totalLossToSetOff: Decimal;
  carriedForwardLoss: Decimal;
  globalNotes: string[];
}

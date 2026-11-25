import { Decimal } from './decimal.ts';

export enum GiftPropertyType {
  MONEY = 'MONEY',
  MOVABLE_PROPERTY = 'MOVABLE_PROPERTY',
  IMMOVABLE_PROPERTY = 'IMMOVABLE_PROPERTY'
}

export interface GiftRecord {
  id: string;
  type: GiftPropertyType;
  
  // Amounts
  actualConsiderationPaid: number;
  fairMarketValue?: number; // For movable
  stampDutyValue?: number;  // For immovable
  
  // Exemptions
  isFromRelative: boolean;
  isOnOccasionOfMarriage: boolean;
  isUnderWillOrInheritance: boolean;
}

export interface LifeInsurancePolicyRecord {
  id: string;
  dateOfIssue: string; // YYYY-MM-DD
  annualPremium: number;
  sumAssured: number;
  maturityAmountReceived: number;
  deductionClaimed80C: number; // For the entire term
  receivedOnDeath: boolean; // Exempt if received on death
}

export interface IfosRecord {
  // General Incomes
  dividends: number;
  casualIncomeLotteries: number; // Taxable @ 30% without deduction
  familyPensionReceived: number;
  interestOnCompulsoryAcquisition: number;
  interestOnBankDeposits: number;
  interestOnIncomeTaxRefund: number;
  otherGeneralIncome: number;
  
  // Specific Collections
  gifts: GiftRecord[];
  lifeInsurancePolicies: LifeInsurancePolicyRecord[];
}

export interface ComputedIfosResult {
  totalIfosIncome: Decimal;
  casualIncome: Decimal; // Needs to be tracked separately for 30% special rate
  dividendIncome: Decimal;
  computationNotes: string[];
}

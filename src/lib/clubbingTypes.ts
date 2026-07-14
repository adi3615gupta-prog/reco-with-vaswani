import { Decimal } from './decimal.ts';
import { IncomeType } from './incomeTaxTypes.ts';

export enum ClubbingSourceCategory {
  MINOR_CHILD = 'MINOR_CHILD',
  SPOUSE_ASSET_TRANSFER = 'SPOUSE_ASSET_TRANSFER',
  SPOUSE_REMUNERATION = 'SPOUSE_REMUNERATION',
  SONS_WIFE = 'SONS_WIFE',
  HUF_TRANSFER = 'HUF_TRANSFER',
  REVOCABLE_TRANSFER = 'REVOCABLE_TRANSFER',
  INCOME_TRANSFER_WITHOUT_ASSET = 'INCOME_TRANSFER_WITHOUT_ASSET'
}

export interface ClubbingRecord {
  id: string;
  sourceCategory: ClubbingSourceCategory;
  incomeHead: IncomeType; // Important: Clubbed income retains its head of income
  
  grossAmount: number; // The computed income in the hands of the transferee
  
  // Specific to Minor Child
  minorChildId?: string; // To group multiple incomes of the same child for the 1500 exemption
  isFromManualWork?: boolean;
  isFromSkillOrTalent?: boolean;
  isMinorDisabled?: boolean;
  
  // Specific to Spouse Remuneration
  hasProfessionalQualification?: boolean;
}

export interface ComputedClubbingResult {
  id: string;
  sourceCategory: ClubbingSourceCategory;
  incomeHead: IncomeType;
  
  grossAmount: Decimal;
  exemptionAllowed: Decimal;
  netClubbedAmount: Decimal;
  
  computationNotes: string[];
}

export interface TotalClubbingAggregation {
  results: ComputedClubbingResult[];
  
  // Aggregated totals to be added to the taxpayer's main heads of income
  totalSalaryClubbed: Decimal;
  totalHousePropertyClubbed: Decimal;
  totalPgbpClubbed: Decimal;
  totalCapitalGainsClubbed: Decimal;
  totalIfosClubbed: Decimal;
  
  globalNotes: string[];
}

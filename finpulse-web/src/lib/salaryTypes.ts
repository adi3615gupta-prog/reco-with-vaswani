import { Decimal } from './decimal.ts';
import { RegimeType } from './incomeTaxTypes.ts';

export enum CityType {
  METRO = 'METRO', // Mumbai, Delhi, Chennai, Kolkata (50% HRA)
  NON_METRO = 'NON_METRO' // 40% HRA
}

export enum EmployeeType {
  GOVERNMENT = 'GOVERNMENT',
  NON_GOVT_POGA = 'NON_GOVT_POGA', // Covered under Payment of Gratuity Act
  NON_GOVT_NON_POGA = 'NON_GOVT_NON_POGA'
}

export enum AccommodationType {
  OWNED_BY_EMPLOYER = 'OWNED_BY_EMPLOYER',
  HIRED_BY_EMPLOYER = 'HIRED_BY_EMPLOYER',
  HOTEL = 'HOTEL'
}

export enum CarPurpose {
  FULLY_OFFICE = 'FULLY_OFFICE',
  FULLY_PERSONAL = 'FULLY_PERSONAL',
  PARTLY_OFFICE_PERSONAL = 'PARTLY_OFFICE_PERSONAL'
}

export interface SalaryProfile {
  employeeType: EmployeeType;
  cityType: CityType;
  /** Population of the city where accommodation is provided (in lakhs). e.g., 20 = 2 million */
  populationInLakhs?: number; 
  /** Months of completed service (for gratuity/leave) */
  completedYearsOfService?: number;
  /** Fraction of year in months (for POGA rounding) */
  fractionMonthsOfService?: number;
}

export interface RawSalaryComponents {
  // Core
  basicSalary: number;
  dearnessAllowance: number;
  /** True if DA forms part of retirement benefits */
  daFormsPart: boolean;
  commission: number;
  bonus: number;
  advanceSalary: number;
  arrearsSalary: number;

  // Allowances
  hraReceived: number;
  rentPaid: number;
  childrenEducationAllowance: number;
  childrenCount: number;
  transportAllowance: number;
  isHandicapped: boolean;

  // Retirement Benefits
  gratuityReceived: number;
  leaveSalaryReceived: number;
  /** Leave credit in days */
  leaveCreditDays: number;
  /** Average salary of last 10 months */
  avgSalaryLast10Months: number;
  uncommutedPension: number;
  commutedPension: number;
  totalPensionValue: number;

  // Deductions u/s 16
  professionalTaxPaid: number;
  entertainmentAllowanceReceived: number;

  // Perquisites
  rentFreeAccommodation?: {
    type: AccommodationType;
    rentPaidByEmployer?: number;
    amountRecoveredFromEmployee?: number;
    daysInHotel?: number;
  };
  motorCar?: {
    ownedBy: 'EMPLOYER' | 'EMPLOYEE';
    expensesPaidBy: 'EMPLOYER' | 'EMPLOYEE';
    purpose: CarPurpose;
    cubicCapacityExceeds1_6L: boolean;
    chauffeurProvided: boolean;
    amountRecoveredFromEmployee: number;
    costOfCar: number; // for fully personal
  };
}

export interface ComputedSalaryDetails {
  grossSalary: Decimal;
  exemptions: {
    hra: Decimal;
    gratuity: Decimal;
    leaveSalary: Decimal;
    commutedPension: Decimal;
    childrenEducation: Decimal;
    transport: Decimal;
  };
  perquisites: {
    rentFreeAccommodation: Decimal;
    motorCar: Decimal;
  };
  deductions: {
    standardDeduction: Decimal;
    professionalTax: Decimal;
    entertainmentAllowance: Decimal;
  };
  netTaxableSalary: Decimal;
  computationNotes: string[];
}

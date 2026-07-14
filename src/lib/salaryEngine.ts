import { D, Decimal, ZERO } from './decimal.ts';
import { RegimeType } from './incomeTaxTypes.ts';
import {
  SalaryProfile,
  RawSalaryComponents,
  ComputedSalaryDetails,
  CityType,
  EmployeeType,
  AccommodationType,
  CarPurpose
} from './salaryTypes.ts';

export function computeSalary(
  profile: SalaryProfile,
  raw: RawSalaryComponents,
  regime: RegimeType
): ComputedSalaryDetails {
  const notes: string[] = [];

  // Core Variables
  const basic = D(raw.basicSalary);
  const da = D(raw.dearnessAllowance);
  const daInTerms = raw.daFormsPart ? da : ZERO;
  const commission = D(raw.commission); // T/O commission
  const bdbacmSalary = basic.add(daInTerms).add(commission); // Basic + DA(T) + T/O Commission
  
  let grossSalary = basic.add(da).add(commission).add(D(raw.bonus)).add(D(raw.advanceSalary)).add(D(raw.arrearsSalary));

  // ─────────────────────────────────────────────────────────────
  // ALLOWANCES
  // ─────────────────────────────────────────────────────────────

  // HRA Exemption u/s 10(13A)
  let hraExempt = ZERO;
  const hraReceived = D(raw.hraReceived);
  if (hraReceived.gt(0) && regime === RegimeType.OLD) {
    const rentPaid = D(raw.rentPaid);
    const tenPercentSalary = bdbacmSalary.percent(10);
    const rentMinus10Percent = Decimal.max(rentPaid.sub(tenPercentSalary), ZERO);
    
    const salaryPercentLimit = profile.cityType === CityType.METRO ? bdbacmSalary.percent(50) : bdbacmSalary.percent(40);
    
    hraExempt = Decimal.min(hraReceived, rentMinus10Percent, salaryPercentLimit);
    notes.push(`HRA Exemption calculated as ${hraExempt.toFixed(2)} based on ${profile.cityType} limit.`);
  } else if (regime === RegimeType.NEW && hraReceived.gt(0)) {
    notes.push('HRA Exemption disallowed under New Tax Regime (Section 115BAC).');
  }

  const taxableHRA = Decimal.max(hraReceived.sub(hraExempt), ZERO);
  grossSalary = grossSalary.add(taxableHRA);

  // Other Allowances
  let childrenEdExempt = ZERO;
  if (regime === RegimeType.OLD && raw.childrenEducationAllowance > 0) {
    const maxChildren = Math.min(raw.childrenCount, 2);
    childrenEdExempt = D(Math.min(raw.childrenEducationAllowance, 100 * 12 * maxChildren));
  }
  const taxableChildrenEd = Decimal.max(D(raw.childrenEducationAllowance).sub(childrenEdExempt), ZERO);
  grossSalary = grossSalary.add(taxableChildrenEd);

  let transportExempt = ZERO;
  if (raw.isHandicapped && raw.transportAllowance > 0) {
    // ₹3200 p.m. allowed for blind/deaf/dumb/handicapped even in new regime
    transportExempt = D(Math.min(raw.transportAllowance, 3200 * 12));
  }
  const taxableTransport = Decimal.max(D(raw.transportAllowance).sub(transportExempt), ZERO);
  grossSalary = grossSalary.add(taxableTransport);

  // ─────────────────────────────────────────────────────────────
  // RETIREMENT BENEFITS
  // ─────────────────────────────────────────────────────────────

  // Gratuity u/s 10(10)
  let gratuityExempt = ZERO;
  const gratuityReceived = D(raw.gratuityReceived);
  if (gratuityReceived.gt(0)) {
    if (profile.employeeType === EmployeeType.GOVERNMENT) {
      gratuityExempt = gratuityReceived; // Fully exempt
    } else if (profile.employeeType === EmployeeType.NON_GOVT_POGA) {
      const completedYears = D(profile.completedYearsOfService || 0);
      const fractions = profile.fractionMonthsOfService || 0;
      const roundingYears = fractions > 6 ? completedYears.add(1) : completedYears;
      
      const latestSalary = basic.add(da); // Last drawn Basic + DA
      const limit1 = D(2000000); // 20 Lakhs
      const limit2 = latestSalary.mul(15).div(26).mul(roundingYears);
      gratuityExempt = Decimal.min(limit1, limit2, gratuityReceived);
    } else {
      // NON-POGA
      const avgSalary = D(raw.avgSalaryLast10Months); // Last 10 months avg
      const completedYears = D(profile.completedYearsOfService || 0); // fractions ignored
      
      const limit1 = D(2000000); // 20 Lakhs
      const limit2 = avgSalary.div(2).mul(completedYears);
      gratuityExempt = Decimal.min(limit1, limit2, gratuityReceived);
    }
  }
  // Leave Salary u/s 10(10AA)
  let leaveExempt = ZERO;
  const leaveReceived = D(raw.leaveSalaryReceived);
  if (leaveReceived.gt(0)) {
    if (profile.employeeType === EmployeeType.GOVERNMENT) {
      leaveExempt = leaveReceived;
    } else {
      const avgSalary = D(raw.avgSalaryLast10Months);
      const leaveCreditMonths = D(raw.leaveCreditDays).div(30);
      const limit1 = D(2500000); // Max 25 lakhs
      const limit2 = leaveCreditMonths.mul(avgSalary);
      const limit3 = avgSalary.mul(10);
      leaveExempt = Decimal.min(limit1, limit2, limit3, leaveReceived);
    }
  }
  const taxableLeave = Decimal.max(leaveReceived.sub(leaveExempt), ZERO);
  grossSalary = grossSalary.add(taxableLeave);

  // Pension u/s 10(10A)
  const uncommutedPension = D(raw.uncommutedPension);
  grossSalary = grossSalary.add(uncommutedPension); // Fully taxable

  let commutedPensionExempt = ZERO;
  const commutedReceived = D(raw.commutedPension);
  if (commutedReceived.gt(0)) {
    if (profile.employeeType === EmployeeType.GOVERNMENT) {
      commutedPensionExempt = commutedReceived;
    } else {
      const totalPensionValue = D(raw.totalPensionValue);
      if (raw.gratuityReceived > 0) {
        commutedPensionExempt = totalPensionValue.div(3);
      } else {
        commutedPensionExempt = totalPensionValue.div(2);
      }
      commutedPensionExempt = Decimal.min(commutedPensionExempt, commutedReceived);
    }
  }
  const taxableCommutedPension = Decimal.max(commutedReceived.sub(commutedPensionExempt), ZERO);
  grossSalary = grossSalary.add(taxableCommutedPension);

  // ─────────────────────────────────────────────────────────────
  // PERQUISITES (Section 17)
  // ─────────────────────────────────────────────────────────────

  // Rent Free Accommodation
  let rfaTaxable = ZERO;
  if (raw.rentFreeAccommodation) {
    const { type, rentPaidByEmployer, amountRecoveredFromEmployee, daysInHotel } = raw.rentFreeAccommodation;
    const rfaSalary = bdbacmSalary.add(D(raw.bonus)).add(taxableChildrenEd).add(taxableTransport); // Basic + DA(T) + Bonus + Commission + Taxable Allowances
    
    if (type === AccommodationType.OWNED_BY_EMPLOYER) {
      if (profile.employeeType === EmployeeType.GOVERNMENT) {
        // Government: Licence fee
        rfaTaxable = D(0); // Assuming 0 if not provided
      } else {
        const pop = profile.populationInLakhs || 0;
        let rate = 7.5; // >15 Lakhs up to 40 Lakhs
        if (pop <= 15) rate = 5;
        if (pop > 40) rate = 10;
        rfaTaxable = rfaSalary.percent(rate);
      }
    } else if (type === AccommodationType.HIRED_BY_EMPLOYER) {
      const fifteenPercent = rfaSalary.percent(10); // Hired by employer: 10% of salary
      const rentPaid = D(rentPaidByEmployer || 0);
      rfaTaxable = Decimal.min(fifteenPercent, rentPaid);
    } else if (type === AccommodationType.HOTEL) {
      if ((daysInHotel || 0) <= 15) {
        rfaTaxable = ZERO;
      } else {
        const twentyFourPercent = rfaSalary.percent(24);
        const rentPaid = D(rentPaidByEmployer || 0);
        rfaTaxable = Decimal.min(twentyFourPercent, rentPaid);
      }
    }
    
    const recovered = D(amountRecoveredFromEmployee || 0);
    rfaTaxable = Decimal.max(rfaTaxable.sub(recovered), ZERO);
    grossSalary = grossSalary.add(rfaTaxable);
  }

  // Motor Car
  let motorCarTaxable = ZERO;
  if (raw.motorCar) {
    const { ownedBy, expensesPaidBy, purpose, cubicCapacityExceeds1_6L, chauffeurProvided, amountRecoveredFromEmployee, costOfCar } = raw.motorCar;
    
    if (purpose === CarPurpose.FULLY_OFFICE) {
      motorCarTaxable = ZERO;
    } else if (purpose === CarPurpose.FULLY_PERSONAL) {
      const runningExps = expensesPaidBy === 'EMPLOYER' ? D(0) : D(0); // If Employer pays, add actuals
      const driverExps = chauffeurProvided ? D(900 * 12) : D(0); // Assuming 900pm for driver
      const wearTear = ownedBy === 'EMPLOYER' ? D(costOfCar).percent(10) : D(0);
      motorCarTaxable = runningExps.add(driverExps).add(wearTear).sub(D(amountRecoveredFromEmployee));
    } else if (purpose === CarPurpose.PARTLY_OFFICE_PERSONAL) {
      if (ownedBy === 'EMPLOYER' && expensesPaidBy === 'EMPLOYER') {
        const val = cubicCapacityExceeds1_6L ? 2400 : 1800;
        motorCarTaxable = D(val * 12);
      } else if (ownedBy === 'EMPLOYER' && expensesPaidBy === 'EMPLOYEE') {
        const val = cubicCapacityExceeds1_6L ? 900 : 600;
        motorCarTaxable = D(val * 12);
      } else if (ownedBy === 'EMPLOYEE' && expensesPaidBy === 'EMPLOYER') {
        // Actual expenses minus 1800/2400 pm. 
        // Need actual expenses from employer which we don't have in this simplified model.
        motorCarTaxable = ZERO; 
      }
      
      if (chauffeurProvided && ownedBy === 'EMPLOYER') {
        motorCarTaxable = motorCarTaxable.add(D(900 * 12));
      }
    }
    grossSalary = grossSalary.add(motorCarTaxable);
  }

  // ─────────────────────────────────────────────────────────────
  // DEDUCTIONS U/S 16
  // ─────────────────────────────────────────────────────────────
  let standardDeduction = ZERO;
  if (grossSalary.gt(0)) {
    standardDeduction = Decimal.min(grossSalary, regime === RegimeType.NEW ? D(75000) : D(50000));
  }

  let professionalTax = ZERO;
  if (regime === RegimeType.OLD && raw.professionalTaxPaid > 0) {
    professionalTax = Decimal.min(grossSalary.sub(standardDeduction), D(raw.professionalTaxPaid));
  }

  let entertainmentAllowance = ZERO; // only govt employees in old regime
  if (regime === RegimeType.OLD && profile.employeeType === EmployeeType.GOVERNMENT && raw.entertainmentAllowanceReceived > 0) {
    const limit1 = D(5000);
    const limit2 = basic.percent(20);
    entertainmentAllowance = Decimal.min(limit1, limit2, D(raw.entertainmentAllowanceReceived));
  }

  const netTaxableSalary = Decimal.max(grossSalary.sub(standardDeduction).sub(professionalTax).sub(entertainmentAllowance), ZERO);

  return {
    grossSalary,
    exemptions: {
      hra: hraExempt,
      gratuity: gratuityExempt,
      leaveSalary: leaveExempt,
      commutedPension: commutedPensionExempt,
      childrenEducation: childrenEdExempt,
      transport: transportExempt,
    },
    perquisites: {
      rentFreeAccommodation: rfaTaxable,
      motorCar: motorCarTaxable,
    },
    deductions: {
      standardDeduction,
      professionalTax,
      entertainmentAllowance,
    },
    netTaxableSalary,
    computationNotes: notes
  };
}

// ============================================================
// Financial Statements Module — Corporate Tax & Deferred Tax Engine
// Section 115BAA (22%), Regular Regime (25%/30%), MAT u/s 115JB
// ============================================================

export interface CorporateTaxInputs {
  profitBeforeTax: number;
  bookDepreciation: number;
  taxDepreciation: number;
  disallowanceSec37: number; // Penalties, fines, CSR
  disallowanceSec40a: number; // 30% TDS default
  disallowanceSec43b: number; // Unpaid statutory liabilities
  deductionsBroughtForwardLosses: number;
  turnoverPrecedingYear: number;
  chosenRegime: '115BAA' | '115BAB' | 'REGULAR';
}

export interface CorporateTaxResult {
  pgbpIncome: number;
  regularTax: {
    baseRate: number;
    baseTax: number;
    surchargeRate: number;
    surchargeAmount: number;
    cessAmount: number;
    totalTaxLiability: number;
    effectiveRate: number;
  };
  matTax?: {
    bookProfit: number;
    matRate: number;
    matTaxAmount: number;
    matCreditAvailable: number;
    isMatPayable: boolean;
  };
  deferredTax: {
    timingDifferenceDepreciation: number;
    timingDifference43B: number;
    totalTimingDifference: number;
    taxRate: number;
    deferredTaxAssetOrLiability: 'DTA' | 'DTL';
    deferredTaxAmount: number;
  };
  finalPayableTax: number;
}

export function computeCorporateTax(inputs: CorporateTaxInputs): CorporateTaxResult {
  const {
    profitBeforeTax,
    bookDepreciation,
    taxDepreciation,
    disallowanceSec37,
    disallowanceSec40a,
    disallowanceSec43b,
    deductionsBroughtForwardLosses,
    turnoverPrecedingYear,
    chosenRegime,
  } = inputs;

  // 1. PGBP Computation
  const taxableAdditions = bookDepreciation + disallowanceSec37 + disallowanceSec40a + disallowanceSec43b;
  const taxableDeductions = taxDepreciation + deductionsBroughtForwardLosses;
  const pgbpIncome = Math.max(0, Math.round((profitBeforeTax + taxableAdditions - taxableDeductions) * 100) / 100);

  // 2. Regime Rates & Surcharge
  let baseRate = 0.25;
  let surchargeRate = 0;

  if (chosenRegime === '115BAA') {
    baseRate = 0.22;
    surchargeRate = 0.10; // Flat 10% under 115BAA
  } else if (chosenRegime === '115BAB') {
    baseRate = 0.15;
    surchargeRate = 0.10;
  } else {
    // Regular Regime
    baseRate = turnoverPrecedingYear < 4000000000 ? 0.25 : 0.30; // 25% if turnover < 400 Cr
    if (pgbpIncome > 100000000) {
      surchargeRate = 0.12; // > 10 Cr
    } else if (pgbpIncome > 10000000) {
      surchargeRate = 0.07; // > 1 Cr
    } else {
      surchargeRate = 0;
    }
  }

  const baseTax = Math.round(pgbpIncome * baseRate * 100) / 100;
  const surchargeAmount = Math.round(baseTax * surchargeRate * 100) / 100;
  const cessAmount = Math.round((baseTax + surchargeAmount) * 0.04 * 100) / 100;
  const totalTaxLiability = Math.round((baseTax + surchargeAmount + cessAmount) * 100) / 100;
  const effectiveRate = pgbpIncome > 0 ? Math.round((totalTaxLiability / pgbpIncome) * 10000) / 100 : baseRate * 104;

  // 3. MAT Calculation u/s 115JB (Not applicable under 115BAA/115BAB)
  let matTax: CorporateTaxResult['matTax'];
  let finalPayable = totalTaxLiability;

  if (chosenRegime === 'REGULAR') {
    const bookProfit = Math.max(0, profitBeforeTax);
    const matBaseRate = 0.15;
    let matSurcharge = 0;
    if (bookProfit > 100000000) matSurcharge = 0.12;
    else if (bookProfit > 10000000) matSurcharge = 0.07;

    const matBase = bookProfit * matBaseRate;
    const matSurch = matBase * matSurcharge;
    const matCess = (matBase + matSurch) * 0.04;
    const totalMat = Math.round((matBase + matSurch + matCess) * 100) / 100;

    const isMatHigher = totalMat > totalTaxLiability;
    finalPayable = Math.max(totalTaxLiability, totalMat);

    matTax = {
      bookProfit,
      matRate: matBaseRate * 100,
      matTaxAmount: totalMat,
      matCreditAvailable: isMatHigher ? 0 : Math.round((totalTaxLiability - totalMat) * 100) / 100,
      isMatPayable: isMatHigher,
    };
  }

  // 4. Deferred Tax Calculation
  // Timing difference: Book Dep - Tax Dep
  const timingDiffDep = Math.round((bookDepreciation - taxDepreciation) * 100) / 100;
  const timingDiff43b = disallowanceSec43b;
  const totalTimingDiff = Math.round((timingDiffDep + timingDiff43b) * 100) / 100;

  // If Book Dep > Tax Dep (or disallowance added back): DTA (tax paid earlier)
  // If Tax Dep > Book Dep: DTL (tax deferred to future)
  const isDta = totalTimingDiff > 0;
  const applicableTaxRate = chosenRegime === '115BAA' ? 0.25168 : baseRate * 1.04;
  const deferredTaxAmount = Math.round(Math.abs(totalTimingDiff) * applicableTaxRate * 100) / 100;

  return {
    pgbpIncome,
    regularTax: {
      baseRate: baseRate * 100,
      baseTax,
      surchargeRate: surchargeRate * 100,
      surchargeAmount,
      cessAmount,
      totalTaxLiability,
      effectiveRate,
    },
    matTax,
    deferredTax: {
      timingDifferenceDepreciation: timingDiffDep,
      timingDifference43B: timingDiff43b,
      totalTimingDifference: totalTimingDiff,
      taxRate: Math.round(applicableTaxRate * 10000) / 100,
      deferredTaxAssetOrLiability: isDta ? 'DTA' : 'DTL',
      deferredTaxAmount,
    },
    finalPayableTax: finalPayable,
  };
}

export function computeCorporateTaxPlan(params: {
  pbt: number;
  depreciationAsPerBooks?: number;
  depreciationAsPerItAct?: number;
  disallowances40a?: number;
  disallowances43b?: number;
  turnover?: number;
}) {
  const pbt = params.pbt || 0;
  const bookDep = params.depreciationAsPerBooks || 0;
  const taxDep = params.depreciationAsPerItAct || 0;
  const disallow40a = params.disallowances40a || 0;
  const disallow43b = params.disallowances43b || 0;
  const turnover = params.turnover || 0;

  const res115BAA = computeCorporateTax({
    profitBeforeTax: pbt,
    bookDepreciation: bookDep,
    taxDepreciation: taxDep,
    disallowanceSec37: 0,
    disallowanceSec40a: disallow40a,
    disallowanceSec43b: disallow43b,
    deductionsBroughtForwardLosses: 0,
    turnoverPrecedingYear: turnover,
    chosenRegime: '115BAA',
  });

  const resRegular = computeCorporateTax({
    profitBeforeTax: pbt,
    bookDepreciation: bookDep,
    taxDepreciation: taxDep,
    disallowanceSec37: 0,
    disallowanceSec40a: disallow40a,
    disallowanceSec43b: disallow43b,
    deductionsBroughtForwardLosses: 0,
    turnoverPrecedingYear: turnover,
    chosenRegime: 'REGULAR',
  });

  return {
    sec115BAA: {
      totalTax: res115BAA.finalPayableTax,
      effectiveRatePercent: res115BAA.regularTax.effectiveRate,
    },
    regularRegime: {
      totalTax: resRegular.finalPayableTax,
      effectiveRatePercent: resRegular.regularTax.effectiveRate,
    },
    mat115JB: {
      matRatePercent: 17.472,
      matTaxAmount: resRegular.matTax?.matTaxAmount || 0,
    },
    recommendedRegime: res115BAA.finalPayableTax <= resRegular.finalPayableTax ? '115BAA' : 'REGULAR',
    deferredTaxImpact: res115BAA.deferredTax,
  };
}


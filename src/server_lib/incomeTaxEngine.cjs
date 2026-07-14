var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/incomeTaxEngine.ts
var incomeTaxEngine_exports = {};
__export(incomeTaxEngine_exports, {
  calculateTaxLiability: () => calculateTaxLiability,
  compareRegimes: () => compareRegimes
});
module.exports = __toCommonJS(incomeTaxEngine_exports);

// src/lib/decimal.ts
var INTERNAL_PRECISION = 4;
var SCALE = BigInt(10 ** INTERNAL_PRECISION);
function toBigInt(value) {
  if (value instanceof Decimal) {
    return value._value;
  }
  if (typeof value === "bigint") {
    return value * SCALE;
  }
  const str = String(value).trim();
  if (str === "" || str === "NaN" || str === "Infinity" || str === "-Infinity") {
    return 0n;
  }
  const negative = str.startsWith("-");
  const abs = negative ? str.slice(1) : str;
  const parts = abs.split(".");
  const intPart = parts[0] || "0";
  let fracPart = parts[1] || "";
  if (fracPart.length > INTERNAL_PRECISION) {
    const roundDigit = parseInt(fracPart[INTERNAL_PRECISION], 10);
    fracPart = fracPart.slice(0, INTERNAL_PRECISION);
    if (roundDigit >= 5) {
      const fracNum = BigInt(fracPart) + 1n;
      if (fracNum >= SCALE) {
        const intNum = BigInt(intPart) + 1n;
        const result = intNum * SCALE;
        return negative ? -result : result;
      }
      fracPart = fracNum.toString().padStart(INTERNAL_PRECISION, "0");
    }
  } else {
    fracPart = fracPart.padEnd(INTERNAL_PRECISION, "0");
  }
  const combined = BigInt(intPart) * SCALE + BigInt(fracPart);
  return negative ? -combined : combined;
}
var Decimal = class _Decimal {
  /** @internal Scaled BigInt value (actual × 10^INTERNAL_PRECISION) */
  _value;
  constructor(value) {
    if (value instanceof _Decimal) {
      this._value = value._value;
    } else if (typeof value === "bigint") {
      this._value = value;
    } else {
      this._value = toBigInt(value);
    }
  }
  // ── Factory ──────────────────────────────────────────────
  /** Create from a raw scaled BigInt (internal use) */
  static _fromRaw(raw) {
    const d = Object.create(_Decimal.prototype);
    d._value = raw;
    return d;
  }
  static ZERO = _Decimal._fromRaw(0n);
  // ── Arithmetic ───────────────────────────────────────────
  add(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return _Decimal._fromRaw(this._value + o);
  }
  sub(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return _Decimal._fromRaw(this._value - o);
  }
  mul(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    const raw = this._value * o / SCALE;
    return _Decimal._fromRaw(raw);
  }
  div(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    if (o === 0n) {
      throw new Error("Decimal division by zero");
    }
    const raw = this._value * SCALE / o;
    return _Decimal._fromRaw(raw);
  }
  /** Negate */
  neg() {
    return _Decimal._fromRaw(-this._value);
  }
  /** Absolute value */
  abs() {
    return _Decimal._fromRaw(this._value < 0n ? -this._value : this._value);
  }
  /** Returns the percentage: this * (percent / 100) */
  percent(rate) {
    return this.mul(rate).div(100);
  }
  /** Floor to nearest integer (towards zero) */
  floor() {
    const truncated = this._value / SCALE * SCALE;
    if (this._value < 0n && truncated !== this._value) {
      return _Decimal._fromRaw(truncated - SCALE);
    }
    return _Decimal._fromRaw(truncated);
  }
  /** Round to nearest integer */
  roundToInt() {
    const half = SCALE / 2n;
    if (this._value >= 0n) {
      return _Decimal._fromRaw((this._value + half) / SCALE * SCALE);
    } else {
      return _Decimal._fromRaw((this._value - half) / SCALE * SCALE);
    }
  }
  // ── Comparison ───────────────────────────────────────────
  gt(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return this._value > o;
  }
  gte(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return this._value >= o;
  }
  lt(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return this._value < o;
  }
  lte(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return this._value <= o;
  }
  eq(other) {
    const o = other instanceof _Decimal ? other._value : toBigInt(other);
    return this._value === o;
  }
  isZero() {
    return this._value === 0n;
  }
  isNegative() {
    return this._value < 0n;
  }
  isPositive() {
    return this._value > 0n;
  }
  // ── Static helpers ───────────────────────────────────────
  static max(...values) {
    let result = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i]._value > result._value) result = values[i];
    }
    return result;
  }
  static min(...values) {
    let result = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i]._value < result._value) result = values[i];
    }
    return result;
  }
  /** Clamp value to be at least `floor` (typically 0) */
  clampMin(floor) {
    const f = floor instanceof _Decimal ? floor._value : toBigInt(floor);
    return this._value < f ? _Decimal._fromRaw(f) : this;
  }
  // ── Output ───────────────────────────────────────────────
  toNumber() {
    const intPart = this._value / SCALE;
    const fracPart = this._value % SCALE;
    const sign = this._value < 0n ? -1 : 1;
    const absInt = intPart < 0n ? -intPart : intPart;
    const absFrac = fracPart < 0n ? -fracPart : fracPart;
    return sign * (Number(absInt) + Number(absFrac) / Number(SCALE));
  }
  toFixed(decimals = 2) {
    const negative = this._value < 0n;
    const abs = negative ? -this._value : this._value;
    const intPart = abs / SCALE;
    const fracPart = abs % SCALE;
    const fracStr = fracPart.toString().padStart(INTERNAL_PRECISION, "0");
    let outputFrac;
    if (decimals <= 0) {
      outputFrac = "";
    } else if (decimals >= INTERNAL_PRECISION) {
      outputFrac = fracStr.padEnd(decimals, "0");
    } else {
      const roundDigit = parseInt(fracStr[decimals], 10);
      let truncated = fracStr.slice(0, decimals);
      if (roundDigit >= 5) {
        const incremented = (parseInt(truncated, 10) + 1).toString().padStart(decimals, "0");
        if (incremented.length > decimals) {
          const newInt = intPart + 1n;
          const prefix2 = negative ? "-" : "";
          return `${prefix2}${newInt}.${"0".repeat(decimals)}`;
        }
        truncated = incremented;
      }
      outputFrac = truncated;
    }
    const prefix = negative ? "-" : "";
    if (outputFrac) {
      return `${prefix}${intPart}.${outputFrac}`;
    }
    return `${prefix}${intPart}`;
  }
  toString() {
    return this.toFixed(2);
  }
  /** Format as Indian currency string (e.g., "₹12,34,567.00") */
  toINR() {
    const num = this.toFixed(2);
    const [intPart, fracPart] = num.split(".");
    const negative = intPart.startsWith("-");
    const absInt = negative ? intPart.slice(1) : intPart;
    let formatted;
    if (absInt.length <= 3) {
      formatted = absInt;
    } else {
      const last3 = absInt.slice(-3);
      const remaining = absInt.slice(0, -3);
      const groups = [];
      for (let i = remaining.length; i > 0; i -= 2) {
        const start = Math.max(0, i - 2);
        groups.unshift(remaining.slice(start, i));
      }
      formatted = groups.join(",") + "," + last3;
    }
    const prefix = negative ? "-\u20B9" : "\u20B9";
    return `${prefix}${formatted}.${fracPart}`;
  }
};
function D(value) {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}
var ZERO = Decimal.ZERO;

// src/lib/incomeTaxTypes.ts
var IncomeType = {
  SALARY: "SALARY",
  HOUSE_PROPERTY: "HOUSE_PROPERTY",
  BUSINESS: "BUSINESS",
  CAPITAL_GAINS: "CAPITAL_GAINS",
  OTHER_SOURCES: "OTHER_SOURCES",
  STCG_111A: "STCG_111A",
  LTCG_112A: "LTCG_112A",
  LTCG_112: "LTCG_112",
  CASUAL_INCOME: "CASUAL_INCOME"
};
var RegimeType = {
  OLD: "OLD",
  NEW: "NEW"
};
var AgeCategory = {
  NORMAL: "NORMAL",
  SENIOR: "SENIOR",
  SUPER_SENIOR: "SUPER_SENIOR"
};

// src/lib/taxSlabData.ts
var ruleId = 0;
function makeRule(regime, age, lower, upper, rate, fy) {
  ruleId++;
  return {
    id: `SLAB_${ruleId}`,
    regime_type: regime,
    age_category: age,
    lower_limit: lower,
    upper_limit: upper,
    rate_percent: rate,
    financial_year: fy
  };
}
function getAllTaxBracketRules(fy) {
  ruleId = 0;
  const rules = [];
  for (const age of [AgeCategory.NORMAL, AgeCategory.SENIOR, AgeCategory.SUPER_SENIOR]) {
    rules.push(
      makeRule(RegimeType.NEW, age, 0, 4e5, 0, fy),
      makeRule(RegimeType.NEW, age, 400001, 8e5, 5, fy),
      makeRule(RegimeType.NEW, age, 800001, 12e5, 10, fy),
      makeRule(RegimeType.NEW, age, 1200001, 16e5, 15, fy),
      makeRule(RegimeType.NEW, age, 1600001, 2e6, 20, fy),
      makeRule(RegimeType.NEW, age, 2000001, 24e5, 25, fy),
      makeRule(RegimeType.NEW, age, 2400001, Infinity, 30, fy)
    );
  }
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 0, 25e4, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 250001, 5e5, 5, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 1000001, Infinity, 30, fy)
  );
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 0, 3e5, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 300001, 5e5, 5, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 1000001, Infinity, 30, fy)
  );
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 0, 5e5, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 1000001, Infinity, 30, fy)
  );
  return rules;
}
var DEDUCTION_LIMITS = [
  // ── Standard Deduction from Salary (Sec 16(ia)) ──────────
  {
    sectionCode: "16ia",
    maxLimit: 75e3,
    description: "Standard Deduction from Salary Income",
    allowedInNewRegime: true,
    aggregateGroup: null
  },
  // ── Section 80C / 80CCC / 80CCD(1) — Aggregate cap ₹1.5L ─
  {
    sectionCode: "80C",
    maxLimit: 15e4,
    description: "Life Insurance, PPF, ELSS, Tuition Fees, etc.",
    allowedInNewRegime: false,
    aggregateGroup: "80C_AGGREGATE"
  },
  {
    sectionCode: "80CCC",
    maxLimit: 15e4,
    description: "Pension Fund Contribution",
    allowedInNewRegime: false,
    aggregateGroup: "80C_AGGREGATE"
  },
  {
    sectionCode: "80CCD1",
    maxLimit: 15e4,
    description: "Employee NPS Contribution (own, within 80C limit)",
    allowedInNewRegime: false,
    aggregateGroup: "80C_AGGREGATE"
  },
  // ── Section 80CCD(1B) — Additional NPS ₹50,000 ───────────
  {
    sectionCode: "80CCD1B",
    maxLimit: 5e4,
    description: "Additional NPS Contribution (over 80C limit)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80CCD(2) — Employer NPS (no cap, 14% of salary) ─
  {
    sectionCode: "80CCD2",
    maxLimit: Infinity,
    description: "Employer NPS Contribution (up to 14% of salary)",
    allowedInNewRegime: true,
    // ✅ Allowed in New Regime
    aggregateGroup: null
  },
  // ── Section 80D — Medical Insurance ───────────────────────
  {
    sectionCode: "80D",
    maxLimit: 1e5,
    description: "Medical Insurance Premium (self + family + parents)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80DD — Disabled Dependent ─────────────────────
  {
    sectionCode: "80DD",
    maxLimit: 125e3,
    description: "Maintenance of Disabled Dependent (\u20B975K/\u20B91.25L)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80DDB — Medical Treatment ─────────────────────
  {
    sectionCode: "80DDB",
    maxLimit: 1e5,
    description: "Medical Treatment of Specified Diseases",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80E — Education Loan Interest ─────────────────
  {
    sectionCode: "80E",
    maxLimit: Infinity,
    description: "Interest on Education Loan (no cap, 8 AYs)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80EEA — Interest on Housing Loan (Affordable) ─
  {
    sectionCode: "80EEA",
    maxLimit: 15e4,
    description: "Interest on Housing Loan for Affordable Housing",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80G — Donations ───────────────────────────────
  {
    sectionCode: "80G",
    maxLimit: Infinity,
    description: "Donations to Charitable Institutions (various limits)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80GG — Rent Paid (no HRA) ─────────────────────
  {
    sectionCode: "80GG",
    maxLimit: 6e4,
    description: "Rent Paid (when no HRA received) \u2014 \u20B95,000/month",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80TTA — Savings Interest (non-senior) ─────────
  {
    sectionCode: "80TTA",
    maxLimit: 1e4,
    description: "Interest on Savings Account (non-senior citizens)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80TTB — Interest Income (senior citizens) ─────
  {
    sectionCode: "80TTB",
    maxLimit: 5e4,
    description: "Interest on Deposits (senior citizens only)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 80U — Person with Disability ──────────────────
  {
    sectionCode: "80U",
    maxLimit: 125e3,
    description: "Person with Disability (\u20B975K/\u20B91.25L)",
    allowedInNewRegime: false,
    aggregateGroup: null
  },
  // ── Section 24(b) — Interest on Housing Loan (Self-Occupied) ─
  {
    sectionCode: "24b",
    maxLimit: 2e5,
    description: "Interest on Housing Loan for Self-Occupied Property",
    allowedInNewRegime: false,
    // ❌ NOT allowed in New Regime
    aggregateGroup: null
  }
];
var SURCHARGE_BRACKETS_OLD = [
  { incomeThreshold: 5e7, rate: 37 },
  { incomeThreshold: 2e7, rate: 25 },
  { incomeThreshold: 1e7, rate: 15 },
  { incomeThreshold: 5e6, rate: 10 }
];
var SURCHARGE_BRACKETS_NEW = [
  { incomeThreshold: 2e7, rate: 25 },
  { incomeThreshold: 1e7, rate: 15 },
  { incomeThreshold: 5e6, rate: 10 }
];
var SPECIAL_INCOME_SURCHARGE_CAP = 15;
var REBATE_87A_NEW = {
  incomeThreshold: 12e5,
  maxRebate: 6e4
};
var REBATE_87A_OLD = {
  incomeThreshold: 5e5,
  maxRebate: 12500
};
var SPECIAL_RATES = {
  /** STCG u/s 111A — 20% from FY 2024-25 onward (Budget 2024) */
  STCG_111A: 20,
  /** LTCG u/s 112A — 12.5% on amount exceeding exemption */
  LTCG_112A: 12.5,
  /** LTCG u/s 112A exemption threshold */
  LTCG_112A_EXEMPTION: 125e3,
  /** LTCG u/s 112 — 12.5% (without indexation, FY 2025-26 default) */
  LTCG_112_WITHOUT_INDEXATION: 12.5,
  /** LTCG u/s 112 — 20% (with indexation, only for pre-23-Jul-2024 assets) */
  LTCG_112_WITH_INDEXATION: 20,
  /** Casual Income (Lottery, Crypto u/s 115BBH, Game Shows) — 30% flat */
  CASUAL_INCOME: 30
};
var HEC_RATE = 4;
var AGGREGATE_CAPS = {
  "80C_AGGREGATE": 15e4
};

// src/lib/incomeTaxEngine.ts
var ENGINE_VERSION = "1.0.0";
function resolveAgeCategory(age) {
  if (age >= 80) return AgeCategory.SUPER_SENIOR;
  if (age >= 60) return AgeCategory.SENIOR;
  return AgeCategory.NORMAL;
}
function aggregateIncome(incomeRecords) {
  const warnings = [];
  let salary = ZERO;
  let houseProperty = ZERO;
  let business = ZERO;
  let capitalGains = ZERO;
  let otherSources = ZERO;
  let stcg111A = ZERO;
  let ltcg112A = ZERO;
  let ltcg112 = ZERO;
  let casualIncome = ZERO;
  const ltcg112Details = [];
  for (const record of incomeRecords) {
    const netAmt = D(record.net_amount);
    switch (record.income_type) {
      case IncomeType.SALARY:
        salary = salary.add(netAmt);
        break;
      case IncomeType.HOUSE_PROPERTY:
        houseProperty = houseProperty.add(netAmt);
        break;
      case IncomeType.BUSINESS:
        business = business.add(netAmt);
        break;
      case IncomeType.CAPITAL_GAINS:
        capitalGains = capitalGains.add(netAmt);
        break;
      case IncomeType.OTHER_SOURCES:
        otherSources = otherSources.add(netAmt);
        break;
      case IncomeType.STCG_111A:
        stcg111A = stcg111A.add(netAmt);
        break;
      case IncomeType.LTCG_112A:
        ltcg112A = ltcg112A.add(netAmt);
        break;
      case IncomeType.LTCG_112:
        ltcg112 = ltcg112.add(netAmt);
        ltcg112Details.push({
          amount: netAmt,
          useIndexation: record.use_indexation === true
        });
        break;
      case IncomeType.CASUAL_INCOME:
        casualIncome = casualIncome.add(netAmt);
        break;
      default:
        warnings.push(`Unknown income type "${record.income_type}" for record ${record.id}. Treated as Other Sources.`);
        otherSources = otherSources.add(netAmt);
    }
  }
  if (houseProperty.isNegative()) {
    const maxHPLossSetOff = D(2e5);
    if (houseProperty.abs().gt(maxHPLossSetOff)) {
      warnings.push(
        `House property loss \u20B9${houseProperty.abs().toINR()} exceeds \u20B92L set-off limit. Only \u20B92L can be set off against other income. Remaining carries forward.`
      );
      houseProperty = maxHPLossSetOff.neg();
    }
  }
  const ltcg112AExemption = Decimal.min(
    D(SPECIAL_RATES.LTCG_112A_EXEMPTION),
    Decimal.max(ltcg112A, ZERO)
  );
  const ltcg112ANetTaxable = Decimal.max(ltcg112A.sub(ltcg112AExemption), ZERO);
  const grossNormalIncome = salary.add(houseProperty).add(business).add(capitalGains).add(otherSources);
  const totalSpecialIncome = stcg111A.add(ltcg112A).add(ltcg112).add(casualIncome);
  const grossTotalIncome = grossNormalIncome.add(totalSpecialIncome);
  return {
    incomeBreakdown: {
      salary,
      houseProperty,
      business,
      capitalGains,
      otherSources,
      stcg111A,
      ltcg112A,
      ltcg112,
      casualIncome
    },
    grossTotalIncome,
    grossNormalIncome,
    totalSpecialIncome,
    ltcg112AExemption,
    ltcg112ANetTaxable,
    ltcg112Details,
    warnings
  };
}
function applyDeductions(deductionRecords, grossNormalIncome, regime) {
  const warnings = [];
  const breakdown = [];
  const aggregateGroupUsed = {};
  let totalDeductions = ZERO;
  for (const record of deductionRecords) {
    const claimed = D(record.claimed_amount);
    const limitConfig = DEDUCTION_LIMITS.find((d) => d.sectionCode === record.section_code);
    if (!limitConfig) {
      warnings.push(
        `Unknown deduction section "${record.section_code}" for record ${record.id}. Skipped.`
      );
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: ZERO,
        reason: "Unknown section code \u2014 not in statutory database"
      });
      continue;
    }
    if (regime === RegimeType.NEW && !limitConfig.allowedInNewRegime) {
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: D(limitConfig.maxLimit === Infinity ? 0 : limitConfig.maxLimit),
        reason: `Not allowed under New Regime (Section 115BAC)`
      });
      continue;
    }
    let maxAllowed = limitConfig.maxLimit === Infinity ? claimed : Decimal.min(claimed, D(limitConfig.maxLimit));
    if (limitConfig.aggregateGroup) {
      const groupKey = limitConfig.aggregateGroup;
      const groupCap = D(AGGREGATE_CAPS[groupKey] || Infinity);
      const groupUsed = aggregateGroupUsed[groupKey] || ZERO;
      const groupRemaining = Decimal.max(groupCap.sub(groupUsed), ZERO);
      maxAllowed = Decimal.min(maxAllowed, groupRemaining);
      aggregateGroupUsed[groupKey] = groupUsed.add(maxAllowed);
    }
    const allowed = Decimal.min(claimed, maxAllowed).clampMin(0);
    breakdown.push({
      sectionCode: record.section_code,
      claimed,
      allowed,
      statutoryLimit: D(limitConfig.maxLimit === Infinity ? 999999999 : limitConfig.maxLimit),
      reason: allowed.eq(claimed) ? "Full claim allowed" : `Capped at statutory limit (${limitConfig.description})`
    });
    totalDeductions = totalDeductions.add(allowed);
  }
  const netTaxableNormalIncome = Decimal.max(grossNormalIncome.sub(totalDeductions), ZERO);
  return {
    deductionBreakdown: breakdown,
    totalDeductions,
    netTaxableNormalIncome,
    warnings
  };
}
function computeSlabTax(taxableIncome, slabs) {
  let tax = ZERO;
  const details = [];
  if (taxableIncome.lte(0)) {
    return { tax: ZERO, details };
  }
  const sortedSlabs = [...slabs].sort((a, b) => a.lower_limit - b.lower_limit);
  for (const slab of sortedSlabs) {
    const lower = D(slab.lower_limit);
    const upper = slab.upper_limit === Infinity ? D(999999999999) : D(slab.upper_limit);
    const rate = D(slab.rate_percent);
    if (taxableIncome.lt(lower)) break;
    const taxableInSlab = Decimal.min(taxableIncome, upper).sub(lower).add(1).clampMin(0);
    const slabStart = slab.lower_limit === 0 ? ZERO : D(slab.lower_limit - 1);
    const slabEnd = slab.upper_limit === Infinity ? taxableIncome : Decimal.min(D(slab.upper_limit), taxableIncome);
    const amountInSlab = Decimal.max(slabEnd.sub(slabStart), ZERO);
    if (amountInSlab.isZero()) continue;
    const taxInSlab = amountInSlab.percent(rate);
    details.push({
      lowerLimit: D(slab.lower_limit),
      upperLimit: slab.upper_limit === Infinity ? D(999999999999) : D(slab.upper_limit),
      taxableInSlab: amountInSlab,
      rate,
      taxInSlab
    });
    tax = tax.add(taxInSlab);
  }
  return { tax, details };
}
function computeTax(netTaxableNormalIncome, stcg111A, ltcg112ANetTaxable, ltcg112Details, casualIncome, regime, ageCategory, slabRules) {
  const applicableSlabs = slabRules.filter(
    (s) => s.regime_type === regime && s.age_category === ageCategory
  );
  const { tax: taxOnNormalIncome, details: slabDetails } = computeSlabTax(
    netTaxableNormalIncome,
    applicableSlabs
  );
  const taxOnSTCG111A = Decimal.max(stcg111A, ZERO).percent(SPECIAL_RATES.STCG_111A);
  const taxOnLTCG112A = Decimal.max(ltcg112ANetTaxable, ZERO).percent(SPECIAL_RATES.LTCG_112A);
  let taxOnLTCG112 = ZERO;
  for (const detail of ltcg112Details) {
    const amt = Decimal.max(detail.amount, ZERO);
    if (detail.useIndexation) {
      taxOnLTCG112 = taxOnLTCG112.add(amt.percent(SPECIAL_RATES.LTCG_112_WITH_INDEXATION));
    } else {
      taxOnLTCG112 = taxOnLTCG112.add(amt.percent(SPECIAL_RATES.LTCG_112_WITHOUT_INDEXATION));
    }
  }
  const taxOnCasualIncome = Decimal.max(casualIncome, ZERO).percent(SPECIAL_RATES.CASUAL_INCOME);
  const totalTaxOnSpecialIncome = taxOnSTCG111A.add(taxOnLTCG112A).add(taxOnLTCG112).add(taxOnCasualIncome);
  const totalComputedTax = taxOnNormalIncome.add(totalTaxOnSpecialIncome);
  return {
    slabDetails,
    taxOnNormalIncome,
    taxOnSTCG111A,
    taxOnLTCG112A,
    taxOnLTCG112,
    taxOnCasualIncome,
    totalTaxOnSpecialIncome,
    totalComputedTax
  };
}
function applyRebate87A(totalComputedTax, taxOnLTCG112A, netTaxableNormalIncome, totalSpecialIncome, regime) {
  const warnings = [];
  const totalNetTaxableIncome = netTaxableNormalIncome.add(totalSpecialIncome);
  const config = regime === RegimeType.NEW ? REBATE_87A_NEW : REBATE_87A_OLD;
  const threshold = D(config.incomeThreshold);
  const maxRebate = D(config.maxRebate);
  let rebate87AEligible = false;
  let rebate87AAmount = ZERO;
  let marginalRelief87A = ZERO;
  if (totalNetTaxableIncome.lte(threshold)) {
    rebate87AEligible = true;
    const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);
    rebate87AAmount = Decimal.min(taxExcluding112A, maxRebate);
    if (taxOnLTCG112A.isPositive()) {
      warnings.push(
        `Rebate u/s 87A of ${rebate87AAmount.toINR()} applied only to non-112A tax. Tax on LTCG u/s 112A (${taxOnLTCG112A.toINR()}) is excluded from rebate computation.`
      );
    }
  } else if (regime === RegimeType.NEW) {
    const excessOverThreshold = totalNetTaxableIncome.sub(threshold);
    if (totalComputedTax.gt(excessOverThreshold)) {
      const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);
      if (taxExcluding112A.gt(excessOverThreshold)) {
        rebate87AEligible = true;
        const uncappedRebate = taxExcluding112A.sub(excessOverThreshold);
        rebate87AAmount = Decimal.min(uncappedRebate, taxExcluding112A);
        marginalRelief87A = rebate87AAmount;
        warnings.push(
          `Marginal Relief on 87A applied: Income ${totalNetTaxableIncome.toINR()} exceeds \u20B912L threshold by ${excessOverThreshold.toINR()}. Tax capped to not exceed the excess.`
        );
      }
    }
  }
  const taxAfterRebate = Decimal.max(totalComputedTax.sub(rebate87AAmount), ZERO);
  return {
    totalNetTaxableIncome,
    rebate87AEligible,
    rebate87AAmount,
    marginalRelief87A,
    taxAfterRebate,
    warnings
  };
}
function getSurchargeRate(totalIncome, brackets) {
  for (const bracket of brackets) {
    if (totalIncome.gt(bracket.incomeThreshold)) {
      return D(bracket.rate);
    }
  }
  return ZERO;
}
function getLowerSurchargeRate(currentRate, brackets) {
  const sortedByThreshold = [...brackets].sort((a, b) => a.incomeThreshold - b.incomeThreshold);
  for (let i = sortedByThreshold.length - 1; i >= 0; i--) {
    if (D(sortedByThreshold[i].rate).eq(currentRate)) {
      if (i > 0) {
        return {
          rate: D(sortedByThreshold[i - 1].rate),
          threshold: D(sortedByThreshold[i].incomeThreshold)
        };
      } else {
        return {
          rate: ZERO,
          threshold: D(sortedByThreshold[i].incomeThreshold)
        };
      }
    }
  }
  return { rate: ZERO, threshold: ZERO };
}
function computeTaxAtIncome(income, regime, ageCategory, slabRules) {
  const applicableSlabs = slabRules.filter(
    (s) => s.regime_type === regime && s.age_category === ageCategory
  );
  const { tax } = computeSlabTax(income, applicableSlabs);
  return tax;
}
function applySurcharge(taxAfterRebate, taxOnNormalIncome, taxOnSpecialIncome, totalNetTaxableIncome, netTaxableNormalIncome, regime, ageCategory, slabRules) {
  const warnings = [];
  if (taxAfterRebate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: ZERO,
      warnings
    };
  }
  const brackets = regime === RegimeType.OLD ? SURCHARGE_BRACKETS_OLD : SURCHARGE_BRACKETS_NEW;
  const applicableSurchargeRate = getSurchargeRate(totalNetTaxableIncome, brackets);
  if (applicableSurchargeRate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: taxAfterRebate,
      warnings
    };
  }
  const normalTaxPortion = Decimal.min(taxOnNormalIncome, taxAfterRebate);
  const surchargeOnNormalTax = normalTaxPortion.percent(applicableSurchargeRate);
  const specialTaxPortion = Decimal.max(taxAfterRebate.sub(normalTaxPortion), ZERO);
  const uncappedSpecialSurcharge = specialTaxPortion.percent(applicableSurchargeRate);
  const cappedRate = Decimal.min(applicableSurchargeRate, D(SPECIAL_INCOME_SURCHARGE_CAP));
  const cappedSpecialSurcharge = specialTaxPortion.percent(cappedRate);
  if (applicableSurchargeRate.gt(SPECIAL_INCOME_SURCHARGE_CAP) && specialTaxPortion.isPositive()) {
    warnings.push(
      `Surcharge on special income tax (\u20B9${specialTaxPortion.toFixed(0)}) capped at 15% (instead of ${applicableSurchargeRate.toFixed(0)}%) as per statutory provision.`
    );
  }
  const totalSurchargeBeforeMR = surchargeOnNormalTax.add(cappedSpecialSurcharge);
  let marginalReliefOnSurcharge = ZERO;
  const { rate: lowerRate, threshold } = getLowerSurchargeRate(applicableSurchargeRate, brackets);
  if (threshold.isPositive()) {
    const excessIncome = totalNetTaxableIncome.sub(threshold);
    const taxPlusSurchargeActual = taxAfterRebate.add(totalSurchargeBeforeMR);
    const taxAtThreshold = computeTaxAtIncome(threshold, regime, ageCategory, slabRules);
    const surchargeAtThreshold = lowerRate.isZero() ? ZERO : taxAtThreshold.percent(lowerRate);
    const taxPlusSurchargeAtThreshold = taxAtThreshold.add(surchargeAtThreshold);
    const additionalTaxBurden = taxPlusSurchargeActual.sub(taxPlusSurchargeAtThreshold);
    if (additionalTaxBurden.gt(excessIncome)) {
      marginalReliefOnSurcharge = additionalTaxBurden.sub(excessIncome);
      warnings.push(
        `Marginal Relief on Surcharge applied: Income exceeds ${threshold.toINR()} threshold by ${excessIncome.toINR()}. Additional tax burden of ${additionalTaxBurden.toINR()} reduced by ${marginalReliefOnSurcharge.toINR()} to cap at excess income.`
      );
    }
  }
  const totalSurchargeAfterMR = Decimal.max(totalSurchargeBeforeMR.sub(marginalReliefOnSurcharge), ZERO);
  const taxAfterSurcharge = taxAfterRebate.add(totalSurchargeAfterMR);
  return {
    applicableSurchargeRate,
    surchargeOnNormalTax,
    surchargeOnSpecialTax: uncappedSpecialSurcharge,
    surchargeOnSpecialTaxCapped: cappedSpecialSurcharge,
    totalSurchargeBeforeMR,
    marginalReliefOnSurcharge,
    totalSurchargeAfterMR,
    taxAfterSurcharge,
    warnings
  };
}
function applyCess(taxAfterSurcharge) {
  const cessRate = D(HEC_RATE);
  const cessAmount = taxAfterSurcharge.percent(cessRate);
  return { cessRate, cessAmount };
}
function calculateTaxLiability(profile, incomeRecords, deductionRecords, slabRules) {
  const allWarnings = [];
  const regime = profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD;
  const ageCategory = resolveAgeCategory(profile.age);
  const rules = slabRules || getAllTaxBracketRules(profile.financial_year);
  const step1 = aggregateIncome(incomeRecords);
  allWarnings.push(...step1.warnings);
  const step2 = applyDeductions(deductionRecords, step1.grossNormalIncome, regime);
  allWarnings.push(...step2.warnings);
  const step3 = computeTax(
    step2.netTaxableNormalIncome,
    step1.incomeBreakdown.stcg111A,
    step1.ltcg112ANetTaxable,
    step1.ltcg112Details,
    step1.incomeBreakdown.casualIncome,
    regime,
    ageCategory,
    rules
  );
  const step4 = applyRebate87A(
    step3.totalComputedTax,
    step3.taxOnLTCG112A,
    step2.netTaxableNormalIncome,
    step1.totalSpecialIncome,
    regime
  );
  allWarnings.push(...step4.warnings);
  const step5 = applySurcharge(
    step4.taxAfterRebate,
    step3.taxOnNormalIncome,
    step3.totalTaxOnSpecialIncome,
    step4.totalNetTaxableIncome,
    step2.netTaxableNormalIncome,
    regime,
    ageCategory,
    rules
  );
  allWarnings.push(...step5.warnings);
  const step6 = applyCess(step5.taxAfterSurcharge);
  const totalTaxLiability = step5.taxAfterSurcharge.add(step6.cessAmount).roundToInt();
  const effectiveTaxRate = step1.grossTotalIncome.isZero() ? ZERO : totalTaxLiability.div(step1.grossTotalIncome).mul(100);
  const assessment = {
    // Profile
    profileId: profile.profile_id,
    financialYear: profile.financial_year,
    assessmentYear: profile.assessment_year,
    regimeType: regime,
    ageCategory,
    // Step 1
    incomeBreakdown: step1.incomeBreakdown,
    grossTotalIncome: step1.grossTotalIncome,
    grossNormalIncome: step1.grossNormalIncome,
    totalSpecialIncome: step1.totalSpecialIncome,
    ltcg112AExemption: step1.ltcg112AExemption,
    ltcg112ANetTaxable: step1.ltcg112ANetTaxable,
    // Step 2
    deductionBreakdown: step2.deductionBreakdown,
    totalDeductions: step2.totalDeductions,
    netTaxableNormalIncome: step2.netTaxableNormalIncome,
    // Step 3
    slabComputationDetails: step3.slabDetails,
    taxOnNormalIncome: step3.taxOnNormalIncome,
    taxOnSTCG111A: step3.taxOnSTCG111A,
    taxOnLTCG112A: step3.taxOnLTCG112A,
    taxOnLTCG112: step3.taxOnLTCG112,
    taxOnCasualIncome: step3.taxOnCasualIncome,
    totalTaxOnSpecialIncome: step3.totalTaxOnSpecialIncome,
    totalComputedTax: step3.totalComputedTax,
    // Step 4
    totalNetTaxableIncome: step4.totalNetTaxableIncome,
    rebate87AEligible: step4.rebate87AEligible,
    rebate87AAmount: step4.rebate87AAmount,
    marginalRelief87A: step4.marginalRelief87A,
    taxAfterRebate: step4.taxAfterRebate,
    // Step 5
    applicableSurchargeRate: step5.applicableSurchargeRate,
    surchargeOnNormalTax: step5.surchargeOnNormalTax,
    surchargeOnSpecialTax: step5.surchargeOnSpecialTax,
    surchargeOnSpecialTaxCapped: step5.surchargeOnSpecialTaxCapped,
    totalSurchargeBeforeMR: step5.totalSurchargeBeforeMR,
    marginalReliefOnSurcharge: step5.marginalReliefOnSurcharge,
    totalSurchargeAfterMR: step5.totalSurchargeAfterMR,
    taxAfterSurcharge: step5.taxAfterSurcharge,
    // Step 6
    cessRate: step6.cessRate,
    cessAmount: step6.cessAmount,
    // Final
    totalTaxLiability,
    effectiveTaxRate,
    // Metadata
    computedAt: (/* @__PURE__ */ new Date()).toISOString(),
    engineVersion: ENGINE_VERSION,
    warnings: allWarnings
  };
  return assessment;
}
function compareRegimes(profile, incomeRecords, deductionRecords) {
  const oldProfile = { ...profile, opted_for_new_regime: false };
  const newProfile = { ...profile, opted_for_new_regime: true };
  const oldAssessment = calculateTaxLiability(oldProfile, incomeRecords, deductionRecords);
  const newAssessment = calculateTaxLiability(newProfile, incomeRecords, deductionRecords);
  const oldTax = oldAssessment.totalTaxLiability;
  const newTax = newAssessment.totalTaxLiability;
  const recommendation = newTax.lte(oldTax) ? "NEW" : "OLD";
  const savings = oldTax.gt(newTax) ? oldTax.sub(newTax) : newTax.sub(oldTax);
  return {
    oldRegimeAssessment: oldAssessment,
    newRegimeAssessment: newAssessment,
    recommendation,
    savings
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateTaxLiability,
  compareRegimes
});

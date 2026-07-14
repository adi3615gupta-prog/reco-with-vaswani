/**
 * decimal.ts — Lightweight fixed-precision decimal arithmetic for Indian tax computations.
 *
 * Uses BigInt internally with 4 decimal places of precision to eliminate
 * all floating-point rounding errors in financial calculations.
 *
 * Usage:
 *   const a = D(100000);         // from number
 *   const b = D("250000.50");    // from string
 *   const c = a.add(b);          // arithmetic
 *   c.toNumber();                // → 350000.5
 *   c.toFixed(2);                // → "350000.50"
 */
const INTERNAL_PRECISION = 4;
const SCALE = BigInt(10 ** INTERNAL_PRECISION); // 10000n
/**
 * Parse a number or string into a scaled BigInt.
 */
function toBigInt(value) {
    if (value instanceof Decimal) {
        return value._value;
    }
    if (typeof value === 'bigint') {
        return value * SCALE;
    }
    const str = String(value).trim();
    if (str === '' || str === 'NaN' || str === 'Infinity' || str === '-Infinity') {
        return 0n;
    }
    const negative = str.startsWith('-');
    const abs = negative ? str.slice(1) : str;
    const parts = abs.split('.');
    const intPart = parts[0] || '0';
    let fracPart = parts[1] || '';
    // Pad or truncate fractional part to INTERNAL_PRECISION digits
    if (fracPart.length > INTERNAL_PRECISION) {
        // Round: check the digit after precision
        const roundDigit = parseInt(fracPart[INTERNAL_PRECISION], 10);
        fracPart = fracPart.slice(0, INTERNAL_PRECISION);
        if (roundDigit >= 5) {
            const fracNum = BigInt(fracPart) + 1n;
            // Handle carry into integer part
            if (fracNum >= SCALE) {
                const intNum = BigInt(intPart) + 1n;
                const result = intNum * SCALE;
                return negative ? -result : result;
            }
            fracPart = fracNum.toString().padStart(INTERNAL_PRECISION, '0');
        }
    }
    else {
        fracPart = fracPart.padEnd(INTERNAL_PRECISION, '0');
    }
    const combined = BigInt(intPart) * SCALE + BigInt(fracPart);
    return negative ? -combined : combined;
}
export class Decimal {
    /** @internal Scaled BigInt value (actual × 10^INTERNAL_PRECISION) */
    _value;
    constructor(value) {
        if (value instanceof Decimal) {
            this._value = value._value;
        }
        else if (typeof value === 'bigint') {
            // Direct BigInt constructor — assumes already scaled
            this._value = value;
        }
        else {
            this._value = toBigInt(value);
        }
    }
    // ── Factory ──────────────────────────────────────────────
    /** Create from a raw scaled BigInt (internal use) */
    static _fromRaw(raw) {
        const d = Object.create(Decimal.prototype);
        d._value = raw;
        return d;
    }
    static ZERO = Decimal._fromRaw(0n);
    // ── Arithmetic ───────────────────────────────────────────
    add(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return Decimal._fromRaw(this._value + o);
    }
    sub(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return Decimal._fromRaw(this._value - o);
    }
    mul(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        // (a * SCALE) * (b * SCALE) / SCALE = a * b * SCALE
        const raw = (this._value * o) / SCALE;
        return Decimal._fromRaw(raw);
    }
    div(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        if (o === 0n) {
            throw new Error('Decimal division by zero');
        }
        // (a * SCALE) * SCALE / (b * SCALE) = a/b * SCALE
        const raw = (this._value * SCALE) / o;
        return Decimal._fromRaw(raw);
    }
    /** Negate */
    neg() {
        return Decimal._fromRaw(-this._value);
    }
    /** Absolute value */
    abs() {
        return Decimal._fromRaw(this._value < 0n ? -this._value : this._value);
    }
    /** Returns the percentage: this * (percent / 100) */
    percent(rate) {
        return this.mul(rate).div(100);
    }
    /** Floor to nearest integer (towards zero) */
    floor() {
        const truncated = (this._value / SCALE) * SCALE;
        if (this._value < 0n && truncated !== this._value) {
            return Decimal._fromRaw(truncated - SCALE);
        }
        return Decimal._fromRaw(truncated);
    }
    /** Round to nearest integer */
    roundToInt() {
        const half = SCALE / 2n;
        if (this._value >= 0n) {
            return Decimal._fromRaw(((this._value + half) / SCALE) * SCALE);
        }
        else {
            return Decimal._fromRaw(((this._value - half) / SCALE) * SCALE);
        }
    }
    // ── Comparison ───────────────────────────────────────────
    gt(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return this._value > o;
    }
    gte(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return this._value >= o;
    }
    lt(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return this._value < o;
    }
    lte(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
        return this._value <= o;
    }
    eq(other) {
        const o = other instanceof Decimal ? other._value : toBigInt(other);
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
            if (values[i]._value > result._value)
                result = values[i];
        }
        return result;
    }
    static min(...values) {
        let result = values[0];
        for (let i = 1; i < values.length; i++) {
            if (values[i]._value < result._value)
                result = values[i];
        }
        return result;
    }
    /** Clamp value to be at least `floor` (typically 0) */
    clampMin(floor) {
        const f = floor instanceof Decimal ? floor._value : toBigInt(floor);
        return this._value < f ? Decimal._fromRaw(f) : this;
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
        // Scale the fractional part to desired decimals
        const fracStr = fracPart.toString().padStart(INTERNAL_PRECISION, '0');
        let outputFrac;
        if (decimals <= 0) {
            outputFrac = '';
        }
        else if (decimals >= INTERNAL_PRECISION) {
            outputFrac = fracStr.padEnd(decimals, '0');
        }
        else {
            // Round the fractional part to the desired precision
            const roundDigit = parseInt(fracStr[decimals], 10);
            let truncated = fracStr.slice(0, decimals);
            if (roundDigit >= 5) {
                const incremented = (parseInt(truncated, 10) + 1).toString().padStart(decimals, '0');
                if (incremented.length > decimals) {
                    // Carry over to integer part
                    const newInt = intPart + 1n;
                    const prefix = negative ? '-' : '';
                    return `${prefix}${newInt}.${'0'.repeat(decimals)}`;
                }
                truncated = incremented;
            }
            outputFrac = truncated;
        }
        const prefix = negative ? '-' : '';
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
        const [intPart, fracPart] = num.split('.');
        const negative = intPart.startsWith('-');
        const absInt = negative ? intPart.slice(1) : intPart;
        // Indian numbering: last 3 digits, then groups of 2
        let formatted;
        if (absInt.length <= 3) {
            formatted = absInt;
        }
        else {
            const last3 = absInt.slice(-3);
            const remaining = absInt.slice(0, -3);
            const groups = [];
            for (let i = remaining.length; i > 0; i -= 2) {
                const start = Math.max(0, i - 2);
                groups.unshift(remaining.slice(start, i));
            }
            formatted = groups.join(',') + ',' + last3;
        }
        const prefix = negative ? '-₹' : '₹';
        return `${prefix}${formatted}.${fracPart}`;
    }
}
/** Shorthand factory: D(100000) or D("250000.50") */
export function D(value) {
    if (value instanceof Decimal)
        return value;
    return new Decimal(value);
}
/** Shorthand for Decimal.ZERO */
export const ZERO = Decimal.ZERO;

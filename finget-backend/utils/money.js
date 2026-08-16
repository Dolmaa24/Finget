/**
 * Integer-paise money primitives.
 *
 * THE RULE: every value in this codebase that holds paise has a name ending in
 * `Paise`. No exceptions — not locals, not parameters, not object keys. A bare
 * `amount` is always rupees.
 *
 * THE OTHER RULE: `toPaise` and `fromPaise` are the ONLY two places rupees and
 * paise convert. Call them at the database mapper and the API serialiser, and
 * nowhere else. `tests/no-bare-hundreds.test.js` enforces this by scanning the
 * source for stray `* 100` / `/ 100`.
 */

const PAISE_PER_RUPEE = 100;

function assertFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number, got ${String(value)}`);
  }
}

function assertInteger(value, label) {
  assertFinite(value, label);
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of paise, got ${value}`);
  }
}

/**
 * Rupees → paise, rounding half away from zero on the *decimal* value.
 *
 * Binary floats make this subtler than it looks: `1.005 * 100` is
 * 100.49999999999999, which naive rounding turns into ₹1.00. Nudging by a
 * relative epsilon before rounding recovers the decimal intent, so
 * `toPaise(1.005) === 101` and `toPaise(0.1 + 0.2) === 30`.
 */
function toPaise(rupees) {
  assertFinite(rupees, "rupees");
  const scaled = rupees * PAISE_PER_RUPEE; // not-money: the sole rupee→paise conversion
  const magnitude = Math.abs(scaled);
  const epsilon = magnitude * Number.EPSILON * 4;
  return Math.sign(scaled) * Math.round(magnitude + epsilon);
}

/** Paise → rupees. Use only when writing to the DB or serialising a response. */
function fromPaise(paise) {
  assertInteger(paise, "paise");
  return paise / PAISE_PER_RUPEE; // not-money: the sole paise→rupee conversion
}

function sumPaise(values) {
  return values.reduce((total, value) => {
    assertInteger(value, "paise entry");
    return total + value;
  }, 0);
}

/**
 * Split `totalPaise` into `parts` shares that sum back to exactly `totalPaise`.
 * The remainder lands on the leading shares, one paisa each.
 */
function splitPaise(totalPaise, parts) {
  assertInteger(totalPaise, "totalPaise");
  if (!Number.isInteger(parts) || parts < 1) {
    throw new TypeError(`parts must be a positive integer, got ${parts}`);
  }

  const sign = totalPaise < 0 ? -1 : 1;
  const magnitude = Math.abs(totalPaise);
  const base = Math.floor(magnitude / parts);
  let remainder = magnitude - base * parts;

  const shares = [];
  for (let i = 0; i < parts; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    shares.push(sign * (base + extra));
  }
  return shares;
}

/**
 * Distribute `totalPaise` across `weights` using the largest-remainder method,
 * so the parts sum to exactly `totalPaise` and nobody loses a paisa to rounding.
 * Powers income-weighted splits (Milestone 5).
 */
function allocatePaise(totalPaise, weights) {
  assertInteger(totalPaise, "totalPaise");
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new TypeError("weights must be a non-empty array");
  }
  weights.forEach((w, i) => {
    assertFinite(w, `weights[${i}]`);
    if (w < 0) throw new TypeError(`weights[${i}] must not be negative`);
  });

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  // No signal in the weights — fall back to an even split rather than dividing by zero.
  if (totalWeight <= 0) return splitPaise(totalPaise, weights.length);

  const sign = totalPaise < 0 ? -1 : 1;
  const magnitude = Math.abs(totalPaise);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = magnitude - floors.reduce((s, v) => s + v, 0);

  // Hand the leftover paise to the largest fractional remainders first.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const shares = floors.slice();
  for (let i = 0; i < order.length && remainder > 0; i++) {
    shares[order[i].index] += 1;
    remainder -= 1;
  }

  return shares.map((share) => sign * share);
}

module.exports = {
  PAISE_PER_RUPEE,
  toPaise,
  fromPaise,
  sumPaise,
  splitPaise,
  allocatePaise,
};

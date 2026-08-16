const {
  toPaise,
  fromPaise,
  sumPaise,
  splitPaise,
  allocatePaise,
} = require("../utils/money");

describe("toPaise", () => {
  it("converts whole and fractional rupees", () => {
    expect(toPaise(0)).toBe(0);
    expect(toPaise(1)).toBe(100);
    expect(toPaise(8499)).toBe(849900);
    expect(toPaise(0.5)).toBe(50);
  });

  it("survives binary float representation error", () => {
    // The whole reason this helper exists.
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1.005)).toBe(101); // naive Math.round gives 100
    expect(toPaise(2.675)).toBe(268); // naive Math.round gives 267
  });

  it("rounds half away from zero, symmetrically", () => {
    expect(toPaise(-1.005)).toBe(-101);
    expect(toPaise(-0.5)).toBe(-50);
  });

  it("rejects anything that is not a finite number", () => {
    expect(() => toPaise(NaN)).toThrow(TypeError);
    expect(() => toPaise(Infinity)).toThrow(TypeError);
    expect(() => toPaise("100")).toThrow(TypeError);
    expect(() => toPaise(null)).toThrow(TypeError);
    expect(() => toPaise(undefined)).toThrow(TypeError);
  });

  it("round-trips through fromPaise", () => {
    for (const rupees of [0, 1, 99.99, 12345.67, 0.01, 100000]) {
      expect(fromPaise(toPaise(rupees))).toBeCloseTo(rupees, 10);
    }
  });
});

describe("fromPaise", () => {
  it("rejects non-integer paise", () => {
    expect(() => fromPaise(10.5)).toThrow(TypeError);
    expect(() => fromPaise(NaN)).toThrow(TypeError);
  });
});

describe("splitPaise", () => {
  it("sums back to exactly the total for every part count", () => {
    const totals = [1, 7, 100, 10001, 849900, 333];
    for (const total of totals) {
      for (let parts = 1; parts <= 7; parts++) {
        const shares = splitPaise(total, parts);
        expect(shares).toHaveLength(parts);
        expect(sumPaise(shares)).toBe(total);
        expect(shares.every(Number.isInteger)).toBe(true);
      }
    }
  });

  it("distributes the remainder onto the leading shares", () => {
    expect(splitPaise(10, 3)).toEqual([4, 3, 3]);
    expect(splitPaise(100, 3)).toEqual([34, 33, 33]);
  });

  it("never differs by more than one paisa between shares", () => {
    const shares = splitPaise(10001, 7);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("handles negative totals (refunds) without losing a paisa", () => {
    const shares = splitPaise(-10, 3);
    expect(sumPaise(shares)).toBe(-10);
  });

  it("rejects invalid part counts", () => {
    expect(() => splitPaise(100, 0)).toThrow(TypeError);
    expect(() => splitPaise(100, -1)).toThrow(TypeError);
    expect(() => splitPaise(100, 2.5)).toThrow(TypeError);
  });
});

describe("allocatePaise", () => {
  it("sums to exactly the total regardless of the weights", () => {
    const cases = [
      [10000, [1, 1, 1]],
      [10000, [90000, 70000, 55000]],
      [1, [1, 1, 1]],
      [849900, [3, 1]],
      [100, [1, 2, 3, 4, 5, 6, 7]],
    ];
    for (const [total, weights] of cases) {
      const shares = allocatePaise(total, weights);
      expect(sumPaise(shares)).toBe(total);
      expect(shares).toHaveLength(weights.length);
      expect(shares.every(Number.isInteger)).toBe(true);
    }
  });

  it("allocates in proportion to weight", () => {
    // 90k / 70k / 55k incomes splitting ₹100 — the Milestone 5 shape.
    const shares = allocatePaise(10000, [90000, 70000, 55000]);
    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[1]).toBeGreaterThan(shares[2]);
    expect(sumPaise(shares)).toBe(10000);
  });

  it("gives the leftover paise to the largest fractional remainders", () => {
    // 100 paise across equal thirds: 34/33/33, not 33/33/33 with one lost.
    expect(sumPaise(allocatePaise(100, [1, 1, 1]))).toBe(100);
  });

  it("falls back to an even split when every weight is zero", () => {
    const shares = allocatePaise(100, [0, 0, 0]);
    expect(sumPaise(shares)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("rejects negative weights and empty weight lists", () => {
    expect(() => allocatePaise(100, [1, -1])).toThrow(TypeError);
    expect(() => allocatePaise(100, [])).toThrow(TypeError);
  });
});

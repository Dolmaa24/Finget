const {
  equalSplit,
  weightedSplit,
  computeBalancesPaise,
  suggestSettlementsPaise,
} = require("../services/splitService");
const { toPaise, sumPaise } = require("../utils/money");

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccccccc";

const expense = (paidBy, amount, splits) => ({
  type: "expense",
  paidBy,
  userId: paidBy,
  amount,
  splits,
});

describe("equalSplit", () => {
  it("splits evenly and sums to exactly the total", () => {
    const splits = equalSplit(3000, [A, B, C]);
    expect(splits).toHaveLength(3);
    expect(sumPaise(splits.map((s) => toPaise(s.amount)))).toBe(toPaise(3000));
    expect(splits.every((s) => s.amount === 1000)).toBe(true);
  });

  it("reconciles an amount that does not divide cleanly", () => {
    const splits = equalSplit(100.01, [A, B, C]);
    expect(sumPaise(splits.map((s) => toPaise(s.amount)))).toBe(toPaise(100.01));
  });

  it("returns nothing when there is nobody to split with", () => {
    expect(equalSplit(500, [])).toEqual([]);
  });
});

describe("weightedSplit", () => {
  it("splits in proportion to income and still sums exactly", () => {
    const splits = weightedSplit(3000, [A, B, C], [90000, 70000, 55000]);
    expect(sumPaise(splits.map((s) => toPaise(s.amount)))).toBe(toPaise(3000));
    expect(splits[0].amount).toBeGreaterThan(splits[1].amount);
    expect(splits[1].amount).toBeGreaterThan(splits[2].amount);
  });

  it("degrades to an even split when nobody has declared income", () => {
    const splits = weightedSplit(300, [A, B, C], [0, 0, 0]);
    expect(sumPaise(splits.map((s) => toPaise(s.amount)))).toBe(toPaise(300));
  });
});

describe("computeBalancesPaise", () => {
  it("credits the payer and debits each participant", () => {
    const balances = computeBalancesPaise([
      expense(A, 3000, equalSplit(3000, [A, B, C])),
    ]);
    expect(balances.get(A)).toBe(toPaise(2000)); // fronted 3000, owed 1000
    expect(balances.get(B)).toBe(toPaise(-1000));
    expect(balances.get(C)).toBe(toPaise(-1000));
  });

  it("always nets to exactly zero across the group", () => {
    const balances = computeBalancesPaise([
      expense(A, 3000, equalSplit(3000, [A, B, C])),
      expense(B, 100.01, equalSplit(100.01, [A, B, C])),
      expense(C, 777.77, equalSplit(777.77, [A, B])),
    ]);
    expect(sumPaise([...balances.values()])).toBe(0);
  });

  it("ignores unsplit group spend, which creates no debt", () => {
    const balances = computeBalancesPaise([expense(A, 3000, [])]);
    expect(sumPaise([...balances.values()])).toBe(0);
  });

  it("nets settlements against the balances", () => {
    const transactions = [expense(A, 3000, equalSplit(3000, [A, B, C]))];
    const settlements = [{ from: B, to: A, amount: 1000 }];
    const balances = computeBalancesPaise(transactions, settlements);
    expect(balances.get(B)).toBe(0);
    expect(balances.get(A)).toBe(toPaise(1000));
  });

  it("excludes income rows from debt", () => {
    const balances = computeBalancesPaise([
      { type: "income", paidBy: A, userId: A, amount: 5000, splits: equalSplit(5000, [A, B]) },
    ]);
    expect(sumPaise([...balances.values()])).toBe(0);
  });
});

describe("suggestSettlementsPaise", () => {
  it("clears every debt in at most (members - 1) transfers", () => {
    const balances = computeBalancesPaise([
      expense(A, 3000, equalSplit(3000, [A, B, C])),
      expense(A, 600, equalSplit(600, [A, B, C])),
    ]);
    const transfers = suggestSettlementsPaise(balances);
    expect(transfers.length).toBeLessThanOrEqual(2);

    // Applying the transfers must zero everyone out, exactly.
    const settled = new Map(balances);
    transfers.forEach((t) => {
      settled.set(t.from, settled.get(t.from) + t.amountPaise);
      settled.set(t.to, settled.get(t.to) - t.amountPaise);
    });
    expect([...settled.values()].every((v) => v === 0)).toBe(true);
  });

  it("suggests nothing when everyone is square", () => {
    const balances = computeBalancesPaise([expense(A, 3000, equalSplit(3000, [A]))]);
    expect(suggestSettlementsPaise(balances)).toEqual([]);
  });

  it("resolves an awkward three-way remainder to exact zero", () => {
    // 100.01 across three people leaves a single stray paisa to place.
    const balances = computeBalancesPaise([
      expense(A, 100.01, equalSplit(100.01, [A, B, C])),
    ]);
    const transfers = suggestSettlementsPaise(balances);
    const settled = new Map(balances);
    transfers.forEach((t) => {
      settled.set(t.from, settled.get(t.from) + t.amountPaise);
      settled.set(t.to, settled.get(t.to) - t.amountPaise);
    });
    expect([...settled.values()].every((v) => v === 0)).toBe(true);
  });

  it("is deterministic for identical balances", () => {
    const build = () =>
      computeBalancesPaise([expense(A, 900, equalSplit(900, [A, B, C]))]);
    expect(suggestSettlementsPaise(build())).toEqual(suggestSettlementsPaise(build()));
  });
});

const { computeTranslation } = require("../services/goalCurrencyService");
const { toPaise } = require("../utils/money");

/** Affordability with sane defaults; override per test. */
const afford = (over = {}) => ({
  remaining: 30000,
  safeDaily: 2000,
  emergencyBuffer: 0,
  daysLeftInMonth: 15,
  ...over,
});

const goal = (over = {}) => ({
  _id: "6a80e497af36fafa963a39d8",
  name: "Goa trip",
  targetAmount: 60000,
  currentAmount: 0,
  priority: "Medium",
  deadline: null,
  ...over,
});

describe("computeTranslation — contract", () => {
  it("requires integer paise", () => {
    expect(() => computeTranslation({ affordability: afford(), goals: [], amountPaise: 10.5 }))
      .toThrow(TypeError);
  });

  it("reports the post-purchase state", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [],
      amountPaise: toPaise(6000),
    });
    expect(t.amount).toBe(6000);
    expect(t.remainingAfter).toBe(24000);
    expect(t.riskAfter).toBe("Safe");
    expect(t.currency).toBe("INR");
  });

  it("escalates risk through the buffer and past zero", () => {
    const a = afford({ emergencyBuffer: 10000 });
    expect(computeTranslation({ affordability: a, goals: [], amountPaise: toPaise(1000) }).riskAfter)
      .toBe("Safe");
    expect(computeTranslation({ affordability: a, goals: [], amountPaise: toPaise(25000) }).riskAfter)
      .toBe("Warning");
    expect(computeTranslation({ affordability: a, goals: [], amountPaise: toPaise(35000) }).riskAfter)
      .toBe("Risky");
  });
});

describe("headline ladder", () => {
  it("prefers a goal delay over everything else", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [goal()],
      amountPaise: toPaise(15000),
    });
    expect(t.headlineKind).toBe("goal_delay");
    expect(t.headline).toContain("Goa trip");
  });

  it("picks the highest-priority goal among several with real delays", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [
        goal({ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Low thing", priority: "Low" }),
        goal({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Big thing", priority: "High" }),
        goal({ _id: "cccccccccccccccccccccccc", name: "Mid thing", priority: "Medium" }),
      ],
      amountPaise: toPaise(15000),
    });
    expect(t.headlineKind).toBe("goal_delay");
    expect(t.headline).toContain("Big thing");
    expect(t.goalImpacts[0].name).toBe("Big thing");
  });

  it("breaks a priority tie by the nearest deadline", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [
        goal({ _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Later", priority: "High", deadline: "2030-01-01" }),
        goal({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Sooner", priority: "High", deadline: "2027-01-01" }),
      ],
      amountPaise: toPaise(15000),
    });
    expect(t.headline).toContain("Sooner");
  });

  it("ranks a stalled goal above any finite delay", () => {
    // Spending everything leaves zero capacity, so the goal cannot advance.
    const t = computeTranslation({
      affordability: afford(),
      goals: [goal({ name: "Emergency fund", priority: "Low" })],
      amountPaise: toPaise(30000),
    });
    expect(t.headlineKind).toBe("goal_delay");
    expect(t.goalImpacts[0].blocked).toBe(true);
    expect(t.headline).toContain("stalls");
  });

  it("falls back to days of safe spend when no goal is affected", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [],
      amountPaise: toPaise(6000),
    });
    expect(t.headlineKind).toBe("safe_days");
    expect(t.headline).toBe("3 days of your safe spend");
  });

  it("falls back to rupees for a purchase under one day of allowance", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [],
      amountPaise: toPaise(500),
    });
    expect(t.headlineKind).toBe("rupees");
    expect(t.headline).toBe("₹500");
  });

  it("falls back to rupees when there is no safe daily allowance at all", () => {
    const t = computeTranslation({
      affordability: afford({ remaining: -5000, safeDaily: 0 }),
      goals: [],
      amountPaise: toPaise(500),
    });
    expect(t.headlineKind).toBe("rupees");
    expect(t.daysOfSafeSpend).toBeNull();
  });

  it("ignores goals that are already fully funded", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [goal({ targetAmount: 5000, currentAmount: 5000 })],
      amountPaise: toPaise(6000),
    });
    expect(t.goalImpacts).toHaveLength(0);
    expect(t.headlineKind).toBe("safe_days");
  });
});

describe("goal impacts", () => {
  it("exposes goalId, outstanding and delay for each goal", () => {
    const t = computeTranslation({
      affordability: afford(),
      goals: [goal({ currentAmount: 10000 })],
      amountPaise: toPaise(15000),
    });
    const impact = t.goalImpacts[0];
    expect(impact.goalId).toBe("6a80e497af36fafa963a39d8");
    expect(impact.outstanding).toBe(50000);
    expect(impact.outstandingPaise).toBe(5000000);
    expect(typeof impact.delayDays).toBe("number");
    expect(impact.blocked).toBe(false);
  });

  it("caps the impact list at four goals", () => {
    const goals = Array.from({ length: 8 }, (_, i) =>
      goal({ _id: String(i).repeat(24).slice(0, 24), name: `Goal ${i}` })
    );
    const t = computeTranslation({ affordability: afford(), goals, amountPaise: toPaise(15000) });
    expect(t.goalImpacts.length).toBeLessThanOrEqual(4);
  });

  it("keeps daysOfSafeSpend and delayDays as separate, uncompared measures", () => {
    // Different denominators on purpose — this asserts they are not conflated.
    const t = computeTranslation({
      affordability: afford(),
      goals: [goal()],
      amountPaise: toPaise(6000),
    });
    expect(t.daysOfSafeSpend).toBe(3); // 6000 / 2000 per day
    expect(t.goalImpacts[0].delayDays).not.toBe(t.daysOfSafeSpend);
  });
});

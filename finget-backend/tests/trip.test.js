const {
  computeTripStatus,
  paceMessage,
  dayIndexOf,
  inclusiveDaySpan,
  spentPaiseFrom,
} = require("../services/tripService");
const { fromISTFields } = require("../utils/time");

/**
 * Trip pace, tested at the boundaries a five-day trip would otherwise take
 * five days to reach.
 *
 * Every date here is built with `fromISTFields`, never `new Date("...")`:
 * a bare date string parses as UTC, which is 05:30 off from the IST calendar
 * day the whole app runs on, and would make every boundary test off by one on
 * exactly the days that matter.
 */

/** 1–5 March 2026, IST. */
const START = fromISTFields(2026, 2, 1);
const END = fromISTFields(2026, 2, 5);

/** Noon IST on a given March day, so nothing sits on a boundary by accident. */
const marchNoon = (day) => fromISTFields(2026, 2, day, 12);

const trip = (overrides = {}) =>
  computeTripStatus({
    startDate: START,
    endDate: END,
    potPaise: 5000000, // ₹50,000
    spentPaise: 0,
    now: marchNoon(2),
    ...overrides,
  });

describe("day counting", () => {
  it("counts both end days — a 1–5 March trip is five days, not four", () => {
    expect(inclusiveDaySpan(START, END)).toBe(5);
  });

  it("treats a single-day trip as one day", () => {
    expect(inclusiveDaySpan(START, START)).toBe(1);
  });

  it("is 0 before the trip starts, so pace maths never divides by a day that hasn't happened", () => {
    expect(dayIndexOf(START, END, fromISTFields(2026, 1, 27, 12))).toBe(0);
  });

  it("counts the first day as day 1", () => {
    expect(dayIndexOf(START, END, marchNoon(1))).toBe(1);
  });

  it("clamps to the last day once the trip is over", () => {
    expect(dayIndexOf(START, END, marchNoon(9))).toBe(5);
  });

  it("uses IST boundaries, not UTC", () => {
    // 00:30 IST on 2 March is still 1 March in UTC. A UTC-based implementation
    // would report day 1 here and be wrong for every user in India.
    expect(dayIndexOf(START, END, fromISTFields(2026, 2, 2, 0, 30))).toBe(2);
    // And 23:30 IST on 1 March is already 2 March in UTC.
    expect(dayIndexOf(START, END, fromISTFields(2026, 2, 1, 23, 30))).toBe(1);
  });
});

describe("pace", () => {
  it("is 'on' when spend tracks time", () => {
    // Day 2 of 5 is 40% elapsed; 40% of the pot spent.
    expect(trip({ spentPaise: 2000000 }).paceStatus).toBe("on");
  });

  it("is 'over' when the money is ahead of the days", () => {
    // The spec's example: day 2 of 5, 61% spent.
    const status = trip({ spentPaise: 3050000 });
    expect(status.paceStatus).toBe("over");
    expect(status.percentSpent).toBe(61);
  });

  it("is 'under' when the days are ahead of the money", () => {
    expect(trip({ spentPaise: 500000 }).paceStatus).toBe("under");
  });

  it("tolerates small drift rather than crying wolf on the first big expense", () => {
    // 45% spent on day 2 (40% elapsed) is 5 points over — within tolerance.
    // A tighter band would flag the hotel bill and be ignored thereafter.
    expect(trip({ spentPaise: 2250000 }).paceStatus).toBe("on");
  });

  it("compares progress, not raw figures — the same spend reads differently later", () => {
    // 61% of the pot on day 2 of 5 is running hot. The identical figure on
    // day 4, with 80% of the trip gone, is comfortably ahead. This is the
    // whole reason pace exists rather than a bare percentage.
    expect(trip({ spentPaise: 3050000, now: marchNoon(2) }).paceStatus).toBe("over");
    expect(trip({ spentPaise: 3050000, now: marchNoon(4) }).paceStatus).toBe("under");
    // And in between it reads as on pace.
    expect(trip({ spentPaise: 3050000, now: marchNoon(3) }).paceStatus).toBe("on");
  });

  it("has no opinion without a pot — there is nothing to be over", () => {
    const status = trip({ potPaise: 0, spentPaise: 9900000 });
    expect(status.paceStatus).toBe("on");
    expect(status.percentSpent).toBeNull();
  });

  it("has no opinion before the trip starts", () => {
    const status = trip({ now: fromISTFields(2026, 1, 27, 12), spentPaise: 4000000 });
    expect(status.started).toBe(false);
    expect(status.paceStatus).toBe("on");
  });
});

describe("allowance and projection", () => {
  it("spreads what is left over the days that remain", () => {
    // Day 2 of 5: ₹20,000 spent, ₹30,000 left, 3 days remaining.
    const status = trip({ spentPaise: 2000000 });
    expect(status.daysRemaining).toBe(3);
    expect(status.dailyAllowancePaise).toBe(1000000);
  });

  it("offers no allowance on the last day rather than dividing by zero", () => {
    const status = trip({ spentPaise: 2000000, now: marchNoon(5) });
    expect(status.daysRemaining).toBe(0);
    expect(status.dailyAllowancePaise).toBe(0);
    expect(Number.isFinite(status.dailyAllowancePaise)).toBe(true);
  });

  it("never offers a negative allowance once the pot is blown", () => {
    expect(trip({ spentPaise: 9900000 }).dailyAllowancePaise).toBe(0);
  });

  it("projects the finish from the current daily rate", () => {
    // ₹20,000 over 2 days → ₹10,000/day → ₹50,000 across five days.
    expect(trip({ spentPaise: 2000000 }).projectedFinalPaise).toBe(5000000);
    expect(trip({ spentPaise: 2000000 }).projectedOverspendPaise).toBe(0);
  });

  it("projects an overspend when running hot", () => {
    const status = trip({ spentPaise: 3050000 });
    expect(status.projectedFinalPaise).toBe(7625000);
    expect(status.projectedOverspendPaise).toBeGreaterThan(0);
  });

  it("does not extrapolate from zero elapsed days", () => {
    const status = trip({ now: fromISTFields(2026, 1, 27, 12), spentPaise: 100000 });
    expect(Number.isFinite(status.projectedFinalPaise)).toBe(true);
    expect(status.projectedFinalPaise).toBe(100000);
  });
});

describe("the strip's sentence", () => {
  it("matches the spec's example", () => {
    expect(paceMessage(trip({ spentPaise: 3050000 }))).toBe(
      "Day 2 of 5 · 61% spent · you're running hot."
    );
  });

  it("observes the pot, never judges the group", () => {
    for (const spentPaise of [500000, 2000000, 3050000, 9900000]) {
      const line = paceMessage(trip({ spentPaise }));
      // Tone rule: calm advisor, never a scold.
      expect(line).not.toMatch(/overspent|too much|wasted|should have|careless/i);
    }
  });

  it("says something useful with no pot set", () => {
    expect(paceMessage(trip({ potPaise: 0 }))).toBe("Day 2 of 5.");
  });

  it("closes out once the trip is done", () => {
    expect(paceMessage(trip({ spentPaise: 2000000, now: marchNoon(9) }))).toMatch(/that's a wrap/);
  });
});

describe("what counts as spend", () => {
  it("counts expenses and ignores income", () => {
    const txs = [
      { type: "expense", amount: 1200 },
      { type: "expense", amount: 800 },
      { type: "income", amount: 5000 },
    ];
    expect(spentPaiseFrom(txs)).toBe(200000);
  });

  it("is zero for an empty ledger", () => {
    expect(spentPaiseFrom([])).toBe(0);
  });
});

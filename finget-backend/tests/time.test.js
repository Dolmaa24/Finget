const {
  istParts,
  startOfMonthIST,
  startOfNextMonthIST,
  startOfDayIST,
  daysLeftInMonthIST,
  daysInMonthIST,
  monthKeyIST,
  isWeekendIST,
} = require("../utils/time");

/**
 * These assertions are written against absolute UTC instants, so they hold
 * identically whatever TZ the machine running them is set to. That is the
 * point: the bug this module fixes is invisible on an IST dev box and only
 * appears on a UTC host.
 */
describe("IST calendar boundaries", () => {
  it("treats 18:30 UTC as the start of the next IST day", () => {
    // 2026-08-15T18:30:00Z is exactly 2026-08-16T00:00:00 IST.
    const justBefore = new Date("2026-08-15T18:29:59Z");
    const justAfter = new Date("2026-08-15T18:30:00Z");

    expect(istParts(justBefore).day).toBe(15);
    expect(istParts(justAfter).day).toBe(16);
  });

  it("rolls the month at IST midnight, not UTC midnight", () => {
    // 2026-07-31T18:30:00Z == 2026-08-01T00:00:00 IST.
    const lastMomentOfJuly = new Date("2026-07-31T18:29:59Z");
    const firstMomentOfAugust = new Date("2026-07-31T18:30:00Z");

    expect(istParts(lastMomentOfJuly).month).toBe(6); // July
    expect(istParts(firstMomentOfAugust).month).toBe(7); // August

    // The classic UTC-host failure: 2026-08-01T00:00Z is still 05:30 IST on
    // the 1st, so the month must already have rolled over.
    const utcMidnightAug1 = new Date("2026-08-01T00:00:00Z");
    expect(startOfMonthIST(utcMidnightAug1).toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("startOfMonthIST returns the instant of IST midnight on the 1st", () => {
    const mid = new Date("2026-08-16T09:00:00Z");
    expect(startOfMonthIST(mid).toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(startOfNextMonthIST(mid).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });

  it("startOfDayIST returns the instant of IST midnight today", () => {
    const mid = new Date("2026-08-16T09:00:00Z"); // 14:30 IST on the 16th
    expect(startOfDayIST(mid).toISOString()).toBe("2026-08-15T18:30:00.000Z");
  });

  it("counts days left in the month inclusively, and never below 1", () => {
    // 1st of a 31-day month → all 31 days remain.
    expect(daysLeftInMonthIST(new Date("2026-08-01T06:00:00Z"))).toBe(31);
    // Last day → exactly 1, never 0, so safe-daily can always divide.
    expect(daysLeftInMonthIST(new Date("2026-08-31T12:00:00Z"))).toBe(1);
    // A late-evening IST instant on the last day is still 1, not 0.
    expect(daysLeftInMonthIST(new Date("2026-08-31T18:29:00Z"))).toBe(1);
  });

  it("handles month lengths and leap years", () => {
    expect(daysInMonthIST(new Date("2026-02-10T06:00:00Z"))).toBe(28);
    expect(daysInMonthIST(new Date("2028-02-10T06:00:00Z"))).toBe(29); // leap
    expect(daysInMonthIST(new Date("2026-04-10T06:00:00Z"))).toBe(30);
    expect(daysInMonthIST(new Date("2026-12-10T06:00:00Z"))).toBe(31);
  });

  it("rolls the year correctly across December", () => {
    const newYearEveIST = new Date("2026-12-31T18:30:00Z"); // 2027-01-01 00:00 IST
    expect(istParts(newYearEveIST).year).toBe(2027);
    expect(istParts(newYearEveIST).month).toBe(0);
    expect(monthKeyIST(newYearEveIST)).toBe("2027-01");
  });

  it("produces a zero-padded month key", () => {
    expect(monthKeyIST(new Date("2026-08-16T09:00:00Z"))).toBe("2026-08");
    expect(monthKeyIST(new Date("2026-03-02T09:00:00Z"))).toBe("2026-03");
  });

  it("classifies weekends by IST day, not UTC day", () => {
    // 2026-08-15T19:00:00Z is Sunday 2026-08-16 00:30 IST — a weekend in IST
    // while still Saturday in UTC.
    expect(isWeekendIST(new Date("2026-08-15T19:00:00Z"))).toBe(true);
    // 2026-08-16T19:00:00Z is Monday 00:30 IST — a weekday in IST while still
    // Sunday in UTC. This is the case a UTC implementation gets wrong.
    expect(isWeekendIST(new Date("2026-08-16T19:00:00Z"))).toBe(false);
  });
});

const { CAPABILITIES, can, explain, GROUP_GRANTABLE } = require("../services/entitlements");

const freeUser = { entitlements: { plan: "free" } };
const plusUser = { entitlements: { plan: "plus", planUntil: new Date(Date.now() + 86400000) } };
const expiredPlus = { entitlements: { plan: "plus", planUntil: new Date(Date.now() - 86400000) } };

const passGroup = { entitlement: { tripPass: true, until: new Date(Date.now() + 86400000) } };
const expiredPass = { entitlement: { tripPass: true, until: new Date(Date.now() - 86400000) } };
const plainGroup = { entitlement: { tripPass: false } };

const allCapabilities = Object.values(CAPABILITIES);

/**
 * This is the only file that turns the paywall ON, and `process.env` is shared
 * by every test file in the run. A `PAYWALL_ENABLED=true` that escaped this
 * file would not fail here — it would fail somewhere else entirely, as a
 * mystery 403 from an integration suite that never mentions entitlements.
 *
 * The per-describe hooks below already restore it; this is the backstop for
 * the case where one of them does not get to run.
 */
const PAYWALL_BEFORE = process.env.PAYWALL_ENABLED;

afterAll(() => {
  if (PAYWALL_BEFORE === undefined) delete process.env.PAYWALL_ENABLED;
  else process.env.PAYWALL_ENABLED = PAYWALL_BEFORE;
});

describe("with the paywall disabled (Milestones 0–7)", () => {
  beforeEach(() => {
    process.env.PAYWALL_ENABLED = "false";
  });

  it("leaves every gate open for a free user", () => {
    for (const capability of allCapabilities) {
      expect(can(freeUser, capability)).toBe(true);
    }
  });

  it("leaves gates open even with no user at all", () => {
    expect(can(null, CAPABILITIES.WEIGHTED_SPLITS)).toBe(true);
  });
});

describe("with the paywall enabled (Milestone 8)", () => {
  beforeEach(() => {
    process.env.PAYWALL_ENABLED = "true";
  });

  afterEach(() => {
    process.env.PAYWALL_ENABLED = "false";
  });

  it("closes every gate for a free user with no group pass", () => {
    for (const capability of allCapabilities) {
      expect(can(freeUser, capability)).toBe(false);
    }
  });

  it("opens every gate for an active Plus subscriber", () => {
    for (const capability of allCapabilities) {
      expect(can(plusUser, capability)).toBe(true);
    }
  });

  it("treats an expired Plus plan as free", () => {
    expect(can(expiredPlus, CAPABILITIES.WIDGETS)).toBe(false);
  });

  it("lets a group Trip Pass unlock group-scoped capabilities for a free member", () => {
    for (const capability of GROUP_GRANTABLE) {
      expect(can(freeUser, capability, { group: passGroup })).toBe(true);
    }
  });

  it("never lets a Trip Pass unlock personal-mode capabilities", () => {
    // The funnel depends on this: ₹199 must not replace five subscriptions.
    const personalOnly = allCapabilities.filter((c) => !GROUP_GRANTABLE.has(c));
    expect(personalOnly.length).toBeGreaterThan(0);
    for (const capability of personalOnly) {
      expect(can(freeUser, capability, { group: passGroup })).toBe(false);
    }
  });

  it("ignores a Trip Pass outside the group scope", () => {
    expect(can(freeUser, CAPABILITIES.WEIGHTED_SPLITS)).toBe(false);
  });

  it("treats an expired or absent Trip Pass as no pass", () => {
    expect(can(freeUser, CAPABILITIES.WRAPPED_EXPORT, { group: expiredPass })).toBe(false);
    expect(can(freeUser, CAPABILITIES.WRAPPED_EXPORT, { group: plainGroup })).toBe(false);
  });
});

describe("capability registry", () => {
  it("rejects an unknown capability rather than silently allowing it", () => {
    expect(() => can(plusUser, "teleportation")).toThrow(/Unknown capability/);
  });

  it("names a concrete benefit for every capability", () => {
    for (const capability of allCapabilities) {
      const reason = explain(capability);
      expect(reason).toMatch(/Plus/);
      expect(reason).not.toMatch(/unlock/i); // "upgrade to unlock" is banned copy
    }
  });
});

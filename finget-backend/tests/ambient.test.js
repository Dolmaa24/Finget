process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const { weekendPreWarning } = require("../services/insights/ruleEngine");

let app;

beforeAll(async () => {
  await connectTestDb();
  app = require("../app").createApp();
}, 120000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

const MS_DAY = 86400000;

async function makeUser(name = "Dolma", email = "dolma@test.com", monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

const ambient = (auth, query = "?context=user") =>
  request(app).get(`/api/finance/ambient${query}`).set("Authorization", auth);

/* ------------------------------------------------------------------ */
/* The ambient payload                                                 */
/* ------------------------------------------------------------------ */

describe("GET /api/finance/ambient", () => {
  it("returns the number, its risk, one line, and when it was true", async () => {
    const user = await makeUser();
    const res = await ambient(user.auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ risk: "Safe", scope: "user" });
    expect(typeof res.body.safeDaily).toBe("number");
    expect(Number.isInteger(res.body.safeDailyPaise)).toBe(true);
    expect(typeof res.body.context).toBe("string");
    // Pre-formatted, so a widget never renders "₹2866.6666666666665".
    expect(res.body.safeDailyLabel).toMatch(/^₹[\d,]+$/);
    expect(new Date(res.body.asOf).toString()).not.toBe("Invalid Date");
  });

  /**
   * This is the whole design constraint: a widget polls this. If it grows goal
   * queries or an insight sweep, it stops being pollable and starts being a
   * battery complaint.
   */
  it("stays a small, fixed payload", async () => {
    const user = await makeUser();
    const res = await ambient(user.auth);

    expect(Object.keys(res.body).sort()).toEqual(
      [
        "asOf",
        "context",
        "label",
        "risk",
        "safeDaily",
        "safeDailyLabel",
        "safeDailyPaise",
        "scope",
      ].sort()
    );
    expect(JSON.stringify(res.body).length).toBeLessThan(300);
  });

  it("never leaks goals, transactions or insights into the payload", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/goals")
      .set("Authorization", user.auth)
      .send({ name: "Goa trip", targetAmount: 40000, priority: "High" });

    const res = await ambient(user.auth);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("Goa");
    expect(body).not.toContain("goalImpacts");
  });

  it("agrees with /affordability — one number, not two", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 12000, category: "Rent", type: "expense" });

    const [full, tiny] = await Promise.all([
      request(app).get("/api/finance/affordability?context=user").set("Authorization", user.auth),
      ambient(user.auth),
    ]);

    expect(tiny.body.safeDaily).toBe(full.body.safeDaily);
    expect(tiny.body.risk).toBe(full.body.risk);
  });

  it("names the group in group scope, and refuses an outsider", async () => {
    const owner = await makeUser("Dolma", "dolma@test.com");
    const stranger = await makeUser("Someone", "someone@test.com");

    const group = (
      await request(app).post("/api/groups").set("Authorization", owner.auth).send({ name: "Goa" })
    ).body;

    const mine = await ambient(owner.auth, `?context=group&groupId=${group._id}`);
    expect(mine.body.scope).toBe("group");
    expect(mine.body.label).toBe("Goa");

    const theirs = await ambient(stranger.auth, `?context=group&groupId=${group._id}`);
    expect(theirs.status).toBe(403);
  });

  it("requires a credential", async () => {
    expect((await request(app).get("/api/finance/ambient")).status).toBe(401);
  });

  it("is reachable with an ambient-scoped token but not a translate-only one", async () => {
    const user = await makeUser();

    const ambientToken = await request(app)
      .post("/api/tokens")
      .set("Authorization", user.auth)
      .send({ name: "Widget", scopes: ["ambient"] });
    expect(ambientToken.status).toBe(201);

    const ok = await request(app)
      .get("/api/finance/ambient")
      .set("Authorization", `Bearer ${ambientToken.body.token}`);
    expect(ok.status).toBe(200);

    const translateOnly = await request(app)
      .post("/api/tokens")
      .set("Authorization", user.auth)
      .send({ name: "Extension", scopes: ["translate"] });

    /**
     * Each scope grants exactly one route. A widget credential must not be able
     * to price things, and an extension credential must not read the number.
     *
     * 401 rather than 403 is deliberate, from Milestone 1: `scopedAuth` does not
     * distinguish unknown, revoked, expired and wrong-scope, because a client's
     * correct response to all four is identical — drop the token and reconnect.
     */
    const refused = await request(app)
      .get("/api/finance/ambient")
      .set("Authorization", `Bearer ${translateOnly.body.token}`);
    expect(refused.status).toBe(401);
    expect(refused.body.reconnect).toBe(true);
  });

  it("says so when the month is already overspent", async () => {
    const user = await makeUser("Dolma", "dolma@test.com", 10000);
    await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 15000, category: "Rent", type: "expense" });

    const res = await ambient(user.auth);
    expect(res.body.risk).toBe("Risky");
    expect(res.body.context).toMatch(/Over by/);
  });
});

/* ------------------------------------------------------------------ */
/* The weekend pre-warning                                             */
/* ------------------------------------------------------------------ */

describe("weekendPreWarning", () => {
  /** 2026-08-21 is a Friday in IST. Weekends fall at 5/6, 12/13, 19/20 days back. */
  const friday = new Date("2026-08-21T06:00:00+05:30");
  const thursday = new Date("2026-08-20T06:00:00+05:30");
  const tuesday = new Date("2026-08-18T06:00:00+05:30");

  const expense = (daysAgo, amount) => ({
    type: "expense",
    date: new Date(friday.getTime() - daysAgo * MS_DAY),
    amount,
  });

  /** Three completed weekends at ₹1,900 each. */
  const threeWeekends = [
    expense(6, 900),
    expense(5, 1000),
    expense(13, 800),
    expense(12, 1100),
    expense(20, 950),
    expense(19, 950),
  ];

  it("produces the sentence the milestone asks for", () => {
    const insight = weekendPreWarning(threeWeekends, { remaining: 800 }, friday);
    expect(insight.description).toBe(
      "₹800 left for the weekend; the last three weekends you spent about ₹1,900."
    );
    expect(insight.source).toBe("rule");
  });

  it("fires on Thursday and Friday, and no other day", () => {
    expect(weekendPreWarning(threeWeekends, { remaining: 800 }, friday)).toBeTruthy();
    expect(weekendPreWarning(threeWeekends, { remaining: 800 }, thursday)).toBeTruthy();
    // Saturday would be too late to change anything; Monday would be a scolding.
    expect(weekendPreWarning(threeWeekends, { remaining: 800 }, tuesday)).toBeNull();
    expect(
      weekendPreWarning(threeWeekends, { remaining: 800 }, new Date("2026-08-22T06:00:00+05:30"))
    ).toBeNull();
  });

  it("says nothing when the weekend is comfortably covered", () => {
    expect(weekendPreWarning(threeWeekends, { remaining: 5000 }, friday)).toBeNull();
  });

  /**
   * The bug this test exists for: a weekend with no recorded spend is
   * indistinguishable from a weekend before the person joined, and averaging
   * the second kind in as ₹0 halved the figure — reporting ₹900 when the two
   * real weekends cost ₹1,900 each.
   */
  it("stays silent rather than counting a no-data weekend as a ₹0 weekend", () => {
    const twoWeekends = [expense(6, 900), expense(5, 1000), expense(13, 800), expense(12, 1100)];
    expect(weekendPreWarning(twoWeekends, { remaining: 100 }, friday)).toBeNull();
  });

  it("says nothing with no history at all", () => {
    expect(weekendPreWarning([], { remaining: 100 }, friday)).toBeNull();
  });

  it("changes its advice once the month is already gone", () => {
    const insight = weekendPreWarning(threeWeekends, { remaining: -500 }, friday);
    expect(insight.actionable_tip).toMatch(/comes out of next month/);
  });

  it("carries structured figures for the push sender", () => {
    const insight = weekendPreWarning(threeWeekends, { remaining: 800 }, friday);
    // The sender cannot re-derive these from prose.
    expect(insight.meta).toMatchObject({ remaining: 800, typical: 1900 });
    expect(insight.meta.shortfall).toBe(1100);
  });

  it("ignores income when measuring what a weekend costs", () => {
    const withIncome = [
      ...threeWeekends,
      { type: "income", date: new Date(friday.getTime() - 6 * MS_DAY), amount: 50000 },
    ];
    const insight = weekendPreWarning(withIncome, { remaining: 800 }, friday);
    expect(insight.meta.typical).toBe(1900);
  });
});

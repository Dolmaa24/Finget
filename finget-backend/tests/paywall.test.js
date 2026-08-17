process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const User = require("../models/User");
const Group = require("../models/Group");
const { FREE_LIMITS, CAPABILITIES } = require("../services/entitlements");
const { consumeCoachMessage, coachUsageFor } = require("../services/coachQuota");
const { monthKeyIST } = require("../utils/time");

/**
 * The paywall, under both flag states.
 *
 * `PAYWALL_ENABLED` is process-global and every test file shares it, so it is
 * set per-test and restored in a `finally` or an `afterEach` — never left on.
 * An escaped "true" surfaces as an unrelated 403 in a suite that never mentions
 * entitlements, which is a genuinely horrible thing to debug.
 */
const PAYWALL_BEFORE = process.env.PAYWALL_ENABLED;

let app;

beforeAll(async () => {
  await connectTestDb();
  app = require("../app").createApp();
}, 120000);

afterAll(async () => {
  if (PAYWALL_BEFORE === undefined) delete process.env.PAYWALL_ENABLED;
  else process.env.PAYWALL_ENABLED = PAYWALL_BEFORE;
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  process.env.PAYWALL_ENABLED = "false";
});

afterEach(() => {
  process.env.PAYWALL_ENABLED = "false";
});

const paywallOn = () => {
  process.env.PAYWALL_ENABLED = "true";
};

async function makeUser(name = "Dolma", email = "dolma@test.com", monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}`, name };
}

/** Grant personal Plus the way a Razorpay webhook eventually will. */
const grantPlus = (userId) =>
  User.findByIdAndUpdate(userId, {
    $set: {
      "entitlements.plan": "plus",
      "entitlements.planUntil": new Date(Date.now() + 30 * 86400000),
    },
  });

/** Grant a group Trip Pass the way a Razorpay webhook eventually will. */
const grantTripPass = (groupId, byUserId) =>
  Group.findByIdAndUpdate(groupId, {
    $set: {
      "entitlement.tripPass": true,
      "entitlement.grantedBy": byUserId,
      "entitlement.until": new Date(Date.now() + 60 * 86400000),
    },
  });

const makeGroup = (auth, body = { name: "Flat" }) =>
  request(app).post("/api/groups").set("Authorization", auth).send(body);

/* ------------------------------------------------------------------ */
/* THE FREE TIER'S PROMISE                                             */
/* ------------------------------------------------------------------ */

/**
 * The most important test in this file.
 *
 * "Free tier must remain genuinely useful forever. The daily number is never
 * paywalled." If someone ever adds a capability check to affordability or
 * ambient, this fails — which is the entire point of writing it down as a test
 * rather than as a comment nobody reads.
 */
describe("the daily number is never paywalled", () => {
  it("stays open with the paywall fully on and no entitlements at all", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 12000, category: "Rent", type: "expense" });

    paywallOn();

    const affordability = await request(app)
      .get("/api/finance/affordability?context=user")
      .set("Authorization", user.auth);
    expect(affordability.status).toBe(200);
    expect(typeof affordability.body.safeDaily).toBe("number");

    const ambient = await request(app)
      .get("/api/finance/ambient?context=user")
      .set("Authorization", user.auth);
    expect(ambient.status).toBe(200);
    expect(typeof ambient.body.safeDaily).toBe("number");
  });

  it("keeps manual entry, goals, the what-if simulator and rule insights free", async () => {
    const user = await makeUser();
    paywallOn();

    const tx = await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 450, category: "Food", type: "expense" });
    expect(tx.status).toBe(200);

    const goal = await request(app)
      .post("/api/goals")
      .set("Authorization", user.auth)
      .send({ name: "Goa trip", targetAmount: 40000, priority: "High" });
    expect(goal.status).toBe(200);

    const translate = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 849900, context: "user" });
    expect(translate.status).toBe(200);

    // Deterministic insights are the free tier's substitute for the coach.
    const insights = await request(app)
      .get("/api/ai/insights?context=user")
      .set("Authorization", user.auth);
    expect(insights.status).toBe(200);
  });

  it("keeps the first group free", async () => {
    const user = await makeUser();
    paywallOn();
    expect((await makeGroup(user.auth)).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* Groups                                                             */
/* ------------------------------------------------------------------ */

describe("the group limit", () => {
  it("allows exactly one created group on free, then names the benefit", async () => {
    const user = await makeUser();
    paywallOn();

    expect((await makeGroup(user.auth, { name: "Flat" })).status).toBe(200);

    const second = await makeGroup(user.auth, { name: "Goa" });
    expect(second.status).toBe(403);
    expect(second.body.capability).toBe(CAPABILITIES.UNLIMITED_GROUPS);
    expect(second.body.limit).toBe(FREE_LIMITS.groups);
    // Names the actual benefit, never "upgrade to unlock".
    expect(second.body.msg).toMatch(/more than one group/i);
    expect(second.body.msg).not.toMatch(/upgrade to unlock/i);
  });

  /**
   * The growth engine depends on this. If joining consumed your one slot, the
   * rational response to a friend's trip invite would be to decline it.
   */
  it("never counts groups you were invited into", async () => {
    const organiser = await makeUser("Priya", "priya@test.com");
    const joiner = await makeUser("Arjun", "arjun@test.com");

    const theirs = (await makeGroup(organiser.auth, { name: "Goa" })).body;

    paywallOn();

    // Joining is free, for everyone, forever.
    const joined = await request(app)
      .post("/api/groups/join")
      .set("Authorization", joiner.auth)
      .send({ inviteCode: theirs.inviteCode });
    expect(joined.status).toBe(200);

    // And it left their own allowance untouched.
    expect((await makeGroup(joiner.auth, { name: "My flat" })).status).toBe(200);
  });

  it("lifts the limit for Plus", async () => {
    const user = await makeUser();
    await grantPlus(user.id);
    paywallOn();

    expect((await makeGroup(user.auth, { name: "One" })).status).toBe(200);
    expect((await makeGroup(user.auth, { name: "Two" })).status).toBe(200);
    expect((await makeGroup(user.auth, { name: "Three" })).status).toBe(200);
  });

  /**
   * A Trip Pass upgrades a TRIP, not an account. If it also minted unlimited
   * groups, ₹199 once would be a permanent substitute for ₹99/month.
   */
  it("is not lifted by a Trip Pass on some other group", async () => {
    const user = await makeUser();
    const first = (await makeGroup(user.auth, { name: "Goa" })).body;
    await grantTripPass(first._id, user.id);

    paywallOn();
    expect((await makeGroup(user.auth, { name: "Second" })).status).toBe(403);
  });

  it("does not fire at all with the paywall off", async () => {
    const user = await makeUser();
    for (const name of ["One", "Two", "Three"]) {
      expect((await makeGroup(user.auth, { name })).status).toBe(200);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Wrapped export                                                     */
/* ------------------------------------------------------------------ */

describe("wrapped export", () => {
  const MS_DAY = 86400000;

  async function tripWithSpend(user) {
    const group = (
      await makeGroup(user.auth, {
        name: "Goa",
        kind: "trip",
        startDate: new Date(Date.now() - 3 * MS_DAY).toISOString(),
        endDate: new Date(Date.now() - 1 * MS_DAY).toISOString(),
        potPaise: 2000000,
      })
    ).body;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 4000, category: "Food", context: "group", groupId: group._id });

    return group;
  }

  it("keeps VIEWING the recap free and gates only the shareable card", async () => {
    const user = await makeUser();
    const group = await tripWithSpend(user);

    paywallOn();

    // The recap is the payoff for a trip they already logged.
    const view = await request(app)
      .get(`/api/groups/${group._id}/wrapped?ai=0`)
      .set("Authorization", user.auth);
    expect(view.status).toBe(200);

    const share = await request(app)
      .post(`/api/groups/${group._id}/wrapped/share`)
      .set("Authorization", user.auth);
    expect(share.status).toBe(403);
    expect(share.body.capability).toBe(CAPABILITIES.WRAPPED_EXPORT);
    expect(share.body.msg).toMatch(/recap itself stays open/i);
  });

  it("is covered by a Trip Pass, for every member", async () => {
    const organiser = await makeUser("Priya", "priya@test.com");
    const member = await makeUser("Arjun", "arjun@test.com");

    const group = await tripWithSpend(organiser);
    await request(app)
      .post("/api/groups/join")
      .set("Authorization", member.auth)
      .send({ inviteCode: group.inviteCode });

    // The organiser pays; the whole table gets the card.
    await grantTripPass(group._id, organiser.id);
    paywallOn();

    for (const who of [organiser, member]) {
      const share = await request(app)
        .post(`/api/groups/${group._id}/wrapped/share`)
        .set("Authorization", who.auth);
      expect(share.status).toBe(201);
    }
  });

  it("is covered by personal Plus too", async () => {
    const user = await makeUser();
    const group = await tripWithSpend(user);
    await grantPlus(user.id);
    paywallOn();

    const share = await request(app)
      .post(`/api/groups/${group._id}/wrapped/share`)
      .set("Authorization", user.auth);
    expect(share.status).toBe(201);
  });

  it("does not fire with the paywall off", async () => {
    const user = await makeUser();
    const group = await tripWithSpend(user);

    const share = await request(app)
      .post(`/api/groups/${group._id}/wrapped/share`)
      .set("Authorization", user.auth);
    expect(share.status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/* The coach meter                                                     */
/* ------------------------------------------------------------------ */

describe("the coach allowance", () => {
  it("counts down and then refuses, on the user document", async () => {
    const user = await makeUser();
    paywallOn();

    const limit = FREE_LIMITS.coachMessagesPerMonth;
    for (let i = 1; i <= limit; i++) {
      const result = await consumeCoachMessage(user.id);
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
    }

    const over = await consumeCoachMessage(user.id);
    expect(over.allowed).toBe(false);
    expect(over.message).toMatch(/free coach messages this month/i);
    // Says what still works rather than only what does not.
    expect(over.message).toMatch(/daily number/i);
  });

  /**
   * The bypass this design exists to close: the meter cannot live in
   * `AIConversation`, because `DELETE /api/ai/coach/history` empties it.
   */
  it("survives clearing the chat history", async () => {
    const user = await makeUser();
    paywallOn();

    for (let i = 0; i < FREE_LIMITS.coachMessagesPerMonth; i++) {
      await consumeCoachMessage(user.id);
    }

    const cleared = await request(app)
      .delete("/api/ai/coach/history?context=user")
      .set("Authorization", user.auth);
    expect(cleared.status).toBe(200);

    // History gone, allowance still spent.
    expect((await consumeCoachMessage(user.id)).allowed).toBe(false);
  });

  it("resets when the IST month rolls over", async () => {
    const user = await makeUser();
    paywallOn();

    for (let i = 0; i < FREE_LIMITS.coachMessagesPerMonth; i++) {
      await consumeCoachMessage(user.id);
    }
    expect((await consumeCoachMessage(user.id)).allowed).toBe(false);

    // Pretend the stored usage belongs to a previous month.
    await User.findByIdAndUpdate(user.id, {
      $set: { "coachUsage.monthKey": "2001-01" },
    });

    const fresh = await consumeCoachMessage(user.id);
    expect(fresh.allowed).toBe(true);
    expect(fresh.used).toBe(1);

    const stored = await User.findById(user.id).lean();
    expect(stored.coachUsage.monthKey).toBe(monthKeyIST());
  });

  it("does not meter Plus at all", async () => {
    const user = await makeUser();
    await grantPlus(user.id);
    paywallOn();

    for (let i = 0; i < FREE_LIMITS.coachMessagesPerMonth + 5; i++) {
      const result = await consumeCoachMessage(user.id);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
    }

    // And never wrote a counter to their document.
    const stored = await User.findById(user.id).lean();
    expect(stored.coachUsage?.count).toBeFalsy();
  });

  it("cannot be overshot by concurrent messages", async () => {
    const user = await makeUser();
    paywallOn();

    const limit = FREE_LIMITS.coachMessagesPerMonth;
    const results = await Promise.all(
      Array.from({ length: limit + 6 }, () => consumeCoachMessage(user.id))
    );

    // Increment-then-decide is atomic; a check-then-increment would let two
    // requests both read "4 used" and both proceed.
    expect(results.filter((r) => r.allowed)).toHaveLength(limit);
  });

  it("reports the meter without consuming it", async () => {
    const user = await makeUser();
    paywallOn();

    await consumeCoachMessage(user.id);
    await consumeCoachMessage(user.id);

    const before = await coachUsageFor(user.id);
    expect(before).toMatchObject({ used: 2, limit: FREE_LIMITS.coachMessagesPerMonth });

    // Reading twice must not move it.
    expect((await coachUsageFor(user.id)).used).toBe(2);
  });

  it("exposes the meter over HTTP", async () => {
    const user = await makeUser();
    paywallOn();
    await consumeCoachMessage(user.id);

    const res = await request(app)
      .get("/api/ai/coach/usage")
      .set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ used: 1, unlimited: false });
  });

  it("answers over SSE rather than erroring when the allowance is spent", async () => {
    const user = await makeUser();
    paywallOn();

    for (let i = 0; i < FREE_LIMITS.coachMessagesPerMonth; i++) {
      await consumeCoachMessage(user.id);
    }

    const res = await request(app)
      .post("/api/ai/coach")
      .set("Authorization", user.auth)
      .send({ question: "how am I doing?", context: "user" });

    /**
     * 200 and a stream, not a 403. The paywall rule is to never block someone
     * mid-action, and a red error toast where a conversation should be is
     * exactly that — the coach explains it in its own voice instead.
     *
     * With no AI key configured this returns the degraded-mode message instead,
     * which is also correct and also not an error, so the assertion is on the
     * status and the stream shape rather than on the wording.
     */
    expect(res.status).toBe(200);
    expect(res.text).toContain("data: ");
    expect(res.text).toContain("[DONE]");
  });

  it("does not meter a question that never reaches a model", async () => {
    const user = await makeUser();
    paywallOn();

    // No GROQ/OPENAI key in tests, so the coach short-circuits to its
    // degraded-mode reply. That costs nothing and must burn nothing.
    await request(app)
      .post("/api/ai/coach")
      .set("Authorization", user.auth)
      .send({ question: "how am I doing?", context: "user" });

    expect((await coachUsageFor(user.id)).used).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Nothing leaks with the flag off                                     */
/* ------------------------------------------------------------------ */

describe("with the paywall off, every gate is open", () => {
  it("leaves import, weighted splits and token minting available", async () => {
    const user = await makeUser();

    const sms = await request(app)
      .post("/api/receipts/parse-sms")
      .set("Authorization", user.auth)
      .send({ text: "Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA x@y Ref 1 -HDFC" });
    expect(sms.status).toBe(200);

    const token = await request(app)
      .post("/api/tokens")
      .set("Authorization", user.auth)
      .send({ name: "Extension", scopes: ["translate"] });
    expect(token.status).toBe(201);

    const group = (await makeGroup(user.auth, { name: "Flat" })).body;
    const preview = await request(app)
      .get(`/api/groups/${group._id}/split-preview?amount=1000&mode=weighted`)
      .set("Authorization", user.auth);
    expect(preview.status).toBe(200);
  });
});

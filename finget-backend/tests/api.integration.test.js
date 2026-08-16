process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");

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

/** Signs up a user and returns { token, id, auth }. */
async function makeUser(name, email, monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return {
    token: res.body.token,
    id: res.body.user._id,
    auth: `Bearer ${res.body.token}`,
  };
}

async function makeGroup(auth, name = "Goa Trip") {
  const res = await request(app).post("/api/groups").set("Authorization", auth).send({ name });
  expect(res.status).toBe(200);
  return res.body;
}

/* ------------------------------------------------------------------ */

describe("POST /api/finance/translate", () => {
  it("translates a price into goal currency in personal scope", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");

    await request(app)
      .post("/api/goals")
      .set("Authorization", user.auth)
      .send({ name: "Goa trip", targetAmount: 60000, context: "user" });

    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 849900, context: "user" });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(8499);
    expect(res.body.currency).toBe("INR");
    expect(res.body).toHaveProperty("headline");
    expect(["goal_delay", "safe_days", "rupees"]).toContain(res.body.headlineKind);
    expect(res.body).toHaveProperty("daysOfSafeSpend");
    expect(Array.isArray(res.body.goalImpacts)).toBe(true);
  });

  it("accepts rupees as a convenience but keeps paise as the contract", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");

    const byPaise = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 849900 });

    const byRupees = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amount: 8499 });

    expect(byPaise.body.amountPaise).toBe(byRupees.body.amountPaise);
    expect(byPaise.body.headline).toBe(byRupees.body.headline);
  });

  it("rejects non-integer paise, missing and non-positive amounts", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const post = (body) =>
      request(app).post("/api/finance/translate").set("Authorization", user.auth).send(body);

    expect((await post({ amountPaise: 10.5 })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ amountPaise: 0 })).status).toBe(400);
    expect((await post({ amountPaise: -100 })).status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/finance/translate").send({ amountPaise: 100 });
    expect(res.status).toBe(401);
  });

  it("agrees with the deprecated /simulate endpoint", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");

    const translated = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 500000 });

    const simulated = await request(app)
      .post("/api/finance/simulate")
      .set("Authorization", user.auth)
      .send({ amount: 5000 });

    expect(simulated.body.remaining).toBe(translated.body.remainingAfter);
    expect(simulated.body.risk).toBe(translated.body.riskAfter);
    expect(simulated.body.headline).toBe(translated.body.headline);
  });
});

/* ------------------------------------------------------------------ */

describe("scope isolation", () => {
  it("refuses to translate against a group the user does not belong to", async () => {
    const owner = await makeUser("Priya", "priya@test.com");
    const outsider = await makeUser("Mallory", "mallory@test.com");
    const group = await makeGroup(owner.auth);

    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", outsider.auth)
      .send({ amountPaise: 100000, context: "group", groupId: group._id });

    expect(res.status).toBe(403);
    expect(res.body.msg).toMatch(/not authorized/i);
  });

  it("refuses group affordability and balances to an outsider", async () => {
    const owner = await makeUser("Priya", "priya@test.com");
    const outsider = await makeUser("Mallory", "mallory@test.com");
    const group = await makeGroup(owner.auth);

    const affordability = await request(app)
      .get(`/api/finance/affordability?context=group&groupId=${group._id}`)
      .set("Authorization", outsider.auth);
    expect(affordability.status).toBe(403);

    const balances = await request(app)
      .get(`/api/groups/${group._id}/balances`)
      .set("Authorization", outsider.auth);
    expect(balances.status).toBe(403);
  });

  it("allows a real member through", async () => {
    const owner = await makeUser("Priya", "priya@test.com", 70000);
    const member = await makeUser("Arjun", "arjun@test.com", 55000);
    const group = await makeGroup(owner.auth);

    await request(app)
      .post("/api/groups/join")
      .set("Authorization", member.auth)
      .send({ inviteCode: group.inviteCode });

    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", member.auth)
      .send({ amountPaise: 100000, context: "group", groupId: group._id });

    expect(res.status).toBe(200);
  });

  it("keeps group spend out of a member's personal number", async () => {
    const owner = await makeUser("Priya", "priya@test.com", 70000);
    const group = await makeGroup(owner.auth);

    await request(app)
      .post("/api/transactions")
      .set("Authorization", owner.auth)
      .send({ amount: 9000, category: "Stay", type: "expense", context: "group", groupId: group._id });

    const personal = await request(app)
      .get("/api/finance/affordability?context=user")
      .set("Authorization", owner.auth);

    expect(personal.status).toBe(200);
    expect(personal.body.expenses).toBe(0);
  });

  it("requires a groupId when context=group", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 100000, context: "group" });
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */

describe("balances reconcile exactly after the paise migration", () => {
  it("nets to zero and clears with the suggested transfers", async () => {
    const a = await makeUser("Alice", "alice@test.com", 90000);
    const b = await makeUser("Bob", "bob@test.com", 60000);
    const c = await makeUser("Carol", "carol@test.com", 50000);
    const group = await makeGroup(a.auth);

    for (const member of [b, c]) {
      await request(app)
        .post("/api/groups/join")
        .set("Authorization", member.auth)
        .send({ inviteCode: group.inviteCode });
    }

    // An amount that does not divide cleanly by three.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", a.auth)
      .send({
        amount: 100.01,
        category: "Food",
        type: "expense",
        context: "group",
        groupId: group._id,
        splitMode: "equal",
      });

    const res = await request(app)
      .get(`/api/groups/${group._id}/balances`)
      .set("Authorization", a.auth);

    expect(res.status).toBe(200);
    const total = res.body.balances.reduce((s, x) => s + Math.round(x.balance * 100), 0);
    expect(total).toBe(0); // exact, not "close to zero"
    expect(res.body.transfers.length).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */

describe("public share routes", () => {
  const { createCard } = require("../services/shareCardService");

  it("serves an OG-tagged page for a valid token", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const card = await createCard({
      kind: "translate",
      ownerId: user.id,
      payload: { amount: 8499, headline: "6 days of your Goa trip", headlineKind: "goal_delay" },
    });

    const res = await request(app).get(`/s/${card.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain('property="og:image"');
    expect(res.text).toContain("6 days of your Goa trip");
  });

  it("needs no authentication", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const card = await createCard({
      kind: "translate",
      ownerId: user.id,
      payload: { amount: 100, headline: "₹100", headlineKind: "rupees" },
    });
    const res = await request(app).get(`/s/${card.token}`); // no Authorization header
    expect(res.status).toBe(200);
  });

  it("404s for unknown, revoked and expired tokens alike", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");

    const unknown = await request(app).get("/s/aaaaaaaaaaaaaaaaaaaaaa");
    expect(unknown.status).toBe(404);

    const revoked = await createCard({
      kind: "translate",
      ownerId: user.id,
      payload: { amount: 100, headline: "₹100", headlineKind: "rupees" },
    });
    const ShareCard = require("../models/ShareCard");
    await ShareCard.updateOne({ _id: revoked._id }, { $set: { revoked: true } });
    expect((await request(app).get(`/s/${revoked.token}`)).status).toBe(404);

    const expired = await createCard({
      kind: "translate",
      ownerId: user.id,
      payload: { amount: 100, headline: "₹100", headlineKind: "rupees" },
      ttlDays: -1,
    });
    expect((await request(app).get(`/s/${expired.token}`)).status).toBe(404);
  });

  it("serves a real PNG on the image route", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const card = await createCard({
      kind: "translate",
      ownerId: user.id,
      payload: {
        amount: 8499,
        headline: "6 days of your Goa trip",
        headlineKind: "goal_delay",
        riskAfter: "Safe",
      },
    });

    const res = await request(app).get(`/s/${card.token}.png`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    // PNG magic number, so a JSON error body cannot pass this by being bytes.
    expect(res.body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    // The spec's budget: a card has to survive being sent over WhatsApp.
    expect(res.body.length).toBeLessThan(100 * 1024);
  }, 30000);

  it("refuses to store a payload that leaks identity", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    await expect(
      createCard({
        kind: "translate",
        ownerId: user.id,
        payload: { amount: 100, headline: "mail me at leak@example.com", headlineKind: "rupees" },
      })
    ).rejects.toThrow(/email/i);
  });

  it("still returns JSON 404 for unknown API routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.msg).toBe("Route not found");
  });
});

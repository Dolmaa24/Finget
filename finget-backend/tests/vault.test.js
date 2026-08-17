process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Deflection = require("../models/Deflection");
const { sweepExpired, GRACE_HOURS, VAULT_HOURS } = require("../services/vaultService");

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

const MS_HOUR = 3600000;

async function makeUser(name = "Dolma", email = "dolma@test.com", monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

const affordability = async (auth, query = "?context=user") =>
  (await request(app).get(`/api/finance/affordability${query}`).set("Authorization", auth)).body;

const openHold = (auth, body) =>
  request(app).post("/api/deflections").set("Authorization", auth).send({ context: "user", ...body });

/* ------------------------------------------------------------------ */
/* The acceptance criterion                                            */
/* ------------------------------------------------------------------ */

describe("a hold moves the number", () => {
  it("lowers safe-to-spend the moment it is created", async () => {
    const user = await makeUser();
    const before = await affordability(user.auth);

    const res = await openHold(user.auth, { label: "Sony headphones", amountPaise: 849900 });
    expect(res.status).toBe(201);

    const after = await affordability(user.auth);

    expect(after.remaining).toBe(before.remaining - 8499);
    expect(after.safeDaily).toBeLessThan(before.safeDaily);
    // The response itself carries both, so the client can animate the drop.
    expect(res.body.safeToSpend.before.remaining).toBe(before.remaining);
    expect(res.body.safeToSpend.after.remaining).toBe(after.remaining);
  });

  it("restores it when the hold is deflected, and credits the ledger", async () => {
    const user = await makeUser();
    const before = await affordability(user.auth);

    const created = await openHold(user.auth, { label: "Headphones", amountPaise: 849900 });

    const resolved = await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", user.auth)
      .send({ decision: "deflected", context: "user" });

    expect(resolved.status).toBe(200);
    expect(resolved.body.released).toBe(true);

    const after = await affordability(user.auth);
    expect(after.remaining).toBe(before.remaining);

    const ledger = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);
    expect(ledger.body.month).toBe(8499);
    expect(ledger.body.count.month).toBe(1);
  });

  it("releases the hold when bought, but never credits the ledger", async () => {
    const user = await makeUser();
    const before = await affordability(user.auth);

    const created = await openHold(user.auth, { label: "Headphones", amountPaise: 849900 });
    await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", user.auth)
      .send({ decision: "bought", context: "user" });

    // The hold stops ring-fencing — a real purchase gets logged as a
    // transaction, and double-counting it here would understate the number.
    const after = await affordability(user.auth);
    expect(after.remaining).toBe(before.remaining);

    const ledger = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);
    expect(ledger.body.month).toBe(0);
  });

  it("holds are an obligation, not an expense", async () => {
    const user = await makeUser();
    await openHold(user.auth, { label: "Headphones", amountPaise: 849900 });

    const a = await affordability(user.auth);
    // If a hold ever landed in `expenses`, the ledger would be crediting back
    // money the app had already recorded as spent.
    expect(a.expenses).toBe(0);
    expect(a.held).toBe(8499);
  });

  it("shows up in the translator and simulator too, not just the dashboard", async () => {
    const user = await makeUser();
    const before = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 100000, context: "user" });

    await openHold(user.auth, { label: "Headphones", amountPaise: 5000000 });

    const after = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", user.auth)
      .send({ amountPaise: 100000, context: "user" });

    expect(after.body.remainingAfter).toBe(before.body.remainingAfter - 50000);
  });
});

/* ------------------------------------------------------------------ */
/* Scope locality                                                      */
/* ------------------------------------------------------------------ */

describe("scope locality", () => {
  it("a personal hold never touches a group's number", async () => {
    const user = await makeUser();
    const group = (
      await request(app).post("/api/groups").set("Authorization", user.auth).send({ name: "Goa" })
    ).body;

    const groupQuery = `?context=group&groupId=${group._id}`;
    const before = await affordability(user.auth, groupQuery);

    await openHold(user.auth, { label: "Personal thing", amountPaise: 849900 });

    const after = await affordability(user.auth, groupQuery);
    expect(after.remaining).toBe(before.remaining);
    expect(after.held).toBe(0);
  });

  it("a group hold never touches personal", async () => {
    const user = await makeUser();
    const group = (
      await request(app).post("/api/groups").set("Authorization", user.auth).send({ name: "Goa" })
    ).body;

    const before = await affordability(user.auth);

    const res = await request(app)
      .post("/api/deflections")
      .set("Authorization", user.auth)
      .send({ label: "Group thing", amountPaise: 500000, context: "group", groupId: group._id });
    expect(res.status).toBe(201);

    const after = await affordability(user.auth);
    expect(after.remaining).toBe(before.remaining);
  });

  it("one user cannot see or resolve another's personal hold", async () => {
    const mine = await makeUser("Dolma", "dolma@test.com");
    const theirs = await makeUser("Someone", "someone@test.com");

    const created = await openHold(mine.auth, { label: "Mine", amountPaise: 100000 });

    const res = await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", theirs.auth)
      .send({ decision: "deflected", context: "user" });
    expect(res.status).toBe(404);

    const ledger = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", theirs.auth);
    expect(ledger.body.holds).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Group rules (B6)                                                    */
/* ------------------------------------------------------------------ */

describe("group holds", () => {
  async function groupWith(auth, name = "Goa") {
    return (await request(app).post("/api/groups").set("Authorization", auth).send({ name })).body;
  }

  /** Income sharing is what gives a group a pooled figure to have headroom in. */
  async function shareIncome(auth, groupId) {
    const res = await request(app)
      .post(`/api/groups/${groupId}/income-sharing`)
      .set("Authorization", auth)
      .send({ optIn: true });
    expect(res.status).toBe(200);
  }

  it("caps a single member at a quarter of group headroom", async () => {
    const admin = await makeUser("Dolma", "dolma@test.com", 100000);
    const group = await groupWith(admin.auth);
    await shareIncome(admin.auth, group._id);

    const headroom = (await affordability(admin.auth, `?context=group&groupId=${group._id}`))
      .remaining;
    const cap = headroom * 0.25;

    const under = await request(app)
      .post("/api/deflections")
      .set("Authorization", admin.auth)
      .send({
        label: "Just under",
        amountPaise: Math.floor(cap * 100) - 100,
        context: "group",
        groupId: group._id,
      });
    expect(under.status).toBe(201);

    // A second hold that would push this one member past the cap.
    const over = await request(app)
      .post("/api/deflections")
      .set("Authorization", admin.auth)
      .send({ label: "Over", amountPaise: 500000, context: "group", groupId: group._id });

    expect(over.status).toBe(409);
    expect(over.body.msg).toMatch(/quarter of the group/i);
  });

  it("does not cap a group that has published no income at all", async () => {
    const admin = await makeUser("Dolma", "dolma@test.com", 100000);
    const group = await groupWith(admin.auth);
    // Nobody opted into income sharing, so the group's pooled income is 0 —
    // it has told Finget nothing, which is not the same as being broke. The
    // quarter-of-headroom cap protects a shared number that does not exist
    // here, so it must not fire and lock the feature out entirely.
    const res = await request(app)
      .post("/api/deflections")
      .set("Authorization", admin.auth)
      .send({ label: "Laptop", amountPaise: 5000000, context: "group", groupId: group._id });

    expect(res.status).toBe(201);
  });

  it("lets a group admin release someone else's hold", async () => {
    const admin = await makeUser("Dolma", "dolma@test.com");
    const member = await makeUser("Someone", "someone@test.com");
    const group = await groupWith(admin.auth);

    await request(app)
      .post("/api/groups/join")
      .set("Authorization", member.auth)
      .send({ inviteCode: group.inviteCode });

    const created = await request(app)
      .post("/api/deflections")
      .set("Authorization", member.auth)
      .send({ label: "Member's hold", amountPaise: 100000, context: "group", groupId: group._id });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", admin.auth)
      .send({ decision: "deflected", context: "group", groupId: group._id });

    expect(res.status).toBe(200);
  });

  it("refuses a non-admin member trying to decide someone else's hold", async () => {
    const admin = await makeUser("Dolma", "dolma@test.com");
    const a = await makeUser("Ana", "ana@test.com");
    const b = await makeUser("Bo", "bo@test.com");
    const group = await groupWith(admin.auth);

    for (const m of [a, b]) {
      await request(app)
        .post("/api/groups/join")
        .set("Authorization", m.auth)
        .send({ inviteCode: group.inviteCode });
    }

    const created = await request(app)
      .post("/api/deflections")
      .set("Authorization", a.auth)
      .send({ label: "Ana's hold", amountPaise: 100000, context: "group", groupId: group._id });

    const res = await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", b.auth)
      .send({ decision: "bought", context: "group", groupId: group._id });

    expect(res.status).toBe(403);
    expect(res.body.msg).toMatch(/only the person|group admin/i);
  });

  it("refuses a hold from someone who is not in the group at all", async () => {
    const admin = await makeUser("Dolma", "dolma@test.com");
    const outsider = await makeUser("Outsider", "out@test.com");
    const group = await groupWith(admin.auth);

    const res = await request(app)
      .post("/api/deflections")
      .set("Authorization", outsider.auth)
      .send({ label: "Nope", amountPaise: 100000, context: "group", groupId: group._id });

    expect(res.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ */
/* The sweep                                                           */
/* ------------------------------------------------------------------ */

describe("auto-resolve sweep", () => {
  async function overdueHold(userId, hoursPastPrompt) {
    const now = Date.now();
    return Deflection.create({
      userId,
      label: "Forgotten",
      amountPaise: 500000,
      state: "considering",
      // vaultUntil is already in the past by `hoursPastPrompt`.
      vaultUntil: new Date(now - hoursPastPrompt * MS_HOUR),
      createdAt: new Date(now - (VAULT_HOURS + hoursPastPrompt) * MS_HOUR),
    });
  }

  it("resolves to deflected after the grace period of silence", async () => {
    const user = await makeUser();
    const d = await overdueHold(user.id, GRACE_HOURS + 1);

    expect(await sweepExpired()).toBe(1);

    const after = await Deflection.findById(d._id).lean();
    expect(after.state).toBe("deflected");
    expect(after.autoResolved).toBe(true);
    expect(after.decidedAt).toBeTruthy();
  });

  it("leaves a hold alone while it is still within the grace period", async () => {
    const user = await makeUser();
    const d = await overdueHold(user.id, GRACE_HOURS - 1);

    expect(await sweepExpired()).toBe(0);
    expect((await Deflection.findById(d._id).lean()).state).toBe("considering");
  });

  it("leaves a hold alone before its 48 hours are even up", async () => {
    const user = await makeUser();
    await openHold(user.auth, { label: "Fresh", amountPaise: 100000 });

    expect(await sweepExpired()).toBe(0);
  });

  it("is idempotent — a second run changes nothing", async () => {
    const user = await makeUser();
    await overdueHold(user.id, GRACE_HOURS + 1);

    expect(await sweepExpired()).toBe(1);
    // This is the property that stops a retried or duplicated job from
    // double-counting the ledger.
    expect(await sweepExpired()).toBe(0);
    expect(await sweepExpired()).toBe(0);

    const ledger = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);
    expect(ledger.body.count.allTime).toBe(1);
  });

  it("is safe when several instances race", async () => {
    const user = await makeUser();
    for (let i = 0; i < 5; i++) await overdueHold(user.id, GRACE_HOURS + 1);

    const results = await Promise.all([sweepExpired(), sweepExpired(), sweepExpired()]);

    // Whoever wins, each document is resolved exactly once in total.
    expect(results.reduce((a, b) => a + b, 0)).toBe(5);
    expect(await Deflection.countDocuments({ state: "considering" })).toBe(0);
    expect(await Deflection.countDocuments({ state: "deflected" })).toBe(5);
  });

  it("never overrides a decision the person already made", async () => {
    const user = await makeUser();
    const d = await overdueHold(user.id, GRACE_HOURS + 1);
    await Deflection.updateOne({ _id: d._id }, { $set: { state: "bought", decidedAt: new Date() } });

    expect(await sweepExpired()).toBe(0);
    expect((await Deflection.findById(d._id).lean()).state).toBe("bought");
  });
});

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

describe("the ledger", () => {
  it("counts only deflections, and offers no way to total what was bought", async () => {
    const user = await makeUser();

    for (const [label, amount, decision] of [
      ["A", 100000, "deflected"],
      ["B", 200000, "bought"],
      ["C", 300000, "deflected"],
    ]) {
      const created = await openHold(user.auth, { label, amountPaise: amount });
      await request(app)
        .post(`/api/deflections/${created.body.deflection._id}/resolve`)
        .set("Authorization", user.auth)
        .send({ decision, context: "user" });
    }

    const res = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);

    expect(res.body.allTime).toBe(4000);
    expect(res.body.count.allTime).toBe(2);

    // The tone rule, enforced: nothing in this payload can be read as a
    // "you caved" figure.
    const body = JSON.stringify(res.body);
    expect(res.body).not.toHaveProperty("boughtTotal");
    expect(res.body).not.toHaveProperty("wasted");
    expect(body).not.toMatch(/wasted|failed|caved/i);
  });

  it("expresses the quarter's total in goal currency", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/goals")
      .set("Authorization", user.auth)
      .send({ name: "Goa trip", targetAmount: 60000, context: "user" });

    const created = await openHold(user.auth, { label: "Headphones", amountPaise: 849900 });
    await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", user.auth)
      .send({ decision: "deflected", context: "user" });

    const res = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);

    expect(res.body.headline).toBeTruthy();
    expect(res.body.headline.text).toBeTruthy();
  });

  it("says nothing rather than '0 days of your Goa trip' when empty", async () => {
    const user = await makeUser();
    const res = await request(app)
      .get("/api/deflections/ledger?context=user")
      .set("Authorization", user.auth);

    expect(res.body.allTime).toBe(0);
    expect(res.body.headline).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe("validation", () => {
  it("rejects a hold with no label — the ledger has to say what it was", async () => {
    const user = await makeUser();
    const res = await openHold(user.auth, { amountPaise: 100000 });
    expect(res.status).toBe(400);
  });

  it("rejects non-integer and non-positive amounts", async () => {
    const user = await makeUser();
    for (const amountPaise of [10.5, 0, -100]) {
      const res = await openHold(user.auth, { label: "x", amountPaise });
      expect(res.status).toBe(400);
    }
  });

  it("rejects an unknown decision", async () => {
    const user = await makeUser();
    const created = await openHold(user.auth, { label: "x", amountPaise: 100000 });
    const res = await request(app)
      .post(`/api/deflections/${created.body.deflection._id}/resolve`)
      .set("Authorization", user.auth)
      .send({ decision: "maybe", context: "user" });
    expect(res.status).toBe(400);
  });

  it("refuses to decide the same hold twice", async () => {
    const user = await makeUser();
    const created = await openHold(user.auth, { label: "x", amountPaise: 100000 });
    const url = `/api/deflections/${created.body.deflection._id}/resolve`;

    expect(
      (await request(app).post(url).set("Authorization", user.auth).send({ decision: "deflected", context: "user" }))
        .status
    ).toBe(200);
    expect(
      (await request(app).post(url).set("Authorization", user.auth).send({ decision: "bought", context: "user" }))
        .status
    ).toBe(409);
  });

  it("requires authentication", async () => {
    expect((await request(app).post("/api/deflections").send({ label: "x", amountPaise: 1 })).status).toBe(401);
    expect((await request(app).get("/api/deflections/ledger")).status).toBe(401);
  });
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

/**
 * Real VAPID keys, generated once here rather than hard-coded: `web-push`
 * validates the curve, so a made-up string would be rejected at
 * `setVapidDetails` and every test would exercise the disabled path instead of
 * the one under test.
 */
const webpush = require("web-push");
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@finget.test";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const PushSubscription = require("../models/PushSubscription");
const PushLog = require("../models/PushLog");
const Deflection = require("../models/Deflection");
const { resetPushConfig } = require("../services/pushService");
const { runVaultExpiry, runTripPace, runWeekendWarning } = require("../services/pushTriggers");

/**
 * Nothing reaches a real push service. `sendNotification` is replaced so the
 * tests assert on what WOULD have been delivered, and so a failing endpoint can
 * be simulated precisely.
 */
const delivered = [];
let nextFailure = null;

beforeAll(() => {
  webpush.sendNotification = async (subscription, payload) => {
    if (nextFailure) {
      const err = new Error(nextFailure.message || "push failed");
      err.statusCode = nextFailure.statusCode;
      throw err;
    }
    delivered.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201 };
  };
});

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
  delivered.length = 0;
  nextFailure = null;
  resetPushConfig();
});

const MS_HOUR = 3600000;

async function makeUser(name = "Dolma", email = "dolma@test.com", monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

const fakeSubscription = (suffix = "a") => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/endpoint-${suffix}`,
  keys: { p256dh: `p256dh-key-${suffix}`, auth: `auth-secret-${suffix}` },
});

const subscribe = (auth, suffix) =>
  request(app)
    .post("/api/push/subscribe")
    .set("Authorization", auth)
    .send({ subscription: fakeSubscription(suffix) });

/* ------------------------------------------------------------------ */
/* Subscription lifecycle                                              */
/* ------------------------------------------------------------------ */

describe("subscribing", () => {
  it("hands out the public key and stores a subscription", async () => {
    const user = await makeUser();

    const config = await request(app).get("/api/push/config").set("Authorization", user.auth);
    expect(config.body.available).toBe(true);
    expect(config.body.publicKey).toBe(vapid.publicKey);
    expect(config.body.devices).toBe(0);

    expect((await subscribe(user.auth, "a")).status).toBe(201);

    const after = await request(app).get("/api/push/config").set("Authorization", user.auth);
    expect(after.body.devices).toBe(1);
  });

  it("never hands out the private key", async () => {
    const user = await makeUser();
    const res = await request(app).get("/api/push/config").set("Authorization", user.auth);
    expect(JSON.stringify(res.body)).not.toContain(vapid.privateKey);
  });

  it("treats one device as one subscription, however many times it registers", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await subscribe(user.auth, "a");
    await subscribe(user.auth, "a");

    expect(await PushSubscription.countDocuments({ userId: user.id })).toBe(1);
  });

  /**
   * A shared laptop signing into a second account must MOVE the subscription,
   * not duplicate it — otherwise the first account keeps pushing to a device
   * that is no longer theirs.
   */
  it("moves a device between accounts rather than duplicating it", async () => {
    const first = await makeUser("Dolma", "dolma@test.com");
    const second = await makeUser("Someone", "someone@test.com");

    await subscribe(first.auth, "shared");
    await subscribe(second.auth, "shared");

    expect(await PushSubscription.countDocuments({})).toBe(1);
    expect(await PushSubscription.countDocuments({ userId: first.id })).toBe(0);
    expect(await PushSubscription.countDocuments({ userId: second.id })).toBe(1);
  });

  it("rejects a malformed subscription", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", user.auth)
      .send({ subscription: { endpoint: "https://example.com" } });
    expect(res.status).toBe(400);
  });

  it("unsubscribes only your own device", async () => {
    const mine = await makeUser("Dolma", "dolma@test.com");
    const theirs = await makeUser("Someone", "someone@test.com");
    await subscribe(mine.auth, "mine");

    // Someone else naming the endpoint must not be able to silence it.
    const attack = await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", theirs.auth)
      .send({ endpoint: fakeSubscription("mine").endpoint });
    expect(attack.body.removed).toBe(0);
    expect(await PushSubscription.countDocuments({})).toBe(1);

    const own = await request(app)
      .post("/api/push/unsubscribe")
      .set("Authorization", mine.auth)
      .send({ endpoint: fakeSubscription("mine").endpoint });
    expect(own.body.removed).toBe(1);
  });

  it("lets one device opt out of a topic without affecting another", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "phone");
    await subscribe(user.auth, "laptop");

    const res = await request(app)
      .put("/api/push/topics")
      .set("Authorization", user.auth)
      .send({ endpoint: fakeSubscription("laptop").endpoint, topics: { weekendWarning: false } });
    expect(res.status).toBe(200);
    expect(res.body.topics.weekendWarning).toBe(false);

    const phone = await PushSubscription.findOne({ endpoint: fakeSubscription("phone").endpoint });
    expect(phone.topics.weekendWarning).toBe(true);
  });

  it("requires a session for every push route", async () => {
    for (const call of [
      request(app).get("/api/push/config"),
      request(app).post("/api/push/subscribe").send({}),
      request(app).post("/api/push/unsubscribe").send({}),
      request(app).put("/api/push/topics").send({}),
    ]) {
      expect((await call).status).toBe(401);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Dead subscriptions                                                  */
/* ------------------------------------------------------------------ */

describe("dead subscriptions", () => {
  async function expiredHold(user) {
    return Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });
  }

  it("is deleted on 410 Gone rather than retried forever", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "gone");
    await expiredHold(user);

    nextFailure = { statusCode: 410, message: "Gone" };
    await runVaultExpiry();

    expect(await PushSubscription.countDocuments({ userId: user.id })).toBe(0);
  });

  it("survives a transient failure but not three of them", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "flaky");

    nextFailure = { statusCode: 500, message: "server error" };

    // Three separate holds, so each is its own claimable event.
    for (let i = 0; i < 3; i++) {
      await Deflection.create({
        userId: user.id,
        label: `Thing ${i}`,
        amountPaise: 100000,
        state: "considering",
        vaultUntil: new Date(Date.now() - MS_HOUR),
      });
      await runVaultExpiry();

      if (i < 2) {
        expect(await PushSubscription.countDocuments({ userId: user.id })).toBe(1);
      }
    }

    expect(await PushSubscription.countDocuments({ userId: user.id })).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Idempotency — the same bar as the Silent Collector                  */
/* ------------------------------------------------------------------ */

describe("triggers send once", () => {
  it("nudges an expired hold exactly once, however often the sweep runs", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await Deflection.create({
      userId: user.id,
      label: "Sony headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });

    expect(await runVaultExpiry()).toBe(1);
    expect(await runVaultExpiry()).toBe(0);
    expect(await runVaultExpiry()).toBe(0);

    expect(delivered).toHaveLength(1);
    expect(delivered[0].payload.title).toMatch(/Sony headphones/);
    expect(delivered[0].payload.href).toBe("/ledger");
  });

  it("sends once when sweeps run concurrently", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });

    const results = await Promise.all([
      runVaultExpiry(),
      runVaultExpiry(),
      runVaultExpiry(),
      runVaultExpiry(),
    ]);

    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(delivered).toHaveLength(1);
  });

  it("reaches every device a person has, but claims the event once", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "phone");
    await subscribe(user.auth, "laptop");
    await Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });

    expect(await runVaultExpiry()).toBe(2);
    expect(delivered).toHaveLength(2);
    expect(await PushLog.countDocuments({ topic: "vaultExpiry" })).toBe(1);

    expect(await runVaultExpiry()).toBe(0);
  });

  it("respects a per-device topic opt-out", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "phone");
    await request(app)
      .put("/api/push/topics")
      .set("Authorization", user.auth)
      .send({ endpoint: fakeSubscription("phone").endpoint, topics: { vaultExpiry: false } });

    await Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });

    expect(await runVaultExpiry()).toBe(0);
    expect(delivered).toHaveLength(0);
  });

  it("says nothing about a hold whose 48 hours are still running", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "considering",
      vaultUntil: new Date(Date.now() + MS_HOUR),
    });

    expect(await runVaultExpiry()).toBe(0);
  });

  it("says nothing about a hold already decided", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await Deflection.create({
      userId: user.id,
      label: "Headphones",
      amountPaise: 849900,
      state: "deflected",
      decidedAt: new Date(),
      vaultUntil: new Date(Date.now() - MS_HOUR),
    });

    expect(await runVaultExpiry()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Trip pace                                                           */
/* ------------------------------------------------------------------ */

describe("trip pace", () => {
  const MS_DAY = 86400000;

  async function runningTrip(user, { spent, potPaise = 2000000 }) {
    const group = (
      await request(app)
        .post("/api/groups")
        .set("Authorization", user.auth)
        .send({
          name: "Goa",
          kind: "trip",
          startDate: new Date(Date.now() - 3 * MS_DAY).toISOString(),
          endDate: new Date(Date.now() + 2 * MS_DAY).toISOString(),
          potPaise,
        })
    ).body;

    if (spent) {
      await request(app)
        .post("/api/transactions")
        .set("Authorization", user.auth)
        .send({ amount: spent, category: "Food", context: "group", groupId: group._id });
    }
    return group;
  }

  it("warns once a day when a trip is running hot", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await runningTrip(user, { spent: 18000 }); // ₹18k of a ₹20k pot, on day 4 of 6

    expect(await runTripPace()).toBe(1);
    expect(delivered[0].payload.title).toMatch(/Goa/);

    // Same day, same trip: nothing more, however busy the group gets.
    expect(await runTripPace()).toBe(0);
    expect(await runTripPace()).toBe(0);
  });

  it("stays quiet on a trip that is on pace", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await runningTrip(user, { spent: 2000 });

    expect(await runTripPace()).toBe(0);
  });

  it("stays quiet on a trip with no pot to measure against", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    await runningTrip(user, { spent: 18000, potPaise: 0 });

    expect(await runTripPace()).toBe(0);
  });

  it("stays quiet after the trip has ended", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");

    const group = (
      await request(app)
        .post("/api/groups")
        .set("Authorization", user.auth)
        .send({
          name: "Old trip",
          kind: "trip",
          startDate: new Date(Date.now() - 20 * MS_DAY).toISOString(),
          endDate: new Date(Date.now() - 10 * MS_DAY).toISOString(),
          potPaise: 2000000,
        })
    ).body;

    await request(app)
      .post("/api/transactions")
      .set("Authorization", user.auth)
      .send({ amount: 19000, category: "Food", context: "group", groupId: group._id });

    // A pace warning after the fact is a review nobody asked for.
    expect(await runTripPace()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Weekend warning                                                     */
/* ------------------------------------------------------------------ */

describe("weekend warning", () => {
  it("only runs on a Friday", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");

    const wednesday = new Date("2026-08-19T09:00:00+05:30");
    expect(await runWeekendWarning(wednesday)).toBe(0);
  });

  it("claims the day so a person is warned once, not four times", async () => {
    const user = await makeUser();
    await subscribe(user.auth, "a");
    const friday = new Date("2026-08-21T09:00:00+05:30");

    // Whether or not this user qualifies, running it repeatedly must never
    // produce a second notification for the same day.
    await runWeekendWarning(friday);
    const first = await PushLog.countDocuments({ topic: "weekendWarning" });

    await runWeekendWarning(friday);
    await runWeekendWarning(friday);

    expect(await PushLog.countDocuments({ topic: "weekendWarning" })).toBe(first);
  });
});

/* ------------------------------------------------------------------ */
/* Degraded mode                                                       */
/* ------------------------------------------------------------------ */

describe("with no VAPID keys", () => {
  const saved = {};

  beforeEach(() => {
    saved.pub = process.env.VAPID_PUBLIC_KEY;
    saved.priv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    resetPushConfig();
  });

  afterEach(() => {
    process.env.VAPID_PUBLIC_KEY = saved.pub;
    process.env.VAPID_PRIVATE_KEY = saved.priv;
    resetPushConfig();
  });

  it("says so plainly and refuses to pretend a subscription worked", async () => {
    const user = await makeUser();

    const config = await request(app).get("/api/push/config").set("Authorization", user.auth);
    expect(config.body.available).toBe(false);
    expect(config.body.publicKey).toBeNull();
    expect(config.body.unavailableReason).toMatch(/VAPID/);

    const res = await subscribe(user.auth, "a");
    expect(res.status).toBe(503);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });
});

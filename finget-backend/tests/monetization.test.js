process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
// Baseline at import, before `app` is required — see `resetPaywall` below.
process.env.PAYWALL_ENABLED = "false";

/**
 * A fully configured gateway, so the code under test is the real path.
 * `fetch` is stubbed below, so no request ever leaves the machine and no order
 * is ever created at Razorpay.
 */
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.RAZORPAY_KEY_ID = "rzp_test_FAKEKEYFORTESTS";
process.env.RAZORPAY_KEY_SECRET = "test-secret-not-real";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";

const crypto = require("crypto");
const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Group = require("../models/Group");
const Notification = require("../models/Notification");
const { PRODUCTS } = require("../services/pricing");
const { tripPassWindow, plusUntil } = require("../services/entitlementService");

const {
  isGoalMature,
  offerForGoal,
  isCompletionAvailable,
  _registerProvider,
  _resetProvider,
} = require("../services/goalCompletionService");


/**
 * Every outbound call is intercepted. Razorpay order creation is the only one
 * this suite triggers, and it must never reach the network — a test that can
 * create a real order is a test that can charge a real card.
 */
const orders = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.razorpay.com")) {
      const body = JSON.parse(init.body);
      const orderId = `order_TEST${orders.length + 1}`;
      orders.push({ orderId, ...body, headers: init.headers });
      return new Response(
        JSON.stringify({ id: orderId, amount: body.amount, currency: "INR", status: "created" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected outbound request in tests: ${url}`);
  };
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

/**
 * Always back to "false", never "whatever it was at import".
 *
 * Vitest gives each test file its own process — verified by instrumenting every
 * file in the suite and finding 24 distinct pids with zero overlap — so
 * `process.env` genuinely cannot leak between files here and a capture/restore
 * would be safe too. This is the simpler invariant regardless: "false" is the
 * baseline every other suite assumes, and asserting it directly means this file
 * cannot be the reason an unrelated suite sees a mystery 403.
 */
const resetPaywall = () => {
  process.env.PAYWALL_ENABLED = "false";
};

let app;

beforeAll(async () => {
  await connectTestDb();
  app = require("../app").createApp();
}, 120000);

afterAll(async () => {
  resetPaywall();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  orders.length = 0;
  process.env.PAYWALL_ENABLED = "false";
  _resetProvider();
});

afterEach(() => {
  process.env.PAYWALL_ENABLED = "false";
  _resetProvider();
});

const MS_DAY = 86400000;

async function makeUser(name = "Dolma", email = "dolma@test.com") {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome: 90000 });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}`, name };
}

const order = (auth, body) =>
  request(app).post("/api/payments/order").set("Authorization", auth).send(body);

/** A Razorpay-shaped webhook body. */
function capturedEvent(orderId, paymentId, amountPaise) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: paymentId, order_id: orderId, amount: amountPaise, status: "captured" },
      },
    },
  };
}

const sign = (body) =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(Buffer.from(JSON.stringify(body)))
    .digest("hex");

/** Deliver a webhook exactly as Razorpay would. */
const deliver = (body, signature) =>
  request(app)
    .post("/api/payments/webhook")
    .set("Content-Type", "application/json")
    .set("X-Razorpay-Signature", signature ?? sign(body))
    .send(JSON.stringify(body));

/* ------------------------------------------------------------------ */
/* THE CLIENT NEVER NAMES A PRICE                                      */
/* ------------------------------------------------------------------ */

describe("order creation", () => {
  it("takes a product key and prices it server-side", async () => {
    const user = await makeUser();
    const res = await order(user.auth, { productKey: "plus_monthly" });

    expect(res.status).toBe(201);
    expect(res.body.amountPaise).toBe(PRODUCTS.plus_monthly.amountPaise);
    // The amount sent to Razorpay came from the catalogue, not the request.
    expect(orders[0].amount).toBe(PRODUCTS.plus_monthly.amountPaise);
  });

  it("ignores an amount the client tries to name", async () => {
    const user = await makeUser();
    const res = await order(user.auth, {
      productKey: "plus_yearly",
      amount: 1,
      amountPaise: 100,
      price: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.amountPaise).toBe(PRODUCTS.plus_yearly.amountPaise);
    expect(orders[0].amount).toBe(PRODUCTS.plus_yearly.amountPaise);
  });

  it("refuses a product that is not in the catalogue", async () => {
    const user = await makeUser();
    expect((await order(user.auth, { productKey: "plus_free_forever" })).status).toBe(400);
    expect((await order(user.auth, {})).status).toBe(400);
  });

  it("records the order locally before the provider is called", async () => {
    const user = await makeUser();
    await order(user.auth, { productKey: "plus_monthly" });

    const row = await Payment.findOne({ userId: user.id }).lean();
    expect(row).toMatchObject({
      productKey: "plus_monthly",
      status: "created",
      amountPaise: PRODUCTS.plus_monthly.amountPaise,
    });
    expect(row.providerPaymentId).toBeUndefined();
  });

  it("never exposes the secret or the webhook secret", async () => {
    const user = await makeUser();
    const [config, created] = await Promise.all([
      request(app).get("/api/payments/config").set("Authorization", user.auth),
      order(user.auth, { productKey: "plus_monthly" }),
    ]);

    const body = JSON.stringify(config.body) + JSON.stringify(created.body);
    expect(body).not.toContain(process.env.RAZORPAY_KEY_SECRET);
    expect(body).not.toContain(process.env.RAZORPAY_WEBHOOK_SECRET);
    // The key id is public by design — Checkout needs it in the browser.
    expect(config.body.publicKey).toBe(process.env.RAZORPAY_KEY_ID);
  });

  it("says it is in test mode, out loud", async () => {
    const user = await makeUser();
    const config = await request(app).get("/api/payments/config").set("Authorization", user.auth);
    expect(config.body.testMode).toBe(true);
  });

  it("requires a group for a Trip Pass, and membership of it", async () => {
    const owner = await makeUser("Priya", "priya@test.com");
    const stranger = await makeUser("Someone", "someone@test.com");

    expect((await order(owner.auth, { productKey: "trip_pass" })).status).toBe(400);

    const group = (
      await request(app).post("/api/groups").set("Authorization", owner.auth).send({ name: "Goa" })
    ).body;

    expect(
      (await order(stranger.auth, { productKey: "trip_pass", groupId: group._id })).status
    ).toBe(403);
    expect((await order(owner.auth, { productKey: "trip_pass", groupId: group._id })).status).toBe(
      201
    );
  });

  it("refuses a second Trip Pass for a trip already covered", async () => {
    const user = await makeUser();
    const group = (
      await request(app).post("/api/groups").set("Authorization", user.auth).send({ name: "Goa" })
    ).body;

    await Group.findByIdAndUpdate(group._id, {
      $set: {
        "entitlement.tripPass": true,
        "entitlement.until": new Date(Date.now() + 30 * MS_DAY),
      },
    });

    const second = await order(user.auth, { productKey: "trip_pass", groupId: group._id });
    expect(second.status).toBe(409);
  });

  it("requires a session", async () => {
    expect((await request(app).post("/api/payments/order").send({ productKey: "plus_monthly" })).status).toBe(401);
    expect((await request(app).get("/api/payments/config")).status).toBe(401);
    expect((await request(app).get("/api/payments/history")).status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* NOTHING IS GRANTED OUTSIDE THE WEBHOOK                              */
/* ------------------------------------------------------------------ */

describe("the webhook is the only thing that grants", () => {
  it("refuses an unsigned delivery", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(capturedEvent(created.body.orderId, "pay_1", 9900)));

    expect(res.status).toBe(401);
    const after = await User.findById(user.id).lean();
    expect(after.entitlements.plan).toBe("free");
  });

  it("refuses a delivery signed with the wrong secret", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });
    const body = capturedEvent(created.body.orderId, "pay_1", 9900);

    const forged = crypto
      .createHmac("sha256", "not-the-secret")
      .update(Buffer.from(JSON.stringify(body)))
      .digest("hex");

    expect((await deliver(body, forged)).status).toBe(401);
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
  });

  it("refuses a tampered body that carries a signature for different bytes", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    const original = capturedEvent(created.body.orderId, "pay_1", 9900);
    const signature = sign(original);
    // Same signature, different payload — a yearly grant for a monthly payment.
    const tampered = capturedEvent(created.body.orderId, "pay_1", 89900);

    expect((await deliver(tampered, signature)).status).toBe(401);
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
  });

  it("grants Plus on a verified capture", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    const res = await deliver(
      capturedEvent(created.body.orderId, "pay_REAL", PRODUCTS.plus_monthly.amountPaise)
    );
    expect(res.status).toBe(200);

    const after = await User.findById(user.id).lean();
    expect(after.entitlements.plan).toBe("plus");
    expect(new Date(after.entitlements.planUntil).getTime()).toBeGreaterThan(Date.now());

    const row = await Payment.findOne({ providerOrderId: created.body.orderId }).lean();
    expect(row.status).toBe("paid");
    expect(row.providerPaymentId).toBe("pay_REAL");
    expect(row.grantedAt).toBeTruthy();
  });

  /**
   * Razorpay retries until it gets a 2xx, so a capture WILL arrive more than
   * once. Granting twice would hand out two months for one payment.
   */
  it("grants once however many times the webhook is redelivered", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });
    const body = capturedEvent(created.body.orderId, "pay_ONCE", PRODUCTS.plus_monthly.amountPaise);

    await deliver(body);
    const afterFirst = await User.findById(user.id).lean();

    await deliver(body);
    await deliver(body);
    await deliver(body);

    const afterMany = await User.findById(user.id).lean();
    // The expiry did not move on the redeliveries.
    expect(new Date(afterMany.entitlements.planUntil).getTime()).toBe(
      new Date(afterFirst.entitlements.planUntil).getTime()
    );
  });

  it("grants once under concurrent redelivery", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_yearly" });
    const body = capturedEvent(created.body.orderId, "pay_RACE", PRODUCTS.plus_yearly.amountPaise);

    await Promise.all([deliver(body), deliver(body), deliver(body), deliver(body)]);

    const notifications = await Notification.countDocuments({ userId: user.id, kind: "system" });
    expect(notifications).toBe(1);
  });

  /**
   * The amount check. An order tampered with anywhere between creation and
   * capture must not buy a year of Plus for ₹1.
   */
  it("refuses to grant when the captured amount is not what was ordered", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_yearly" });

    await deliver(capturedEvent(created.body.orderId, "pay_CHEAP", 100));

    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
    const row = await Payment.findOne({ providerOrderId: created.body.orderId }).lean();
    expect(row.status).toBe("failed");
    expect(row.failureReason).toMatch(/amount mismatch/i);
  });

  it("ignores a capture for an order it never created", async () => {
    const res = await deliver(capturedEvent("order_NEVER_SEEN", "pay_X", 9900));
    // 200, because retrying will never make an unknown order known.
    expect(res.status).toBe(200);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("acknowledges events it does not act on", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    const authorized = {
      event: "payment.authorized",
      payload: { payment: { entity: { id: "pay_A", order_id: created.body.orderId, amount: 9900 } } },
    };
    expect((await deliver(authorized)).status).toBe(200);

    // Authorised is not captured — no money has settled, so nothing is granted.
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
  });

  it("records a failure without granting", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    await deliver({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_F",
            order_id: created.body.orderId,
            amount: 9900,
            error_description: "Card declined",
          },
        },
      },
    });

    const row = await Payment.findOne({ providerOrderId: created.body.orderId }).lean();
    expect(row.status).toBe("failed");
    expect(row.failureReason).toMatch(/declined/i);
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
  });

  it("has no endpoint that grants from a client callback", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });

    /**
     * The shapes a client-side "payment succeeded, please upgrade me" call would
     * take. None of these may exist — the browser callback is a UI hint, and a
     * user-controlled one at that.
     */
    for (const path of [
      "/api/payments/verify",
      "/api/payments/confirm",
      "/api/payments/success",
      "/api/payments/capture",
    ]) {
      const res = await request(app)
        .post(path)
        .set("Authorization", user.auth)
        .send({ orderId: created.body.orderId, paymentId: "pay_CLIENT", signature: "whatever" });
      expect([404, 405]).toContain(res.status);
    }

    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
  });
});

/* ------------------------------------------------------------------ */
/* The Trip Pass                                                       */
/* ------------------------------------------------------------------ */

describe("the Trip Pass", () => {
  async function tripAndPass(organiser) {
    const group = (
      await request(app)
        .post("/api/groups")
        .set("Authorization", organiser.auth)
        .send({
          name: "Goa",
          kind: "trip",
          startDate: new Date(Date.now() - MS_DAY).toISOString(),
          endDate: new Date(Date.now() + 4 * MS_DAY).toISOString(),
          potPaise: 2000000,
        })
    ).body;

    const created = await order(organiser.auth, { productKey: "trip_pass", groupId: group._id });
    await deliver(
      capturedEvent(created.body.orderId, `pay_TRIP_${group._id}`, PRODUCTS.trip_pass.amountPaise)
    );

    return group;
  }

  it("upgrades the group, not the buyer's account", async () => {
    const organiser = await makeUser();
    const group = await tripAndPass(organiser);

    const after = await Group.findById(group._id).lean();
    expect(after.entitlement.tripPass).toBe(true);
    expect(String(after.entitlement.grantedBy)).toBe(organiser.id);

    // ₹199 must not become a permanent substitute for ₹99/month.
    expect((await User.findById(organiser.id).lean()).entitlements.plan).toBe("free");
  });

  /**
   * The funnel. The organiser pays, four to six people get Plus features for the
   * trip, and they meet the personal paywall later on their own.
   */
  it("covers a member who joins AFTER the purchase", async () => {
    const organiser = await makeUser("Priya", "priya@test.com");
    const latecomer = await makeUser("Arjun", "arjun@test.com");

    const group = await tripAndPass(organiser);

    await request(app)
      .post("/api/groups/join")
      .set("Authorization", latecomer.auth)
      .send({ inviteCode: group.inviteCode });

    process.env.PAYWALL_ENABLED = "true";

    // A group-grantable capability, reached by someone who paid nothing.
    const preview = await request(app)
      .get(`/api/groups/${group._id}/split-preview?amount=4000&mode=weighted`)
      .set("Authorization", latecomer.auth);
    expect(preview.status).toBe(200);
  });

  it("lasts past the end of the trip, so Wrapped still works", async () => {
    const endDate = new Date(Date.now() + 4 * MS_DAY);
    const until = tripPassWindow({ endDate });

    // The recap is generated after the trip; a window closing on the end date
    // would sell someone a card they could not export.
    expect(until.getTime()).toBeGreaterThan(endDate.getTime());
    expect(Math.round((until - endDate) / MS_DAY)).toBe(30);
  });

  it("falls back to 90 days when a trip has no dates yet", async () => {
    const now = new Date();
    const until = tripPassWindow({}, now);
    expect(Math.round((until - now) / MS_DAY)).toBe(90);
  });

  it("tells every member, not just the buyer", async () => {
    const organiser = await makeUser("Priya", "priya@test.com");
    const member = await makeUser("Arjun", "arjun@test.com");

    const group = (
      await request(app).post("/api/groups").set("Authorization", organiser.auth).send({ name: "Goa", kind: "trip", startDate: new Date().toISOString(), endDate: new Date(Date.now() + MS_DAY).toISOString() })
    ).body;

    await request(app)
      .post("/api/groups/join")
      .set("Authorization", member.auth)
      .send({ inviteCode: group.inviteCode });

    const created = await order(organiser.auth, { productKey: "trip_pass", groupId: group._id });
    await deliver(capturedEvent(created.body.orderId, "pay_TP", PRODUCTS.trip_pass.amountPaise));

    // A member who never learns they got Plus features cannot use them.
    expect(await Notification.countDocuments({ userId: member.id })).toBe(1);
    expect(await Notification.countDocuments({ userId: organiser.id })).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

describe("refunds", () => {
  it("revoke what the payment granted", async () => {
    const user = await makeUser();
    const created = await order(user.auth, { productKey: "plus_monthly" });
    await deliver(
      capturedEvent(created.body.orderId, "pay_R", PRODUCTS.plus_monthly.amountPaise)
    );
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("plus");

    await deliver({
      event: "refund.processed",
      payload: { payment: { entity: { id: "pay_R", order_id: created.body.orderId, amount: 9900 } } },
    });

    // Returning the money and keeping the product is not a refund.
    expect((await User.findById(user.id).lean()).entitlements.plan).toBe("free");
    expect((await Payment.findOne({ providerOrderId: created.body.orderId }).lean()).status).toBe(
      "refunded"
    );
  });

  it("revoke a Trip Pass from the group", async () => {
    const user = await makeUser();
    const group = (
      await request(app).post("/api/groups").set("Authorization", user.auth).send({ name: "Goa" })
    ).body;

    const created = await order(user.auth, { productKey: "trip_pass", groupId: group._id });
    await deliver(capturedEvent(created.body.orderId, "pay_TR", PRODUCTS.trip_pass.amountPaise));
    expect((await Group.findById(group._id).lean()).entitlement.tripPass).toBe(true);

    await deliver({
      event: "refund.processed",
      payload: { payment: { entity: { id: "pay_TR", order_id: created.body.orderId, amount: 19900 } } },
    });

    expect((await Group.findById(group._id).lean()).entitlement.tripPass).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Renewal maths                                                       */
/* ------------------------------------------------------------------ */

describe("renewing early", () => {
  it("adds to the remaining time rather than throwing it away", async () => {
    const now = new Date("2026-08-17T00:00:00Z");
    const existing = { entitlements: { planUntil: new Date("2026-09-01T00:00:00Z") } };

    const until = plusUntil(existing, 31, now);
    // Extends from the existing expiry, not from today.
    expect(until.toISOString().slice(0, 10)).toBe("2026-10-02");
  });

  it("extends from today when the plan has already lapsed", async () => {
    const now = new Date("2026-08-17T00:00:00Z");
    const lapsed = { entitlements: { planUntil: new Date("2026-01-01T00:00:00Z") } };

    const until = plusUntil(lapsed, 31, now);
    expect(until.toISOString().slice(0, 10)).toBe("2026-09-17");
  });
});

/* ------------------------------------------------------------------ */
/* Degraded mode                                                       */
/* ------------------------------------------------------------------ */

describe("with no payment keys", () => {
  const saved = {};

  beforeEach(() => {
    saved.id = process.env.RAZORPAY_KEY_ID;
    saved.secret = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = saved.id;
    process.env.RAZORPAY_KEY_SECRET = saved.secret;
  });

  it("says so and refuses to open an order", async () => {
    const user = await makeUser();

    const config = await request(app).get("/api/payments/config").set("Authorization", user.auth);
    expect(config.body.available).toBe(false);
    expect(config.body.publicKey).toBeNull();
    expect(config.body.unavailableReason).toMatch(/RAZORPAY/);

    expect((await order(user.auth, { productKey: "plus_monthly" })).status).toBe(503);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("still refuses a forged webhook exactly as loudly", async () => {
    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(capturedEvent("order_X", "pay_X", 9900)));
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/* NO INVESTMENT RECOMMENDATION SHIPS                                  */
/* ------------------------------------------------------------------ */

/**
 * The regulatory guard. `services/goalCompletionService.js` is a documented seam
 * blocked on AMFI/SEBI registration and a legal review; until those exist it
 * must return nothing actionable. These tests are what stop a future edit from
 * quietly switching it on.
 */
describe("goal completion is a seam, not a feature", () => {
  it("ships with no provider", () => {
    expect(isCompletionAvailable()).toBe(false);
  });

  it("offers nothing, for any goal, however mature", async () => {
    const funded = { name: "Goa trip", targetAmount: 40000, currentAmount: 40000 };
    const overfunded = { name: "Laptop", targetAmount: 50000, currentAmount: 90000 };
    const expired = {
      name: "Bike",
      targetAmount: 100000,
      currentAmount: 95000,
      deadline: new Date(Date.now() - 30 * MS_DAY),
    };

    for (const goal of [funded, overfunded, expired]) {
      expect(await offerForGoal(goal, {})).toBeNull();
    }
  });

  it("still recognises a mature goal, because saying so is not regulated", () => {
    expect(isGoalMature({ targetAmount: 40000, currentAmount: 40000 })).toBe(true);
    expect(isGoalMature({ targetAmount: 40000, currentAmount: 39999 })).toBe(false);
    expect(isGoalMature({ targetAmount: 0, currentAmount: 0 })).toBe(false);
    expect(
      isGoalMature({
        targetAmount: 100000,
        currentAmount: 85000,
        deadline: new Date(Date.now() - MS_DAY),
      })
    ).toBe(true);
  });

  /**
   * THE ACTUAL GUARD, and it is a source scan rather than a behaviour check.
   *
   * `_registerProvider` exists so a reviewed, registered future can plug a
   * provider in — which means no runtime assertion can distinguish "shipped
   * with a provider" from "a test registered one". What CAN be checked is that
   * shipped code never calls it. Same technique as
   * `tests/no-bare-hundreds.test.js`, which greps for stray `* 100`: the whole
   * bug class, caught at the only moment it is cheap.
   *
   * If this fails, someone wired an investment recommendation into a product
   * that is not registered to give one. Do not "fix" it by editing this test.
   */
  it("has no provider registered anywhere in shipped code", () => {
    const fs = require("fs");
    const path = require("path");

    const root = path.join(__dirname, "..");
    const skip = new Set(["node_modules", "tests", ".git", "coverage", ".claude"]);
    const offenders = [];

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".js")) {
          const source = fs.readFileSync(full, "utf8");
          // The definition itself lives in goalCompletionService; a CALL is the
          // thing that would switch it on.
          const calls = source.match(/_registerProvider\s*\(/g) || [];
          const isDefinition = full.endsWith(path.join("services", "goalCompletionService.js"));
          if (calls.length > 0 && !isDefinition) {
            offenders.push(path.relative(root, full));
          }
        }
      }
    };

    walk(root);

    expect(
      offenders,
      `A goal-completion provider is registered in: ${offenders.join(", ")}. ` +
        "Distributing an investment product needs AMFI/SEBI registration and a legal " +
        "review first — see the TODO at the top of services/goalCompletionService.js."
    ).toEqual([]);
  });

  it("rejects a malformed provider", () => {
    expect(() => _registerProvider({ name: "broken" })).toThrow(/offerFor/);
    expect(() => _registerProvider(null)).toThrow();
  });
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

/**
 * A fully configured provider, so the webhook path under test is the real one.
 * `sendText` is mocked below, so nothing reaches the network.
 */
process.env.WHATSAPP_PROVIDER = "meta";
process.env.WHATSAPP_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
process.env.WHATSAPP_APP_SECRET = "test-app-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";

const crypto = require("crypto");
const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const BotAction = require("../models/BotAction");
const User = require("../models/User");
const { parseMessage } = require("../services/messageParser");
const { normalisePhone } = require("../services/whatsappService");

/**
 * Outbound sends are intercepted at the TRANSPORT, not at the service.
 *
 * Stubbing `sendText` would have skipped the very code most worth testing —
 * the Graph URL, the auth header, the message envelope. Stubbing `fetch`
 * instead runs the real Meta adapter and asserts on what it would have put on
 * the wire, while guaranteeing nothing leaves the machine.
 */
const sent = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("graph.facebook.com")) {
      const body = JSON.parse(init.body);
      sent.push({ to: body.to, body: body.text.body, url: String(url), headers: init.headers });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.SENT" }] }), { status: 200 });
    }
    throw new Error(`Unexpected outbound request in tests: ${url}`);
  };
});

afterAll(() => {
  globalThis.fetch = realFetch;
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
  sent.length = 0;
});

const PHONE = "919876543210";

/* ------------------------------------------------------------------ */
/* Webhook plumbing                                                    */
/* ------------------------------------------------------------------ */

/** A Meta-shaped delivery for one text message. */
function metaPayload(text, { from = PHONE, id } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              messages: [
                {
                  from,
                  id: id || `wamid.${crypto.randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function sign(body) {
  return (
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
      .update(Buffer.from(JSON.stringify(body)))
      .digest("hex")
  );
}

/** Post a signed webhook exactly as Meta would. */
function deliver(body) {
  return request(app)
    .post("/api/whatsapp/webhook")
    .set("Content-Type", "application/json")
    .set("X-Hub-Signature-256", sign(body))
    .send(JSON.stringify(body));
}

/** Send `text` from a number and return whatever the bot replied. */
async function say(text, opts = {}) {
  const before = sent.length;
  const res = await deliver(metaPayload(text, opts));
  expect(res.status).toBe(200);
  return sent.slice(before).map((m) => m.body).join("\n---\n");
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

async function makeUser(name = "Dolma", email = "dolma@test.com", monthlyIncome = 90000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}`, name };
}

/** Link a number the way the real flow does: request a code, reply with it. */
async function linkNumber(user, phone = PHONE) {
  const start = await request(app)
    .post("/api/whatsapp/link/start")
    .set("Authorization", user.auth)
    .send({ phone });
  expect(start.status).toBe(200);

  const code = /(\d{6})/.exec(sent.at(-1).body)[1];
  const reply = await say(code, { from: phone });
  expect(reply).toMatch(/Linked/i);
  return code;
}

async function makeGroup(user, name) {
  const res = await request(app)
    .post("/api/groups")
    .set("Authorization", user.auth)
    .send({ name });
  expect(res.status).toBe(200);
  return res.body;
}

/* ------------------------------------------------------------------ */
/* THE ACCEPTANCE CRITERION, part 1                                    */
/* "five message shapes produce correct transactions"                  */
/* ------------------------------------------------------------------ */

describe("five message shapes", () => {
  let user;
  let goa;

  beforeEach(async () => {
    user = await makeUser();
    await linkNumber(user);
    goa = await makeGroup(user, "Goa");
  });

  it("1. a bare amount and a note", async () => {
    const reply = await say("450 dinner");

    const tx = await Transaction.findOne({}).lean();
    expect(tx.amount).toBe(450);
    expect(tx.category).toBe("Food");
    expect(tx.note).toBe("dinner");
    expect(tx.type).toBe("expense");
    expect(tx.groupId).toBeUndefined();
    expect(reply).toContain("₹450");
  });

  it("2. a group expense, split", async () => {
    const reply = await say("450 dinner split with Goa");

    const tx = await Transaction.findOne({}).lean();
    expect(String(tx.groupId)).toBe(goa._id);
    expect(tx.amount).toBe(450);
    expect(tx.splitMode).toBe("equal");
    expect(tx.splits).toHaveLength(1); // a one-member group, split one way
    expect(reply).toContain("Goa");
  });

  it("3. income", async () => {
    await say("got 50000 salary");

    const tx = await Transaction.findOne({}).lean();
    expect(tx.type).toBe("income");
    expect(tx.amount).toBe(50000);
  });

  it("4. rupee symbols, thousands separators and the k suffix", async () => {
    await say("₹1,250.50 uber");
    const uber = await Transaction.findOne({ category: "Transport" }).lean();
    expect(uber.amount).toBe(1250.5);

    await say("2k flight");
    const flight = await Transaction.findOne({ category: "Travel" }).lean();
    expect(flight.amount).toBe(2000);
  });

  it("5. a group named without the word 'split'", async () => {
    await say("900 groceries with Goa");

    const tx = await Transaction.findOne({}).lean();
    expect(String(tx.groupId)).toBe(goa._id);
    expect(tx.category).toBe("Groceries");
    // Naming a group implies splitting it — an unsplit shared expense creates
    // no debt and helps nobody.
    expect(tx.splits.length).toBeGreaterThan(0);
  });

  it("replies with the goal translation, which is the whole point", async () => {
    await request(app)
      .post("/api/goals")
      .set("Authorization", user.auth)
      .send({ name: "Goa trip", targetAmount: 40000, priority: "High" });

    const reply = await say("8499 headphones");
    expect(reply).toMatch(/Goa trip|days of your safe spend|left this month/);
  });
});

/* ------------------------------------------------------------------ */
/* THE ACCEPTANCE CRITERION, part 2                                    */
/* "an unlinked number can never write"                                */
/* ------------------------------------------------------------------ */

describe("an unlinked number", () => {
  it("cannot log an expense", async () => {
    const reply = await say("450 dinner", { from: "919999900000" });

    expect(await Transaction.countDocuments({})).toBe(0);
    expect(reply).toMatch(/isn't linked/i);
  });

  it("cannot read a balance, settle, or undo either", async () => {
    await makeUser();

    for (const text of ["what's my number", "who owes what", "settle 2000 to Priya", "undo"]) {
      const reply = await say(text, { from: "919999900000" });
      // Every one of them gets the same refusal — no reads, no writes, and no
      // difference in the reply that could reveal whether the number is known.
      expect(reply === "" || /isn't linked/i.test(reply)).toBe(true);
    }

    expect(await Transaction.countDocuments({})).toBe(0);
    expect(await Settlement.countDocuments({})).toBe(0);
  });

  it("gets exactly ONE reply however many times it messages", async () => {
    for (let i = 0; i < 6; i++) {
      await say(`450 dinner ${i}`, { from: "919999900000" });
    }

    // Six messages recorded, one reply sent — the number cannot be used as a
    // free SMS gateway, and the silence leaks nothing either.
    expect(await BotAction.countDocuments({ phone: "919999900000" })).toBe(6);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatch(/isn't linked/i);
  });

  it("cannot write even when a user with that number exists but is unverified", async () => {
    const user = await makeUser();
    // A pending link is NOT a link. `User.phone` is only set once the code has
    // come back from the number.
    await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", user.auth)
      .send({ phone: PHONE });

    await say("450 dinner");
    expect(await Transaction.countDocuments({})).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Webhook security                                                    */
/* ------------------------------------------------------------------ */

describe("the webhook", () => {
  it("refuses an unsigned delivery", async () => {
    const res = await request(app)
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(metaPayload("450 dinner")));

    expect(res.status).toBe(401);
    expect(await BotAction.countDocuments({})).toBe(0);
  });

  it("refuses a delivery signed with the wrong secret", async () => {
    const body = metaPayload("450 dinner");
    const forged =
      "sha256=" +
      crypto.createHmac("sha256", "not-the-secret").update(Buffer.from(JSON.stringify(body))).digest("hex");

    const res = await request(app)
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", forged)
      .send(JSON.stringify(body));

    expect(res.status).toBe(401);
  });

  it("refuses a tampered body that keeps a valid signature for different bytes", async () => {
    const original = metaPayload("450 dinner");
    const signature = sign(original);
    const tampered = metaPayload("45000 dinner");

    const res = await request(app)
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(JSON.stringify(tampered));

    expect(res.status).toBe(401);
    expect(await Transaction.countDocuments({})).toBe(0);
  });

  it("answers Meta's registration challenge, and only with the right token", async () => {
    const ok = await request(app)
      .get("/api/whatsapp/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");

    const bad = await request(app)
      .get("/api/whatsapp/webhook")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" });
    expect(bad.status).toBe(403);
  });

  it("processes a redelivered message exactly once", async () => {
    const user = await makeUser();
    await linkNumber(user);

    const body = metaPayload("450 dinner", { id: "wamid.STABLE" });

    // Meta redelivers whenever it does not get a prompt 200 — on a timeout, a
    // 500, or a deploy mid-request.
    await deliver(body);
    await deliver(body);
    await deliver(body);

    expect(await Transaction.countDocuments({})).toBe(1);
  });

  it("processes concurrent redeliveries exactly once", async () => {
    const user = await makeUser();
    await linkNumber(user);

    const body = metaPayload("450 dinner", { id: "wamid.RACE" });
    await Promise.all([deliver(body), deliver(body), deliver(body), deliver(body)]);

    expect(await Transaction.countDocuments({})).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Linking                                                             */
/* ------------------------------------------------------------------ */

describe("linking a number", () => {
  it("sends a code and links when it comes back from that number", async () => {
    const user = await makeUser();
    await linkNumber(user);

    const stored = await User.findById(user.id).lean();
    expect(stored.phone).toBe(PHONE);
    expect(stored.phoneVerifiedAt).toBeTruthy();
    // The code is not kept around once it has been used.
    expect(stored.phoneLink?.codeHash).toBeFalsy();
  });

  it("never stores the code in the clear", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", user.auth)
      .send({ phone: PHONE });

    const code = /(\d{6})/.exec(sent.at(-1).body)[1];
    const stored = await User.findById(user.id).lean();

    expect(stored.phoneLink.codeHash).not.toBe(code);
    expect(stored.phoneLink.codeHash).toHaveLength(64); // sha256 hex
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it("refuses a wrong code without revealing that a request exists", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", user.auth)
      .send({ phone: PHONE });

    const reply = await say("000000");
    expect(reply).toMatch(/isn't linked/i);
    expect((await User.findById(user.id).lean()).phone).toBeUndefined();
  });

  it("stops accepting codes after five wrong tries", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", user.auth)
      .send({ phone: PHONE });
    const code = /(\d{6})/.exec(sent.at(-1).body)[1];

    for (let i = 0; i < 5; i++) {
      await say(String(i).repeat(6));
    }

    // Even the RIGHT code is refused now — the attempt budget is spent.
    await say(code);
    expect((await User.findById(user.id).lean()).phone).toBeUndefined();
  });

  it("refuses a number already linked to someone else", async () => {
    const first = await makeUser("Dolma", "dolma@test.com");
    await linkNumber(first);

    const second = await makeUser("Someone", "someone@test.com");
    const res = await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", second.auth)
      .send({ phone: PHONE });

    expect(res.status).toBe(409);
  });

  it("unlinks, and the number goes back to being a stranger", async () => {
    const user = await makeUser();
    await linkNumber(user);

    await request(app).post("/api/whatsapp/link/stop").set("Authorization", user.auth);

    await say("450 dinner");
    expect(await Transaction.countDocuments({})).toBe(0);
  });

  it("reports status without ever exposing the code", async () => {
    const user = await makeUser();
    await request(app)
      .post("/api/whatsapp/link/start")
      .set("Authorization", user.auth)
      .send({ phone: PHONE });

    const res = await request(app).get("/api/whatsapp/status").set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(false);
    expect(res.body.pendingPhone).toBe("+919876543210");
    expect(res.body.available).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/codeHash|code"/);
  });
});

/* ------------------------------------------------------------------ */
/* Reads, settling and undo                                            */
/* ------------------------------------------------------------------ */

describe("conversation", () => {
  let user;

  beforeEach(async () => {
    user = await makeUser();
    await linkNumber(user);
  });

  it("answers what's my number", async () => {
    const reply = await say("what's my number");
    expect(reply).toMatch(/safe to spend today/);
    expect(reply).toMatch(/left this month/);
  });

  it("answers who owes what", async () => {
    const reply = await say("who owes what");
    expect(reply).toMatch(/not in any groups/i);
  });

  it("records a settlement to a named member", async () => {
    const other = await makeUser("Priya", "priya@test.com");
    const group = await makeGroup(user, "Flat");
    await request(app)
      .post("/api/groups/join")
      .set("Authorization", other.auth)
      .send({ inviteCode: group.inviteCode });

    const reply = await say("settle 2000 to Priya");

    const settlement = await Settlement.findOne({}).lean();
    expect(settlement.amount).toBe(2000);
    expect(String(settlement.to)).toBe(other.id);
    expect(reply).toMatch(/never moves the money/i);
  });

  it("undoes the last expense inside the window", async () => {
    await say("450 dinner");
    expect(await Transaction.countDocuments({})).toBe(1);

    const reply = await say("undo");
    expect(await Transaction.countDocuments({})).toBe(0);
    expect(reply).toMatch(/Removed/i);
  });

  it("undoes a settlement too", async () => {
    const other = await makeUser("Priya", "priya@test.com");
    const group = await makeGroup(user, "Flat");
    await request(app)
      .post("/api/groups/join")
      .set("Authorization", other.auth)
      .send({ inviteCode: group.inviteCode });

    await say("settle 2000 to Priya");
    await say("undo");
    expect(await Settlement.countDocuments({})).toBe(0);
  });

  it("refuses to undo past the ten-minute window", async () => {
    await say("450 dinner");
    await BotAction.updateMany(
      { reversible: true },
      { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } }
    );

    const reply = await say("undo");
    expect(await Transaction.countDocuments({})).toBe(1);
    expect(reply).toMatch(/Nothing to undo/i);
  });

  it("undoes only once", async () => {
    await say("450 dinner");
    await say("undo");
    const reply = await say("undo");
    expect(reply).toMatch(/Nothing to undo/i);
  });

  it("tells every write how to reverse it", async () => {
    const reply = await say("450 dinner");
    expect(reply).toMatch(/UNDO within 10 minutes/i);
  });

  it("says what it understands when it cannot read a message", async () => {
    const reply = await say("hey what's up");
    expect(reply).toMatch(/didn't catch an amount|Here's what I understand/i);
    expect(await Transaction.countDocuments({})).toBe(0);
  });

  it("asks rather than guessing when a named group is not theirs", async () => {
    const reply = await say("450 dinner with Bahamas");
    expect(reply).toMatch(/couldn't find a group called "Bahamas"/i);
    // Crucially it does NOT fall back to booking it personally.
    expect(await Transaction.countDocuments({})).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* The parser, directly                                                */
/* ------------------------------------------------------------------ */

describe("the parser", () => {
  const groups = [{ _id: "g1", name: "Goa trip" }, { _id: "g2", name: "Flat 4B" }];

  it("reads amount, category, note and group from one line", () => {
    const intent = parseMessage("450 dinner split with Goa", { groups });
    expect(intent).toMatchObject({
      intent: "log_expense",
      amountPaise: 45000,
      category: "Food",
      note: "dinner",
      groupId: "g1",
      splitMode: "equal",
    });
  });

  it("matches a group by prefix without matching the wrong one", () => {
    expect(parseMessage("450 with Flat", { groups }).groupId).toBe("g2");
    expect(parseMessage("450 with Goa", { groups }).groupId).toBe("g1");
  });

  it("refuses to guess between two plausible groups", () => {
    const ambiguous = [{ _id: "a", name: "Goa trip" }, { _id: "b", name: "Goa reunion" }];
    const intent = parseMessage("450 dinner with Goa", { groups: ambiguous });
    // Booking into the wrong shared wallet is a mistake other people have to
    // notice and unpick, so it asks instead.
    expect(intent.intent).toBe("unknown");
    expect(intent.reason).toBe("unknown_group");
  });

  it("honours an explicit by-income instruction", () => {
    const intent = parseMessage("3000 dinner with Goa by income", { groups });
    expect(intent.splitMode).toBe("weighted");
    expect(intent.splitModeExplicit).toBe(true);
  });

  it("does not fire a category on a substring", () => {
    // "bar" inside "barber" must not make this Entertainment.
    expect(parseMessage("300 barber").category).not.toBe("Entertainment");
  });

  it("reads commands without an amount", () => {
    expect(parseMessage("undo").intent).toBe("undo");
    expect(parseMessage("help").intent).toBe("help");
    expect(parseMessage("what's my number").intent).toBe("balance");
    expect(parseMessage("who owes what").intent).toBe("who_owes");
  });

  it("treats a bare number as a linking code, not an expense", () => {
    // Otherwise the very first message of the linking flow would book ₹123456.
    expect(parseMessage("123456").intent).toBe("link_code");
  });
});

describe("phone normalisation", () => {
  it("collapses every way a number gets typed into one key", () => {
    for (const written of ["+91 98765 43210", "9876543210", "0091-98765-43210", "919876543210"]) {
      expect(normalisePhone(written)).toBe(PHONE);
    }
  });

  it("rejects things that are not phone numbers", () => {
    expect(normalisePhone("hello")).toBeNull();
    expect(normalisePhone("123")).toBeNull();
    expect(normalisePhone("")).toBeNull();
  });
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const ApiToken = require("../models/ApiToken");
const { mint, verify, hash, PREFIX } = require("../services/apiTokenService");

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

async function makeUser(name = "Dolma", email = "dolma@test.com") {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome: 90000 });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

/** Mints a translate token through the API and returns the plaintext. */
async function connectExtension(auth) {
  const res = await request(app).post("/api/tokens").set("Authorization", auth).send({});
  expect(res.status).toBe(201);
  return res.body.token;
}

/* ------------------------------------------------------------------ */

describe("minting", () => {
  it("returns the plaintext exactly once and stores only a hash", async () => {
    const user = await makeUser();
    const res = await request(app).post("/api/tokens").set("Authorization", user.auth).send({});

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^fgt_/);

    const stored = await ApiToken.findById(res.body.apiToken._id).lean();
    expect(stored.tokenHash).toBe(hash(res.body.token));
    // The plaintext must appear nowhere in the document.
    expect(JSON.stringify(stored)).not.toContain(res.body.token);
  });

  it("never returns the plaintext again on list", async () => {
    const user = await makeUser();
    const plaintext = await connectExtension(user.auth);

    const res = await request(app).get("/api/tokens").set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(plaintext);
    // A prefix is fine — it identifies without authenticating.
    expect(res.body[0].prefix).toBe(plaintext.slice(0, PREFIX.length + 6));
    expect(res.body[0].tokenHash).toBeUndefined();
  });

  it("rejects an unknown scope", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/tokens")
      .set("Authorization", user.auth)
      .send({ scope: "read_everything" });
    expect(res.status).toBe(400);
  });

  it("needs the app JWT — a token cannot mint another token", async () => {
    const user = await makeUser();
    const plaintext = await connectExtension(user.auth);

    // This is the escalation path that must stay closed: a leaked extension
    // credential minting fresh ones that survive a password change.
    const res = await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${plaintext}`)
      .send({});
    expect(res.status).toBe(401);
  });
});

describe("scope enforcement", () => {
  it("reaches /finance/translate", async () => {
    const user = await makeUser();
    const plaintext = await connectExtension(user.auth);

    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", `Bearer ${plaintext}`)
      .send({ amountPaise: 849900, context: "user" });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(8499);
  });

  it("reaches NOTHING else", async () => {
    const user = await makeUser();
    const plaintext = await connectExtension(user.auth);
    const auth = `Bearer ${plaintext}`;

    // The whole security argument for a scoped token is this list.
    const forbidden = [
      ["get", "/api/transactions?context=user"],
      ["get", "/api/goals?context=user"],
      ["get", "/api/groups"],
      ["get", "/api/finance/affordability?context=user"],
      ["get", "/api/auth/me"],
      ["get", "/api/tokens"],
      ["get", "/api/share"],
      ["post", "/api/finance/simulate"],
    ];

    for (const [method, path] of forbidden) {
      const res = await request(app)[method](path).set("Authorization", auth).send({});
      expect(res.status, `${method.toUpperCase()} ${path} should reject an extension token`).toBe(401);
    }
  });
});

describe("revocation", () => {
  it("stops working immediately once revoked", async () => {
    const user = await makeUser();
    const plaintext = await connectExtension(user.auth);
    const list = await request(app).get("/api/tokens").set("Authorization", user.auth);

    const del = await request(app)
      .delete(`/api/tokens/${list.body[0]._id}`)
      .set("Authorization", user.auth);
    expect(del.status).toBe(200);

    const res = await request(app)
      .post("/api/finance/translate")
      .set("Authorization", `Bearer ${plaintext}`)
      .send({ amountPaise: 849900, context: "user" });

    expect(res.status).toBe(401);
    // The extension keys off this to drop the credential rather than retrying.
    expect(res.body.reconnect).toBe(true);
  });

  it("does not let one user revoke another's token", async () => {
    const owner = await makeUser("Dolma", "dolma@test.com");
    const other = await makeUser("Someone", "someone@test.com");

    await connectExtension(owner.auth);
    const list = await request(app).get("/api/tokens").set("Authorization", owner.auth);

    const res = await request(app)
      .delete(`/api/tokens/${list.body[0]._id}`)
      .set("Authorization", other.auth);
    expect(res.status).toBe(404);

    // And the owner's token is untouched.
    const stillThere = await request(app).get("/api/tokens").set("Authorization", owner.auth);
    expect(stillThere.body).toHaveLength(1);
  });

  it("hides revoked tokens from the list", async () => {
    const user = await makeUser();
    await connectExtension(user.auth);
    const list = await request(app).get("/api/tokens").set("Authorization", user.auth);
    await request(app).delete(`/api/tokens/${list.body[0]._id}`).set("Authorization", user.auth);

    const after = await request(app).get("/api/tokens").set("Authorization", user.auth);
    expect(after.body).toHaveLength(0);
  });

  it("404s on a malformed id instead of 500ing on the cast", async () => {
    const user = await makeUser();
    const res = await request(app).delete("/api/tokens/not-an-objectid").set("Authorization", user.auth);
    expect(res.status).toBe(404);
  });
});

describe("verify()", () => {
  it("rejects an expired token", async () => {
    const user = await makeUser();
    const { plaintext, doc } = await mint({ userId: user.id, ttlDays: 1 });

    await ApiToken.updateOne({ _id: doc._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verify(plaintext, "translate")).toBeNull();
  });

  it("rejects a token presented for the wrong scope", async () => {
    const user = await makeUser();
    const { plaintext } = await mint({ userId: user.id });
    expect(await verify(plaintext, "some_other_scope")).toBeNull();
  });

  it("rejects anything without the fgt_ prefix without hitting the database", async () => {
    expect(await verify("not-a-finget-token", "translate")).toBeNull();
    expect(await verify("", "translate")).toBeNull();
    expect(await verify(null, "translate")).toBeNull();
  });

  it("uses full 32-byte entropy, not the 16 used for share links", async () => {
    const user = await makeUser();
    const { plaintext } = await mint({ userId: user.id });
    // base64url of 32 bytes is 43 chars, plus the "fgt_" prefix.
    expect(plaintext.length).toBe(PREFIX.length + 43);
  });
});

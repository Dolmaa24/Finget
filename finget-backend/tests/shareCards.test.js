process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const ShareCard = require("../models/ShareCard");

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
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

async function makeGoal(auth, name = "Goa trip", targetAmount = 60000) {
  await request(app)
    .post("/api/goals")
    .set("Authorization", auth)
    .send({ name, targetAmount, context: "user" });
}

/* ------------------------------------------------------------------ */

describe("POST /api/share", () => {
  it("mints a translate card from an amount alone", async () => {
    const user = await makeUser();
    await makeGoal(user.auth);

    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({ kind: "translate", amountPaise: 849900, context: "user" });

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("translate");
    expect(res.body.token).toHaveLength(22);
    expect(res.body.url).toContain(`/s/${res.body.token}`);
    expect(res.body.payload.amount).toBe(8499);
    expect(res.body.payload).toHaveProperty("headline");
  });

  it("builds the payload server-side and ignores anything the client sends", async () => {
    const user = await makeUser();
    await makeGoal(user.auth);

    // The whole reason the endpoint takes an intent rather than a payload:
    // a caller must not be able to put its own fields on a public card.
    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({
        kind: "translate",
        amountPaise: 849900,
        context: "user",
        payload: { email: "leak@example.com", monthlyIncome: 90000 },
        headline: "anything I like",
      });

    expect(res.status).toBe(201);
    expect(res.body.payload.email).toBeUndefined();
    expect(res.body.payload.monthlyIncome).toBeUndefined();
    expect(res.body.payload.headline).not.toBe("anything I like");
  });

  it("stores rounded figures only", async () => {
    const user = await makeUser();
    await makeGoal(user.auth);

    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({ kind: "translate", amountPaise: 849949, context: "user" });

    expect(res.status).toBe(201);
    for (const value of Object.values(res.body.payload)) {
      if (typeof value === "number") expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never leaks how much of a goal is already saved", async () => {
    const user = await makeUser();
    await makeGoal(user.auth);

    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({ kind: "translate", amountPaise: 849900, context: "user" });

    // The goal's NAME is the shareable part; its balance is nobody's business.
    expect(res.body.payload).not.toHaveProperty("outstanding");
    expect(res.body.payload).not.toHaveProperty("outstandingPaise");
    expect(res.body.payload).not.toHaveProperty("remainingAfter");
    expect(res.body.payload).not.toHaveProperty("safeDailyAfter");
  });

  it("validates the amount", async () => {
    const user = await makeUser();
    for (const body of [
      { kind: "translate", amountPaise: 10.5 },
      { kind: "translate", amountPaise: 0 },
      { kind: "translate" },
    ]) {
      const res = await request(app).post("/api/share").set("Authorization", user.auth).send(body);
      expect(res.status).toBe(400);
    }
  });

  it("says the other kinds arrive with their features rather than half-working", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({ kind: "wrapped", amountPaise: 100 });
    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/arrive with the feature/i);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/share").send({ kind: "translate", amountPaise: 100 });
    expect(res.status).toBe(401);
  });
});

describe("the resulting link", () => {
  async function mintCard() {
    const user = await makeUser();
    await makeGoal(user.auth);
    const res = await request(app)
      .post("/api/share")
      .set("Authorization", user.auth)
      .send({ kind: "translate", amountPaise: 849900, context: "user" });
    return { user, card: res.body };
  }

  it("is readable with no authentication at all", async () => {
    const { card } = await mintCard();
    const res = await request(app).get(`/s/${card.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("carries Open Graph tags so it unfurls in a chat app", async () => {
    const { card } = await mintCard();
    const res = await request(app).get(`/s/${card.token}`);
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain('property="og:image"');
    expect(res.text).toContain(`/s/${card.token}.png`);
  });

  it("renders the same words in the HTML and the PNG path", async () => {
    const { card } = await mintCard();
    const { describe: copy } = require("../services/shareCardCopy");
    const stored = await ShareCard.findOne({ token: card.token }).lean();
    const { title } = copy(stored);

    const res = await request(app).get(`/s/${card.token}`);
    // Both surfaces read from shareCardCopy, so the page must contain the
    // title that module produces — that is what stops the two drifting.
    expect(res.text).toContain(title.replace(/&/g, "&amp;"));
  });

  it("never contains the owner's name or email", async () => {
    const { card } = await mintCard();
    const res = await request(app).get(`/s/${card.token}`);
    expect(res.text).not.toContain("dolma@test.com");
  });

  it("stops resolving once revoked", async () => {
    const { user, card } = await mintCard();

    const del = await request(app).delete(`/api/share/${card.token}`).set("Authorization", user.auth);
    expect(del.status).toBe(200);

    expect((await request(app).get(`/s/${card.token}`)).status).toBe(404);
    expect((await request(app).get(`/s/${card.token}.png`)).status).toBe(404);
  });

  it("does not let one user revoke another's card", async () => {
    const { card } = await mintCard();
    const other = await makeUser("Someone", "someone@test.com");

    const res = await request(app).delete(`/api/share/${card.token}`).set("Authorization", other.auth);
    expect(res.status).toBe(404);
    expect((await request(app).get(`/s/${card.token}`)).status).toBe(200);
  });
});

describe("GET /api/share", () => {
  it("lists only the caller's own live cards", async () => {
    const mine = await makeUser("Dolma", "dolma@test.com");
    const theirs = await makeUser("Someone", "someone@test.com");
    await makeGoal(mine.auth);
    await makeGoal(theirs.auth);

    await request(app)
      .post("/api/share")
      .set("Authorization", mine.auth)
      .send({ kind: "translate", amountPaise: 849900, context: "user" });
    await request(app)
      .post("/api/share")
      .set("Authorization", theirs.auth)
      .send({ kind: "translate", amountPaise: 500000, context: "user" });

    const res = await request(app).get("/api/share").set("Authorization", mine.auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].payload.amount).toBe(8499);
  });
});

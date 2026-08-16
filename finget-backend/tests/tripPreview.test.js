process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Group = require("../models/Group");

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
  require("../controllers/joinController")._resetFailureWindow();
});

async function makeUser(name, email) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome: 90000 });
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

/** A trip with three members and real money in it. */
async function seedTrip() {
  const ana = await makeUser("Ana Sharma", "ana@test.com");
  const bo = await makeUser("Bo Mehta", "bo@test.com");
  const cai = await makeUser("Cai Patel", "cai@test.com");

  const trip = (
    await request(app).post("/api/groups").set("Authorization", ana.auth).send({
      name: "Goa 2026",
      emoji: "🏖️",
      kind: "trip",
      startDate: "2026-03-01",
      endDate: "2026-03-05",
      potPaise: 5000000,
    })
  ).body;

  for (const m of [bo, cai]) {
    await request(app)
      .post("/api/groups/join")
      .set("Authorization", m.auth)
      .send({ inviteCode: trip.inviteCode });
  }

  await request(app)
    .post("/api/transactions")
    .set("Authorization", ana.auth)
    .send({ amount: 18000, category: "Travel", context: "group", groupId: trip._id });

  return { trip, ana, bo, cai };
}

/* ------------------------------------------------------------------ */

describe("the public preview", () => {
  it("needs no authentication", async () => {
    const { trip } = await seedTrip();
    const res = await request(app).get(`/join/${trip.previewToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("shows what a person needs to decide: name, emoji, who's in, when", async () => {
    const { trip } = await seedTrip();
    const res = await request(app).get(`/join/${trip.previewToken}.json`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Goa 2026");
    expect(res.body.memberCount).toBe(3);
    expect(res.body.initials).toEqual(["A", "B", "C"]);
    expect(res.body.inviterName).toBe("Ana");
    expect(res.body.startDate).toBeTruthy();
  });

  it("NEVER shows the total — the thing that makes a leaked link valuable", async () => {
    const { trip } = await seedTrip();

    for (const path of [`/join/${trip.previewToken}`, `/join/${trip.previewToken}.json`]) {
      const res = await request(app).get(path);
      const body = typeof res.text === "string" ? res.text : JSON.stringify(res.body);

      expect(body).not.toContain("18000");
      expect(body).not.toContain("18,000");
      expect(body).not.toContain("50000");
      expect(body).not.toMatch(/potPaise|totalSpent|spentPaise|balance/i);
    }
  });

  it("shows initials, never full names or emails", async () => {
    const { trip } = await seedTrip();

    for (const path of [`/join/${trip.previewToken}`, `/join/${trip.previewToken}.json`]) {
      const res = await request(app).get(path);
      const body = typeof res.text === "string" ? res.text : JSON.stringify(res.body);

      expect(body).not.toContain("Sharma");
      expect(body).not.toContain("Mehta");
      expect(body).not.toContain("ana@test.com");
    }
  });

  it("never leaks the invite code, so seeing the page cannot let you join", async () => {
    const { trip } = await seedTrip();

    for (const path of [`/join/${trip.previewToken}`, `/join/${trip.previewToken}.json`]) {
      const res = await request(app).get(path);
      const body = typeof res.text === "string" ? res.text : JSON.stringify(res.body);
      expect(body).not.toContain(trip.inviteCode);
    }
  });

  it("never leaks database ids", async () => {
    const { trip } = await seedTrip();
    const res = await request(app).get(`/join/${trip.previewToken}.json`);
    expect(JSON.stringify(res.body)).not.toMatch(/\b[a-f0-9]{24}\b/);
  });

  it("carries Open Graph tags so it unfurls in WhatsApp", async () => {
    const { trip } = await seedTrip();
    const res = await request(app).get(`/join/${trip.previewToken}`);
    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain('property="og:description"');
  });

  it("404s for an unknown token", async () => {
    expect((await request(app).get("/join/aaaaaaaaaaaaaaaaaaaaaa")).status).toBe(404);
    expect((await request(app).get("/join/aaaaaaaaaaaaaaaaaaaaaa.json")).status).toBe(404);
  });

  it("does not resolve a 6-char invite code as a preview token", async () => {
    const { trip } = await seedTrip();
    // The route pattern requires 16+ chars, so a leaked code cannot be swapped
    // into a preview URL and resolve to anything.
    const res = await request(app).get(`/join/${trip.inviteCode}`);
    expect(res.status).toBe(404);
  });

  it("still returns the JSON 404 for unknown API routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.msg).toBe("Route not found");
  });
});

describe("joining", () => {
  it("turns a link holder into a member once they are signed in", async () => {
    const { trip } = await seedTrip();
    const newcomer = await makeUser("Dev Rao", "dev@test.com");

    const res = await request(app)
      .post("/api/groups/join-by-token")
      .set("Authorization", newcomer.auth)
      .send({ previewToken: trip.previewToken });

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(4);
  });

  it("requires authentication — the preview is public, joining is not", async () => {
    const { trip } = await seedTrip();
    const res = await request(app)
      .post("/api/groups/join-by-token")
      .send({ previewToken: trip.previewToken });
    expect(res.status).toBe(401);
  });

  it("is idempotent for someone already in", async () => {
    const { trip, bo } = await seedTrip();
    const res = await request(app)
      .post("/api/groups/join-by-token")
      .set("Authorization", bo.auth)
      .send({ previewToken: trip.previewToken });
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(3);
  });

  it("404s on an unknown token", async () => {
    const user = await makeUser("Dev", "dev@test.com");
    const res = await request(app)
      .post("/api/groups/join-by-token")
      .set("Authorization", user.auth)
      .send({ previewToken: "aaaaaaaaaaaaaaaaaaaaaa" });
    expect(res.status).toBe(404);
  });
});

describe("revoking the link", () => {
  it("kills every shared link without kicking a single member", async () => {
    const { trip, ana } = await seedTrip();
    const old = trip.previewToken;

    const rotated = await request(app)
      .post(`/api/groups/${trip._id}/rotate-preview`)
      .set("Authorization", ana.auth);

    expect(rotated.status).toBe(200);
    expect(rotated.body.previewToken).not.toBe(old);

    // The old link is dead...
    expect((await request(app).get(`/join/${old}`)).status).toBe(404);
    // ...and the new one works...
    expect((await request(app).get(`/join/${rotated.body.previewToken}`)).status).toBe(200);

    // ...and this is the point: everyone who already joined is still in.
    const after = await Group.findById(trip._id).lean();
    expect(after.members).toHaveLength(3);
  });

  it("is admins only", async () => {
    const { trip, bo } = await seedTrip();
    const res = await request(app)
      .post(`/api/groups/${trip._id}/rotate-preview`)
      .set("Authorization", bo.auth);
    expect(res.status).toBe(403);
  });
});

describe("the invite card", () => {
  it("respects the same redaction as the preview", async () => {
    const { trip, ana } = await seedTrip();
    const res = await request(app)
      .post(`/api/groups/${trip._id}/invite-card`)
      .set("Authorization", ana.auth);

    expect(res.status).toBe(201);
    expect(res.body.payload.memberCount).toBe(3);
    expect(res.body.payload.initials).toEqual(["A", "B", "C"]);

    const json = JSON.stringify(res.body.payload);
    expect(json).not.toContain("18000");
    expect(json).not.toContain("Sharma");
    expect(json).not.toMatch(/\b[a-f0-9]{24}\b/);

    // The card is the picture; the join link is what actually recruits.
    expect(res.body.joinUrl).toContain(trip.previewToken);
  });

  it("names whoever is sharing it, not always the creator", async () => {
    const { trip, bo } = await seedTrip();
    const res = await request(app)
      .post(`/api/groups/${trip._id}/invite-card`)
      .set("Authorization", bo.auth);
    expect(res.body.payload.inviterName).toBe("Bo");
  });
});

describe("invite-code enumeration", () => {
  it("caps attempts per account so the 6-char code cannot be walked", async () => {
    const attacker = await makeUser("Zed", "zed@test.com");

    let limited = 0;
    // The limiter allows 20 an hour; 25 attempts must run into it.
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post("/api/groups/join")
        .set("Authorization", attacker.auth)
        .send({ inviteCode: `ZZZZ${String(i).padStart(2, "0")}` });
      if (res.status === 429) limited++;
    }

    expect(limited).toBeGreaterThan(0);
  });
});

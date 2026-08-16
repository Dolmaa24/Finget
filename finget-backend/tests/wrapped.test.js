process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const { computeWrapped, wrappedCardPayload } = require("../services/wrappedService");
const { assertRedacted } = require("../services/shareCardService");
const { fromISTFields } = require("../utils/time");

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

/* ------------------------------------------------------------------ */
/* The pure recap                                                      */
/* ------------------------------------------------------------------ */

const ANA = "6a0000000000000000000001";
const BO = "6a0000000000000000000002";
const CAI = "6a0000000000000000000003";

const group = {
  name: "Goa 2026",
  emoji: "🏖️",
  startDate: fromISTFields(2026, 2, 1),
  endDate: fromISTFields(2026, 2, 5),
  members: [
    { _id: ANA, name: "Ana Sharma" },
    { _id: BO, name: "Bo Mehta" },
    { _id: CAI, name: "Cai Patel" },
  ],
};

/** Ana fronts the big hotel bill; Bo pays for lots of small things. */
const transactions = [
  {
    type: "expense",
    amount: 18000,
    category: "Travel",
    note: "Hotel",
    paidBy: ANA,
    date: fromISTFields(2026, 2, 1, 10),
    splits: [
      { userId: ANA, amount: 6000 },
      { userId: BO, amount: 6000 },
      { userId: CAI, amount: 6000 },
    ],
  },
  {
    type: "expense",
    amount: 1200,
    category: "Food",
    note: "Lunch",
    paidBy: BO,
    date: fromISTFields(2026, 2, 2, 13),
    splits: [
      { userId: ANA, amount: 400 },
      { userId: BO, amount: 400 },
      { userId: CAI, amount: 400 },
    ],
  },
  {
    type: "expense",
    amount: 900,
    category: "Food",
    note: "Dinner",
    paidBy: BO,
    date: fromISTFields(2026, 2, 2, 21),
    splits: [
      { userId: ANA, amount: 300 },
      { userId: BO, amount: 300 },
      { userId: CAI, amount: 300 },
    ],
  },
  {
    type: "expense",
    amount: 600,
    category: "Transport",
    note: "Taxi",
    paidBy: BO,
    date: fromISTFields(2026, 2, 3, 9),
    splits: [
      { userId: ANA, amount: 200 },
      { userId: BO, amount: 200 },
      { userId: CAI, amount: 200 },
    ],
  },
  // Income must never inflate the trip total.
  { type: "income", amount: 5000, paidBy: CAI, date: fromISTFields(2026, 2, 3, 12) },
];

const wrapped = () => computeWrapped({ group, transactions, settlements: [] });

describe("the recap", () => {
  it("totals expenses only", () => {
    expect(wrapped().totalSpent).toBe(20700);
  });

  it("counts the trip's calendar days, not the days money was spent", () => {
    // Nothing was logged on 4 or 5 March; it was still a five-day trip.
    expect(wrapped().days).toBe(5);
  });

  it("finds the biggest single expense", () => {
    expect(wrapped().biggestExpense.amount).toBe(18000);
    expect(wrapped().biggestExpense.category).toBe("Travel");
  });

  it("finds the top category by total, not by count", () => {
    // Food has three entries; Travel has one and is far larger.
    expect(wrapped().topCategory.name).toBe("Travel");
  });

  it("records what each member fronted versus what they owed", () => {
    const ana = wrapped().perMember.find((m) => m.memberId === ANA);
    expect(ana.paid).toBe(18000);
    expect(ana.share).toBe(6900);
    expect(ana.net).toBe(11100);
  });
});

describe("superlatives", () => {
  it("credits the biggest spender by amount fronted", () => {
    const s = wrapped().superlatives.find((x) => x.title === "Biggest Spender");
    expect(s.name).toBe("Ana");
  });

  it("credits the one who always paid by number of bills, not size", () => {
    // Bo paid three times for less money than Ana's single hotel bill.
    const s = wrapped().superlatives.find((x) => x.title === "The One Who Always Paid");
    expect(s.name).toBe("Bo");
  });

  it("never gives one person two badges", () => {
    const named = wrapped().superlatives.filter((s) => s.name);
    expect(new Set(named.map((s) => s.name)).size).toBe(named.length);
  });

  it("uses first names only — a card names friends, not identities", () => {
    for (const s of wrapped().superlatives) {
      if (s.name) expect(s.name).not.toMatch(/\s/);
    }
  });

  it("is affectionate, never accusatory", () => {
    for (const s of wrapped().superlatives) {
      expect(`${s.title} ${s.detail}`).not.toMatch(/wasted|worst|overspent|blame|guilty/i);
    }
  });

  it("is deterministic — the same trip always produces the same card", () => {
    expect(JSON.stringify(wrapped())).toBe(JSON.stringify(wrapped()));
  });

  it("breaks ties by name so two equal spenders do not shuffle", () => {
    const tied = {
      ...group,
      members: [
        { _id: BO, name: "Bo Mehta" },
        { _id: ANA, name: "Ana Sharma" },
      ],
    };
    const txs = [
      { type: "expense", amount: 500, paidBy: ANA, date: fromISTFields(2026, 2, 1) },
      { type: "expense", amount: 500, paidBy: BO, date: fromISTFields(2026, 2, 1) },
    ];
    const a = computeWrapped({ group: tied, transactions: txs });
    const b = computeWrapped({ group: tied, transactions: txs });
    expect(a.superlatives[0].name).toBe(b.superlatives[0].name);
    expect(a.superlatives[0].name).toBe("Ana");
  });

  it("withholds Cheapest Day when there is only one day to compare", () => {
    // Everything logged on the same day: "Cheapest Day ₹20,700" against a
    // ₹20,700 trip is the whole total, and reads as broken on a shared card.
    const oneDay = computeWrapped({
      group,
      transactions: [
        { type: "expense", amount: 500, paidBy: ANA, date: fromISTFields(2026, 2, 1, 10) },
        { type: "expense", amount: 700, paidBy: ANA, date: fromISTFields(2026, 2, 1, 20) },
      ],
    });
    expect(oneDay.superlatives.find((s) => s.title === "Cheapest Day")).toBeUndefined();

    // Two spending days makes the comparison real again.
    expect(wrapped().superlatives.find((s) => s.title === "Cheapest Day")).toBeTruthy();
  });

  it("says nothing rather than inventing badges for an empty trip", () => {
    const empty = computeWrapped({ group, transactions: [] });
    expect(empty.superlatives).toHaveLength(0);
    expect(empty.totalSpent).toBe(0);
  });
});

describe("the shareable card", () => {
  it("highlights the viewer's own name — that is why it gets shared", () => {
    expect(wrappedCardPayload(wrapped(), ANA).highlightName).toBe("Ana");
    expect(wrappedCardPayload(wrapped(), BO).highlightName).toBe("Bo");
  });

  it("passes redaction for every member", () => {
    for (const id of [ANA, BO, CAI]) {
      expect(() => assertRedacted("wrapped", wrappedCardPayload(wrapped(), id))).not.toThrow();
    }
  });

  it("carries first names only, never full names", () => {
    const payload = wrappedCardPayload(wrapped(), ANA);
    expect(payload.members).toEqual(["Ana", "Bo", "Cai"]);
    expect(JSON.stringify(payload)).not.toContain("Sharma");
  });

  it("publishes the biggest expense as a figure, never its note", () => {
    // A note can say anything; it is not ours to put on a public page.
    const payload = wrappedCardPayload(wrapped(), ANA);
    expect(payload.biggestExpense).toBe(18000);
    expect(JSON.stringify(payload)).not.toContain("Hotel");
  });

  it("puts the viewer's name in the headline, in BOTH the page and the image", () => {
    // The PNG is what unfurls in WhatsApp. Personalising only the HTML would
    // mean the thing people actually see is generic — which is the version
    // nobody shares.
    const { describe: copy } = require("../services/shareCardCopy");
    expect(copy({ kind: "wrapped", payload: wrappedCardPayload(wrapped(), ANA) }).title).toContain(
      "Ana's"
    );
    expect(copy({ kind: "wrapped", payload: wrappedCardPayload(wrapped(), BO) }).title).toContain(
      "Bo's"
    );
  });

  it("leads with the viewer's own badge rather than a trip-wide fact", () => {
    const { statLine } = require("../services/shareCardCopy");
    expect(statLine({ kind: "wrapped", payload: wrappedCardPayload(wrapped(), ANA) })).toMatch(
      /Biggest Spender/
    );
    expect(statLine({ kind: "wrapped", payload: wrappedCardPayload(wrapped(), BO) })).toMatch(
      /Always Paid/
    );
    // Cai earned no badge, so the card falls back to the trip's top category.
    expect(statLine({ kind: "wrapped", payload: wrappedCardPayload(wrapped(), CAI) })).toMatch(
      /Travel/
    );
  });

  it("formats money as rupees — a badge reading 'fronted 18000' looks broken", () => {
    for (const s of wrapped().superlatives) {
      if (/\d/.test(s.detail) && !/bills/.test(s.detail)) {
        expect(s.detail).toMatch(/₹/);
      }
    }
  });

  it("carries no member ids and no per-person balances", () => {
    const json = JSON.stringify(wrappedCardPayload(wrapped(), ANA));
    expect(json).not.toContain(ANA);
    expect(json).not.toMatch(/\b[a-f0-9]{24}\b/);
    expect(json).not.toContain("11100");
  });
});

/* ------------------------------------------------------------------ */
/* Through the API                                                     */
/* ------------------------------------------------------------------ */

async function makeUser(name, email) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome: 90000 });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}` };
}

async function makeTrip(auth) {
  const res = await request(app).post("/api/groups").set("Authorization", auth).send({
    name: "Goa 2026",
    kind: "trip",
    startDate: "2026-03-01",
    endDate: "2026-03-05",
    potPaise: 5000000,
  });
  expect(res.status).toBe(200);
  return res.body;
}

describe("the API", () => {
  it("creates a trip with dates and a pot", async () => {
    const user = await makeUser("Ana", "ana@test.com");
    const trip = await makeTrip(user.auth);

    expect(trip.kind).toBe("trip");
    expect(trip.potPaise).toBe(5000000);
    expect(trip.previewToken).toHaveLength(22);
  });

  it("refuses a trip that ends before it starts", async () => {
    const user = await makeUser("Ana", "ana@test.com");
    const res = await request(app).post("/api/groups").set("Authorization", user.auth).send({
      name: "Backwards",
      kind: "trip",
      startDate: "2026-03-05",
      endDate: "2026-03-01",
    });
    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/end before it starts/i);
  });

  it("catches an inversion introduced by editing only one date", async () => {
    const user = await makeUser("Ana", "ana@test.com");
    const trip = await makeTrip(user.auth);

    const res = await request(app)
      .put(`/api/groups/${trip._id}`)
      .set("Authorization", user.auth)
      .send({ endDate: "2026-02-01" });

    expect(res.status).toBe(400);
  });

  it("reports trip status, and says plainly when a group is not a trip", async () => {
    const user = await makeUser("Ana", "ana@test.com");
    const trip = await makeTrip(user.auth);

    const status = await request(app)
      .get(`/api/groups/${trip._id}/trip-status`)
      .set("Authorization", user.auth);
    expect(status.status).toBe(200);
    expect(status.body.isTrip).toBe(true);
    expect(status.body.totalDays).toBe(5);

    const household = (
      await request(app).post("/api/groups").set("Authorization", user.auth).send({ name: "Flat" })
    ).body;
    const none = await request(app)
      .get(`/api/groups/${household._id}/trip-status`)
      .set("Authorization", user.auth);
    expect(none.status).toBe(200);
    expect(none.body.isTrip).toBe(false);
  });

  it("refuses trip status to a non-member", async () => {
    const owner = await makeUser("Ana", "ana@test.com");
    const outsider = await makeUser("Zed", "zed@test.com");
    const trip = await makeTrip(owner.auth);

    const res = await request(app)
      .get(`/api/groups/${trip._id}/trip-status`)
      .set("Authorization", outsider.auth);
    expect(res.status).toBe(403);
  });

  it("declines to wrap a trip with nothing in it", async () => {
    const user = await makeUser("Ana", "ana@test.com");
    const trip = await makeTrip(user.auth);

    const res = await request(app)
      .get(`/api/groups/${trip._id}/wrapped?ai=0`)
      .set("Authorization", user.auth);
    expect(res.status).toBe(409);
  });

  it("lets any member mint their own personalised card", async () => {
    const ana = await makeUser("Ana", "ana@test.com");
    const bo = await makeUser("Bo", "bo@test.com");
    const trip = await makeTrip(ana.auth);

    await request(app)
      .post("/api/groups/join")
      .set("Authorization", bo.auth)
      .send({ inviteCode: trip.inviteCode });

    await request(app)
      .post("/api/transactions")
      .set("Authorization", ana.auth)
      .send({ amount: 18000, category: "Travel", context: "group", groupId: trip._id });

    const anaCard = await request(app)
      .post(`/api/groups/${trip._id}/wrapped/share`)
      .set("Authorization", ana.auth);
    const boCard = await request(app)
      .post(`/api/groups/${trip._id}/wrapped/share`)
      .set("Authorization", bo.auth);

    expect(anaCard.status).toBe(201);
    expect(boCard.status).toBe(201);
    // Each member gets their OWN card with their OWN name on it.
    expect(anaCard.body.payload.highlightName).toBe("Ana");
    expect(boCard.body.payload.highlightName).toBe("Bo");
    expect(anaCard.body.token).not.toBe(boCard.body.token);
  });

  it("refuses to mint a wrapped card for a non-member", async () => {
    const ana = await makeUser("Ana", "ana@test.com");
    const outsider = await makeUser("Zed", "zed@test.com");
    const trip = await makeTrip(ana.auth);

    const res = await request(app)
      .post(`/api/groups/${trip._id}/wrapped/share`)
      .set("Authorization", outsider.auth);
    expect(res.status).toBe(403);
  });
});

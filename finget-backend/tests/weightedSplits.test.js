process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const {
  resolveIncomeWeights,
  weightedSplit,
  relativeShareLabel,
} = require("../services/splitService");
const { toPaise } = require("../utils/money");

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

async function makeUser(name, email, monthlyIncome) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}`, name };
}

async function makeGroup(owner, name = "Flat 4B") {
  const res = await request(app)
    .post("/api/groups")
    .set("Authorization", owner.auth)
    .send({ name });
  expect(res.status).toBe(200);
  return res.body;
}

async function join(user, inviteCode) {
  const res = await request(app)
    .post("/api/groups/join")
    .set("Authorization", user.auth)
    .send({ inviteCode });
  expect(res.status).toBe(200);
  return res.body;
}

const optIn = (user, groupId, value = true) =>
  request(app)
    .post(`/api/groups/${groupId}/income-sharing`)
    .set("Authorization", user.auth)
    .send({ optIn: value });

/* ------------------------------------------------------------------ */
/* Weight resolution                                                   */
/* ------------------------------------------------------------------ */

describe("resolveIncomeWeights", () => {
  const incomes = new Map([
    ["a", 100000],
    ["b", 50000],
    ["c", 30000],
  ]);

  it("weights consenting members by income", () => {
    const { weights, consentingCount } = resolveIncomeWeights(
      ["a", "b"],
      incomes,
      new Set(["a", "b"])
    );
    expect(weights).toEqual([100000, 50000]);
    expect(consentingCount).toBe(2);
  });

  it("gives an opted-out member the mean of those who opted in", () => {
    const { weights } = resolveIncomeWeights(["a", "b", "c"], incomes, new Set(["a", "b"]));
    // c pays as an average earner would: (100000 + 50000) / 2.
    expect(weights).toEqual([100000, 50000, 75000]);
  });

  it("degrades to a flat equal split when nobody has consented", () => {
    const { weights, consentingCount } = resolveIncomeWeights(
      ["a", "b", "c"],
      incomes,
      new Set()
    );
    expect(weights).toEqual([1, 1, 1]);
    expect(consentingCount).toBe(0);
  });

  it("treats consent without an income figure as opted out", () => {
    const sparse = new Map([
      ["a", 100000],
      ["b", 0],
    ]);
    const { weights, consentingCount } = resolveIncomeWeights(
      ["a", "b"],
      sparse,
      new Set(["a", "b"])
    );
    // b is weighted as the mean of the real signal, not at zero — a zero
    // weight would hand them the meal for free.
    expect(weights).toEqual([100000, 100000]);
    expect(consentingCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Exactness — the same bar the equal split is held to                 */
/* ------------------------------------------------------------------ */

describe("weightedSplit arithmetic", () => {
  it("splits 2:1 exactly", () => {
    const splits = weightedSplit(3000, ["a", "b"], [100000, 50000]);
    expect(splits.map((s) => s.amount)).toEqual([2000, 1000]);
  });

  it("sums to the total when the ratio does not divide cleanly", () => {
    const splits = weightedSplit(100, ["a", "b", "c"], [100000, 50000, 30000]);
    const totalPaise = splits.reduce((sum, s) => sum + toPaise(s.amount), 0);
    expect(totalPaise).toBe(toPaise(100));
  });

  it("never loses a paisa across a thousand awkward totals", () => {
    for (let rupees = 1; rupees <= 1000; rupees++) {
      const splits = weightedSplit(rupees + 0.37, ["a", "b", "c"], [7, 11, 13]);
      const totalPaise = splits.reduce((sum, s) => sum + toPaise(s.amount), 0);
      expect(totalPaise).toBe(toPaise(rupees + 0.37));
    }
  });
});

describe("relativeShareLabel", () => {
  it("names the reader's own direction, and nobody else's", () => {
    expect(relativeShareLabel(200000, 150000)).toBe("larger");
    expect(relativeShareLabel(100000, 150000)).toBe("smaller");
    expect(relativeShareLabel(150000, 150000)).toBe("even");
  });

  it("does not call a one-paisa rounding remainder a larger share", () => {
    // ₹100 three ways: someone absorbs the extra paisa. That is not a verdict.
    expect(relativeShareLabel(3334, 3333)).toBe("even");
  });
});

/* ------------------------------------------------------------------ */
/* Privacy — the hard part of this milestone                           */
/* ------------------------------------------------------------------ */

describe("income never leaves its owner", () => {
  it("omits every other member's income from the group payload", async () => {
    const priya = await makeUser("Priya", "priya@test.com", 180000);
    const arjun = await makeUser("Arjun", "arjun@test.com", 40000);

    const group = await makeGroup(priya);
    await join(arjun, group.inviteCode);

    const seen = await request(app)
      .get(`/api/groups/${group._id}`)
      .set("Authorization", arjun.auth);

    const priyaAsSeenByArjun = seen.body.members.find((m) => m._id === priya.id);
    const arjunHimself = seen.body.members.find((m) => m._id === arjun.id);

    expect(priyaAsSeenByArjun.monthlyIncome).toBeUndefined();
    expect(arjunHimself.monthlyIncome).toBe(40000);

    // And no aggregate that a two-person group could subtract its way out of.
    expect(JSON.stringify(seen.body)).not.toContain("180000");
  });

  it("reports consent as a count and a flag, never as amounts", async () => {
    const priya = await makeUser("Priya", "priya@test.com", 180000);
    const arjun = await makeUser("Arjun", "arjun@test.com", 40000);
    const group = await makeGroup(priya);
    await join(arjun, group.inviteCode);

    await optIn(priya, group._id);

    const seen = await request(app)
      .get(`/api/groups/${group._id}`)
      .set("Authorization", arjun.auth);

    expect(seen.body.incomeSharingCount).toBe(1);
    expect(seen.body.incomeSharingOptedIn).toBe(false);
    expect(seen.body.members.find((m) => m._id === priya.id).sharesIncome).toBe(true);
  });

  /**
   * The leak that a passing test suite missed and a screenshot caught: the
   * group dashboard printed "₹2,40,000 pooled", which in a two-person group is
   * one subtraction away from the other person's exact salary.
   */
  it("pools only the income of members who consented", async () => {
    const priya = await makeUser("Priya", "priya@test.com", 180000);
    const arjun = await makeUser("Arjun", "arjun@test.com", 60000);
    const group = await makeGroup(priya);
    await join(arjun, group.inviteCode);

    const query = `?context=group&groupId=${group._id}`;
    const read = (auth) =>
      request(app).get(`/api/finance/affordability${query}`).set("Authorization", auth);

    // Nobody has consented, so there is no shared income figure to derive
    // anything from.
    const cold = await read(arjun.auth);
    expect(cold.body.income).toBe(0);
    expect(cold.body.incomeContributors).toBe(0);
    expect(cold.body.memberCount).toBe(2);

    // Arjun sharing tells Arjun only what Arjun already knew.
    await optIn(arjun, group._id);
    const one = await read(arjun.auth);
    expect(one.body.income).toBe(60000);
    expect(one.body.incomeContributors).toBe(1);

    // Priya consenting is what makes the total include her — 240000 is now
    // derivable, and that is exactly what she agreed to.
    await optIn(priya, group._id);
    const both = await read(arjun.auth);
    expect(both.body.income).toBe(240000);
    expect(both.body.incomeContributors).toBe(2);

    // Withdrawing takes it back out.
    await optIn(priya, group._id, false);
    const withdrawn = await read(arjun.auth);
    expect(withdrawn.body.income).toBe(60000);
    expect(withdrawn.body.incomeContributors).toBe(1);
  });

  it("lets a member withdraw consent on their own", async () => {
    const priya = await makeUser("Priya", "priya@test.com", 180000);
    const group = await makeGroup(priya);

    await optIn(priya, group._id, true);
    const off = await optIn(priya, group._id, false);

    expect(off.status).toBe(200);
    expect(off.body.incomeSharingOptedIn).toBe(false);
    expect(off.body.incomeSharingCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* End to end                                                          */
/* ------------------------------------------------------------------ */

describe("weighted splits end to end", () => {
  async function twoPersonGroup() {
    const priya = await makeUser("Priya", "priya@test.com", 150000);
    const arjun = await makeUser("Arjun", "arjun@test.com", 50000);
    const group = await makeGroup(priya, "Goa");
    await join(arjun, group.inviteCode);
    return { priya, arjun, groupId: group._id };
  }

  it("previews a 3:1 split and labels only the reader's own share", async () => {
    const { priya, arjun, groupId } = await twoPersonGroup();
    await optIn(priya, groupId);
    await optIn(arjun, groupId);

    const asArjun = await request(app)
      .get(`/api/groups/${groupId}/split-preview?amount=4000&mode=weighted`)
      .set("Authorization", arjun.auth);

    expect(asArjun.status).toBe(200);
    expect(asArjun.body.mode).toBe("weighted");
    expect(asArjun.body.degradedToEqual).toBe(false);
    expect(asArjun.body.yourShare).toBe(1000);
    expect(asArjun.body.relativeLabel).toBe("smaller");

    const asPriya = await request(app)
      .get(`/api/groups/${groupId}/split-preview?amount=4000&mode=weighted`)
      .set("Authorization", priya.auth);
    expect(asPriya.body.yourShare).toBe(3000);
    expect(asPriya.body.relativeLabel).toBe("larger");
  });

  it("says so when a weighted request degrades to equal", async () => {
    const { arjun, groupId } = await twoPersonGroup();

    const preview = await request(app)
      .get(`/api/groups/${groupId}/split-preview?amount=4000&mode=weighted`)
      .set("Authorization", arjun.auth);

    expect(preview.body.degradedToEqual).toBe(true);
    expect(preview.body.yourShare).toBe(2000);
    expect(preview.body.relativeLabel).toBe("even");
  });

  it("stores a weighted expense whose splits sum to the total", async () => {
    const { priya, arjun, groupId } = await twoPersonGroup();
    await optIn(priya, groupId);
    await optIn(arjun, groupId);

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", priya.auth)
      .send({
        amount: 4000,
        category: "Food",
        context: "group",
        groupId,
        splitMode: "weighted",
      });

    expect(res.status).toBe(200);
    expect(res.body.transaction.splitMode).toBe("weighted");

    const splits = res.body.transaction.splits;
    expect(splits.reduce((sum, s) => sum + toPaise(s.amount), 0)).toBe(toPaise(4000));
    expect(splits.find((s) => s.userId === priya.id).amount).toBe(3000);
    expect(splits.find((s) => s.userId === arjun.id).amount).toBe(1000);
  });

  it("records the mode that actually happened, not the one requested", async () => {
    const { priya, groupId } = await twoPersonGroup(); // nobody opted in

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", priya.auth)
      .send({ amount: 4000, category: "Food", context: "group", groupId, splitMode: "weighted" });

    // An equal split stored as "weighted" would claim a weighting that never
    // took place, and the ledger has to be honest about that.
    expect(res.body.transaction.splitMode).toBe("equal");
    expect(res.body.transaction.splits.every((s) => s.amount === 2000)).toBe(true);
  });

  it("lets an admin set the group's default mode", async () => {
    const { priya, groupId } = await twoPersonGroup();

    const res = await request(app)
      .put(`/api/groups/${groupId}`)
      .set("Authorization", priya.auth)
      .send({ splitMode: "weighted" });

    expect(res.status).toBe(200);
    expect(res.body.splitMode).toBe("weighted");

    const bad = await request(app)
      .put(`/api/groups/${groupId}`)
      .set("Authorization", priya.auth)
      .send({ splitMode: "vibes" });
    expect(bad.status).toBe(400);
  });

  it("is gated behind the weighted-splits capability once the paywall lands", async () => {
    const { priya, groupId } = await twoPersonGroup();
    await optIn(priya, groupId);

    // `PAYWALL_ENABLED` is process-global and every test file shares it, so
    // this is restored in a finally rather than an afterEach — an escaped
    // "true" surfaces as an unrelated 403 in a suite that never mentions
    // entitlements, which is a genuinely horrible thing to debug.
    const before = process.env.PAYWALL_ENABLED;
    try {
      process.env.PAYWALL_ENABLED = "true";

      const preview = await request(app)
        .get(`/api/groups/${groupId}/split-preview?amount=4000&mode=weighted`)
        .set("Authorization", priya.auth);
      expect(preview.status).toBe(403);
      expect(preview.body.capability).toBe("weighted_splits");

      const write = await request(app)
        .post("/api/transactions")
        .set("Authorization", priya.auth)
        .send({ amount: 4000, category: "Food", context: "group", groupId, splitMode: "weighted" });
      expect(write.status).toBe(403);

      // Equal splits stay free. The wall is around weighting, not around
      // sharing an expense with your friends.
      const equal = await request(app)
        .get(`/api/groups/${groupId}/split-preview?amount=4000&mode=equal`)
        .set("Authorization", priya.auth);
      expect(equal.status).toBe(200);
    } finally {
      if (before === undefined) delete process.env.PAYWALL_ENABLED;
      else process.env.PAYWALL_ENABLED = before;
    }
  });

  it("refuses a preview from a non-member", async () => {
    const { groupId } = await twoPersonGroup();
    const stranger = await makeUser("Stranger", "stranger@test.com", 10000);

    const res = await request(app)
      .get(`/api/groups/${groupId}/split-preview?amount=100&mode=weighted`)
      .set("Authorization", stranger.auth);

    expect(res.status).toBe(403);
  });
});

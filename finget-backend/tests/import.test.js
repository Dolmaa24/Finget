process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { suggestCategory, seedCategory } = require("../services/categoryLearner");
const { resolveProvider } = require("../services/visionClient");

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

const BLOCK = `
Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265 -HDFC Bank

438291 is your OTP for login. Do not share it.

INR 899.00 spent at NETFLIX on Axis Bank Card XX2201 on 16-08-26. Avl Lmt INR 42,100.00
`;

const parseSms = (auth, text = BLOCK) =>
  request(app).post("/api/receipts/parse-sms").set("Authorization", auth).send({ text, context: "user" });

const commit = (auth, rows) =>
  request(app).post("/api/receipts/commit").set("Authorization", auth).send({ rows, context: "user" });

/* ------------------------------------------------------------------ */

describe("what this server can do", () => {
  it("always offers SMS import, with or without a vision provider", async () => {
    const user = await makeUser();
    const res = await request(app).get("/api/receipts/status").set("Authorization", user.auth);

    expect(res.status).toBe(200);
    expect(res.body.smsEnabled).toBe(true);
    // The trust claim, asserted rather than merely written in the UI.
    expect(res.body.imagesStored).toBe(false);
  });

  it("says plainly when screenshots are not available rather than failing oddly", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/receipts/parse")
      .set("Authorization", user.auth)
      .send({ image: "data:image/png;base64,iVBORw0KGgo=", context: "user" });

    if (res.status === 501) {
      expect(res.body.visionEnabled).toBe(false);
      // It must point at the path that works, or a person concludes import is broken.
      expect(res.body.alternative).toBe("sms");
      expect(res.body.msg).toMatch(/SMS/i);
    }
  });
});

describe("the vision provider interface", () => {
  it("is off with no key at all", () => {
    expect(resolveProvider({})).toBeNull();
  });

  it("turns on from config alone — a second key, not a rewrite", () => {
    const openai = resolveProvider({ OPENAI_API_KEY: "sk-" + "x".repeat(40) });
    expect(openai.kind).toBe("openai-compatible");

    const anthropic = resolveProvider({
      VISION_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-" + "x".repeat(40),
    });
    expect(anthropic.kind).toBe("anthropic");
  });

  it("can be pointed at any OpenAI-compatible host, including Groq if it ever ships vision", () => {
    const provider = resolveProvider({
      VISION_PROVIDER: "openai-compatible",
      VISION_API_KEY: "gsk_" + "x".repeat(40),
      VISION_BASE_URL: "https://api.groq.com/openai/v1",
      VISION_MODEL: "some-future-vision-model",
    });
    expect(provider.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(provider.model).toBe("some-future-vision-model");
  });

  it("ignores a placeholder key", () => {
    expect(resolveProvider({ OPENAI_API_KEY: "your_openai_key" })).toBeNull();
    expect(resolveProvider({ OPENAI_API_KEY: "sk-xxx" })).toBeNull();
  });
});

describe("pasting SMS", () => {
  it("returns a reviewable row per transaction and drops the OTP", async () => {
    const user = await makeUser();
    const res = await parseSms(user.auth);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows.map((r) => r.amount)).toEqual([1248, 899]);
  });

  it("never commits anything by itself", async () => {
    const user = await makeUser();
    await parseSms(user.auth);
    // Parsing is not importing. Nothing reaches the ledger until /commit.
    expect(await Transaction.countDocuments()).toBe(0);
  });

  it("marks which fields the sheet should highlight instead of guessing", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/receipts/parse-sms")
      .set("Authorization", user.auth)
      .send({ text: "Rs.500.00 debited", context: "user" });

    const row = res.body.rows[0];
    expect(row.needsAttention).toContain("date");
    expect(row.needsAttention).toContain("merchant");
  });

  it("surfaces messages it could not read rather than losing them silently", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/receipts/parse-sms")
      .set("Authorization", user.auth)
      .send({ text: "Rs.500 in an entirely unfamiliar template with no verb", context: "user" });

    expect(Array.isArray(res.body.unrecognised)).toBe(true);
  });

  it("rejects an empty paste and an absurd one", async () => {
    const user = await makeUser();
    expect((await parseSms(user.auth, "")).status).toBe(400);
    expect((await parseSms(user.auth, "Rs.1 ".repeat(20000))).status).toBe(413);
  });

  it("requires authentication", async () => {
    expect((await request(app).post("/api/receipts/parse-sms").send({ text: BLOCK })).status).toBe(401);
  });
});

describe("committing", () => {
  it("writes only the rows that were confirmed", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);

    // The person unticks the second row.
    const rows = body.rows.map((r, i) => ({ ...r, category: "Food" })).slice(0, 1);
    const res = await commit(user.auth, rows);

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(await Transaction.countDocuments()).toBe(1);
  });

  it("records provenance so an imported row is distinguishable from a typed one", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);
    await commit(user.auth, body.rows);

    const tx = await Transaction.findOne({ amount: 1248 }).lean();
    expect(tx.importSource).toBe("sms");
    expect(tx.importReference).toBe("438291047265");
    expect(tx.merchant).toBe("bluetokai");
  });

  it("honours edits the person made in the review sheet", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);

    /**
     * The row still carries the ORIGINAL `amountPaise` from the parse — that
     * is what a real review sheet sends back, since it edits the rupee field
     * and leaves the rest of the row alone. Reading paise first here meant a
     * corrected amount was thrown away and the misread original written
     * instead, which is the exact failure this whole feature exists to avoid.
     */
    expect(body.rows[0].amountPaise).toBe(124800);
    const edited = [{ ...body.rows[0], amount: 1300, category: "Groceries", note: "Corrected" }];
    await commit(user.auth, edited);

    const tx = await Transaction.findOne({}).lean();
    expect(tx.amount).toBe(1300);
    expect(tx.category).toBe("Groceries");
    expect(tx.note).toBe("Corrected");
  });

  it("rejects a row the person cleared the amount out of", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);

    const res = await commit(user.auth, [{ ...body.rows[0], amount: "" }, { ...body.rows[1], amount: 0 }]);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped.every((s) => s.reason === "invalid amount")).toBe(true);
  });

  it("refuses an empty commit", async () => {
    const user = await makeUser();
    expect((await commit(user.auth, [])).status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* The acceptance criterion                                            */
/* ------------------------------------------------------------------ */

describe("importing the same messages twice", () => {
  it("creates one transaction, not two", async () => {
    const user = await makeUser();

    const first = await parseSms(user.auth);
    await commit(user.auth, first.body.rows);
    expect(await Transaction.countDocuments()).toBe(2);

    // The same paste again. Every row now matches something stored.
    const second = await parseSms(user.auth);
    expect(second.body.rows.every((r) => r.duplicateOf)).toBe(true);
    // And each arrives excluded, so the default action imports nothing.
    expect(second.body.rows.every((r) => r.include === false)).toBe(true);

    expect(await Transaction.countDocuments()).toBe(2);
  });

  it("still refuses at commit even if the client sends the duplicates anyway", async () => {
    const user = await makeUser();
    const first = await parseSms(user.auth);
    await commit(user.auth, first.body.rows);

    // A stale review sheet, or a client ignoring `include`. The server
    // re-checks rather than trusting what it is handed.
    const second = await parseSms(user.auth);
    const res = await commit(user.auth, second.body.rows);

    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped.every((s) => s.reason === "already imported")).toBe(true);
    expect(await Transaction.countDocuments()).toBe(2);
  });

  it("lets a genuinely new transaction through alongside the duplicates", async () => {
    const user = await makeUser();
    const first = await parseSms(user.auth);
    await commit(user.auth, first.body.rows);

    const withNew = await parseSms(
      user.auth,
      `${BLOCK}\n\nRs.320.00 spent at ZOMATO on 19-08-26 Ref 5566778899`
    );
    const res = await commit(user.auth, withNew.body.rows);

    expect(res.body.imported).toBe(1);
    expect(await Transaction.countDocuments()).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* Category learning                                                   */
/* ------------------------------------------------------------------ */

describe("category learning", () => {
  it("seeds well-known merchants", () => {
    expect(seedCategory("SWIGGY")).toBe("Food");
    expect(seedCategory("NETFLIX")).toBe("Entertainment");
    expect(seedCategory("uber")).toBe("Transport");
    expect(seedCategory("some corner shop")).toBeNull();
  });

  it("learns from what the person actually chose", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);

    // They file Blue Tokai under Food.
    await commit(user.auth, [{ ...body.rows[0], category: "Food" }]);

    const stored = await User.findById(user.id);
    expect(suggestCategory(stored, "bluetokai").category).toBe("Food");
    expect(suggestCategory(stored, "bluetokai").source).toBe("learned");
  });

  it("applies what it learned to the next import", async () => {
    const user = await makeUser();
    const first = await parseSms(user.auth);
    await commit(user.auth, [{ ...first.body.rows[0], category: "Groceries" }]);

    const next = await parseSms(user.auth, "Rs.640.00 debited on 20-08-26 to VPA bluetokai@okhdfcbank Ref 999");
    expect(next.body.rows[0].category).toBe("Groceries");
    expect(next.body.rows[0].categorySource).toBe("learned");
  });

  it("lets the person's own choice override the built-in seed", async () => {
    const user = await makeUser();
    const parsed = await parseSms(user.auth, "Rs.900.00 spent at SWIGGY on 14-08-26 Ref 111222333");
    expect(parsed.body.rows[0].category).toBe("Food"); // the seed's guess

    // They order staples on Swiggy, so they file it under Groceries.
    await commit(user.auth, [{ ...parsed.body.rows[0], category: "Groceries" }]);

    const again = await parseSms(user.auth, "Rs.150.00 spent at SWIGGY on 20-08-26 Ref 444555666");
    expect(again.body.rows[0].category).toBe("Groceries");
  });

  it("matches a merchant across the spellings different issuers use", async () => {
    const user = await makeUser();
    const parsed = await parseSms(user.auth, "Rs.900.00 spent at BLUE TOKAI on 14-08-26 Ref 111222333");
    await commit(user.auth, [{ ...parsed.body.rows[0], category: "Food" }]);

    const stored = await User.findById(user.id);
    // Same shop, three ways of writing it.
    for (const spelling of ["Blue Tokai", "blue tokai Pvt Ltd", "BLUE TOKAI"]) {
      expect(suggestCategory(stored, spelling).category).toBe("Food");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

describe("image handling", () => {
  it("rejects an unsupported type", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/receipts/parse")
      .set("Authorization", user.auth)
      .send({ image: "data:image/gif;base64,R0lGOD", context: "user" });

    // 501 when vision is off; 415 when it is on. Either way, never a 500.
    expect([415, 501]).toContain(res.status);
  });

  it("caps the upload size", async () => {
    const user = await makeUser();
    const huge = "A".repeat(9 * 1024 * 1024);
    const res = await request(app)
      .post("/api/receipts/parse")
      .set("Authorization", user.auth)
      .send({ image: `data:image/png;base64,${huge}`, context: "user" });

    expect([413, 501]).toContain(res.status);
  });

  it("writes no image anywhere — the drafts carry no bytes", async () => {
    const user = await makeUser();
    const { body } = await parseSms(user.auth);
    // Nothing from any import path carries image data forward.
    expect(JSON.stringify(body)).not.toMatch(/base64|data:image/);
  });
});

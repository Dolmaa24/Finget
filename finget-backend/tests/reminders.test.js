process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest-only";
process.env.PAYWALL_ENABLED = "false";
// No mail credentials in tests: `sendMail` short-circuits to "skipped" and
// nothing here touches the network. See services/mailer.js.
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;

const request = require("supertest");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/db");
const Reminder = require("../models/Reminder");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  sweepReminders,
  debtEpisodeStart,
  stageForAge,
  reminderCopy,
  MIN_REMINDER_PAISE,
} = require("../services/reminderService");

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

const MS_DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * MS_DAY);

async function makeUser(name, email, monthlyIncome = 60000) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ name, email, password: "password123", monthlyIncome });
  expect(res.status).toBe(200);
  return { id: res.body.user._id, auth: `Bearer ${res.body.token}`, name };
}

/**
 * Priya pays for something and splits it with Arjun, `ageDays` ago.
 * Arjun therefore owes Priya half of it, and has done for `ageDays`.
 */
async function debtScenario({ ageDays = 5, amount = 4000, creditorUpiId } = {}) {
  const priya = await makeUser("Priya", "priya@test.com");
  const arjun = await makeUser("Arjun", "arjun@test.com");

  if (creditorUpiId) {
    await request(app)
      .put("/api/auth/me")
      .set("Authorization", priya.auth)
      .send({ upiId: creditorUpiId });
  }

  const group = (
    await request(app).post("/api/groups").set("Authorization", priya.auth).send({ name: "Flat 4B" })
  ).body;

  await request(app)
    .post("/api/groups/join")
    .set("Authorization", arjun.auth)
    .send({ inviteCode: group.inviteCode });

  await request(app)
    .post("/api/transactions")
    .set("Authorization", priya.auth)
    .send({
      amount,
      category: "Groceries",
      context: "group",
      groupId: group._id,
      splitMode: "equal",
      date: daysAgo(ageDays).toISOString(),
    });

  return { priya, arjun, groupId: group._id };
}

/* ------------------------------------------------------------------ */
/* THE ACCEPTANCE CRITERION                                            */
/* "reminder scheduling is idempotent under repeated cron runs; no     */
/*  user can ever receive two reminders for the same debt inside the   */
/*  cap window."                                                       */
/* ------------------------------------------------------------------ */

describe("idempotency under repeated sweeps", () => {
  it("sends once, however many times the sweep runs", async () => {
    const { arjun } = await debtScenario({ ageDays: 5 });

    expect(await sweepReminders()).toBe(1);
    expect(await sweepReminders()).toBe(0);
    expect(await sweepReminders()).toBe(0);
    expect(await sweepReminders()).toBe(0);

    expect(await Reminder.countDocuments({ from: arjun.id })).toBe(1);
    expect(await Notification.countDocuments({ userId: arjun.id })).toBe(1);
  });

  it("sends once when several sweeps run concurrently", async () => {
    const { arjun } = await debtScenario({ ageDays: 5 });

    // The unique index is the lock, not a check-then-write — so a genuine race
    // has to resolve to one message, not to whoever checked first.
    const results = await Promise.all([
      sweepReminders(),
      sweepReminders(),
      sweepReminders(),
      sweepReminders(),
      sweepReminders(),
    ]);

    expect(results.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(await Reminder.countDocuments({ from: arjun.id })).toBe(1);
    expect(await Notification.countDocuments({ userId: arjun.id })).toBe(1);
  });

  it("does not send a second reminder inside the cap window, even at a new stage", async () => {
    const { arjun, groupId } = await debtScenario({ ageDays: 3 });

    expect(await sweepReminders()).toBe(1);
    const first = await Reminder.findOne({ from: arjun.id });
    expect(first.stage).toBe(3);

    // Age the debt past the day-7 threshold but leave the reminder recent, so
    // only the 72-hour cap stands between the debtor and a second message.
    await Reminder.updateOne({ _id: first._id }, { $set: { sentAt: new Date() } });
    const { default: mongoose } = await import("mongoose");
    await mongoose.connection
      .collection("transactions")
      .updateMany({ groupId: first.groupId }, { $set: { date: daysAgo(8) } });

    expect(await sweepReminders()).toBe(0);
    expect(await Reminder.countDocuments({ from: arjun.id, groupId })).toBe(1);
  });

  it("does escalate once the cap window has passed", async () => {
    const { arjun } = await debtScenario({ ageDays: 3 });

    expect(await sweepReminders()).toBe(1);

    const { default: mongoose } = await import("mongoose");
    // Four days later: the debt is 7 days old and the last message is 4 days
    // old, so the cap no longer applies.
    await Reminder.updateMany({ from: arjun.id }, { $set: { sentAt: daysAgo(4) } });
    await mongoose.connection
      .collection("transactions")
      .updateMany({}, { $set: { date: daysAgo(7) } });

    expect(await sweepReminders()).toBe(1);

    const stages = (await Reminder.find({ from: arjun.id }).lean()).map((r) => r.stage).sort();
    expect(stages).toEqual([3, 7]);
  });
});

/* ------------------------------------------------------------------ */
/* Debt ageing                                                         */
/* ------------------------------------------------------------------ */

describe("debt episodes", () => {
  it("dates the debt from when the member first went into the red", () => {
    const start = debtEpisodeStart(
      [
        {
          type: "expense",
          date: daysAgo(10),
          paidBy: "priya",
          splits: [
            { userId: "priya", amount: 500 },
            { userId: "arjun", amount: 500 },
          ],
        },
      ],
      [],
      "arjun"
    );

    expect(start.toISOString().slice(0, 10)).toBe(daysAgo(10).toISOString().slice(0, 10));
  });

  it("returns null once the member is square", () => {
    const transactions = [
      {
        type: "expense",
        date: daysAgo(10),
        paidBy: "priya",
        splits: [
          { userId: "priya", amount: 500 },
          { userId: "arjun", amount: 500 },
        ],
      },
    ];
    const settlements = [{ date: daysAgo(2), from: "arjun", to: "priya", amount: 500 }];

    expect(debtEpisodeStart(transactions, settlements, "arjun")).toBeNull();
  });

  it("starts a NEW episode after settling and falling behind again", () => {
    const transactions = [
      {
        type: "expense",
        date: daysAgo(30),
        paidBy: "priya",
        splits: [
          { userId: "priya", amount: 500 },
          { userId: "arjun", amount: 500 },
        ],
      },
      {
        type: "expense",
        date: daysAgo(4),
        paidBy: "priya",
        splits: [
          { userId: "priya", amount: 300 },
          { userId: "arjun", amount: 300 },
        ],
      },
    ];
    const settlements = [{ date: daysAgo(20), from: "arjun", to: "priya", amount: 500 }];

    const start = debtEpisodeStart(transactions, settlements, "arjun");
    // Dated from the new expense, not the long-settled one — otherwise a debt
    // four days old would arrive wearing a month-old escalation.
    expect(start.toISOString().slice(0, 10)).toBe(daysAgo(4).toISOString().slice(0, 10));
  });

  it("reminds again after a settled debt re-opens", async () => {
    const { priya, arjun, groupId } = await debtScenario({ ageDays: 10 });
    const { default: mongoose } = await import("mongoose");

    expect(await sweepReminders()).toBe(1);
    expect((await Reminder.findOne({ from: arjun.id })).stage).toBe(7);

    // Arjun pays up, two days after the expense…
    await request(app)
      .post(`/api/groups/${groupId}/settle`)
      .set("Authorization", arjun.auth)
      .send({ from: arjun.id, to: priya.id, amount: 2000 });
    await mongoose.connection
      .collection("settlements")
      .updateMany({}, { $set: { date: daysAgo(8) } });

    expect(await sweepReminders()).toBe(0);

    // …then falls behind again on something new, four days ago. The order
    // matters: the settlement has to predate the new expense, or the ledger
    // read chronologically never recovers and it is all one long episode.
    await request(app)
      .post("/api/transactions")
      .set("Authorization", priya.auth)
      .send({
        amount: 6000,
        category: "Bills",
        context: "group",
        groupId,
        splitMode: "equal",
        date: daysAgo(4).toISOString(),
      });
    await Reminder.updateMany({ from: arjun.id }, { $set: { sentAt: daysAgo(8) } });

    // A new episode means the key is free again — the old rows do not silence
    // him forever. And it restarts at the gentle stage, because this debt
    // really is four days old however long the last one ran.
    expect(await sweepReminders()).toBe(1);
    expect(await Reminder.countDocuments({ from: arjun.id })).toBe(2);

    const latest = await Reminder.findOne({ from: arjun.id }).sort({ sentAt: -1 });
    expect(latest.stage).toBe(3);
  });
});

describe("stage selection", () => {
  it("holds its tongue before day 3", () => {
    expect(stageForAge(0)).toBeNull();
    expect(stageForAge(2)).toBeNull();
  });

  it("picks the highest threshold crossed, not the next one in sequence", () => {
    expect(stageForAge(3)).toBe(3);
    expect(stageForAge(6)).toBe(3);
    expect(stageForAge(7)).toBe(7);
    expect(stageForAge(13)).toBe(7);
    expect(stageForAge(14)).toBe(14);
    // A month-old debt gets the plain summary once — not a gentle nudge
    // followed by two more messages over the next fortnight.
    expect(stageForAge(60)).toBe(14);
  });

  it("goes quiet after the last stage", async () => {
    await debtScenario({ ageDays: 40 });

    expect(await sweepReminders()).toBe(1);
    const only = await Reminder.findOne({});
    expect(only.stage).toBe(14);

    await Reminder.updateMany({}, { $set: { sentAt: daysAgo(30) } });
    // Cap window long past, debt still open, and still nothing more to say.
    expect(await sweepReminders()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Consent and tone                                                    */
/* ------------------------------------------------------------------ */

describe("muting", () => {
  it("stays silent when the debtor mutes everything", async () => {
    const { arjun } = await debtScenario({ ageDays: 5 });

    await request(app)
      .put("/api/auth/me")
      .set("Authorization", arjun.auth)
      .send({ mutedAll: true });

    expect(await sweepReminders()).toBe(0);
    expect(await Notification.countDocuments({ userId: arjun.id })).toBe(0);
  });

  it("stays silent when the debtor mutes just this group", async () => {
    const { arjun, groupId } = await debtScenario({ ageDays: 5 });

    const res = await request(app)
      .post(`/api/groups/${groupId}/mute-reminders`)
      .set("Authorization", arjun.auth)
      .send({ muted: true });
    expect(res.status).toBe(200);

    expect(await sweepReminders()).toBe(0);
  });

  it("stays silent when an admin disables the group's collector", async () => {
    const { priya } = await debtScenario({ ageDays: 5 });
    const groupId = (await Reminder.find({}).lean()).length; // no reminders yet
    expect(groupId).toBe(0);

    const group = (await request(app).get("/api/groups").set("Authorization", priya.auth)).body[0];
    await request(app)
      .put(`/api/groups/${group._id}`)
      .set("Authorization", priya.auth)
      .send({ remindersEnabled: false });

    expect(await sweepReminders()).toBe(0);
  });

  it("un-muting restores the reminder", async () => {
    const { arjun, groupId } = await debtScenario({ ageDays: 5 });

    await request(app)
      .post(`/api/groups/${groupId}/mute-reminders`)
      .set("Authorization", arjun.auth)
      .send({ muted: true });
    expect(await sweepReminders()).toBe(0);

    await request(app)
      .post(`/api/groups/${groupId}/mute-reminders`)
      .set("Authorization", arjun.auth)
      .send({ muted: false });
    expect(await sweepReminders()).toBe(1);
  });

  it("leaves pocket change alone", async () => {
    // Half of ₹80 is ₹40, under the ₹50 floor.
    await debtScenario({ ageDays: 10, amount: 80 });
    expect(MIN_REMINDER_PAISE).toBe(5000);
    expect(await sweepReminders()).toBe(0);
  });
});

describe("the wording", () => {
  const shaming = [
    "overdue",
    "still haven't",
    "failed",
    "owe us",
    "please pay immediately",
    "!",
  ];

  it("never shames, at any stage", () => {
    for (const stage of [3, 7, 14]) {
      const copy = reminderCopy({
        stage,
        creditorName: "Priya",
        groupName: "Flat 4B",
        amountPaise: 200000,
        hasPayLink: true,
      });
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      for (const word of shaming) {
        expect(text).not.toContain(word);
      }
      expect(copy.body).toContain("₹2,000");
      expect(copy.body).toContain("Priya");
    }
  });

  it("says out loud that Finget does not handle the money", () => {
    const copy = reminderCopy({
      stage: 3,
      creditorName: "Priya",
      groupName: "Flat 4B",
      amountPaise: 200000,
      hasPayLink: true,
    });
    expect(copy.body).toContain("never handles the money");
  });
});

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

describe("what lands", () => {
  it("carries a one-tap UPI intent when the creditor has published a handle", async () => {
    const { arjun } = await debtScenario({ ageDays: 5, creditorUpiId: "priya@okhdfcbank" });

    await sweepReminders();

    const notification = await Notification.findOne({ userId: arjun.id }).lean();
    expect(notification.payIntent).toContain("upi://pay");
    expect(notification.payIntent).toContain("pa=priya%40okhdfcbank");
    expect(notification.payIntent).toContain("am=2000.00");
    expect(notification.payIntent).toContain("cu=INR");
  });

  it("still reminds when the creditor has no handle", async () => {
    const { arjun } = await debtScenario({ ageDays: 5 });

    await sweepReminders();

    const notification = await Notification.findOne({ userId: arjun.id }).lean();
    expect(notification).toBeTruthy();
    expect(notification.payIntent).toBeUndefined();
  });

  it("records email as skipped rather than failed when mail is not configured", async () => {
    await debtScenario({ ageDays: 5 });
    await sweepReminders();

    const reminder = await Reminder.findOne({}).lean();
    expect(reminder.channels.inApp).toBe(true);
    expect(reminder.channels.email).toBe("skipped");
  });

  it("reminds the debtor and nobody else", async () => {
    const { priya, arjun } = await debtScenario({ ageDays: 5 });
    await sweepReminders();

    expect(await Notification.countDocuments({ userId: arjun.id })).toBe(1);
    expect(await Notification.countDocuments({ userId: priya.id })).toBe(0);
  });

  it("exposes it through the notifications API, unread", async () => {
    const { arjun } = await debtScenario({ ageDays: 5 });
    await sweepReminders();

    const list = await request(app)
      .get("/api/notifications")
      .set("Authorization", arjun.auth);

    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBe(1);
    expect(list.body.notifications[0].kind).toBe("reminder");
    expect(list.body.notifications[0].amount).toBe(2000);

    const marked = await request(app)
      .post("/api/notifications/read")
      .set("Authorization", arjun.auth)
      .send({});
    expect(marked.body.marked).toBe(1);

    const after = await request(app)
      .get("/api/notifications")
      .set("Authorization", arjun.auth);
    expect(after.body.unreadCount).toBe(0);
  });

  it("shows nobody else's notifications", async () => {
    const { priya, arjun } = await debtScenario({ ageDays: 5 });
    await sweepReminders();

    const asPriya = await request(app).get("/api/notifications").set("Authorization", priya.auth);
    expect(asPriya.body.notifications).toHaveLength(0);

    const asArjun = await request(app).get("/api/notifications").set("Authorization", arjun.auth);
    expect(asArjun.body.notifications).toHaveLength(1);
  });
});

describe("the UPI handle", () => {
  it("rejects something that is not a VPA", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");
    const res = await request(app)
      .put("/api/auth/me")
      .set("Authorization", user.auth)
      .send({ upiId: "not an id" });
    expect(res.status).toBe(400);
  });

  it("can be cleared once set", async () => {
    const user = await makeUser("Dolma", "dolma@test.com");

    await request(app)
      .put("/api/auth/me")
      .set("Authorization", user.auth)
      .send({ upiId: "dolma@okaxis" });

    const cleared = await request(app)
      .put("/api/auth/me")
      .set("Authorization", user.auth)
      .send({ upiId: "" });

    expect(cleared.status).toBe(200);
    expect(cleared.body.upiId).toBe("");
    expect((await User.findById(user.id)).upiId).toBe("");
  });
});

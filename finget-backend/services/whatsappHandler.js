const User = require("../models/User");
const Group = require("../models/Group");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const BotAction = require("../models/BotAction");
const { idOf } = require("../utils/groupAuth");
const { toPaise, fromPaise } = require("../utils/money");
const { inr } = require("../utils/format");
const { parseMessage } = require("./messageParser");
const { completeLink } = require("./phoneLinkService");
const { sendText, formatPhone } = require("./whatsappService");
const { resolveScope, goalsForScope, affordabilityForScope } = require("./scopeResolver");
const { computeTranslation } = require("./goalCurrencyService");
const {
  equalSplit,
  weightedSplit,
  groupIncomeWeights,
  computeBalancesPaise,
  suggestSettlementsPaise,
} = require("./splitService");

/**
 * The conversation.
 *
 * One entry point, `handleInbound`, which takes a NORMALISED message — never a
 * Meta payload — and returns the reply. Nothing in this file knows which
 * provider delivered the text, and nothing in it talks to HTTP.
 *
 * THREE RULES HOLD THIS TOGETHER.
 *
 * 1. THE NUMBER IS THE CREDENTIAL. A linked number writes to a ledger with no
 *    password behind it. An unlinked number therefore gets exactly one reply —
 *    "link your number" — and can never cause a write, not even a read. There
 *    is no path below where an unrecognised `from` reaches a database write.
 *
 * 2. EVERY MESSAGE IS PROCESSED ONCE. Meta redelivers whenever it does not get
 *    a prompt 200, so the provider's message id is claimed in `BotAction`
 *    BEFORE anything happens. The unique index decides; a redelivery loses the
 *    insert and returns silently. Without this, one "450 dinner" becomes three
 *    transactions and the user blames themselves.
 *
 * 3. EVERY WRITE IS REVERSIBLE FOR TEN MINUTES, and every write says so in the
 *    same breath. Typing into a chat is fast and lossy; a bot that makes fast
 *    mistakes permanent is a bot people stop trusting with money.
 */

/** How long an UNDO can still reach the last write. */
const UNDO_WINDOW_MINUTES = 10;

/**
 * Per-number ceiling, counted from the durable action log rather than an
 * in-process counter — every webhook arrives from Meta's IP, so an IP-keyed
 * limiter would be one global bucket, and a memory-keyed one would reset on
 * deploy and diverge across instances.
 */
const MAX_MESSAGES_PER_HOUR = 60;

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const HELP = [
  "Here's what I understand:",
  "",
  "• *450 dinner* — log a personal expense",
  "• *450 dinner split with Goa* — log it to a group and split it",
  "• *got 50000 salary* — log income",
  "• *what's my number* — today's safe-to-spend",
  "• *who owes what* — balances across your groups",
  "• *settle 2000 to Priya* — record a payment you made",
  "• *undo* — reverse the last thing I did (10 minutes)",
  "",
  "Finget never holds or moves money. I only record what you tell me.",
].join("\n");

const LINK_PROMPT = [
  "This number isn't linked to a Finget account yet, so I can't log anything for you.",
  "",
  "Open Finget → Settings → WhatsApp, enter this number, and I'll send you a code to reply with.",
].join("\n");

const undoHint = `Reply UNDO within ${UNDO_WINDOW_MINUTES} minutes to remove it.`;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Groups this person is in, for name matching and group writes. */
const groupsFor = (userId) =>
  Group.find({ members: userId }).populate("members", "name monthlyIncome").lean();

/**
 * The goal-currency line — the reason this reply is worth sending.
 *
 * "Logged. Goa trip now 3 days further away." is the whole product thesis in
 * one sentence, delivered inside the app the whole group is already in.
 * Computed by the SAME function the dashboard and the browser extension use,
 * so the bot can never quote a number the app disagrees with.
 */
async function goalLine(userId, amountPaise, groupId) {
  try {
    const scope = await resolveScope({
      userId,
      context: groupId ? "group" : "user",
      groupId: groupId || undefined,
    });
    const translation = computeTranslation({
      affordability: affordabilityForScope(scope),
      goals: await goalsForScope(scope),
      amountPaise,
    });

    if (translation.headlineKind === "goal_delay") return `That's ${translation.headline}.`;
    if (translation.headlineKind === "safe_days") return `That's ${translation.headline}.`;
    return `${inr(translation.remainingAfter)} left this month.`;
  } catch {
    // A translation that cannot be computed must never cost the user their
    // transaction — it is the flourish, not the write.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Intent handlers                                                     */
/* ------------------------------------------------------------------ */

async function logTransaction(user, intent) {
  const isIncome = intent.intent === "log_income";
  const amount = fromPaise(intent.amountPaise);

  let group = null;
  let splits = [];
  let splitMode = "none";

  if (intent.groupId && !isIncome) {
    group = await Group.findById(intent.groupId).populate("members", "monthlyIncome");
    if (group) {
      const participants = group.members.map((m) => idOf(m));
      // An explicit "by income" in the message wins; otherwise the group's own
      // default applies, exactly as it would in the Add sheet.
      const wanted = intent.splitModeExplicit
        ? intent.splitMode
        : group.splitDefaults?.mode || "equal";

      if (wanted === "weighted") {
        const { weights, consentingCount } = groupIncomeWeights(group, participants);
        splits = weightedSplit(amount, participants, weights);
        splitMode = consentingCount > 0 ? "weighted" : "equal";
      } else {
        splits = equalSplit(amount, participants);
        splitMode = "equal";
      }
    }
  }

  const transaction = await Transaction.create({
    userId: user._id,
    groupId: group ? group._id : undefined,
    paidBy: user._id,
    amount,
    category: intent.category,
    note: intent.note || undefined,
    type: isIncome ? "income" : "expense",
    date: new Date(),
    splitMode,
    splits,
  });

  const lines = [];
  if (isIncome) {
    lines.push(`Logged ${inr(amount)} income · ${intent.category}`);
  } else {
    lines.push(
      `Logged ${inr(amount)} · ${intent.category}${group ? ` · ${group.name}` : ""}`
    );
  }

  if (group && splits.length > 0) {
    const mine = splits.find((s) => idOf(s.userId) === idOf(user._id));
    lines.push(
      `Split ${splits.length} ways${splitMode === "weighted" ? " by income" : ""} — your share is ${inr(mine ? mine.amount : 0)}.`
    );
  }

  if (!isIncome) {
    const line = await goalLine(user._id, intent.amountPaise, group ? group._id : null);
    if (line) lines.push(line);
  }

  lines.push(undoHint);

  return {
    reply: lines.join("\n"),
    transactionId: transaction._id,
    reversible: true,
  };
}

async function tellBalance(user) {
  const scope = await resolveScope({ userId: user._id, context: "user" });
  const affordability = affordabilityForScope(scope);

  return {
    reply: [
      `${inr(affordability.safeDaily)} safe to spend today.`,
      `${inr(affordability.remaining)} left this month, ${affordability.daysLeftInMonth} ${
        affordability.daysLeftInMonth === 1 ? "day" : "days"
      } to go.`,
      affordability.held > 0 ? `${inr(affordability.held)} is on hold in your vault.` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function tellWhoOwes(user) {
  const groups = await groupsFor(user._id);
  if (groups.length === 0) {
    return { reply: "You're not in any groups yet, so there's nothing to settle." };
  }

  const blocks = [];
  for (const group of groups) {
    const [transactions, settlements] = await Promise.all([
      Transaction.find({ groupId: group._id }).lean(),
      Settlement.find({ groupId: group._id }).lean(),
    ]);

    const balances = computeBalancesPaise(transactions, settlements);
    const nameFor = (id) =>
      (group.members || []).find((m) => idOf(m) === id)?.name || "someone";

    // Only the transfers involving this person. The others are the group's
    // business and nobody asked the bot to read out the whole sheet.
    const mine = suggestSettlementsPaise(balances).filter(
      (t) => t.from === idOf(user._id) || t.to === idOf(user._id)
    );

    if (mine.length === 0) {
      blocks.push(`*${group.name}* — all settled`);
      continue;
    }

    blocks.push(
      `*${group.name}*\n` +
        mine
          .map((t) =>
            t.from === idOf(user._id)
              ? `• You owe ${nameFor(t.to)} ${inr(fromPaise(t.amountPaise))}`
              : `• ${nameFor(t.from)} owes you ${inr(fromPaise(t.amountPaise))}`
          )
          .join("\n")
    );
  }

  return { reply: blocks.join("\n\n") };
}

async function recordSettlement(user, intent) {
  if (!intent.amountPaise || !intent.counterparty) {
    return {
      reply:
        'Tell me how much and to whom — for example: *settle 2000 to Priya*.\nOr reply *who owes what* and I\'ll show the open balances.',
    };
  }

  const groups = await groupsFor(user._id);
  const needle = intent.counterparty.toLowerCase();

  const matches = [];
  for (const group of groups) {
    for (const member of group.members || []) {
      const name = String(member.name || "").toLowerCase();
      if (idOf(member) === idOf(user._id)) continue;
      if (name === needle || name.startsWith(needle) || name.includes(needle)) {
        matches.push({ group, member });
      }
    }
  }

  if (matches.length === 0) {
    return { reply: `I couldn't find anyone called "${intent.counterparty}" in your groups.` };
  }
  if (matches.length > 1) {
    const where = [...new Set(matches.map((m) => m.group.name))].join(", ");
    return {
      reply: `There's more than one "${intent.counterparty}" (${where}). Record it in the app so it lands in the right group.`,
    };
  }

  const { group, member } = matches[0];
  const settlement = await Settlement.create({
    groupId: group._id,
    from: user._id,
    to: idOf(member),
    amount: fromPaise(intent.amountPaise),
    recordedBy: user._id,
  });

  return {
    reply: [
      `Recorded: you paid ${member.name} ${inr(fromPaise(intent.amountPaise))} in ${group.name}.`,
      "This only records the transfer — Finget never moves the money.",
      undoHint,
    ].join("\n"),
    settlementId: settlement._id,
    reversible: true,
  };
}

/**
 * Reverse the last reversible thing, if it is still inside the window.
 *
 * Deletes what was created rather than writing a compensating row: an "undo"
 * that leaves a ₹450 expense and a −₹450 expense in the ledger is not an undo,
 * it is two mistakes.
 */
async function undoLast(user) {
  const cutoff = new Date(Date.now() - UNDO_WINDOW_MINUTES * 60 * 1000);

  const last = await BotAction.findOne({
    userId: user._id,
    reversible: true,
    undoneAt: { $exists: false },
    createdAt: { $gt: cutoff },
  }).sort({ createdAt: -1 });

  if (!last) {
    return {
      reply: `Nothing to undo from the last ${UNDO_WINDOW_MINUTES} minutes. You can still edit or delete anything in the app.`,
    };
  }

  let what = "that";
  if (last.transactionId) {
    const tx = await Transaction.findOneAndDelete({
      _id: last.transactionId,
      userId: user._id,
    });
    if (tx) what = `the ${inr(tx.amount)} ${tx.category} entry`;
  } else if (last.settlementId) {
    const settlement = await Settlement.findOneAndDelete({
      _id: last.settlementId,
      recordedBy: user._id,
    });
    if (settlement) what = `the ${inr(settlement.amount)} settlement`;
  }

  last.undoneAt = new Date();
  await last.save();

  return { reply: `Removed ${what}. Nothing else changed.`, undidActionId: last._id };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Handle one inbound message.
 *
 * @param {{providerMessageId: string, from: string, text: string, unsupportedType?: string}} message
 * @returns {Promise<{reply: string|null, intent: string, duplicate?: boolean}>}
 */
async function handleInbound(message) {
  const { providerMessageId, from, text } = message;
  if (!providerMessageId || !from) return { reply: null, intent: "ignored" };

  // Rule 2: claim the message id first. Whoever wins the insert does the work.
  let action;
  try {
    action = await BotAction.create({ providerMessageId, phone: from, intent: "pending" });
  } catch (err) {
    if (err?.code === 11000) return { reply: null, intent: "duplicate", duplicate: true };
    throw err;
  }

  const finish = async (intent, { reply = null, ...rest } = {}) => {
    action.intent = intent;
    action.reply = reply || undefined;
    Object.assign(action, rest);
    await action.save();
    if (reply) await sendText(from, reply);
    return { reply, intent };
  };

  const user = await User.findOne({ phone: from });

  /* ---------------- unlinked ---------------- */
  if (!user) {
    const parsed = parseMessage(text);

    if (parsed.intent === "link_code") {
      const linked = await completeLink(from, parsed.code);
      if (linked) {
        return finish("link_success", {
          userId: linked._id,
          reply: [
            `Linked. ${formatPhone(from)} now logs straight into ${linked.name}'s Finget.`,
            "",
            "Try: *450 dinner* — or reply *help* for everything I understand.",
          ].join("\n"),
        });
      }
      // Deliberately identical to the generic refusal. Saying "wrong code"
      // would confirm that a link request exists for this number, which turns
      // the channel into an oracle for who has a Finget account.
      return finish("link_failed", { reply: LINK_PROMPT });
    }

    /**
     * Rule 1, and the milestone's acceptance bar: an unlinked number gets ONE
     * reply, then silence. Recording the message but not answering means a
     * stranger messaging this number repeatedly cannot use it as a free SMS
     * gateway, and cannot learn anything from the pattern of replies either.
     */
    const alreadyTold = await BotAction.countDocuments({
      phone: from,
      intent: "unlinked",
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    return finish("unlinked", { reply: alreadyTold === 0 ? LINK_PROMPT : null });
  }

  /* ---------------- rate limit ---------------- */
  const recent = await BotAction.countDocuments({
    phone: from,
    createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
  });
  if (recent > MAX_MESSAGES_PER_HOUR) {
    return finish("rate_limited", {
      userId: user._id,
      reply:
        recent === MAX_MESSAGES_PER_HOUR + 1
          ? "That's a lot of messages in an hour — I'm pausing for a bit. Everything you already sent is saved."
          : null,
    });
  }

  if (message.unsupportedType) {
    return finish("unsupported", {
      userId: user._id,
      reply: `I can only read text here. Send me *${message.unsupportedType === "image" ? "the amount, or import the screenshot in the app" : "a message like 450 dinner"}*.`,
    });
  }

  /* ---------------- linked ---------------- */
  const groups = await groupsFor(user._id);
  const intent = parseMessage(text, { groups });

  switch (intent.intent) {
    case "help":
      return finish("help", { userId: user._id, reply: HELP });

    case "link_code":
      return finish("already_linked", {
        userId: user._id,
        reply: "This number is already linked. Reply *help* to see what I can do.",
      });

    case "balance":
      return finish("balance", { userId: user._id, ...(await tellBalance(user)) });

    case "who_owes":
      return finish("who_owes", { userId: user._id, ...(await tellWhoOwes(user)) });

    case "settle":
      return finish("settle", { userId: user._id, ...(await recordSettlement(user, intent)) });

    case "undo":
      return finish("undo", { userId: user._id, ...(await undoLast(user)) });

    case "log_expense":
    case "log_income":
      return finish(intent.intent, { userId: user._id, ...(await logTransaction(user, intent)) });

    default:
      return finish("unknown", {
        userId: user._id,
        reply:
          intent.reason === "unknown_group"
            ? `I couldn't find a group called "${intent.spokenGroup}". Your groups: ${
                groups.map((g) => g.name).join(", ") || "none yet"
              }.`
            : `I didn't catch an amount in that.\n\n${HELP}`,
      });
  }
}

module.exports = {
  handleInbound,
  UNDO_WINDOW_MINUTES,
  MAX_MESSAGES_PER_HOUR,
  HELP,
  LINK_PROMPT,
};

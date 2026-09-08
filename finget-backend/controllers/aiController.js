const AIConversation = require("../models/AIConversation");
const { getClient, isAiConfigured, MODEL, AI_DISABLED_MESSAGE } = require("../services/aiClient");
const {
  resolveScope,
  goalsForScope,
  affordabilityForScope,
  handleScopeError,
} = require("../services/scopeResolver");
const { orchestrateInsights } = require("../services/insights/insightOrchestrator");
const { buildCoachContext } = require("../services/coachContextBuilder");
const { consumeCoachMessage, coachUsageFor } = require("../services/coachQuota");
const { CAPABILITIES } = require("../services/entitlements");

/** One conversation thread per user per scope. */
function conversationQuery(userId, context, groupId) {
  const query = { userId };
  if (context === "group" && groupId) query.groupId = groupId;
  else query.groupId = { $exists: false };
  return query;
}

exports.coachHistory = async (req, res) => {
  try {
    const { context, groupId } = req.query;
    // Resolving the scope also enforces group membership.
    await resolveScope({ userId: req.user, context, groupId });

    const conv = await AIConversation.findOne(
      conversationQuery(req.user, context, groupId)
    ).lean();

    res.json({
      messages: (conv?.messages || []).map((m) => ({ role: m.role, content: m.content })),
      aiEnabled: isAiConfigured(),
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.clearCoachHistory = async (req, res) => {
  try {
    const { context, groupId } = req.query;
    await resolveScope({ userId: req.user, context, groupId });
    await AIConversation.deleteOne(conversationQuery(req.user, context, groupId));
    res.json({ msg: "Conversation cleared" });
  } catch (err) {
    handleScopeError(err, res);
  }
};

exports.moneyCoach = async (req, res) => {
  try {
    const { question, context, groupId } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "question is required" });
    }

    const scope = await resolveScope({ userId: req.user, context, groupId });

    // Without a key, stream back a useful explanation rather than a 401 dump.
    if (!isAiConfigured()) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ text: AI_DISABLED_MESSAGE })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    /**
     * The free-tier meter, claimed only now.
     *
     * Placed AFTER the `isAiConfigured` check above on purpose: a question asked
     * on a server with no API key never reaches a model, so it costs nothing and
     * must not burn an allowance. It is claimed BEFORE the model call, because
     * the whole point is not making that call.
     *
     * When the allowance is spent, the answer arrives down the SSE stream as a
     * normal coach reply rather than as an HTTP error. The paywall rule is to
     * never block someone mid-action — and a red error toast where a
     * conversation should be is exactly that. The coach says, in its own voice,
     * what it can no longer do and what still works. `paywall` rides along so
     * the client can offer the upgrade without parsing prose.
     */
    const quota = await consumeCoachMessage(req.user);
    if (!quota.allowed) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      res.write(
        `data: ${JSON.stringify({
          text: quota.message,
          paywall: {
            capability: CAPABILITIES.UNLIMITED_COACH,
            used: quota.used,
            limit: quota.limit,
          },
        })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // Numbers come from the database, not from whatever the client posted, so
    // the coach can no longer be fed a fabricated income by a crafted request.
    const affordability = affordabilityForScope(scope);

    const coachData = await buildCoachContext({
      userId: req.user,
      groupId: scope.isGroup ? groupId : undefined,
      transactions: scope.transactions,
    });

    const query = conversationQuery(req.user, context, groupId);
    let conversation = await AIConversation.findOne(query);
    if (!conversation) {
      conversation = new AIConversation({
        userId: req.user,
        ...(scope.isGroup ? { groupId } : {}),
      });
    }

    conversation.messages.push({ role: "user", content: question });

    const systemPrompt = `You are Finget AI Coach — a practical, non-judgmental financial advisor.

VERIFIED FIGURES (from the database — treat as authoritative):
- Monthly income${scope.isGroup ? " (pooled across members)" : ""}: ₹${Math.round(affordability.income)}
- Spent this month: ₹${Math.round(affordability.expenses)}
- Remaining this month: ₹${Math.round(affordability.remaining)}
- Safe to spend per day (${affordability.daysLeftInMonth} days left): ₹${Math.round(affordability.safeDaily)}
- Risk level: ${affordability.risk}${
      affordability.held > 0
        ? `
- Held back by 48-hour vault holds (NOT spent, awaiting a decision): ₹${Math.round(affordability.held)}`
        : ""
    }

Scope: ${
      scope.isGroup
        ? `Shared group wallet "${scope.owner.name}" with ${scope.group.members.length} members — speak about "we", "the group" and shared goals.`
        : 'Personal finance — speak to "you".'
    }

STRUCTURED FINANCIAL DATA (authoritative for categories, goals, recent activity):
${JSON.stringify(coachData)}

Rules:
- Ground every number in the data above. Never invent figures.
- Write amounts as rounded rupees with Indian digit grouping: ₹3,394 — never ₹3393.8125.
- Give 1–3 concrete next steps.
- Reference goals and category trends when relevant.
- Stay consistent with prior assistant messages in this thread.
- Be concise: under 180 words unless asked for detail.

On \`deflections\` — things this person considered buying and then did not:
- Credit them. "You walked away from ₹8,499 of headphones — that is two days of
  Goa you kept" is the tone. Name the specific thing when you have it.
- Never frame a deflection as deprivation, and never suggest they are now
  "owed" a purchase for having resisted one.
- Money on hold is NOT available. Do not offer it as spare room to spend.
- Say nothing at all about purchases they went ahead with after considering
  them. That is not a failure and it is not yours to mention.`;

    const history = conversation.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = await getClient().chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      stream: true,
    });

    let fullResponse = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    if (fullResponse) {
      conversation.messages.push({ role: "assistant", content: fullResponse });
      conversation.lastUpdated = new Date();
      await conversation.save();
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Coach error:", err.message);
    if (!res.headersSent) {
      if (err.status && err.msg) return res.status(err.status).json({ error: err.msg });
      return res.status(500).json({ error: "The coach could not respond. Please try again." });
    }
    res.write(
      `data: ${JSON.stringify({ error: "The coach was interrupted. Please try again." })}\n\n`
    );
    res.end();
  }
};

exports.getInsights = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    const currentAffordability = affordabilityForScope(scope);
    const goals = await goalsForScope(scope);

    const insightsData = await orchestrateInsights(
      scope.owner,
      scope.transactions,
      currentAffordability,
      goals,
      scope.isGroup ? scope.group.members.length : 1
    );

    res.json({ ...insightsData, aiEnabled: isAiConfigured() });
  } catch (err) {
    handleScopeError(err, res);
  }
};

const { getSavageRoast } = require("../services/savageConscienceService");

/**
 * `POST /api/ai/roast` — The Savage Conscience reality-check generator.
 */
exports.savageRoast = async (req, res) => {
  try {
    const { itemOrCategory, amount, context, groupId, persona } = req.body;
    const scope = await resolveScope({ userId: req.user, context, groupId });

    const currentAffordability = affordabilityForScope(scope);
    const goals = await goalsForScope(scope);
    const worstGoal = goals?.[0] || null;

    const result = await getSavageRoast({
      itemOrCategory,
      amount: Number(amount) || 0,
      safeDaily: currentAffordability.safeDaily || 0,
      remaining: currentAffordability.remaining || 0,
      risk: currentAffordability.risk || "Safe",
      worstGoal,
      monthlyIncome: scope.owner.monthlyIncome || 0,
      persona: persona || "savage",
    });

    res.json({
      ...result,
      aiEnabled: isAiConfigured(),
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

/**
 * `GET /api/ai/coach/usage` — how much of the free allowance is left.
 *
 * Exists so the coach page can show the meter BEFORE someone hits the wall. A
 * limit you only discover by exceeding it feels like a trap; one you can see
 * coming is just a limit.
 *
 * A read, and only a read — it never resets a stale month, because two tabs
 * opening the page would then race on the same document.
 */
exports.getCoachUsage = async (req, res) => {
  try {
    res.json(await coachUsageFor(req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


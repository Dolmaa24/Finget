const OpenAI = require("openai");
const AIConversation = require("../models/AIConversation");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Settings = require("../models/Settings");
const Group = require("../models/Group");
const { isGroupMember } = require("../utils/groupAuth");
const { calculateAffordability } = require("../services/affordabilityService");
const { orchestrateInsights } = require("../services/insights/insightOrchestrator");
const { buildCoachContext } = require("../services/coachContextBuilder");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function loadTransactionsForCoach(req, context, groupId) {
  if (context === "group" && groupId) {
    const group = await Group.findById(groupId);
    if (!group || !isGroupMember(group, req.user)) {
      return { error: 403, msg: "Not authorized for this group" };
    }
    const transactions = await Transaction.find({ groupId }).sort({ date: -1 }).limit(500);
    return { transactions };
  }
  const transactions = await Transaction.find({
    userId: req.user,
    groupId: { $exists: false },
  })
    .sort({ date: -1 })
    .limit(500);
  return { transactions };
}

exports.coachHistory = async (req, res) => {
  try {
    const { context, groupId } = req.query;
    const query = { userId: req.user };
    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      query.groupId = groupId;
    } else {
      query.groupId = { $exists: false };
    }

    const conv = await AIConversation.findOne(query).lean();
    const messages = (conv?.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.moneyCoach = async (req, res) => {
  try {
    const { income, expenses, safeToSpend, question, context, groupId } = req.body;

    if (context === "group" && groupId) {
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
    }

    const query = { userId: req.user };
    if (context === "group" && groupId) {
      query.groupId = groupId;
    } else {
      query.groupId = { $exists: false };
    }

    const loaded = await loadTransactionsForCoach(req, context, groupId);
    if (loaded.error) {
      return res.status(loaded.error).json({ msg: loaded.msg });
    }

    const coachData = await buildCoachContext({
      groupId: context === "group" ? groupId : undefined,
      transactions: loaded.transactions,
    });

    let conversation = await AIConversation.findOne(query);
    if (!conversation) {
      conversation = new AIConversation(query);
    }

    conversation.messages.push({ role: "user", content: question });

    const dataBlock = JSON.stringify(coachData, null, 0);

    const systemPrompt = `You are Finget AI Coach — a practical, non-judgmental financial advisor.
Session numbers (may overlap with structured data; prefer structured data for facts):
- Monthly Income (user-reported for this chat): ${income}
- Total obligations / expenses baseline: ${expenses}
- Safe daily spend hint: ${safeToSpend}
Scope: ${context === "group" ? "Shared group wallet — speak about \"we\" and shared goals." : "Personal finance — speak to \"you\"."}

STRUCTURED FINANCIAL DATA (authoritative for amounts, categories, goals):
${dataBlock}

Rules:
- Ground numbers in STRUCTURED FINANCIAL DATA when possible (e.g. "You overspent on food this week by X%" only if derivable).
- Give 1–3 concrete next steps. Use ₹ for currency.
- Reference goals and category trends when relevant.
- Remember the recent conversation; stay consistent with prior assistant messages in this thread.
`;

    const history = conversation.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const openaiMessages = [{ role: "system", content: systemPrompt }, ...history];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
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

    conversation.messages.push({ role: "assistant", content: fullResponse });
    conversation.lastUpdated = new Date();
    await conversation.save();

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
};

exports.getInsights = async (req, res) => {
  try {
    const { context, groupId } = req.query;

    let userOrGroup = null;
    let transactions = [];

    if (context === "group" && groupId) {
      userOrGroup = await Group.findById(groupId).populate("members");
      if (!userOrGroup || !isGroupMember(userOrGroup, req.user)) {
        return res.status(403).json({ msg: "Not authorized for this group" });
      }
      transactions = await Transaction.find({ groupId });
      userOrGroup.monthlyIncome = userOrGroup.members.reduce(
        (sum, member) => sum + (member.monthlyIncome || 0),
        0
      );
    } else {
      userOrGroup = await User.findById(req.user);
      transactions = await Transaction.find({ userId: req.user, groupId: { $exists: false } });
    }

    const settings = await Settings.findOne({ userId: req.user });
    const currentAffordability = calculateAffordability(userOrGroup, transactions, settings);

    const Goal = require("../models/Goal");
    const goalQuery =
      context === "group" && groupId
        ? { groupId }
        : { userId: req.user, groupId: { $exists: false } };
    const goals = await Goal.find(goalQuery).lean();

    const insightsData = await orchestrateInsights(
      userOrGroup,
      transactions,
      currentAffordability,
      goals
    );

    res.json(insightsData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

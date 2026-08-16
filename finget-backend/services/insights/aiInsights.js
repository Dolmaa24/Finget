const { getClient, isAiConfigured, MODEL } = require("../aiClient");

/**
 * @param {string[]} existingTitles titles the rule engine already produced, so
 *   the model is told not to restate them.
 */
exports.generateAIInsights = async (
  transactions,
  income,
  safeDaily,
  goals = [],
  existingTitles = []
) => {
  if (!isAiConfigured()) return [];

  try {
    const sample = transactions
      .slice(0, 80)
      .map((t) => ({
        amount: t.amount,
        category: t.category,
        type: t.type,
      }));

    const goalsBrief = goals.slice(0, 12).map((g) => ({
      name: g.name,
      target: g.targetAmount,
      saved: g.currentAmount,
      deadline: g.deadline,
    }));

    const prompt = `You are Finget's backend analytics brain.

User context:
- Monthly income: ₹${Math.round(income)}
- Safe daily spend: ₹${Math.round(safeDaily)}
- Goals: ${JSON.stringify(goalsBrief)}
- Transactions sample: ${JSON.stringify(sample)}

Task: generate exactly 2 insights. Actionable, specific, blunt.

Writing rules:
- Write every amount as rounded rupees with the ₹ symbol and Indian digit grouping,
  e.g. ₹3,394 or ₹1,80,000. Never print raw decimals like 3393.8125.
- Never dump a list of raw transaction amounts; summarise the pattern instead.
- Each "description" must be a full sentence of 15–35 words that cites at least one
  concrete ₹ figure or percentage. One-line fragments like "Rent is largest expense"
  are not acceptable.
- Each "actionable_tip" must be a specific instruction of 8–20 words, ideally
  quantified (e.g. "Cap weekend food at ₹1,500 to free ₹3,000 a month").
- Do not repeat these already-covered rule-based findings: ${
      existingTitles.length ? existingTitles.join("; ") : "none"
    }.

Respond with JSON in exactly this shape:
{
  "insights": [
    { "title": "...", "description": "...", "actionable_tip": "...", "source": "ai" }
  ]
}`;

    const response = await getClient().chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch (err) {
    console.error("AI Insight generation failed:", err.message);
    return [];
  }
};

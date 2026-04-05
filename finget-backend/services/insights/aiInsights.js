const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.generateAIInsights = async (transactions, income, safeDaily, goals = []) => {
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
User Context:
- Monthly Income: ${income}
- Safe Daily Spend: ${safeDaily}
- Goals: ${JSON.stringify(goalsBrief)}
- Transactions sample: ${JSON.stringify(sample)}

Task: Generate exactly 2 JSON insights: actionable, specific, blunt.
Output MUST match this exact format strictly:
{
  "insights": [
    { "title": "...", "description": "...", "actionable_tip": "...", "source": "ai" }
  ]
}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.insights || [];
  } catch (err) {
    console.error("AI Insight generation failed:", err);
    return [];
  }
};

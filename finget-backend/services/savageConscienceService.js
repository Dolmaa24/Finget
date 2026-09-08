const { getClient, isAiConfigured, MODEL } = require("./aiClient");

/**
 * The Savage Conscience / Roast Engine:
 * Breaks the dopamine spending trance before a purchase by roasting the user's
 * opportunity cost with razor-sharp wit, persona voices, and goal delay comparisons.
 */

const PERSONA_PROMPTS = {
  savage: `You are "The Savage Conscience" — a hilarious, unhinged, razor-sharp Gen-Z financial advisor with zero filter. You roast the user's purchase by pointing out what absurd, better things that money could buy, and how badly it delays their goals. Keep it punchy, funny, and deeply relatable. Output in JSON.`,
  desi_mom: `You are an Indian Mom reacting to this purchase. Use hilarious desi mother expressions ("Paisa ped pe ugta hai kya?", "Sharma ji ka beta", "Ghar pe khana nahi hai kya?"), calculate how many plates of momos or cups of cutting chai this costs, and guilt-trip the user back to reality. Output in JSON.`,
  toxic_cfo: `You are a ruthless Wall Street Hedge Fund CFO auditing the user's personal balance sheet. Treat this purchase as an unauthorized, indefensible CapEx line item. Destroy the justification with corporate jargon and ruthless sarcasm. Output in JSON.`,
  monk: `You are an ultra-minimalist Zen Monk. Sardonically question why the user seeks spiritual enlightenment inside a shopping cart and remind them of their impermanence and looming credit card bill. Output in JSON.`,
};

function generateDeterministicRoast({ itemOrCategory, amount, safeDaily, remaining, worstGoal, monthlyIncome, persona = "savage" }) {
  const item = itemOrCategory || "this impulse buy";
  const num = Number(amount) || 1000;
  const momoPlates = Math.max(1, Math.round(num / 100));
  const chaiCups = Math.max(1, Math.round(num / 20));
  const daysOfDaily = safeDaily > 0 ? (num / safeDaily).toFixed(1) : "several";
  
  const incomePercent = monthlyIncome > 0 ? ((num / monthlyIncome) * 100).toFixed(1) : 0;
  let salarySavage = "";
  if (incomePercent > 50) salarySavage = ` Are you insane? This is literally more than half your entire monthly salary!`;
  else if (incomePercent > 30) salarySavage = ` This is a massive ${incomePercent}% of your entire month's income in one go!`;

  const goalDelay = worstGoal?.delayDays
    ? `${worstGoal.delayDays} days delay on your "${worstGoal.name}" goal`
    : `weeks off your savings`;

  if (persona === "desi_mom") {
    return {
      roast: `Arre wah! ₹${num.toLocaleString("en-IN")} for ${item}?! Itne me poore mohalle ko ${momoPlates} plate momos aur ${chaiCups} cup chai pila dete! Ye khareedne se pehle socha tha ki ghar me already kitna samaan pada hai?`,
      realityCheck: `This blows away ${daysOfDaily} days of your daily budget and pushes "${worstGoal?.name || "your savings"}" back by ${worstGoal?.delayDays || 12} days.`,
      absurdityScore: Math.min(99, Math.max(45, Math.round((num / Math.max(1, remaining || 5000)) * 100 + 40))),
      equivalents: [
        `🥟 ${momoPlates} plates of steamed momos`,
        `☕ ${chaiCups} cutting chais at the tapri`,
        `📉 ${goalDelay}`,
      ],
      punchline: `Ghar chalo, batati hoon ₹${num.toLocaleString("en-IN")} ka hisaab.`,
      persona: "desi_mom",
    };
  }

  if (persona === "toxic_cfo") {
    return {
      roast: `I am rejecting this ₹${num.toLocaleString("en-IN")} CapEx requisition for "${item}". Your burn rate is spiraling, safe runway is depleted, and the projected ROI on this dopamine spike is exactly -100%.`,
      realityCheck: `This single line-item represents ${daysOfDaily}x your target daily operating allowance.`,
      absurdityScore: Math.min(99, Math.max(50, Math.round((num / Math.max(1, remaining || 5000)) * 100 + 35))),
      equivalents: [
        `📊 ${daysOfDaily} full days of operating capital`,
        `📉 Compromises ${worstGoal?.name || "Q3 Reserves"} by ${worstGoal?.delayDays || 10} days`,
        `🛑 0% tax-deductible utility`,
      ],
      punchline: `Requisition Denied. Resume productive labor.`,
      persona: "toxic_cfo",
    };
  }

  // Default Savage
  return {
    roast: `Spending ₹${num.toLocaleString("en-IN")} on ${item}?${salarySavage} Bro, your bank account is having an existential crisis and your safe daily allowance is literally ₹${Math.round(safeDaily)}. Close the tab and go drink water.`,
    realityCheck: `That's ${daysOfDaily} days of your living allowance evaporating into thin air and sets your ${worstGoal?.name || "savings"} back by ${worstGoal?.delayDays || 14} days.`,
    absurdityScore: Math.min(99, Math.max(40, Math.round((num / Math.max(1, remaining || 5000)) * 100 + 45))),
    equivalents: [
      `🥟 ${momoPlates} plates of roadside momos`,
      `⏳ ${goalDelay}`,
      `☕ ${chaiCups} emergency coffees`,
    ],
    punchline: `Dopamine lasts 10 minutes. Broke is forever.`,
    persona: "savage",
  };
}

async function getSavageRoast({
  itemOrCategory,
  amount,
  safeDaily = 0,
  remaining = 0,
  risk = "Safe",
  worstGoal = null,
  monthlyIncome = 0,
  persona = "savage",
}) {
  const chosenPersona = PERSONA_PROMPTS[persona] ? persona : "savage";
  const num = Number(amount) || 0;

  if (!isAiConfigured() || num <= 0) {
    return generateDeterministicRoast({ itemOrCategory, amount: num, safeDaily, remaining, worstGoal, monthlyIncome, persona: chosenPersona });
  }

  const client = getClient();
  const systemPrompt = `${PERSONA_PROMPTS[chosenPersona]}
Return STRICT JSON with the following schema:
{
  "roast": "A 2-3 sentence ruthless, hilarious roast tailored specifically to the purchase item and numbers",
  "realityCheck": "1 sentence breaking down the real math and goal delay impact",
  "absurdityScore": 85, // number from 1 to 100 rating the financial delusion
  "equivalents": ["Emoji + Funny equivalent 1", "Emoji + Funny equivalent 2", "Emoji + Funny equivalent 3"],
  "punchline": "A short, memorable, shareable 1-liner"
}`;

  const userPrompt = `Purchase: "${itemOrCategory || "Discretionary item"}"
Amount: ₹${num.toLocaleString("en-IN")}
User's monthly income: ₹${Math.round(monthlyIncome).toLocaleString("en-IN")}
User's remaining monthly safe budget: ₹${Math.round(remaining).toLocaleString("en-IN")}
User's safe daily allowance: ₹${Math.round(safeDaily).toLocaleString("en-IN")}
Current Risk Level: ${risk}
Goal Impact: ${worstGoal ? `Delays goal "${worstGoal.name}" by ${worstGoal.delayDays || 0} days (Target: ₹${worstGoal.targetAmount})` : "No specific goal tracked"}
Persona: ${chosenPersona}

IMPORTANT: Calculate the exact percentage of their monthly income this purchase costs. If it's over 10%, brutally mock them for it. If it's over 30-50%, treat it like a full-blown financial catastrophe.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" },
    });

    let rawContent = completion.choices[0].message.content.trim();
    if (rawContent.startsWith("```json")) {
      rawContent = rawContent.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (rawContent.startsWith("```")) {
      rawContent = rawContent.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(rawContent);
    return {
      roast: parsed.roast || "Put the card down.",
      realityCheck: parsed.realityCheck || "Your goals are waiting.",
      absurdityScore: Number(parsed.absurdityScore) || 75,
      equivalents: Array.isArray(parsed.equivalents) ? parsed.equivalents : [`🥟 ${Math.round(num / 100)} plates of momos`],
      punchline: parsed.punchline || "Step away from the checkout.",
      persona: chosenPersona,
    };
  } catch (err) {
    console.error("Savage Roast AI error (falling back to deterministic):", err.message);
    return generateDeterministicRoast({ itemOrCategory, amount: num, safeDaily, remaining, worstGoal, monthlyIncome, persona: chosenPersona });
  }
}

module.exports = {
  getSavageRoast,
  PERSONA_PROMPTS,
};

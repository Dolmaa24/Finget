const {
  analyzeSubscriptions,
  calculateHealthScore,
  categoryOverspendVsLastMonth,
  predictiveBalanceNote,
  goalPaceCheck,
  weekendSpendPattern,
  groupContributionBalance,
} = require("./ruleEngine");
const { generateAIInsights } = require("./aiInsights");

/**
 * Deterministic rules first (instant, always available), then LLM reasoning
 * layered on top when a key is configured.
 */
exports.orchestrateInsights = async (
  owner,
  transactions,
  currentAffordability,
  goals = [],
  memberCount = 1
) => {
  const rules = [
    analyzeSubscriptions(transactions),
    categoryOverspendVsLastMonth(transactions),
    predictiveBalanceNote(transactions, currentAffordability),
    goalPaceCheck(goals, currentAffordability),
    weekendSpendPattern(transactions),
    groupContributionBalance(transactions, memberCount),
  ].filter(Boolean);

  const health = calculateHealthScore(
    owner?.monthlyIncome || 0,
    currentAffordability.remaining
  );

  const aiGenerated = await generateAIInsights(
    transactions,
    owner?.monthlyIncome || 0,
    currentAffordability.safeDaily,
    goals,
    rules.map((r) => r.title)
  );

  return {
    healthScore: health,
    insights: [...rules, ...aiGenerated],
  };
};

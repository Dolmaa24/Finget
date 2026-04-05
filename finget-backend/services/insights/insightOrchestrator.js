const {
  analyzeSubscriptions,
  calculateHealthScore,
  categoryOverspendVsLastMonth,
  predictiveBalanceNote,
} = require("./ruleEngine");
const { generateAIInsights } = require("./aiInsights");

exports.orchestrateInsights = async (user, transactions, currentAffordability, goals = []) => {
  const insights = [];

  const subLeak = analyzeSubscriptions(transactions);
  if (subLeak) insights.push(subLeak);

  const overspend = categoryOverspendVsLastMonth(transactions);
  if (overspend) insights.push(overspend);

  const predictive = predictiveBalanceNote(transactions, currentAffordability);
  if (predictive) insights.push(predictive);

  const health = calculateHealthScore(user.monthlyIncome || 0, currentAffordability.remaining);

  const aiGenerated = await generateAIInsights(
    transactions,
    user.monthlyIncome || 0,
    currentAffordability.safeDaily,
    goals
  );

  insights.push(...aiGenerated);

  return {
    healthScore: health,
    insights,
  };
};

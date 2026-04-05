exports.simulatePurchase = (data, amount) => {
  const newRemaining = data.remaining - amount;

  return {
    remaining: newRemaining,
    risk: newRemaining < 0 ? "Risky" : "Safe",
    impact: newRemaining < 0 ? "Goal delayed" : "Within budget"
  };
};

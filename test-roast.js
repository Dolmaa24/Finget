const { getSavageRoast } = require("./finget-backend/services/savageConscienceService");
require('dotenv').config({path: './finget-backend/.env'});

(async () => {
  try {
    const res = await getSavageRoast({
      itemOrCategory: "Test Item",
      amount: 1000,
      safeDaily: 500,
      remaining: 5000,
      risk: "Safe",
      worstGoal: null,
      monthlyIncome: 10000,
      persona: "savage"
    });
    console.log("Success:", res);
  } catch(e) {
    console.log("Error:", e);
  }
})();

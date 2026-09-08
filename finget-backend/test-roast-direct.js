require("dotenv").config();
const mongoose = require("mongoose");
const { getSavageRoast } = require("./services/savageConscienceService");

(async () => {
  try {
    const result = await getSavageRoast({
      itemOrCategory: "TCL TV",
      amount: 141900,
      safeDaily: 500,
      remaining: 5000,
      risk: "Risky",
      worstGoal: null,
      monthlyIncome: 200000,
      persona: "savage"
    });
    console.log(result);
  } catch (err) {
    console.error(err);
  }
  process.exit();
})();

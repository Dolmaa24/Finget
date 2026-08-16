const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { translateLimiter } = require("../middleware/rateLimit");

const {
  getAffordability,
  simulate,
  translatePrice,
  getAutoBudget,
  saveActiveBudget,
  futureImpactHabit,
  getBudgetSettings,
  updateBudgetSettings,
} = require("../controllers/financeController");

router.get("/affordability", auth, getAffordability);
router.post("/translate", auth, translateLimiter, translatePrice);
/** @deprecated Rupee-denominated wrapper over /translate. */
router.post("/simulate", auth, simulate);
router.get("/auto-budget", auth, getAutoBudget);
router.put("/active-budget", auth, saveActiveBudget);
router.post("/future-impact", auth, futureImpactHabit);
router.get("/budget-settings", auth, getBudgetSettings);
router.put("/budget-settings", auth, updateBudgetSettings);

module.exports = router;

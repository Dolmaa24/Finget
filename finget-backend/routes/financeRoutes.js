const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

const {
  getAffordability,
  simulate,
  getAutoBudget,
  saveActiveBudget,
  futureImpactHabit,
} = require("../controllers/financeController");

router.get("/affordability", auth, getAffordability);
router.post("/simulate", auth, simulate);
router.get("/auto-budget", auth, getAutoBudget);
router.put("/active-budget", auth, saveActiveBudget);
router.post("/future-impact", auth, futureImpactHabit);

module.exports = router;

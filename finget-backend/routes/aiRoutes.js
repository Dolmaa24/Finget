const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const {
  moneyCoach,
  getInsights,
  coachHistory,
  getCoachUsage,
  clearCoachHistory,
} = require("../controllers/aiController");

router.get("/coach/history", auth, coachHistory);
/** The free-tier meter, so the page can show it before anyone hits the wall. */
router.get("/coach/usage", auth, getCoachUsage);
router.delete("/coach/history", auth, clearCoachHistory);
router.post("/coach", auth, moneyCoach);
router.get("/insights", auth, getInsights);

module.exports = router;

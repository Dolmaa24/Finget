const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { allowApiToken } = require("../middleware/scopedAuth");
const {
  moneyCoach,
  getInsights,
  coachHistory,
  getCoachUsage,
  clearCoachHistory,
  savageRoast,
} = require("../controllers/aiController");

router.get("/coach/history", auth, coachHistory);
/** The free-tier meter, so the page can show it before anyone hits the wall. */
router.get("/coach/usage", auth, getCoachUsage);
router.delete("/coach/history", auth, clearCoachHistory);
router.post("/coach", auth, moneyCoach);
router.get("/insights", auth, getInsights);
router.post("/roast", allowApiToken("roast"), savageRoast);

module.exports = router;

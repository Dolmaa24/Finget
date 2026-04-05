const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { moneyCoach, getInsights, coachHistory } = require("../controllers/aiController");

router.get("/coach/history", auth, coachHistory);
router.post("/coach", auth, moneyCoach);
router.get("/insights", auth, getInsights);

module.exports = router;

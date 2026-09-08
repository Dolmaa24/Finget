const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { allowApiToken } = require("../middleware/scopedAuth");
const {
  createGoal,
  getGoals,
  updateGoal,
  deleteGoal,
  contributeToGoal,
} = require("../controllers/goalController");

router.post("/", allowApiToken("goals"), createGoal);
router.get("/", auth, getGoals);
router.put("/:id", auth, updateGoal);
router.post("/:id/contribute", auth, contributeToGoal);
router.delete("/:id", auth, deleteGoal);

module.exports = router;

const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const {
  getConfig,
  subscribe,
  unsubscribe,
  updateTopics,
} = require("../controllers/pushController");

router.get("/config", auth, getConfig);
router.post("/subscribe", auth, subscribe);
router.post("/unsubscribe", auth, unsubscribe);
router.put("/topics", auth, updateTopics);

module.exports = router;

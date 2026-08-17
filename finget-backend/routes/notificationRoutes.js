const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { listNotifications, markRead } = require("../controllers/notificationController");

router.get("/", auth, listNotifications);
router.post("/read", auth, markRead);

module.exports = router;

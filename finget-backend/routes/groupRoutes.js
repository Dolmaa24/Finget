const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  createGroup,
  joinByCode,
  getGroups,
  getGroup,
  updateGroup,
  rotateInviteCode,
  leaveGroup,
  getBalances,
  recordSettlement,
  getActivity,
} = require("../controllers/groupController");

router.post("/", auth, createGroup);
router.get("/", auth, getGroups);
router.post("/join", auth, joinByCode);

router.get("/:id", auth, getGroup);
router.put("/:id", auth, updateGroup);
router.post("/:id/rotate-code", auth, rotateInviteCode);
router.post("/:id/leave", auth, leaveGroup);
router.get("/:id/balances", auth, getBalances);
router.post("/:id/settle", auth, recordSettlement);
router.get("/:id/activity", auth, getActivity);

module.exports = router;

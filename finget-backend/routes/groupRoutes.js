const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { inviteCodeLimiter, aiLimiter, shareCreateLimiter } = require("../middleware/rateLimit");
const {
  createGroup,
  joinByCode,
  joinByPreviewToken,
  getGroups,
  getGroup,
  updateGroup,
  rotateInviteCode,
  rotatePreviewToken,
  leaveGroup,
  getBalances,
  recordSettlement,
  getActivity,
  getTripStatus,
  setIncomeSharing,
  getSplitPreview,
  muteGroupReminders,
} = require("../controllers/groupController");
const { getWrapped, shareWrapped, shareInvite } = require("../controllers/wrappedController");

router.post("/", auth, createGroup);
router.get("/", auth, getGroups);

/**
 * Two ways in, deliberately different.
 *
 * `join` takes the 6-char code someone reads out loud, and is attempt-limited
 * per account so the short code cannot be walked. `join-by-token` takes the
 * 22-char token from a public link, which is unguessable and needs no limit
 * beyond the public preview's own.
 */
router.post("/join", auth, inviteCodeLimiter, joinByCode);
router.post("/join-by-token", auth, joinByPreviewToken);

router.get("/:id", auth, getGroup);
router.put("/:id", auth, updateGroup);
router.post("/:id/rotate-code", auth, rotateInviteCode);
router.post("/:id/rotate-preview", auth, rotatePreviewToken);
router.post("/:id/leave", auth, leaveGroup);
router.get("/:id/balances", auth, getBalances);
router.post("/:id/settle", auth, recordSettlement);
router.get("/:id/activity", auth, getActivity);

/**
 * Income-weighted splits. The opt-in acts only on the caller — see the note on
 * `setIncomeSharing` for why there is no admin-side version of this route.
 */
router.post("/:id/income-sharing", auth, setIncomeSharing);
router.get("/:id/split-preview", auth, getSplitPreview);

/** The Silent Collector's per-member off switch. Acts only on the caller. */
router.post("/:id/mute-reminders", auth, muteGroupReminders);

/** Trip mode. */
router.get("/:id/trip-status", auth, getTripStatus);
/** The AI one-liner makes this an AI-costing route, so it takes that limiter. */
router.get("/:id/wrapped", auth, aiLimiter, getWrapped);
router.post("/:id/wrapped/share", auth, shareCreateLimiter, shareWrapped);
router.post("/:id/invite-card", auth, shareCreateLimiter, shareInvite);

module.exports = router;

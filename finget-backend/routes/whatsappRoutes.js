const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { phoneLinkLimiter } = require("../middleware/rateLimit");
const {
  verifyWebhook,
  receiveWebhook,
  getStatus,
  startLinking,
  stopLinking,
} = require("../controllers/whatsappController");

/**
 * The webhook is UNAUTHENTICATED in the JWT sense — Meta has no account here.
 * Its gate is the HMAC signature over the raw body, checked first thing in
 * `receiveWebhook`. It is mounted separately in `app.js`, above the global
 * JSON parser, because that signature is over bytes the parser destroys.
 */
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

/** Everything below is a normal signed-in user managing their own number. */
router.get("/status", auth, getStatus);
router.post("/link/start", auth, phoneLinkLimiter, startLinking);
router.post("/link/stop", auth, stopLinking);

module.exports = router;

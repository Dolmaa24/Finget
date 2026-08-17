const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { paymentOrderLimiter } = require("../middleware/rateLimit");
const {
  getConfig,
  createPaymentOrder,
  receiveWebhook,
  getHistory,
} = require("../controllers/paymentController");

/**
 * The webhook is UNAUTHENTICATED in the JWT sense — Razorpay has no account
 * here. Its gate is the HMAC signature over the raw body, checked first thing
 * in `receiveWebhook`. It is mounted separately in `app.js`, above the global
 * JSON parser, because that signature is over bytes the parser destroys.
 */
router.post("/webhook", receiveWebhook);

router.get("/config", auth, getConfig);
router.post("/order", auth, paymentOrderLimiter, createPaymentOrder);
router.get("/history", auth, getHistory);

module.exports = router;

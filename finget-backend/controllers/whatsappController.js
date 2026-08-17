const User = require("../models/User");
const {
  verifyChallenge,
  verifySignature,
  parseWebhook,
  isWhatsAppConfigured,
  whatsAppDisabledReason,
} = require("../services/whatsappService");
const { handleInbound } = require("../services/whatsappHandler");
const { startLink, unlink, linkStatus, LinkError } = require("../services/phoneLinkService");

/**
 * The WhatsApp webhook and the linking endpoints.
 *
 * Everything provider-shaped is behind `services/whatsappService`; this file
 * deals in HTTP and nothing else.
 */

/**
 * `GET /api/whatsapp/webhook` — Meta's registration handshake.
 *
 * It calls the URL with a token it expects echoed back as plain text. Any
 * mismatch is a 403 rather than a friendly message: this endpoint is not for
 * humans, and a helpful error would only help someone probing it.
 */
exports.verifyWebhook = (req, res) => {
  const challenge = verifyChallenge(req.query);
  if (challenge === null) return res.sendStatus(403);
  res.type("text/plain").send(challenge);
};

/**
 * `POST /api/whatsapp/webhook` — inbound messages.
 *
 * SIGNATURE FIRST, ALWAYS. Everything downstream writes to somebody's ledger
 * on the strength of a phone number in the payload, so an unsigned or
 * unverifiable delivery is refused before it is even parsed. With no app
 * secret configured, verification fails closed — an open write endpoint is not
 * an acceptable default, and "we hadn't set the secret yet" is exactly how one
 * would ship.
 *
 * Messages are processed INLINE and the 200 comes after. Returning early and
 * working in the background would drop a message whenever the process
 * restarted mid-handle; processing first means a crash leaves the delivery
 * unacknowledged and Meta retries it, which the dedupe key makes safe.
 */
exports.receiveWebhook = async (req, res) => {
  if (!verifySignature(req.rawBody, req.headers)) {
    return res.sendStatus(401);
  }

  let messages = [];
  try {
    messages = parseWebhook(req.body);
  } catch (err) {
    // A payload shape we cannot read is not worth a retry — Meta would send
    // the same bytes again forever.
    console.error("WhatsApp webhook parse failed:", err.message);
    return res.sendStatus(200);
  }

  for (const message of messages) {
    try {
      await handleInbound(message);
    } catch (err) {
      // One bad message must not cost the rest of the batch. It stays
      // unacknowledged only in the sense that its own handling failed; the
      // BotAction row already claimed its id, so a retry will not double-write.
      console.error(`WhatsApp message ${message.providerMessageId} failed: ${err.message}`);
    }
  }

  res.sendStatus(200);
};

/** `GET /api/whatsapp/status` — what Settings renders. */
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user).select("phone phoneVerifiedAt phoneLink").lean();
    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({
      ...linkStatus(user),
      /** Whether this SERVER can do WhatsApp at all, distinct from whether YOU have linked. */
      available: isWhatsAppConfigured(),
      unavailableReason: whatsAppDisabledReason(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/whatsapp/link/start` — send a code to a number.
 *
 * The code goes to WhatsApp and must come back from WhatsApp. Confirming it in
 * the web app instead would only prove the person still holds the session they
 * already had, which proves nothing about the number.
 */
exports.startLinking = async (req, res) => {
  try {
    if (!isWhatsAppConfigured()) {
      return res.status(503).json({
        msg: "WhatsApp isn't connected on this server yet.",
        reason: whatsAppDisabledReason(),
      });
    }

    const result = await startLink(req.user, req.body.phone);

    if (result.delivery !== "sent") {
      return res.status(502).json({
        msg: "Couldn't send the code just now. Check the number and try again in a minute.",
      });
    }

    res.json({
      msg: "Code sent. Reply to it on WhatsApp to finish linking.",
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (err instanceof LinkError) return res.status(err.status).json({ msg: err.msg });
    res.status(500).json({ error: err.message });
  }
};

exports.stopLinking = async (req, res) => {
  try {
    await unlink(req.user);
    res.json({ msg: "Number unlinked. WhatsApp can no longer log anything for you." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

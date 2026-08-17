const PushSubscription = require("../models/PushSubscription");
const {
  isPushConfigured,
  pushDisabledReason,
  publicKey,
  saveSubscription,
  removeSubscription,
} = require("../services/pushService");

/**
 * Web Push subscription management.
 *
 * The browser owns the subscription; these endpoints only store it. There is no
 * "send me a test push to any endpoint" route on purpose — that is a spam relay
 * with extra steps.
 */

/**
 * `GET /api/push/config` — what the client needs before it can subscribe.
 *
 * The VAPID PUBLIC key is public by design: it is what the browser pins the
 * subscription to. The private key never leaves the server.
 */
exports.getConfig = async (req, res) => {
  try {
    const mine = await PushSubscription.countDocuments({ userId: req.user });

    res.json({
      available: isPushConfigured(),
      unavailableReason: pushDisabledReason(),
      publicKey: publicKey(),
      /** How many of this user's devices are subscribed. */
      devices: mine,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.subscribe = async (req, res) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({
        msg: "Push notifications aren't set up on this server yet.",
        reason: pushDisabledReason(),
      });
    }

    const saved = await saveSubscription(req.user, req.body.subscription, req.header("User-Agent"));
    res.status(201).json({ msg: "This device will get Finget notifications.", topics: saved.topics });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ msg: err.message });
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/push/unsubscribe` — scoped to the caller's own subscriptions.
 *
 * Passing someone else's endpoint deletes nothing, because the filter carries
 * `userId`. Without that, an endpoint string would be enough to silence another
 * person's notifications.
 */
exports.unsubscribe = async (req, res) => {
  try {
    const endpoint = req.body.endpoint;
    if (!endpoint) return res.status(400).json({ msg: "endpoint is required" });

    const result = await removeSubscription(req.user, endpoint);
    res.json({ removed: result.deletedCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** `PUT /api/push/topics` — which kinds of notification this device wants. */
exports.updateTopics = async (req, res) => {
  try {
    const { endpoint, topics } = req.body;
    if (!endpoint) return res.status(400).json({ msg: "endpoint is required" });

    const allowed = ["vaultExpiry", "tripPace", "weekendWarning"];
    const update = {};
    for (const topic of allowed) {
      if (typeof topics?.[topic] === "boolean") update[`topics.${topic}`] = topics[topic];
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ msg: "Pass at least one topic as true or false." });
    }

    const updated = await PushSubscription.findOneAndUpdate(
      { userId: req.user, endpoint },
      { $set: update },
      { new: true }
    );
    if (!updated) return res.status(404).json({ msg: "This device isn't subscribed." });

    res.json({ topics: updated.topics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

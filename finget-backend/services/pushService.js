const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

/**
 * Web Push.
 *
 * `web-push` is a dependency rather than something hand-rolled on purpose: a
 * push message is a VAPID JWT signed over ES256 plus a payload encrypted with
 * ECDH-ES and AES128GCM against a key the browser generated. That is real
 * cryptography with a spec that has changed twice, and getting it subtly wrong
 * produces messages that silently never arrive.
 *
 * DEGRADED MODE. With no VAPID keys, `isPushConfigured()` is false, the
 * subscribe endpoint says so, and every send returns `"skipped"`. Nothing else
 * changes: the in-app notification from Milestone 5 still lands, the ambient
 * number still updates, and the app never pretends a push went out.
 *
 * WHAT IS SENT. A title, a body, and a path to open. Never a full transaction,
 * never a merchant, never a list. Push payloads pass through Google's and
 * Mozilla's infrastructure — encrypted, but still — and the trust promise says
 * transaction contents do not leave the device for third parties. A figure and
 * a sentence about the reader's own budget is the most that travels.
 */

/** How many failures before a subscription is assumed dead and removed. */
const MAX_FAILURES = 3;

let configured = null;

/**
 * Configure the VAPID identity, once, lazily.
 *
 * Lazily because `server.js` loads dotenv after this module may already have
 * been required, and reading the keys at import time would capture an empty
 * environment.
 */
function ensureConfigured(env = process.env) {
  if (configured !== null) return configured;

  const publicKey = (env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (env.VAPID_SUBJECT || "").trim();

  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    // Malformed keys are a configuration error, not a runtime one — say so at
    // boot rather than failing silently on the first send hours later.
    console.error(`Web Push disabled: VAPID keys rejected — ${err.message}`);
    configured = false;
  }
  return configured;
}

const isPushConfigured = (env = process.env) => ensureConfigured(env);

/** The key a browser needs to subscribe. Null when push is off. */
const publicKey = (env = process.env) =>
  ensureConfigured(env) ? (env.VAPID_PUBLIC_KEY || "").trim() : null;

/** Why push is off, in words a developer can act on. Null when it is on. */
function pushDisabledReason(env = process.env) {
  if (ensureConfigured(env)) return null;
  const missing = [];
  if (!env.VAPID_PUBLIC_KEY) missing.push("VAPID_PUBLIC_KEY");
  if (!env.VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
  if (!env.VAPID_SUBJECT) missing.push("VAPID_SUBJECT");
  return missing.length
    ? `${missing.join(", ")} not set — generate a pair with 'npx web-push generate-vapid-keys'`
    : "VAPID keys were rejected";
}

/** Test seam: forget the cached decision so a changed environment is re-read. */
function resetPushConfig() {
  configured = null;
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

/**
 * Send one notification to every subscription a user has that wants this topic.
 *
 * NEVER THROWS. Callers are background jobs — a push failure must not abort a
 * sweep that has other people's notifications still to deliver.
 *
 * @param {string} userId
 * @param {"vaultExpiry"|"tripPace"|"weekendWarning"} topic
 * @param {{title: string, body: string, href?: string, tag?: string}} payload
 * @returns {Promise<{sent: number, removed: number, skipped: boolean}>}
 */
async function sendToUser(userId, topic, payload) {
  if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: true };

  const subscriptions = await PushSubscription.find({
    userId,
    [`topics.${topic}`]: { $ne: false },
  });
  if (subscriptions.length === 0) return { sent: 0, removed: 0, skipped: false };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    href: payload.href || "/dashboard",
    /**
     * `tag` lets the service worker REPLACE an earlier notification instead of
     * stacking one on top of it. Three "this weekend will be tight" cards in a
     * row is how a person turns notifications off.
     */
    tag: payload.tag || topic,
  });

  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        body
      );
      sent += 1;
      subscription.lastSentAt = new Date();
      subscription.failureCount = 0;
      await subscription.save();
    } catch (err) {
      const status = err?.statusCode;

      /**
       * 404 and 410 are the push service saying this subscription is gone for
       * good — the user cleared site data or uninstalled. Deleting is correct;
       * retrying is a guaranteed failure paid for on every future send.
       */
      if (status === 404 || status === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        removed += 1;
        continue;
      }

      subscription.failureCount = (subscription.failureCount || 0) + 1;
      if (subscription.failureCount >= MAX_FAILURES) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        removed += 1;
      } else {
        await subscription.save();
      }
      console.error(`Push to ${subscription.endpoint.slice(0, 40)}… failed (${status}): ${err.message}`);
    }
  }

  return { sent, removed, skipped: false };
}

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

/**
 * Store or move a subscription.
 *
 * Upserted on `endpoint`, which is unique across all users: the same device
 * signing into a second account should MOVE, not duplicate, or the previous
 * account keeps pushing to a phone that is no longer theirs.
 */
async function saveSubscription(userId, subscription, userAgent) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    const error = new Error("A push subscription needs an endpoint and both keys.");
    error.status = 400;
    throw error;
  }

  return PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        userId,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: (userAgent || "").slice(0, 200),
        failureCount: 0,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const removeSubscription = (userId, endpoint) =>
  PushSubscription.deleteOne({ userId, endpoint });

module.exports = {
  isPushConfigured,
  pushDisabledReason,
  publicKey,
  resetPushConfig,
  sendToUser,
  saveSubscription,
  removeSubscription,
  MAX_FAILURES,
};

const { runAllTriggers } = require("../services/pushTriggers");
const { isPushConfigured, pushDisabledReason } = require("../services/pushService");

/**
 * Fires the three push triggers.
 *
 * Same in-process interval as the vault and reminder sweeps, for the same
 * reasons: it cannot be forgotten in a deploy the way a separate cron container
 * can, and the work is idempotent by construction — every trigger claims its
 * event through `PushLog`'s unique index before sending, so running this twice
 * or on two instances produces exactly the same notifications as running it
 * once.
 *
 * EVERY FIFTEEN MINUTES, which is set by the tightest of the three:
 *
 *   Vault expiry is the one with a real deadline — someone pressed "ask me in
 *   two days" and being asked 45 minutes late makes the feature feel broken.
 *   Trip pace is deduped to once a day, and the weekend warning fires on a
 *   Friday, so neither cares about the interval at all.
 */

const INTERVAL_MS = 15 * 60 * 1000;

/** Well clear of the first requests after a deploy. */
const INITIAL_DELAY_MS = 90 * 1000;

let timer = null;

async function runOnce() {
  try {
    const result = await runAllTriggers();
    const total = (result.vaultExpiry || 0) + (result.tripPace || 0) + (result.weekendWarning || 0);
    if (total > 0) {
      console.log(
        `Push: ${result.vaultExpiry} vault, ${result.tripPace} trip pace, ${result.weekendWarning} weekend`
      );
    }
  } catch (err) {
    // Never take the process down over a notification. The next tick retries,
    // and the claim rows mean the retry cannot double-send what did get out.
    console.error("Push sweep failed:", err.message);
  }
}

function startPushSweep() {
  if (timer) return timer;

  if (!isPushConfigured()) {
    console.log(`Web Push: off — ${pushDisabledReason()}. In-app notifications still work.`);
    // Nothing to poll for. Starting an interval that can only ever no-op is
    // just a timer that wakes the process up 96 times a day for nothing.
    return null;
  }

  setTimeout(runOnce, INITIAL_DELAY_MS).unref?.();

  timer = setInterval(runOnce, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopPushSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startPushSweep, stopPushSweep, runOnce, INTERVAL_MS };

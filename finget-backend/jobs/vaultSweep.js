const { sweepExpired, GRACE_HOURS } = require("../services/vaultService");

/**
 * Releases vault holds nobody answered.
 *
 * Deliberately an in-process interval rather than a cron container: this is a
 * single `updateMany` against an index, it must not silently stop when a
 * separate scheduler is forgotten in a deploy, and the work it does is
 * idempotent — so if several instances run it at once, or one runs it twice
 * after a crash, the outcome is identical. That property lives in
 * `vaultService.sweepExpired`, not here; this file only decides *when*.
 *
 * The window is 72 hours wide, so the interval is not load-bearing. Running
 * every 15 minutes means a released hold shows up well within the resolution
 * anyone would notice, at a cost of four trivial queries an hour.
 */

const INTERVAL_MS = 15 * 60 * 1000;

/** Long enough after boot that it never competes with the first requests. */
const INITIAL_DELAY_MS = 30 * 1000;

let timer = null;

async function runOnce() {
  try {
    const released = await sweepExpired();
    if (released > 0) {
      console.log(`Vault sweep: released ${released} hold(s) after ${GRACE_HOURS}h of silence`);
    }
  } catch (err) {
    // A failed sweep must never take the process down — the next tick retries,
    // and a hold living a few minutes too long is not a correctness problem.
    console.error("Vault sweep failed:", err.message);
  }
}

function startVaultSweep() {
  if (timer) return timer;

  setTimeout(runOnce, INITIAL_DELAY_MS).unref?.();

  timer = setInterval(runOnce, INTERVAL_MS);
  // Do not hold the event loop open on shutdown.
  timer.unref?.();
  return timer;
}

function stopVaultSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startVaultSweep, stopVaultSweep, runOnce, INTERVAL_MS };

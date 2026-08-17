const { sweepReminders } = require("../services/reminderService");
const { isMailConfigured, mailDisabledReason } = require("../services/mailer");

/**
 * Runs the Silent Collector.
 *
 * Same shape as `jobs/vaultSweep.js`, and for the same reason: an in-process
 * interval cannot be forgotten in a deploy the way a separate cron container
 * can, and the work is idempotent by construction — `services/reminderService`
 * claims each send through a unique index, so running this twice, or on two
 * instances at once, produces exactly the same messages as running it once.
 *
 * HOURLY, NOT EVERY MINUTE. The thresholds are whole days apart, so precision
 * beyond an hour buys nothing at all, and a reminder is the one kind of write
 * where being early is worse than being late. Hourly also means a debt that
 * crosses day 3 at 2am is not delivered at 2am.
 */

const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Deliberately long. Reminders are the least urgent thing this process does,
 * and starting a full ledger walk while the first requests after a deploy are
 * still landing helps nobody.
 */
const INITIAL_DELAY_MS = 5 * 60 * 1000;

let timer = null;

async function runOnce() {
  try {
    const sent = await sweepReminders();
    if (sent > 0) {
      console.log(`Silent Collector: sent ${sent} reminder(s)`);
    }
  } catch (err) {
    // Never take the process down over a reminder. The next tick retries, and
    // the unique index means the retry cannot double-send whatever did get out.
    console.error("Reminder sweep failed:", err.message);
  }
}

function startReminderSweep() {
  if (timer) return timer;

  if (!isMailConfigured()) {
    console.log(
      `Silent Collector: in-app only — ${mailDisabledReason()}. Reminders still appear in the app.`
    );
  }

  setTimeout(runOnce, INITIAL_DELAY_MS).unref?.();

  timer = setInterval(runOnce, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopReminderSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startReminderSweep, stopReminderSweep, runOnce, INTERVAL_MS };

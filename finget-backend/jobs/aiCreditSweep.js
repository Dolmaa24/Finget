const User = require("../models/User");
const { sweepLowBalancesAndExpirations } = require("../services/aiCreditEngine");

const INTERVAL_MS = 60 * 60 * 1000; // Hourly check
const INITIAL_DELAY_MS = 45 * 1000;

let timer = null;

async function runOnce() {
  try {
    const users = await User.find({}, "_id").lean();
    let totalAlerts = 0;
    for (const u of users) {
      const alerts = await sweepLowBalancesAndExpirations(u._id);
      totalAlerts += alerts.length;
    }
    if (totalAlerts > 0) {
      console.log(`AI Credit sweep: processed ${totalAlerts} low balance/expiry alert(s)`);
    }
  } catch (err) {
    console.error("AI credit sweep failed:", err.message);
  }
}

function startAiCreditSweep() {
  if (timer) return timer;
  setTimeout(runOnce, INITIAL_DELAY_MS).unref?.();
  timer = setInterval(runOnce, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopAiCreditSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startAiCreditSweep, stopAiCreditSweep, runOnce, INTERVAL_MS };

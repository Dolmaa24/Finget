/**
 * Outbound email.
 *
 * Deliberately one small HTTP call against Resend rather than an SMTP client:
 * it needs no dependency, no connection pool and no credentials beyond one API
 * key, and the whole surface Finget needs is "send this short plain-text note
 * to one address".
 *
 * DEGRADED MODE. With no key configured, `sendMail` returns `"skipped"` and
 * says so once at boot. Nothing upstream branches on email working — the
 * Silent Collector writes its in-app notification either way, and a reminder
 * that reached the app but not the inbox is a fully functional reminder. This
 * is the same rules-first posture the AI coach and screenshot import take.
 *
 * SWAP POINT. Everything provider-shaped is inside `deliver()`. Moving to
 * SES, Postmark or a self-hosted SMTP relay means rewriting that one function;
 * callers see `sendMail` and the three-value result and never learn who sent it.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Long enough for a cold serverless mailer, short enough not to stall a sweep. */
const TIMEOUT_MS = 10000;

function mailConfig(env = process.env) {
  const apiKey = (env.RESEND_API_KEY || "").trim();
  const from = (env.MAIL_FROM || "").trim();
  return { apiKey, from, enabled: Boolean(apiKey && from) };
}

function isMailConfigured(env = process.env) {
  return mailConfig(env).enabled;
}

/**
 * Why email is off, in words a developer reading a log can act on. Returns
 * `null` when it is on.
 */
function mailDisabledReason(env = process.env) {
  const { apiKey, from } = mailConfig(env);
  if (!apiKey && !from) return "RESEND_API_KEY and MAIL_FROM are not set";
  if (!apiKey) return "RESEND_API_KEY is not set";
  if (!from) return "MAIL_FROM is not set";
  return null;
}

async function deliver({ to, subject, text, config }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.from, to: [to], subject, text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one plain-text message.
 *
 * NEVER THROWS. Callers are background jobs, and an unreachable mail provider
 * must not abort a sweep that has other people's reminders still to write.
 *
 * @returns {Promise<"sent"|"skipped"|"failed">}
 */
async function sendMail({ to, subject, text }, env = process.env) {
  const config = mailConfig(env);
  if (!config.enabled) return "skipped";
  if (!to || !subject || !text) return "skipped";

  try {
    await deliver({ to, subject, text, config });
    return "sent";
  } catch (err) {
    console.error(`Mail to ${to} failed: ${err.message}`);
    return "failed";
  }
}

module.exports = { sendMail, isMailConfigured, mailDisabledReason };

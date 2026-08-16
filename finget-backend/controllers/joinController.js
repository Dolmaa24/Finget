const { previewByToken } = require("../services/tripPreviewService");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";

/** Minimal HTML escaping — every value below is interpolated into markup. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Failed lookups are worth watching.
 *
 * One is someone clicking an expired link. A hundred in a minute from one
 * source is someone walking the token space, and 128 bits means they will not
 * succeed — but the attempt is the signal that something changed.
 */
let recentFailures = [];
const FAILURE_WINDOW_MS = 60 * 1000;
const FAILURE_ALERT_THRESHOLD = 50;

function noteLookupFailure(ip) {
  const now = Date.now();
  recentFailures = recentFailures.filter((t) => now - t < FAILURE_WINDOW_MS);
  recentFailures.push(now);

  if (recentFailures.length === FAILURE_ALERT_THRESHOLD) {
    console.warn(
      `Trip preview: ${FAILURE_ALERT_THRESHOLD} failed token lookups in the last minute ` +
        `(most recent from ${ip}). Possible enumeration attempt.`
    );
  }
}

const DATE_FMT = { day: "numeric", month: "short" };
function dateRange(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const a = new Date(startDate).toLocaleDateString("en-IN", DATE_FMT);
  const b = new Date(endDate).toLocaleDateString("en-IN", DATE_FMT);
  return `${a} – ${b}`;
}

function notFoundPage(res) {
  return res.status(404).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not available — Finget</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       font:16px/1.5 Inter,system-ui,sans-serif;color:#262019;
       background:linear-gradient(155deg,#efe9e1,#e0d7cc 46%,#cec4b7)}
  .card{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.68);
        border-radius:28px;padding:40px;max-width:420px;text-align:center;
        box-shadow:0 26px 60px -28px rgba(60,48,38,.42)}
  a{color:#5b54d6;font-weight:600;text-decoration:none}
</style></head>
<body><div class="card">
  <h1 style="font-weight:300;letter-spacing:-.03em;margin:0 0 12px">Link not available</h1>
  <p style="color:#5f574e;margin:0 0 20px">This invite has expired or been turned off.
     Ask whoever sent it for a fresh one.</p>
  <a href="${esc(APP_BASE_URL)}">Go to Finget →</a>
</div></body></html>`);
}

/**
 * `GET /join/:previewToken` — the pre-signup trip preview.
 *
 * One of exactly two unauthenticated routes that return user data. Everything
 * it serves has been through `tripPreviewService`, which is where the decision
 * about what a stranger may see lives — notably NOT the total.
 *
 * Server-rendered with Open Graph tags so the link unfurls in WhatsApp, which
 * is where trip invites actually travel.
 */
exports.getJoinPage = async (req, res) => {
  try {
    const preview = await previewByToken(req.params.previewToken);

    if (!preview) {
      noteLookupFailure(req.ip);
      return notFoundPage(res);
    }

    const others = Math.max(0, preview.memberCount - 1);
    const title = `${preview.emoji} Join ${preview.name} on Finget`;
    const description = others
      ? `${preview.inviterName} and ${others} other${others === 1 ? "" : "s"} are splitting this${
          preview.kind === "trip" ? " trip" : ""
        }.`
      : `${preview.inviterName} invited you to split expenses on Finget.`;

    const dates = dateRange(preview.startDate, preview.endDate);
    // The app finishes the job: it takes the token, then joins once signed in.
    const appUrl = `${APP_BASE_URL}/join/${encodeURIComponent(req.params.previewToken)}`;

    res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Finget">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">

<style>
  :root{color-scheme:light}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       font:16px/1.5 Inter,system-ui,-apple-system,sans-serif;color:#262019;
       background:linear-gradient(155deg,#efe9e1,#e0d7cc 46%,#cec4b7)}
  .card{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.68);
        border-radius:28px;padding:44px;max-width:460px;width:100%;text-align:center;
        box-shadow:0 26px 60px -28px rgba(60,48,38,.42)}
  .eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;
           text-transform:uppercase;color:#8a8177;margin:0 0 18px}
  .emoji{font-size:52px;line-height:1;margin:0 0 14px}
  h1{font-weight:300;letter-spacing:-.03em;line-height:1.05;
     font-size:clamp(28px,6vw,40px);margin:0 0 10px}
  p.sub{color:#5f574e;margin:0 0 8px}
  p.dates{color:#8a8177;font-size:14px;margin:0 0 24px}
  .initials{display:flex;gap:8px;justify-content:center;margin:0 0 26px;flex-wrap:wrap}
  .initials span{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;
                 background:rgb(91 84 214 / .1);color:#5b54d6;font-weight:600;font-size:15px}
  a.cta{display:inline-block;background:#5b54d6;color:#fff;font-weight:600;
        padding:14px 28px;border-radius:999px;text-decoration:none}
  footer{margin-top:24px;font-size:13px;color:#8a8177}
</style></head>
<body><main class="card">
  <p class="eyebrow">Finget</p>
  <p class="emoji">${esc(preview.emoji)}</p>
  <h1>${esc(preview.name)}</h1>
  <p class="sub">${esc(description)}</p>
  ${dates ? `<p class="dates">${esc(dates)}</p>` : ""}
  <div class="initials">${preview.initials.map((i) => `<span>${esc(i)}</span>`).join("")}</div>
  <a class="cta" href="${esc(appUrl)}">Join on Finget →</a>
  <footer>No ads. No selling data. Finget never holds your money.</footer>
</main></body></html>`);
  } catch (err) {
    console.error("Trip preview error:", err.message);
    return notFoundPage(res);
  }
};

/**
 * `GET /join/:previewToken.json` — the same preview, for the web app.
 *
 * The app renders its own landing page; this feeds it. Identical redaction,
 * because it is the identical audience: anyone holding the link.
 */
exports.getJoinPreview = async (req, res) => {
  try {
    const preview = await previewByToken(req.params.previewToken);
    if (!preview) {
      noteLookupFailure(req.ip);
      return res.status(404).json({ msg: "This invite has expired or been turned off." });
    }
    res.json(preview);
  } catch (err) {
    console.error("Trip preview error:", err.message);
    res.status(500).json({ error: "Could not load that invite" });
  }
};

/** Test seam — the failure counter is module state by design. */
exports._resetFailureWindow = () => {
  recentFailures = [];
};

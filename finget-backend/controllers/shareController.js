const { readCard } = require("../services/shareCardService");
const { renderCardPng, RendererUnavailableError } = require("../services/shareRenderer");
const { describe, statLine, TRUST_LINE } = require("../services/shareCardCopy");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

/** Minimal HTML escaping — every value below is interpolated into markup. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function notFoundPage(res) {
  return res.status(404).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not available — Finget</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font:16px/1.5 Inter,system-ui,sans-serif;color:#262019;
       background:linear-gradient(155deg,#efe9e1,#e0d7cc 46%,#cec4b7)}
  .card{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.68);
        border-radius:28px;padding:40px;max-width:420px;text-align:center;
        box-shadow:0 26px 60px -28px rgba(60,48,38,.42)}
  a{color:#5b54d6;font-weight:600;text-decoration:none}
</style></head>
<body><div class="card">
  <h1 style="font-weight:300;letter-spacing:-.03em;margin:0 0 12px">Link not available</h1>
  <p style="color:#5f574e;margin:0 0 20px">This card has expired or been revoked.</p>
  <a href="${esc(APP_BASE_URL)}">Go to Finget →</a>
</div></body></html>`);
}

/**
 * `GET /s/:token` — one of only two unauthenticated routes that return user
 * data (the other is the Milestone 3 trip preview). Serves a server-rendered
 * page with Open Graph tags so the link unfurls in WhatsApp and iMessage.
 */
exports.getSharePage = async (req, res) => {
  try {
    const card = await readCard(req.params.token);
    if (!card) return notFoundPage(res);

    const { title, description } = describe(card);
    const stat = statLine(card);
    const imageUrl = `${API_BASE_URL}/s/${encodeURIComponent(card.token)}.png`;
    const canonical = `${API_BASE_URL}/s/${encodeURIComponent(card.token)}`;
    const p = card.payload || {};

    res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Finget</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Finget">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(imageUrl)}">

<style>
  :root{color-scheme:light}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       font:16px/1.5 Inter,system-ui,-apple-system,sans-serif;color:#262019;
       background:linear-gradient(155deg,#efe9e1,#e0d7cc 46%,#cec4b7)}
  .card{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.68);
        border-radius:28px;padding:44px;max-width:520px;width:100%;
        box-shadow:0 26px 60px -28px rgba(60,48,38,.42)}
  .eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;
           text-transform:uppercase;color:#8a8177;margin:0 0 14px}
  h1{font-weight:300;letter-spacing:-.03em;line-height:1.05;
     font-size:clamp(30px,6vw,44px);margin:0 0 14px}
  p.sub{color:#5f574e;margin:0 0 28px}
  a.cta{display:inline-block;background:#5b54d6;color:#fff;font-weight:600;
        padding:14px 26px;border-radius:999px;text-decoration:none}
  .stat{display:inline-block;background:rgb(91 84 214 / .1);color:#5b54d6;
        font-weight:600;font-size:14px;padding:8px 16px;border-radius:999px;
        margin:0 0 24px}
  footer{margin-top:26px;font-size:13px;color:#8a8177}
</style></head>
<body><main class="card">
  <p class="eyebrow">Finget</p>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(description)}</p>
  ${stat ? `<p class="stat">${esc(stat)}</p>` : ""}
  ${p.highlightName ? `<p class="sub"><strong>${esc(p.highlightName)}</strong></p>` : ""}
  <a class="cta" href="${esc(APP_BASE_URL)}">See what's safe to spend →</a>
  <footer>${esc(TRUST_LINE)}</footer>
</main></body></html>`);
  } catch (err) {
    console.error("Share page error:", err.message);
    return notFoundPage(res);
  }
};

/** `GET /s/:token.png` — stubbed until Milestone 1 wires a real renderer. */
exports.getShareImage = async (req, res) => {
  try {
    const card = await readCard(req.params.token);
    if (!card) return res.status(404).json({ msg: "Card not found" });

    const png = await renderCardPng(card);
    res.type("png").set("Cache-Control", "public, max-age=86400, immutable").send(png);
  } catch (err) {
    if (err instanceof RendererUnavailableError) {
      return res.status(501).json({ msg: err.message });
    }
    console.error("Share image error:", err.message);
    res.status(500).json({ error: "Could not render the card" });
  }
};

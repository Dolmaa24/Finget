/**
 * Share-card image rendering: a layout tree → SVG (satori) → PNG (resvg).
 *
 * No headless browser. satori is here for one specific reason — it measures
 * and wraps text. A hand-written SVG template cannot know that "stalls your
 * Kerala trip fund" is wider than "6 days of Goa", and the headline is
 * user-supplied, so it has to wrap correctly or the card is broken.
 *
 * DEGRADATION. Both dependencies are optional at runtime. `@resvg/resvg-js`
 * ships native prebuilds, and a host without one for its platform would
 * otherwise crash the process on first require. If either module fails to
 * load we fall back to the Milestone 0 behaviour: a 501 on the `.png` route,
 * while `/s/:token` keeps serving the HTML card. A share link that loses its
 * preview image is a degraded card; a share link that 500s is a broken one.
 *
 * FONTS are bundled, not taken from the host. A Linux container has no Inter,
 * and satori has no access to system fonts regardless.
 */

const fs = require("fs");
const path = require("path");
const { describe, statLine, TRUST_LINE } = require("./shareCardCopy");

const WIDTH = 1200;
const HEIGHT = 630;

/* ------------------------------------------------------------------ */
/* Lazy, cached module + font loading                                  */
/* ------------------------------------------------------------------ */

let modulesPromise = null;
let fontsCache = null;
let unavailableReason = null;

const FONT_DIR = path.join(
  path.dirname(require.resolve("@fontsource/inter/package.json")),
  "files"
);

/**
 * Inter's `latin` subset does NOT contain U+20B9, the rupee sign — it renders
 * as a missing-glyph box. Every figure on every card is in rupees, so each
 * weight is loaded twice: the latin subset, then latin-ext as a named fallback
 * that satori reaches for when the first has no glyph. Do not drop the ext
 * files to save 140 KB; the card silently becomes "□8,499".
 */
const FONT_WEIGHTS = [300, 400, 600];

function loadFonts() {
  if (fontsCache) return fontsCache;

  const fonts = [];
  for (const weight of FONT_WEIGHTS) {
    fonts.push({
      name: "Inter",
      data: fs.readFileSync(path.join(FONT_DIR, `inter-latin-${weight}-normal.woff`)),
      weight,
      style: "normal",
    });
    fonts.push({
      name: "InterExt",
      data: fs.readFileSync(path.join(FONT_DIR, `inter-latin-ext-${weight}-normal.woff`)),
      weight,
      style: "normal",
    });
  }

  fontsCache = fonts;
  return fonts;
}

async function loadModules() {
  if (!modulesPromise) {
    modulesPromise = (async () => {
      // satori is ESM-only in source but ships a CJS build; the dynamic import
      // works either way and keeps the cost off the boot path.
      const satori = (await import("satori")).default;
      const { Resvg } = require("@resvg/resvg-js");
      return { satori, Resvg, fonts: loadFonts() };
    })().catch((err) => {
      // Cache the failure. Retrying a missing native binding on every request
      // just turns a 501 into a slow 501.
      unavailableReason = err.message;
      modulesPromise = Promise.reject(err);
      return modulesPromise;
    });
  }
  return modulesPromise;
}

/** Whether the `.png` route can serve anything. Callers use it to hide UI. */
function isRendererAvailable() {
  if (unavailableReason) return false;
  try {
    require.resolve("satori");
    require.resolve("@resvg/resvg-js");
    require.resolve("@fontsource/inter/package.json");
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/* Straight from src/styles/theme.css — the card is the app, screenshotted. */
const INK = "#262019";
const INK_2 = "#5f574e";
const INK_3 = "#8a8177";
const ACCENT = "#5b54d6";

/** satori needs an explicit `display` on anything holding children. */
const el = (type, style, children) => ({ type, props: { style, children } });

/**
 * Text is a subset of the app's, not a copy of it.
 *
 * Inter has no emoji, and neither satori nor resvg falls back to a system
 * emoji font — an unhandled 🏖️ rasterises as a literal "NO GLYPH" box. Group
 * emoji are user-chosen and arbitrary, so there is no allow-list to bundle.
 *
 * The HTML card at `/s/:token` keeps its emoji (browsers have the fonts); only
 * the PNG drops them. If Milestone 3's Wrapped card wants them back, the fix
 * is bundling Twemoji SVGs and passing satori `graphemeImages` — not a network
 * fetch on the render path.
 */
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]️?|[️‍]/gu;

function stripUnrenderable(text) {
  return String(text ?? "")
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Long headlines have to stay on the card. Rather than shrink-to-fit by
 * measuring (satori gives no measurement API), step the size down by length —
 * coarse, but the input is one short sentence and the bands are generous.
 */
function titleSize(title) {
  const n = title.length;
  if (n <= 26) return 86;
  if (n <= 40) return 70;
  if (n <= 58) return 58;
  if (n <= 80) return 48;
  return 40;
}

function buildTree(card) {
  const described = describe(card);
  const title = stripUnrenderable(described.title);
  const description = stripUnrenderable(described.description);
  const rawStat = statLine(card);
  const stat = rawStat ? stripUnrenderable(rawStat) : null;

  return el(
    "div",
    {
      display: "flex",
      width: WIDTH,
      height: HEIGHT,
      padding: 48,
      fontFamily: "Inter",
      // The app's ambient ground. satori supports linear-gradient backgrounds.
      backgroundColor: "#e7e0d8",
      backgroundImage: "linear-gradient(155deg, #efe9e1 0%, #e0d7cc 46%, #cec4b7 100%)",
    },
    [
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 56,
          borderRadius: 40,
          // Glass, pre-composited: there is no backdrop to filter in a PNG.
          backgroundColor: "rgba(255,255,255,0.80)",
          border: "1px solid rgba(255,255,255,0.68)",
        },
        [
          /* Wordmark */
          el("div", { display: "flex", alignItems: "center" }, [
            el(
              "div",
              {
                display: "flex",
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: ACCENT,
                marginRight: 12,
              },
              []
            ),
            el(
              "div",
              {
                display: "flex",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "0.14em",
                color: INK_3,
              },
              "FINGET"
            ),
          ]),

          /* The message */
          el("div", { display: "flex", flexDirection: "column" }, [
            el(
              "div",
              {
                display: "flex",
                fontSize: titleSize(title),
                fontWeight: 300,
                letterSpacing: "-0.03em",
                lineHeight: 1.06,
                color: INK,
              },
              title
            ),
            el(
              "div",
              { display: "flex", fontSize: 28, color: INK_2, marginTop: 20, lineHeight: 1.35 },
              description
            ),
            ...(stat
              ? [
                  el(
                    "div",
                    {
                      display: "flex",
                      alignSelf: "flex-start",
                      marginTop: 26,
                      paddingTop: 10,
                      paddingBottom: 10,
                      paddingLeft: 22,
                      paddingRight: 22,
                      borderRadius: 999,
                      backgroundColor: "rgba(91,84,214,0.10)",
                      color: ACCENT,
                      fontSize: 22,
                      fontWeight: 600,
                    },
                    stat
                  ),
                ]
              : []),
          ]),

          /* The positioning, on every card */
          el("div", { display: "flex", fontSize: 19, color: INK_3 }, TRUST_LINE),
        ]
      ),
    ]
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

class RendererUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 501;
  }
}

/**
 * @param {object} card a ShareCard document (or plain object with kind+payload)
 * @returns {Promise<Buffer>} PNG bytes
 * @throws {RendererUnavailableError} when the pipeline cannot load on this host
 */
async function renderCardPng(card) {
  let satori;
  let Resvg;
  let fonts;

  try {
    ({ satori, Resvg, fonts } = await loadModules());
  } catch (err) {
    throw new RendererUnavailableError(
      `Card images are unavailable on this server (${err.message}). The shareable link and its preview text still work.`
    );
  }

  const svg = await satori(buildTree(card), { width: WIDTH, height: HEIGHT, fonts });

  return new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    // Every glyph is already a path by the time satori is done; resvg never
    // needs to resolve a font, so it must not go looking at system ones.
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

module.exports = {
  renderCardPng,
  isRendererAvailable,
  RendererUnavailableError,
  buildTree,
  titleSize,
  stripUnrenderable,
  loadFonts,
  FONT_WEIGHTS,
  WIDTH,
  HEIGHT,
};

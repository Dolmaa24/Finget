import { formatInr } from "./lib/price";
import { labelFrom } from "./lib/label";
import type { ChipTranslation, DeflectResult } from "./lib/messages";

/**
 * The chip.
 *
 * Rendered into a closed-ish shadow root with an inline stylesheet, because
 * the host page's CSS is hostile by default — Amazon has global `span { }`
 * rules, Myntra resets `all`, and a chip that inherits a 10px line-height or a
 * `display:none` from a page-level selector is worse than no chip.
 *
 * Nothing here is loaded from the network. No fonts, no images, no CSS files:
 * a retailer's CSP would block them, and a request per product page would tell
 * Finget's server what the user is browsing even when they never engage.
 */

const HOST_ID = "finget-chip-host";

/* The app's tokens, inlined. Kept in sync with src/styles/theme.css by hand —
   the extension is a separate build and cannot import the app's CSS. */
const STYLES = `
:host { all: initial; }
.chip {
  /**
   * Wraps, and is a rounded rect rather than a pill.
   *
   * A pill only works while the content fits on one line. Mobile Amazon is a
   * ~340px column, and a non-wrapping inline-flex there pushed the button off
   * the screen and broke the headline one word per line. The radius is the
   * app's --r-sm, so a wrapped chip still reads as the same object.
   */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  max-width: 100%;
  box-sizing: border-box;
  margin: 10px 0;
  padding: 9px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 1px 1px rgba(255, 255, 255, 0.6) inset,
              0 10px 26px -14px rgba(60, 48, 38, 0.34);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.35;
  color: #262019;
  text-align: left;
  animation: finget-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes finget-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .chip { animation: none; } }

/**
 * Inline, not a flex item. As a sibling of .text it was pushed onto its own
 * line the moment .text claimed the full row; inline-block keeps it sitting
 * against the first character where a bullet belongs.
 */
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5b54d6;
  margin-right: 8px;
  vertical-align: baseline;
}

/**
 * All three phrases live in ONE flowing text block rather than as separate
 * flex items. As flex items they wrapped independently, which orphaned the
 * middots onto their own lines; as inline text they wrap the way a sentence
 * does. min-width:0 is what actually lets it shrink inside the flex row.
 */
.text { flex: 1 1 auto; min-width: 0; }

.amount { font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.sep { color: #a9a096; padding: 0 2px; }
.headline { color: #262019; }
.risk { font-weight: 600; }
.risk--Safe { color: #2f8f63; }
.risk--Warning { color: #b8802b; }
.risk--Risky { color: #c0503c; }

button {
  font: inherit;
  border: 0;
  cursor: pointer;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #5b54d6;
  background: rgba(91, 84, 214, 0.1);
  white-space: nowrap;
}
button:disabled { color: #a9a096; background: rgba(60, 48, 38, 0.06); cursor: default; }
button:focus-visible { outline: 2px solid #5b54d6; outline-offset: 2px; }
button.held { color: #2f8f63; background: rgba(47, 143, 99, 0.12); }
.note { font-size: 12px; color: #5f574e; flex-basis: 100%; }
.note--error { color: #c0503c; }
`;

/** The risk clause. Calm, factual, never a verdict about the person. */
const RISK_TEXT: Record<ChipTranslation["riskAfter"], string> = {
  Safe: "you'd still be Safe",
  Warning: "this gets close to your buffer",
  Risky: "this goes past your buffer",
};

/** What the ledger will call this, read off the page. See lib/label.ts. */
function pageLabel(): string {
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  return labelFrom(og, document.title);
}

function buildRoot(): ShadowRoot {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    // The host itself must not participate in the page's layout rules.
    host.style.cssText = "all: initial; display: block;";
    document.body.appendChild(host);
  }
  return host.shadowRoot ?? host.attachShadow({ mode: "open" });
}

export function removeChip() {
  document.getElementById(HOST_ID)?.remove();
}

/**
 * Renders (or re-renders) the chip next to `anchor`.
 *
 * Returns silently if anything is missing. This is called from a MutationObserver
 * on pages we do not control, so it must never throw into someone else's code.
 */
export function renderChip(anchor: Element, translation: ChipTranslation) {
  try {
    const root = buildRoot();
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.setAttribute("role", "status");

    const dot = document.createElement("span");
    dot.className = "dot";

    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = formatInr(translation.amountPaise);

    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "·";

    const headline = document.createElement("span");
    headline.className = "headline";
    // `headline` is server-generated but contains a user's own goal name.
    // textContent, never innerHTML.
    headline.textContent = translation.headline;

    const sep2 = document.createElement("span");
    sep2.className = "sep";
    sep2.textContent = "·";

    const risk = document.createElement("span");
    risk.className = `risk risk--${translation.riskAfter}`;
    risk.textContent = RISK_TEXT[translation.riskAfter] ?? "";

    /**
     * The 48-hour vault, from the product page.
     *
     * Pressing it ring-fences the amount immediately — the number in the app
     * moves before the person has left the tab. The label for the ledger is
     * taken from the page title rather than asked for: a prompt here would be
     * friction at exactly the moment the feature needs to be effortless.
     */
    const deflect = document.createElement("button");
    deflect.type = "button";
    deflect.textContent = "Think about it";
    deflect.title = "Hold this for 48 hours and take it out of your safe-to-spend";

    const note = document.createElement("div");
    note.className = "note";
    note.hidden = true;

    deflect.addEventListener("click", async () => {
      // Disabled first: a second click before the request returns would open a
      // second hold for the same product.
      deflect.disabled = true;
      deflect.textContent = "Holding…";

      try {
        const result: DeflectResult = await chrome.runtime.sendMessage({
          type: "deflect",
          amountPaise: translation.amountPaise,
          label: pageLabel(),
          sourceUrl: location.href,
        });

        if (result?.ok) {
          deflect.textContent = "In your vault";
          deflect.classList.add("held");
          note.hidden = false;
          note.textContent = `Held for ${result.vaultHours} hours. Finget will ask you once, and give it back if you don't answer.`;
          return;
        }

        deflect.disabled = false;
        deflect.textContent = "Think about it";
        note.hidden = false;
        note.className = "note note--error";
        note.textContent =
          result?.reason === "logged-out"
            ? "Reconnect Finget from the extension icon to use the vault."
            : result?.message || "Could not hold that just now.";
      } catch {
        deflect.disabled = false;
        deflect.textContent = "Think about it";
      }
    });

    const text = document.createElement("div");
    text.className = "text";
    text.append(dot, amount, sep, headline, sep2, risk);

    chip.append(text, deflect, note);

    // Move the host next to the price rather than leaving it on <body>.
    const host = root.host as HTMLElement;
    if (anchor.parentNode && host.parentNode !== anchor.parentNode) {
      anchor.parentNode.insertBefore(host, anchor.nextSibling);
    }

    root.appendChild(chip);
  } catch {
    // A page that breaks our chip does not get to break itself.
  }
}

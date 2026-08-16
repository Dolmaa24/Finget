import { renderChip } from "../src/chip";
import type { ChipTranslation } from "../src/lib/messages";

/**
 * Development harness. NOT part of the extension build — it exists so the chip
 * can be looked at, and its shadow-DOM isolation proven against hostile host
 * CSS, without loading an unpacked extension and browsing to a live retailer.
 *
 * `renderChip` is imported from src, so what renders here is the shipping code
 * rather than a copy that can drift.
 */

const cases: Array<[string, ChipTranslation]> = [
  [
    "anchor-safe",
    { amountPaise: 849900, headline: "6 days of your Goa trip", headlineKind: "goal_delay", riskAfter: "Safe" },
  ],
  [
    "anchor-warning",
    { amountPaise: 12999900, headline: "stalls your Goa trip", headlineKind: "goal_delay", riskAfter: "Warning" },
  ],
  [
    "anchor-risky",
    { amountPaise: 4590000, headline: "12 days of your safe spend", headlineKind: "safe_days", riskAfter: "Risky" },
  ],
  [
    "anchor-long",
    {
      amountPaise: 2200000,
      headline: "41 days of your Kerala backwaters and Munnar trip fund",
      headlineKind: "goal_delay",
      riskAfter: "Safe",
    },
  ],
];

/**
 * The real content script renders one chip per page. The harness renders four,
 * so each gets its own host element rather than reusing the shared id.
 */
for (const [anchorId, translation] of cases) {
  const anchor = document.getElementById(anchorId);
  if (!anchor) continue;

  const slot = document.createElement("div");
  anchor.after(slot);

  // renderChip finds-or-creates a host by id, so isolate each case in its own
  // detached document fragment stand-in.
  const shadowHost = document.createElement("div");
  shadowHost.id = "finget-chip-host";
  slot.appendChild(shadowHost);

  renderChip(shadowHost, translation);
  shadowHost.id = `rendered-${anchorId}`;
}

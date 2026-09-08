import { parsePriceToPaise } from "../lib/price";
import type { PriceHit, SiteAdapter } from "./types";

/**
 * Turning an adapter config plus a document into a price, or into nothing.
 *
 * "Or into nothing" is the important half. Every failure here returns null and
 * the content script injects no chip. A missing chip is invisible; a chip
 * showing the wrong number tells someone a ₹1,29,999 laptop costs them one day
 * of their trip, and they would be right to never trust Finget again.
 */

/** Only a leaf-ish element's own text is trustworthy as "the price". */
function ownText(el: Element): string {
  // `.a-offscreen` and friends are single text nodes; a container's textContent
  // would happily glue the price to the MRP, the EMI and the delivery date.
  let text = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === 3 /* TEXT_NODE */) text += node.nodeValue ?? "";
  });
  return text.trim() || (el.textContent ?? "").trim();
}

/** A rupee figure and essentially nothing else. Used by the container scan. */
const LOOKS_LIKE_PRICE = /^\s*(?:₹|Rs\.?|INR)\s*\d[\d,]*(?:\.\d{1,2})?\s*$/i;

function fromSelectors(root: ParentNode, adapter: SiteAdapter): { el: Element; paise: number } | null {
  for (const selector of adapter.priceSelectors) {
    let nodes: Element[];
    try {
      nodes = Array.from(root.querySelectorAll(selector));
    } catch {
      continue;
    }

    let best: { el: Element; paise: number } | null = null;
    for (const el of nodes) {
      const paise = parsePriceToPaise(ownText(el));
      if (paise !== null) {
        if (!best || paise < best.paise) {
          best = { el, paise };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function fromScan(root: ParentNode, adapter: SiteAdapter): { el: Element; paise: number } | null {
  for (const containerSelector of adapter.scanContainers ?? []) {
    let containers: Element[];
    try {
      containers = Array.from(root.querySelectorAll(containerSelector));
    } catch {
      continue;
    }

    for (const container of containers) {
      // Cap the walk: a cart page can hold thousands of nodes and this runs
      // on every mutation batch.
      const candidates = Array.from(container.querySelectorAll("span, div, p, strong, h1, h2")).slice(0, 400);

      let bestInContainer: { el: Element; paise: number } | null = null;
      for (const el of candidates) {
        const text = ownText(el);
        if (!LOOKS_LIKE_PRICE.test(text)) continue;
        const paise = parsePriceToPaise(text);
        if (paise !== null) {
          if (!bestInContainer || paise < bestInContainer.paise) {
            bestInContainer = { el, paise };
          }
        }
      }
      if (bestInContainer) return bestInContainer;
    }
  }
  return null;
}

function findAnchor(root: ParentNode, adapter: SiteAdapter, priceEl: Element): Element {
  for (const selector of adapter.anchorSelectors ?? []) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {
      continue;
    }
  }
  // `.a-offscreen` is visually hidden, so anchoring to it directly would hide
  // the chip too. Its parent is the visible price block.
  return priceEl.parentElement ?? priceEl;
}

/**
 * @returns the price on this page, or null if there isn't one we trust
 */
export function extractPrice(
  doc: Document,
  url: URL,
  adapter: SiteAdapter
): PriceHit | null {
  if (adapter.isPriceablePage && !adapter.isPriceablePage(url)) return null;

  const found = fromSelectors(doc, adapter) ?? fromScan(doc, adapter);
  if (!found) return null;

  return {
    adapterId: adapter.id,
    pricePaise: found.paise,
    priceEl: found.el,
    anchorEl: findAnchor(doc, adapter, found.el),
  };
}

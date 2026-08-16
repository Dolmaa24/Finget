import { adapterForHost } from "./adapters/sites";
import { extractPrice } from "./adapters/extract";
import { renderChip, removeChip } from "./chip";
import type { TranslateResult } from "./lib/messages";

/**
 * Runs on the retail pages listed in the manifest.
 *
 * Three jobs, in order of importance:
 *   1. Never break the host page. Everything is wrapped, nothing throws out.
 *   2. Show nothing rather than something wrong.
 *   3. Show the chip within a second of the price being readable.
 */

const adapter = adapterForHost(location.hostname);

/** Bail immediately on a site we have no adapter for. */
if (adapter) {
  let lastPaise: number | null = null;
  let lastUrl = location.href;
  let scheduled = 0;

  const clear = () => {
    lastPaise = null;
    removeChip();
  };

  async function attempt() {
    try {
      const hit = extractPrice(document, new URL(location.href), adapter!);

      if (!hit) {
        // Left a product page, or the price has not rendered yet.
        if (lastPaise !== null) clear();
        return;
      }

      // The chip is already showing this exact price; re-rendering would only
      // restart the entrance animation on every unrelated DOM mutation.
      if (hit.pricePaise === lastPaise && document.getElementById("finget-chip-host")) return;

      lastPaise = hit.pricePaise;

      const result: TranslateResult = await chrome.runtime.sendMessage({
        type: "translate",
        amountPaise: hit.pricePaise,
      });

      // Logged out, offline, or rate-limited: the extension is simply absent.
      // A retail page is the wrong place to nag someone about signing in.
      if (!result || !result.ok) {
        removeChip();
        return;
      }

      // The page may have navigated away while the request was in flight.
      if (lastPaise !== hit.pricePaise) return;

      renderChip(hit.anchorEl, result.translation);
    } catch {
      // Extension context invalidated (a reload during development), or the
      // page tore the node out from under us. Neither is worth surfacing.
    }
  }

  /** Coalesce mutation bursts — a product page settles over several hundred ms. */
  function schedule(delay = 250) {
    clearTimeout(scheduled);
    scheduled = setTimeout(attempt, delay) as unknown as number;
  }

  /**
   * Soft navigation. Amazon, Flipkart and Myntra all swap products via the
   * History API without a page load, and the acceptance criterion is that the
   * chip survives it. `popstate` alone misses pushState, so the URL is checked
   * on every mutation batch too.
   */
  function checkUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clear();
    schedule(400);
  }

  const observer = new MutationObserver(() => {
    checkUrl();
    schedule();
  });

  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", checkUrl);
    // First pass immediately: on a warm cache the price is usually in the
    // initial HTML and the chip appears well inside the 1s target.
    schedule(0);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

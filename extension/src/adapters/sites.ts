import type { SiteAdapter } from "./types";

/**
 * The site configs. Nothing here is logic — it is a table of selectors, and it
 * is expected to need edits as the sites change. Keep it that way.
 */

/** Amazon's `.a-offscreen` span holds the full accessible price, e.g. "₹8,499.00". */
const amazon: SiteAdapter = {
  id: "amazon.in",
  label: "Amazon",
  hosts: ["amazon.in"],
  isPriceablePage: (url) => /\/(dp|gp\/product)\//.test(url.pathname),
  priceSelectors: [
    "#corePriceDisplay_desktop_feature_div .priceToPay .a-price-whole",
    "#corePriceDisplay_desktop_feature_div .a-price-whole",
    "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .priceToPay .a-price-whole",
    "#corePrice_feature_div .a-price-whole",
    "#corePrice_feature_div .priceToPay .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .priceToPay .a-price-whole",
    "#apex_desktop .a-price-whole",
    "#apex_desktop .priceToPay .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    // Mobile web puts the price here instead.
    "#corePrice_mobile_feature_div .a-price-whole",
    "#corePrice_mobile_feature_div .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".priceToPay .a-price-whole",
    ".a-price:not(.a-text-price) .a-offscreen",
    ".a-price .a-offscreen",
  ],
  scanContainers: [
    "#corePriceDisplay_desktop_feature_div",
    "#corePrice_feature_div",
    "#apex_desktop",
    "#price",
    "#centerCol",
  ],
  anchorSelectors: [
    "#corePriceDisplay_desktop_feature_div",
    "#corePrice_feature_div",
    "#apex_desktop",
    "#corePrice_mobile_feature_div",
  ],
};

/**
 * Flipkart ships generated class names that rotate every few releases, so the
 * selectors below are a best effort and the container scan is what actually
 * keeps this working between edits.
 */
const flipkart: SiteAdapter = {
  id: "flipkart.com",
  label: "Flipkart",
  hosts: ["flipkart.com"],
  isPriceablePage: (url) => url.pathname.includes("/p/"),
  priceSelectors: ["div.Nx9bqj.CxhGGd", "div._30jeq3._16Jk6d", "div._30jeq3"],
  scanContainers: ["div._1YokD2", "div.C7fEHH", "main", "#container"],
  anchorSelectors: ["div.Nx9bqj.CxhGGd", "div._30jeq3._16Jk6d"],
};

const myntra: SiteAdapter = {
  id: "myntra.com",
  label: "Myntra",
  hosts: ["myntra.com"],
  isPriceablePage: (url) => /\/\d+\/buy/.test(url.pathname),
  priceSelectors: [".pdp-price strong", ".pdp-price", ".pdp-discount-container .pdp-price"],
  scanContainers: [".pdp-price-info", ".pdp-details"],
  anchorSelectors: [".pdp-price-info", ".pdp-price"],
};

const nykaa: SiteAdapter = {
  id: "nykaa.com",
  label: "Nykaa",
  hosts: ["nykaa.com"],
  isPriceablePage: (url) => url.pathname.includes("/p/"),
  priceSelectors: ['[class*="post-card__content-price-offer"]', 'span[class*="css-"][class*="price"]'],
  scanContainers: ['[class*="product-price"]', '[class*="pdp"]', "main"],
  anchorSelectors: ['[class*="product-price"]'],
};

/**
 * Food delivery is a cart decision, not a dish decision. A chip beside every
 * item on a menu would be forty chips and pure noise, so these only fire on
 * the cart/checkout total — the number the person is actually about to commit.
 */
const zomato: SiteAdapter = {
  id: "zomato.com",
  label: "Zomato",
  hosts: ["zomato.com"],
  isPriceablePage: (url) => /\/(cart|checkout|order)\b/.test(url.pathname),
  priceSelectors: ['[data-testid="cart-total"]', '[class*="total"] [class*="price"]'],
  scanContainers: ['[class*="cart"]', '[class*="checkout"]'],
};

const swiggy: SiteAdapter = {
  id: "swiggy.com",
  label: "Swiggy",
  hosts: ["swiggy.com"],
  isPriceablePage: (url) => /\/(checkout|cart)\b/.test(url.pathname),
  priceSelectors: ['[data-testid="grand-total"]', '[class*="GrandTotal"]', '[class*="grandTotal"]'],
  scanContainers: ['[class*="Checkout"]', '[class*="cart"]', "main"],
};

export const ADAPTERS: SiteAdapter[] = [amazon, flipkart, myntra, nykaa, zomato, swiggy];

/**
 * Universal Fallback Adapter
 * If a site is not explicitly listed, we try common e-commerce CSS classes.
 */
const universal: SiteAdapter = {
  id: "universal",
  label: "Online Store",
  hosts: [], // Matches everything not explicitly matched
  isPriceablePage: (url) => /\/(product|item|p|buy|checkout|cart)\b/.test(url.pathname) || document.querySelector('[class*="price"]') !== null,
  priceSelectors: [
    '[class*="price"]',
    '[class*="amount"]',
    '[class*="total"]',
    'span:contains("₹")',
    'div:contains("₹")'
  ],
  scanContainers: [
    "main",
    '[class*="product"]',
    '[class*="cart"]',
    '[class*="checkout"]',
    "body"
  ],
};

/** Suffix match so `www.amazon.in` and `amazon.in` both resolve. */
export function adapterForHost(hostname: string): SiteAdapter | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const explicit = ADAPTERS.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return explicit ?? universal;
}

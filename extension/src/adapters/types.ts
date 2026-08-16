/**
 * One adapter per retailer.
 *
 * Retail markup changes without warning and without notice to us. The whole
 * point of this shape is that a broken site is a one-line selector edit in one
 * small file, never a change to the extension's logic — and that a site we
 * cannot read produces NO chip rather than a wrong one.
 */
export interface SiteAdapter {
  /** Stable id, used in logs and tests. */
  id: string;

  /** Shown in the chip's tooltip and the popup. */
  label: string;

  /** Hostnames this adapter claims, matched as suffixes. */
  hosts: string[];

  /**
   * Only run on pages that are actually a product or a cart. A category
   * listing has forty prices and no single one worth pricing against a goal.
   */
  isPriceablePage?: (url: URL) => boolean;

  /**
   * Tried in order; the first that yields a parseable price wins. Put the most
   * specific and most stable selector first — on Amazon that is the
   * accessibility text, which changes far less often than the visual markup.
   */
  priceSelectors: string[];

  /**
   * Fallback for sites whose class names are generated and rotate (Flipkart,
   * Nykaa). Within these containers, the first element whose OWN text is just
   * a rupee figure is taken as the price. Slower and blunter than a selector,
   * so it only runs when every selector above has missed.
   */
  scanContainers?: string[];

  /**
   * Where the chip goes. Tried in order; falls back to the price element's
   * parent. The chip is inserted after this element.
   */
  anchorSelectors?: string[];
}

/** What an adapter found on the current page. */
export interface PriceHit {
  adapterId: string;
  pricePaise: number;
  /** The element the price was read from — used to position the chip. */
  priceEl: Element;
  anchorEl: Element;
}

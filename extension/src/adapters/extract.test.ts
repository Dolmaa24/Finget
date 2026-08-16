import { describe, it, expect } from "vitest";
import { extractPrice } from "./extract";
import { adapterForHost, ADAPTERS } from "./sites";

/**
 * Markup captured from the real sites, trimmed to the parts the adapters look
 * at. These are fixtures on purpose: a test that fetched a live product page
 * would fail whenever Amazon shipped, which tells us nothing about our code.
 *
 * When a site breaks in the wild, the fix is to update the fixture here and
 * the selector in sites.ts together — that way the regression is captured.
 */

function docFrom(html: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = html;
  return doc;
}

const at = (href: string) => new URL(href);

describe("adapterForHost", () => {
  it("matches with and without www", () => {
    expect(adapterForHost("www.amazon.in")?.id).toBe("amazon.in");
    expect(adapterForHost("amazon.in")?.id).toBe("amazon.in");
    expect(adapterForHost("WWW.FLIPKART.COM")?.id).toBe("flipkart.com");
  });

  it("returns null for everything else, so the content script does nothing", () => {
    expect(adapterForHost("example.com")).toBeNull();
    expect(adapterForHost("amazon.com")).toBeNull();
    // Not a suffix match on a lookalike domain.
    expect(adapterForHost("notamazon.in")).toBeNull();
  });

  it("every adapter declares at least one selector", () => {
    for (const adapter of ADAPTERS) {
      expect(adapter.priceSelectors.length).toBeGreaterThan(0);
    }
  });
});

describe("Amazon", () => {
  const adapter = adapterForHost("www.amazon.in")!;

  // Amazon splits the visible price across spans and puts the whole thing in
  // a visually-hidden `.a-offscreen`. Reading the visible spans would yield
  // "8,49900"; reading a-offscreen yields "₹8,499.00". Hence selector order.
  const html = `
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price">
        <span class="a-offscreen">₹8,499.00</span>
        <span aria-hidden="true">
          <span class="a-price-symbol">₹</span>
          <span class="a-price-whole">8,499<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">00</span>
        </span>
      </span>
      <span class="a-text-price"><span class="a-offscreen">₹12,999.00</span></span>
    </div>`;

  it("reads the accessible price, not the split spans", () => {
    const hit = extractPrice(docFrom(html), at("https://www.amazon.in/dp/B0ABC12345"), adapter);
    expect(hit?.pricePaise).toBe(849900);
  });

  it("anchors to the visible price block, not the hidden span", () => {
    const hit = extractPrice(docFrom(html), at("https://www.amazon.in/dp/B0ABC12345"), adapter);
    expect((hit!.anchorEl as HTMLElement).id).toBe("corePriceDisplay_desktop_feature_div");
  });

  it("ignores search and category pages", () => {
    const hit = extractPrice(docFrom(html), at("https://www.amazon.in/s?k=laptop"), adapter);
    expect(hit).toBeNull();
  });

  it("returns null when the price has not rendered yet", () => {
    const hit = extractPrice(
      docFrom(`<div id="corePriceDisplay_desktop_feature_div"></div>`),
      at("https://www.amazon.in/dp/B0ABC12345"),
      adapter
    );
    expect(hit).toBeNull();
  });
});

describe("Flipkart", () => {
  const adapter = adapterForHost("www.flipkart.com")!;

  it("reads the current generated class name", () => {
    const hit = extractPrice(
      docFrom(`<div class="Nx9bqj CxhGGd">₹8,499</div>`),
      at("https://www.flipkart.com/thing/p/itm123"),
      adapter
    );
    expect(hit?.pricePaise).toBe(849900);
  });

  it("falls back to a container scan when the class names have rotated again", () => {
    // This is the realistic failure: Flipkart ships new hashed classes and
    // every selector misses. The scan is what keeps the chip alive until
    // someone edits sites.ts.
    const hit = extractPrice(
      docFrom(`<div id="container"><div class="totally-new-hash">₹8,499</div></div>`),
      at("https://www.flipkart.com/thing/p/itm123"),
      adapter
    );
    expect(hit?.pricePaise).toBe(849900);
  });

  it("does not fire on a listing page", () => {
    const hit = extractPrice(
      docFrom(`<div class="Nx9bqj CxhGGd">₹8,499</div>`),
      at("https://www.flipkart.com/search?q=laptop"),
      adapter
    );
    expect(hit).toBeNull();
  });
});

describe("Myntra", () => {
  const adapter = adapterForHost("www.myntra.com")!;

  it("reads the pdp price", () => {
    const hit = extractPrice(
      docFrom(`<div class="pdp-price"><strong>Rs. 1,299</strong></div>`),
      at("https://www.myntra.com/shirts/brand/thing/12345678/buy"),
      adapter
    );
    expect(hit?.pricePaise).toBe(129900);
  });
});

describe("food delivery", () => {
  it("only fires on the cart, never on a menu full of dish prices", () => {
    const swiggy = adapterForHost("www.swiggy.com")!;
    const menu = docFrom(`<div data-testid="grand-total">₹640</div>`);

    expect(extractPrice(menu, at("https://www.swiggy.com/restaurants/x-123"), swiggy)).toBeNull();
    expect(extractPrice(menu, at("https://www.swiggy.com/checkout"), swiggy)?.pricePaise).toBe(64000);
  });
});

describe("failure behaviour", () => {
  const adapter = adapterForHost("www.amazon.in")!;

  it("never throws on markup it does not recognise", () => {
    expect(() =>
      extractPrice(docFrom("<main><p>nothing here</p></main>"), at("https://www.amazon.in/dp/B0X"), adapter)
    ).not.toThrow();
  });

  it("shows nothing rather than something wrong when the price is unparseable", () => {
    const hit = extractPrice(
      docFrom(`<div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price"><span class="a-offscreen">Currently unavailable</span></span>
      </div>`),
      at("https://www.amazon.in/dp/B0X"),
      adapter
    );
    expect(hit).toBeNull();
  });
});

const {
  renderCardPng,
  buildTree,
  titleSize,
  loadFonts,
  FONT_WEIGHTS,
  WIDTH,
  HEIGHT,
} = require("../services/shareRenderer");
const { describe: copy, statLine, TRUST_LINE } = require("../services/shareCardCopy");

/** Every string in a satori layout tree, flattened. */
function textOf(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && node.props) return textOf(node.props.children);
  return "";
}

const card = (kind, payload) => ({ kind, payload });

describe("layout", () => {
  it("is a 1200x630 Open Graph card", () => {
    expect(WIDTH).toBe(1200);
    expect(HEIGHT).toBe(630);
  });

  it("puts the trust line on every card", () => {
    for (const kind of ["translate", "deflection", "wrapped", "trip_invite"]) {
      const text = textOf(buildTree(card(kind, { amount: 100, headline: "x", tripName: "T" })));
      expect(text).toContain(TRUST_LINE);
    }
  });

  it("steps the headline down as it gets longer, so it stays on the card", () => {
    expect(titleSize("₹8,499 = 6 days")).toBeGreaterThan(titleSize("₹1,29,999 = stalls your Kerala backwaters trip fund"));
    // Monotonic: never larger for a longer string.
    let previous = Infinity;
    for (const n of [10, 30, 50, 70, 120]) {
      const size = titleSize("x".repeat(n));
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
  });
});

describe("emoji", () => {
  /**
   * Inter has no emoji and neither satori nor resvg falls back to a system
   * font, so an unhandled emoji rasterises as a literal "NO GLYPH" box. This
   * is the regression guard for that.
   */
  it("strips emoji from the PNG text", () => {
    const text = textOf(
      buildTree(card("wrapped", { tripName: "Goa 2026", emoji: "🏖️", totalSpent: 48200, days: 5, memberCount: 6 }))
    );
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    // The words survive; only the pictograph goes.
    expect(text).toContain("Goa 2026");
  });

  it("leaves the emoji alone in the shared copy, which the HTML page uses", () => {
    const { title } = copy(card("wrapped", { tripName: "Goa 2026", emoji: "🏖️", totalSpent: 1, days: 1, memberCount: 1 }));
    expect(title).toContain("🏖️");
  });
});

describe("tone", () => {
  it("states risk as a fact about the buffer, never as a verdict", () => {
    const risky = statLine(card("translate", { riskAfter: "Risky" }));
    expect(risky).toBe("This goes past your buffer");
    // "still be Risky" both scolds and implies nothing changed.
    expect(risky).not.toMatch(/still/i);
  });

  it("omits the stat pill entirely when there is nothing to say", () => {
    expect(statLine(card("translate", {}))).toBeNull();
    expect(statLine(card("wrapped", { tripName: "T" }))).toBeNull();
  });

  it("counts in grammatical English — the first card anyone shares says 1", () => {
    expect(statLine(card("deflection", { count: 1, period: "this quarter" }))).toBe(
      "1 decision, this quarter"
    );
    expect(statLine(card("deflection", { count: 7, period: "this quarter" }))).toBe(
      "7 decisions, this quarter"
    );
  });
});

describe("rendering", () => {
  it("produces a PNG under the 100KB share budget", async () => {
    const png = await renderCardPng(
      card("translate", {
        amount: 8499,
        headline: "6 days of your Goa trip",
        headlineKind: "goal_delay",
        riskAfter: "Safe",
      })
    );

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.length).toBeLessThan(100 * 1024);
  }, 30000);

});

describe("fonts", () => {
  /**
   * Inter's `latin` subset does not contain U+20B9. Without latin-ext loaded
   * as a named fallback, every card renders "□8,499" — and nothing throws, so
   * only a human looking at the image would ever catch it. This guards the
   * mechanism directly rather than inferring it from the output.
   */
  it("loads a latin-ext fallback alongside latin at every weight", () => {
    const fonts = loadFonts();
    for (const weight of FONT_WEIGHTS) {
      const atWeight = fonts.filter((f) => f.weight === weight);
      expect(atWeight.map((f) => f.name).sort()).toEqual(["Inter", "InterExt"]);
      for (const font of atWeight) expect(font.data.length).toBeGreaterThan(1000);
    }
  });

  it("caches the buffers rather than re-reading them per card", () => {
    expect(loadFonts()).toBe(loadFonts());
  });
});

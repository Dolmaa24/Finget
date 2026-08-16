import { describe, it, expect } from "vitest";
import { labelFrom, LABEL_FALLBACK } from "./label";

/**
 * Titles captured from the real product pages. A ledger entry reading
 * "Sony WH-1000XM5 : Amazon.in: Electronics" is technically correct and
 * useless to read back three months later.
 */
describe("labelFrom", () => {
  it("prefers the og:title over the document title", () => {
    expect(labelFrom("Sony WH-1000XM5", "Amazon.in: Sony WH-1000XM5: Electronics")).toBe(
      "Sony WH-1000XM5"
    );
  });

  it("trims Amazon's category tail", () => {
    expect(labelFrom(null, "Sony WH-1000XM5 Wireless Headphones : Amazon.in: Electronics")).toBe(
      "Sony WH-1000XM5 Wireless Headphones"
    );
  });

  it("trims a Flipkart-style pipe tail", () => {
    expect(labelFrom(null, "Nike Revolution 7 Running Shoes | Buy Online at Flipkart")).toBe(
      "Nike Revolution 7 Running Shoes"
    );
  });

  it("drops the 'Buy ... online' preamble sites put in front", () => {
    expect(labelFrom(null, "Levi's 511 Jeans Buy Online at Myntra")).toBe("Levi's 511 Jeans");
  });

  it("handles en and em dashes", () => {
    expect(labelFrom(null, "Dyson Airwrap – Nykaa")).toBe("Dyson Airwrap");
    expect(labelFrom(null, "Dyson Airwrap — Nykaa")).toBe("Dyson Airwrap");
  });

  it("leaves a clean title alone", () => {
    expect(labelFrom(null, "MacBook Air 15-inch M4")).toBe("MacBook Air 15-inch M4");
  });

  it("does not split on a hyphen inside a product name", () => {
    // "15-inch" and "WH-1000XM5" must survive — only spaced dashes separate.
    expect(labelFrom(null, "MacBook Air 15-inch")).toBe("MacBook Air 15-inch");
    expect(labelFrom(null, "Sony WH-1000XM5")).toBe("Sony WH-1000XM5");
  });

  it("caps the length so one page cannot write an essay into the ledger", () => {
    expect(labelFrom(null, "x".repeat(400)).length).toBe(120);
  });

  it("falls back rather than storing an empty label", () => {
    for (const [og, title] of [
      [null, null],
      ["", ""],
      ["   ", "   "],
      [null, " | Amazon.in"],
    ] as const) {
      expect(labelFrom(og, title)).toBe(LABEL_FALLBACK);
    }
  });
});

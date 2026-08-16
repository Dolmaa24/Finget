import { describe, it, expect } from "vitest";
import { parsePriceToPaise, formatInr } from "./price";

/**
 * The chip is only as trustworthy as this function. Every case below is a
 * shape that actually appears in Indian retail markup.
 */
describe("parsePriceToPaise", () => {
  it("reads a plain rupee price", () => {
    expect(parsePriceToPaise("₹8,499")).toBe(849900);
  });

  it("reads Indian digit grouping", () => {
    expect(parsePriceToPaise("₹1,29,999")).toBe(12999900);
    // ₹1 crore = 1,00,00,000 rupees.
    expect(parsePriceToPaise("₹1,00,00,000")).toBe(1_00_00_000 * 100);
  });

  it("reads a two-decimal price", () => {
    expect(parsePriceToPaise("₹8,499.00")).toBe(849900);
    expect(parsePriceToPaise("₹8,499.50")).toBe(849950);
  });

  it("accepts the other ways sites write rupees", () => {
    expect(parsePriceToPaise("Rs. 1,299")).toBe(129900);
    expect(parsePriceToPaise("Rs 1,299")).toBe(129900);
    expect(parsePriceToPaise("INR 1,299")).toBe(129900);
    expect(parsePriceToPaise("1,299")).toBe(129900);
  });

  it("survives non-breaking spaces, which price markup is full of", () => {
    // Escapes, not literals: two lines that look identical but differ by an
    // invisible codepoint are a trap for whoever edits this next.
    expect(parsePriceToPaise("\u20b9 8,499")).toBe(849900);
    expect(parsePriceToPaise("\u20b9\u00a08,499")).toBe(849900);
    expect(parsePriceToPaise("\u20b9\u202f8,499")).toBe(849900);
  });

  it("takes the selling price, not the struck-through MRP beside it", () => {
    // Whitespace deliberately does not join two numbers into one.
    expect(parsePriceToPaise("₹8,499 ₹12,999")).toBe(849900);
    expect(parsePriceToPaise("₹8,499.00₹12,999.00")).toBe(849900);
  });

  it("treats a dot as grouping when more than two digits follow it", () => {
    // "1.499" is European grouping leaking through a mis-localised template.
    // Reading it as ₹1.50 would understate the product by a thousand times.
    expect(parsePriceToPaise("₹1.499")).toBe(149900);
  });

  it("returns null rather than guessing", () => {
    expect(parsePriceToPaise("")).toBeNull();
    expect(parsePriceToPaise(null)).toBeNull();
    expect(parsePriceToPaise(undefined)).toBeNull();
    expect(parsePriceToPaise("Out of stock")).toBeNull();
    expect(parsePriceToPaise("Free delivery")).toBeNull();
  });

  it("does not read a star rating as a price", () => {
    // The whole reason for the ₹10 floor: "4.5" is a rating on every one of
    // these sites, and ₹4.50 is a chip that is confidently wrong.
    expect(parsePriceToPaise("4.5 out of 5 stars")).toBeNull();
    expect(parsePriceToPaise("3.9")).toBeNull();
    expect(parsePriceToPaise("5")).toBeNull();
  });

  it("rejects figures outside plausible retail bounds", () => {
    expect(parsePriceToPaise("₹0")).toBeNull();
    expect(parsePriceToPaise("₹9.50")).toBeNull(); // under the ₹10 floor
    expect(parsePriceToPaise("₹50,00,00,000")).toBeNull(); // over ₹10 crore
  });

  it("always returns an integer", () => {
    for (const text of ["₹8,499.99", "₹10.01", "₹99,999.95"]) {
      const paise = parsePriceToPaise(text);
      expect(Number.isInteger(paise)).toBe(true);
    }
  });
});

describe("formatInr", () => {
  it("formats paise back into Indian-grouped rupees", () => {
    expect(formatInr(849900)).toBe("₹8,499");
    expect(formatInr(12999900)).toBe("₹1,29,999");
  });

  it("rounds to whole rupees — a chip never shows paise", () => {
    expect(formatInr(849950)).toBe("₹8,500");
  });
});

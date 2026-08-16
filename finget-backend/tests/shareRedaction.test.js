const {
  assertRedacted,
  firstNameOf,
  generateToken,
  RedactionError,
} = require("../services/shareCardService");

const valid = {
  translate: { amount: 8499, headline: "6 days of your Goa trip", headlineKind: "goal_delay" },
  wrapped: { tripName: "Goa", emoji: "🏖️", totalSpent: 53600, days: 5, memberCount: 3 },
  trip_invite: { tripName: "Goa", emoji: "🏖️", memberCount: 3, inviterName: "Priya" },
};

describe("share payload redaction", () => {
  it("accepts a well-formed payload for each kind", () => {
    for (const [kind, payload] of Object.entries(valid)) {
      expect(assertRedacted(kind, payload)).toBe(true);
    }
  });

  it("rejects an email address anywhere in the payload", () => {
    expect(() =>
      assertRedacted("translate", { ...valid.translate, goalName: "ping me at a@b.com" })
    ).toThrow(RedactionError);
  });

  it("rejects an email hidden inside a nested array", () => {
    expect(() =>
      assertRedacted("wrapped", {
        ...valid.wrapped,
        members: [{ name: "Priya" }, { name: "bob@example.com" }],
      })
    ).toThrow(/email/i);
  });

  it("rejects a database ObjectId", () => {
    expect(() =>
      assertRedacted("translate", { ...valid.translate, goalName: "6a80e497af36fafa963a39d8" })
    ).toThrow(/database id/i);
  });

  it("rejects forbidden keys outright", () => {
    for (const key of ["email", "userId", "_id", "groupId", "inviteCode", "note", "monthlyIncome"]) {
      expect(() => assertRedacted("wrapped", { ...valid.wrapped, [key]: "anything" }))
        .toThrow(RedactionError);
    }
  });

  it("rejects a full name in a name field", () => {
    expect(() =>
      assertRedacted("trip_invite", { ...valid.trip_invite, inviterName: "Priya Nair" })
    ).toThrow(/full name/i);
  });

  it("accepts a first name in a name field", () => {
    expect(assertRedacted("trip_invite", { ...valid.trip_invite, inviterName: "Priya" })).toBe(true);
  });

  it("rejects unrounded figures", () => {
    expect(() => assertRedacted("translate", { ...valid.translate, amount: 8499.37 }))
      .toThrow(/rounded/i);
  });

  it("rejects keys outside the kind's allow-list", () => {
    expect(() => assertRedacted("translate", { ...valid.translate, secretSauce: "x" }))
      .toThrow(/not permitted/i);
    // A key valid on one kind is still rejected on another.
    expect(() => assertRedacted("translate", { ...valid.translate, tripName: "Goa" }))
      .toThrow(/not permitted/i);
  });

  it("rejects an unknown card kind", () => {
    expect(() => assertRedacted("not_a_kind", {})).toThrow(RedactionError);
  });

  it("rejects non-finite numbers", () => {
    expect(() => assertRedacted("translate", { ...valid.translate, amount: Infinity }))
      .toThrow(RedactionError);
  });
});

describe("firstNameOf", () => {
  it("keeps only the first name", () => {
    expect(firstNameOf("Priya Nair")).toBe("Priya");
    expect(firstNameOf("Dolma")).toBe("Dolma");
    expect(firstNameOf("  Arjun  Rao ")).toBe("Arjun");
  });

  it("degrades gracefully on empty input", () => {
    expect(firstNameOf("")).toBe("Someone");
    expect(firstNameOf(undefined)).toBe("Someone");
  });
});

describe("generateToken", () => {
  it("produces a 22-char URL-safe token", () => {
    const token = generateToken();
    expect(token).toHaveLength(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not collide across a large sample", () => {
    const tokens = new Set(Array.from({ length: 5000 }, generateToken));
    expect(tokens.size).toBe(5000);
  });
});

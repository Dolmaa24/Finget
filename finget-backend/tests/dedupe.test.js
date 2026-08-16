const {
  findDuplicate,
  annotateDuplicates,
  merchantSimilarity,
  normaliseMerchant,
} = require("../services/dedupeService");
const { parseBlock } = require("../services/smsParser");
const { fromISTFields } = require("../utils/time");

/**
 * "Deduplication ... is what makes import trustworthy. Test it."
 *
 * The failure this guards against is silent and unrecoverable: a doubled
 * import makes safe-to-spend wrong, and the person has no way to tell which of
 * two identical rows is the phantom.
 */

const AUG = (day, hour = 12) => fromISTFields(2026, 7, day, hour);

const tx = (amount, day, name, extra = {}) => ({
  _id: `tx-${amount}-${day}`,
  amount,
  date: AUG(day),
  note: name,
  ...extra,
});

const draft = (amountPaise, day, merchant, extra = {}) => ({
  amountPaise,
  date: day === null ? null : AUG(day),
  merchant,
  type: "expense",
  ...extra,
});

/* ------------------------------------------------------------------ */

describe("merchant similarity", () => {
  it("normalises away casing, punctuation and rail noise", () => {
    expect(normaliseMerchant("BLUE TOKAI  Pvt Ltd")).toBe("blue tokai");
    expect(normaliseMerchant("bluetokai@okhdfcbank")).toBe("bluetokai");
  });

  it("treats a longer name containing a shorter one as the same shop", () => {
    // Edit distance alone would score this poorly — one string is twice the
    // length — but they are obviously the same coffee shop.
    expect(merchantSimilarity("BLUE TOKAI", "BLUE TOKAI COFFEE ROASTERS")).toBeGreaterThan(0.9);
  });

  it("tolerates small spelling drift between issuers", () => {
    expect(merchantSimilarity("SWIGGY", "Swiggy")).toBe(1);
    expect(merchantSimilarity("AMAZON PAY", "Amazon Pay India")).toBeGreaterThan(0.9);
  });

  it("keeps genuinely different shops apart", () => {
    expect(merchantSimilarity("SWIGGY", "ZOMATO")).toBeLessThan(0.72);
    expect(merchantSimilarity("NETFLIX", "SPOTIFY")).toBeLessThan(0.72);
  });

  it("scores nothing when either side is missing", () => {
    expect(merchantSimilarity(null, "SWIGGY")).toBe(0);
    expect(merchantSimilarity("SWIGGY", "")).toBe(0);
  });
});

describe("finding a duplicate", () => {
  const existing = [tx(1248, 14, "BLUE TOKAI COFFEE"), tx(899, 16, "NETFLIX")];

  it("matches the same purchase on the same day", () => {
    expect(findDuplicate(draft(124800, 14, "BLUE TOKAI"), existing)).toBeTruthy();
  });

  it("matches a day either side, because an SMS at 23:58 books on the next day", () => {
    expect(findDuplicate(draft(124800, 13, "BLUE TOKAI"), existing)).toBeTruthy();
    expect(findDuplicate(draft(124800, 15, "BLUE TOKAI"), existing)).toBeTruthy();
  });

  it("does NOT match two days out — that is a genuine repeat purchase", () => {
    expect(findDuplicate(draft(124800, 17, "BLUE TOKAI"), existing)).toBeNull();
  });

  it("does not match a different amount", () => {
    expect(findDuplicate(draft(125000, 14, "BLUE TOKAI"), existing)).toBeNull();
  });

  it("does not match the same amount at a different shop", () => {
    // The most damaging false positive: two ₹1,248 purchases on one day are
    // ordinary, and dropping the second silently loses real money.
    expect(findDuplicate(draft(124800, 14, "ZOMATO"), existing)).toBeNull();
  });

  it("trusts a matching bank reference absolutely", () => {
    const withRef = [tx(500, 14, "SOMETHING", { importReference: "438291047265" })];
    // Different name, different amount — the reference still proves it.
    const match = findDuplicate(
      draft(999900, 20, "TOTALLY DIFFERENT", { reference: "438291047265" }),
      withRef
    );
    expect(match.reason).toBe("reference");
    expect(match.confidence).toBe(1);
  });

  it("will not match on amount alone when the draft has no date", () => {
    // A ₹150 chai twice in a week is not a duplicate.
    expect(findDuplicate(draft(124800, null, "BLUE TOKAI"), existing)).toBeNull();
  });

  it("matches two unnamed identical amounts on the same day", () => {
    const unnamed = [tx(150, 14, "")];
    expect(findDuplicate(draft(15000, 14, null), unnamed)).toBeTruthy();
  });

  it("finds nothing in an empty ledger", () => {
    expect(findDuplicate(draft(124800, 14, "BLUE TOKAI"), [])).toBeNull();
  });
});

describe("annotating a batch", () => {
  const existing = [tx(1248, 14, "BLUE TOKAI COFFEE")];

  it("excludes suspected duplicates by default and includes the rest", () => {
    const rows = annotateDuplicates(
      [draft(124800, 14, "BLUE TOKAI"), draft(89900, 16, "NETFLIX")],
      existing
    );

    expect(rows[0].include).toBe(false);
    expect(rows[0].duplicateOf).toBeTruthy();
    expect(rows[1].include).toBe(true);
    expect(rows[1].duplicateOf).toBeNull();
  });

  it("shows what it matched, so the person can judge rather than trust", () => {
    const rows = annotateDuplicates([draft(124800, 14, "BLUE TOKAI")], existing);
    expect(rows[0].duplicateOf.amount).toBe(1248);
    expect(rows[0].duplicateOf.label).toBe("BLUE TOKAI COFFEE");
  });

  it("catches a repeat inside a single paste, not just against the database", () => {
    // Pasting the same block twice in one go is as common as doing it twice
    // on different days.
    const rows = annotateDuplicates(
      [draft(50000, 20, "SWIGGY"), draft(50000, 20, "SWIGGY")],
      []
    );
    expect(rows[0].include).toBe(true);
    expect(rows[1].include).toBe(false);
  });

  it("never mutates the caller's drafts", () => {
    const input = [draft(124800, 14, "BLUE TOKAI")];
    annotateDuplicates(input, existing);
    expect(input[0]).not.toHaveProperty("include");
    expect(input[0]).not.toHaveProperty("duplicateOf");
  });
});

/* ------------------------------------------------------------------ */
/* The acceptance criterion                                            */
/* ------------------------------------------------------------------ */

describe("re-importing the same paste", () => {
  const BLOCK = `
Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265 -HDFC Bank

INR 899.00 spent at NETFLIX on Axis Bank Card XX2201 on 16-08-26. Avl Lmt INR 42,100.00

Rs.5,000.00 credited to your A/c XX4417 on 18-08-26 by ACME PAYROLL Ref 771823645. -HDFC Bank
`;
  const NOW = fromISTFields(2026, 7, 20, 12);

  it("creates three rows the first time and none the second", () => {
    const { drafts } = parseBlock(BLOCK, NOW);
    expect(drafts).toHaveLength(3);

    // First import: nothing in the ledger, everything comes through.
    const first = annotateDuplicates(drafts, []);
    expect(first.filter((r) => r.include)).toHaveLength(3);

    // Those rows are now stored, carrying their bank references.
    const stored = first.map((r, i) => ({
      _id: `stored-${i}`,
      amount: r.amountPaise / 100, // not-money: fixture mirrors the stored rupee shape
      date: r.date,
      note: r.merchant,
      importReference: r.reference,
    }));

    // Second import of the identical block: every row is caught.
    const second = annotateDuplicates(parseBlock(BLOCK, NOW).drafts, stored);
    expect(second.filter((r) => r.include)).toHaveLength(0);
    expect(second.every((r) => r.duplicateOf)).toBe(true);
  });

  it("still lets a genuinely new transaction through on the second pass", () => {
    const { drafts } = parseBlock(BLOCK, NOW);
    const stored = annotateDuplicates(drafts, []).map((r, i) => ({
      _id: `stored-${i}`,
      amount: r.amountPaise / 100, // not-money: fixture mirrors the stored rupee shape
      date: r.date,
      note: r.merchant,
      importReference: r.reference,
    }));

    const withNew = parseBlock(
      `${BLOCK}\n\nRs.320.00 spent at ZOMATO on 19-08-26 Ref 5566778899`,
      NOW
    ).drafts;

    const rows = annotateDuplicates(withNew, stored);
    const included = rows.filter((r) => r.include);
    expect(included).toHaveLength(1);
    expect(included[0].merchant).toBe("ZOMATO");
  });
});

const {
  parseMessage,
  parseBlock,
  splitMessages,
  amountPaiseFrom,
  directionFrom,
  dateFrom,
  merchantFrom,
  cleanMerchant,
} = require("../services/smsParser");
const { istParts, fromISTFields } = require("../utils/time");

/**
 * Real message shapes from Indian issuers.
 *
 * With no vision provider available, this parser IS Finget's import feature,
 * so it is tested at the level of the actual strings people paste rather than
 * through the API.
 */

/** "now" for date-sanity checks — the parser rejects implausible years. */
const NOW = fromISTFields(2026, 7, 20, 12);

describe("amount", () => {
  it("reads every currency marker issuers use", () => {
    expect(amountPaiseFrom("Rs.1,248.00 debited")).toBe(124800);
    expect(amountPaiseFrom("Rs 1248 debited")).toBe(124800);
    expect(amountPaiseFrom("INR 1,248.50 debited")).toBe(124850);
    expect(amountPaiseFrom("₹1,248.00 debited")).toBe(124800);
  });

  it("requires a currency marker — a bare number is a reference, not money", () => {
    expect(amountPaiseFrom("txn 438291047265 completed")).toBeNull();
    expect(amountPaiseFrom("A/c XX4417 updated")).toBeNull();
  });

  it("returns integer paise", () => {
    for (const text of ["Rs.99.99", "Rs.0.50", "INR 12,345.67"]) {
      const paise = amountPaiseFrom(text);
      if (paise !== null) expect(Number.isInteger(paise)).toBe(true);
    }
  });
});

describe("direction", () => {
  it("reads debits", () => {
    for (const word of ["debited", "spent", "paid", "withdrawn"]) {
      expect(directionFrom(`Rs.100 ${word} from your account`)).toBe("expense");
    }
  });

  it("reads credits", () => {
    for (const word of ["credited", "received", "refund"]) {
      expect(directionFrom(`Rs.100 ${word} to your account`)).toBe("income");
    }
  });

  it("does not read 'credit card' as money coming in", () => {
    // The classic false positive: a card bill is an expense.
    expect(directionFrom("Rs.5,000 debited towards credit card payment")).toBe("expense");
  });
});

describe("date", () => {
  const ist = (d) => {
    const p = istParts(d);
    return `${p.year}-${p.month + 1}-${p.day}`;
  };

  it("reads day-first numeric dates, never month-first", () => {
    // 14/08 is 14 August. Read as month-first it would be 8 December — months
    // away from where the transaction belongs.
    expect(ist(dateFrom("on 14-08-26", NOW))).toBe("2026-8-14");
    expect(ist(dateFrom("on 14/08/2026", NOW))).toBe("2026-8-14");
  });

  it("reads named months", () => {
    expect(ist(dateFrom("on 14-Aug-26", NOW))).toBe("2026-8-14");
    expect(ist(dateFrom("on 14 Aug 2026", NOW))).toBe("2026-8-14");
  });

  it("reads ISO", () => {
    expect(ist(dateFrom("on 2026-08-14", NOW))).toBe("2026-8-14");
  });

  it("lands on IST midnight, not UTC midnight", () => {
    // A UTC-midnight Date would read as the previous day for every Indian user.
    expect(istParts(dateFrom("on 14-08-26", NOW)).day).toBe(14);
    expect(istParts(dateFrom("on 14-08-26", NOW)).hour).toBe(0);
  });

  it("rejects a reference number that happens to look like a date", () => {
    expect(dateFrom("ref 12-31-99", NOW)).toBeNull();
  });

  it("returns null rather than guessing when there is no date", () => {
    expect(dateFrom("Rs.100 debited", NOW)).toBeNull();
  });
});

describe("merchant", () => {
  it("strips a VPA handle down to the name", () => {
    expect(cleanMerchant("bluetokai@okhdfcbank")).toBe("bluetokai");
  });

  it("rejects pure noise", () => {
    for (const junk of ["ref", "a/c", "upi", "438291047265", "", null]) {
      expect(cleanMerchant(junk)).toBeNull();
    }
  });

  it("pulls the name out of a transfer line", () => {
    expect(merchantFrom("trf to BLUE TOKAI Ref 4382910")).toBe("BLUE TOKAI");
  });

  it("pulls the name out of an 'at MERCHANT' line", () => {
    expect(merchantFrom("Rs.520 spent at SWIGGY on 14-08-26")).toBe("SWIGGY");
  });
});

/* ------------------------------------------------------------------ */
/* Whole messages, as actually received                                */
/* ------------------------------------------------------------------ */

describe("real issuer templates", () => {
  const cases = [
    {
      issuer: "hdfc",
      sms: "Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265. Not you? Call 18002586161 -HDFC Bank",
      expect: { amountPaise: 124800, type: "expense", merchant: "bluetokai", day: 14 },
    },
    {
      issuer: "icici",
      sms: "ICICI Bank Acct XX891 debited Rs 520.00 on 14-Aug-26; SWIGGY credited. UPI:438291047265. Call 18002662 for dispute.",
      expect: { amountPaise: 52000, type: "expense", day: 14 },
    },
    {
      issuer: "sbi",
      sms: "Dear Customer, Rs.2,400.00 debited from A/c X4417 on 15/08/2026 trf to AMAZON PAY Ref 992817364501 -SBI",
      expect: { amountPaise: 240000, type: "expense", merchant: "AMAZON PAY", day: 15 },
    },
    {
      issuer: "axis",
      sms: "INR 899.00 spent at NETFLIX on Axis Bank Card XX2201 on 16-08-26. Avl Lmt INR 42,100.00",
      expect: { amountPaise: 89900, type: "expense", merchant: "NETFLIX", day: 16 },
    },
    {
      issuer: "kotak",
      sms: "Sent Rs.150.00 from Kotak Bank AC X1234 to chaiwala@ybl on 17-08-26. UPI Ref 118273645509.",
      expect: { amountPaise: 15000, type: "expense", day: 17 },
    },
    {
      issuer: "credit",
      sms: "Rs.5,000.00 credited to your A/c XX4417 on 18-08-26 by ACME PAYROLL Ref 771823645. -HDFC Bank",
      expect: { amountPaise: 500000, type: "income", merchant: "ACME PAYROLL", day: 18 },
    },
  ];

  for (const c of cases) {
    it(`parses a ${c.issuer} message`, () => {
      const draft = parseMessage(c.sms, NOW);
      expect(draft, `${c.issuer} should parse`).toBeTruthy();
      expect(draft.amountPaise).toBe(c.expect.amountPaise);
      expect(draft.type).toBe(c.expect.type);
      if (c.expect.merchant) expect(draft.merchant).toBe(c.expect.merchant);
      if (c.expect.day) expect(istParts(draft.date).day).toBe(c.expect.day);
    });
  }

  it("identifies the issuer when the message names it", () => {
    expect(parseMessage(cases[0].sms, NOW).issuer).toBe("hdfc");
    expect(parseMessage(cases[1].sms, NOW).issuer).toBe("icici");
  });

  it("captures the bank reference — the strongest dedup key there is", () => {
    expect(parseMessage(cases[0].sms, NOW).reference).toBe("438291047265");
  });
});

describe("what it correctly refuses", () => {
  it("ignores an OTP", () => {
    expect(parseMessage("438291 is your OTP for login. Do not share it.", NOW)).toBeNull();
  });

  it("ignores a balance alert with no transaction", () => {
    expect(parseMessage("Available balance in A/c XX4417 is Rs.81,501.00", NOW)).toBeNull();
  });

  it("ignores marketing", () => {
    expect(parseMessage("Get a personal loan approved instantly! Visit hdfc.com", NOW)).toBeNull();
  });

  it("ignores empty input", () => {
    for (const junk of ["", "   ", null, undefined]) {
      expect(parseMessage(junk, NOW)).toBeNull();
    }
  });
});

describe("confidence", () => {
  it("is high when everything was found", () => {
    const draft = parseMessage(
      "Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265 -HDFC Bank",
      NOW
    );
    expect(draft.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("drops when the date and merchant had to be guessed", () => {
    const draft = parseMessage("Rs.1248.00 debited", NOW);
    expect(draft.confidence).toBeLessThan(0.7);
    expect(draft.date).toBeNull();
    expect(draft.merchant).toBeNull();
  });

  it("flags a defaulted direction rather than pretending it was read", () => {
    // Nothing should silently claim to know something it assumed.
    const draft = parseMessage("Rs.1248.00 at BLUE TOKAI on 14-08-26", NOW);
    expect(draft.type).toBe("expense");
    expect(draft.directionDetected).toBe(false);
  });
});

describe("pasting a block", () => {
  const BLOCK = `
Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265 -HDFC Bank

438291 is your OTP for login. Do not share it.

INR 899.00 spent at NETFLIX on Axis Bank Card XX2201 on 16-08-26. Avl Lmt INR 42,100.00

Rs.5,000.00 credited to your A/c XX4417 on 18-08-26 by ACME PAYROLL Ref 771823645. -HDFC Bank
`;

  it("extracts every transaction and drops the OTP", () => {
    const { drafts } = parseBlock(BLOCK, NOW);
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.amountPaise)).toEqual([124800, 89900, 500000]);
  });

  it("reads both directions in one paste", () => {
    const { drafts } = parseBlock(BLOCK, NOW);
    expect(drafts.filter((d) => d.type === "expense")).toHaveLength(2);
    expect(drafts.filter((d) => d.type === "income")).toHaveLength(1);
  });

  it("handles one-per-line pasting as well as blank-line separated", () => {
    const oneLine = [
      "Rs.1248.00 debited from A/c XX4417 on 14-08-26 to VPA bluetokai@okhdfcbank Ref 438291047265",
      "INR 899.00 spent at NETFLIX on 16-08-26",
    ].join("\n");
    expect(parseBlock(oneLine, NOW).drafts).toHaveLength(2);
  });

  it("keeps a money-shaped leftover for the optional LLM pass, and nothing else", () => {
    // The OTP is not a parse failure and must not be offered to a model.
    const { unparsed } = parseBlock("438291 is your OTP\n\nRs.500 something entirely unfamiliar", NOW);
    expect(unparsed.every((u) => !u.includes("OTP"))).toBe(true);
  });

  it("returns nothing for an empty paste", () => {
    expect(parseBlock("", NOW).drafts).toHaveLength(0);
    expect(splitMessages("")).toHaveLength(0);
  });

  it("never throws on hostile input", () => {
    for (const junk of ["  ", "Rs." .repeat(5000), "\n".repeat(1000)]) {
      expect(() => parseBlock(junk, NOW)).not.toThrow();
    }
  });
});

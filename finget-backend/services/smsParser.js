const { toPaise } = require("../utils/money");
const { istParts, fromISTFields } = require("../utils/time");

/**
 * Bank and UPI SMS → transaction drafts, deterministically.
 *
 * This path needs NO API key and no vision provider, which makes it the
 * primary import route rather than a fallback: most people can paste a week of
 * bank SMS in one go and be done. Regex per issuer runs first and an LLM only
 * ever sees what the regex could not read — so the common case is exact,
 * offline, private, and free.
 *
 * PRIVACY. Nothing here calls out anywhere. Bank SMS is among the most
 * sensitive text a person owns, and the deterministic path means the ordinary
 * import never leaves the server.
 *
 * Every function is pure. The parser is the part most likely to be wrong, so
 * it is tested directly against captured message shapes rather than through
 * the API.
 */

/* ------------------------------------------------------------------ */
/* Amount                                                              */
/* ------------------------------------------------------------------ */

/**
 * Indian SMS writes money as `Rs.1,248.00`, `INR 1248`, `Rs 1,248/-`, or
 * `₹1,248.00`. The decimal is always a dot and grouping is always commas, so
 * this is simpler than the retail-page case in the extension — but the
 * currency marker is required, because a bare number in an SMS is as likely to
 * be an account suffix or a reference id.
 */
const AMOUNT_RE = /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

function amountPaiseFrom(text) {
  const match = text.match(AMOUNT_RE);
  if (!match) return null;

  const rupees = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(rupees) || rupees <= 0) return null;

  return toPaise(rupees);
}

/* ------------------------------------------------------------------ */
/* Direction                                                           */
/* ------------------------------------------------------------------ */

/**
 * Order matters. "credited" contains no debit word, but several issuers write
 * "debited ... towards credit card", so debit markers are checked first and
 * the credit markers stay narrow.
 */
const DEBIT_MARKERS = /\b(debited|debit|spent|paid|withdrawn|purchase|sent to|txn of)\b/i;
const CREDIT_MARKERS = /\b(credited|credit(?!\s*card)|received|refund|deposited|cashback)\b/i;

function directionFrom(text) {
  if (DEBIT_MARKERS.test(text)) return "expense";
  if (CREDIT_MARKERS.test(text)) return "income";
  return null;
}

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * The three shapes Indian issuers actually send:
 *   14-08-26 / 14/08/2026   (day first — never month first)
 *   14-Aug-26 / 14 Aug 2026
 *   2026-08-14              (ISO, rare but unambiguous)
 *
 * Day-first is assumed for all-numeric dates because no Indian bank sends
 * US-style month-first, and guessing wrong silently files a transaction weeks
 * away from where it belongs.
 */
const DATE_PATTERNS = [
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    build: (m) => ({ year: +m[1], month: +m[2] - 1, day: +m[3] }),
  },
  {
    re: /\b(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})\b/,
    build: (m) => {
      const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
      return month === undefined ? null : { year: fullYear(+m[3]), month, day: +m[1] };
    },
  },
  {
    re: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
    build: (m) => ({ year: fullYear(+m[3]), month: +m[2] - 1, day: +m[1] }),
  },
];

/** Two-digit years are this century — a bank SMS is never from 1998. */
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/**
 * @returns {Date|null} midnight IST on the parsed day, or null
 */
function dateFrom(text, now = new Date()) {
  for (const { re, build } of DATE_PATTERNS) {
    const match = text.match(re);
    if (!match) continue;

    const parts = build(match);
    if (!parts) continue;
    if (parts.month < 0 || parts.month > 11 || parts.day < 1 || parts.day > 31) continue;

    const date = fromISTFields(parts.year, parts.month, parts.day);

    // Reject a date the parse clearly mangled — a reference number can look
    // like a date, and a transaction dated 2031 is worse than an undated one.
    const { year: nowYear } = istParts(now);
    if (parts.year < nowYear - 5 || parts.year > nowYear + 1) continue;

    return date;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Merchant                                                            */
/* ------------------------------------------------------------------ */

/** Noise that appears where a merchant name should be. */
const MERCHANT_STOPWORDS =
  /^(a\/c|ac|acct|account|vpa|upi|ref|refno|txn|txnid|imps|neft|rtgs|no|id|on|at|to|from|your|the)$/i;

function cleanMerchant(raw) {
  if (!raw) return null;

  let name = String(raw)
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();

  // "bluetokai@okhdfcbank" → "bluetokai". A VPA handle is not a merchant name,
  // but its local part usually is.
  if (name.includes("@")) name = name.split("@")[0];

  // Issuers pad merchant names with their own routing junk.
  name = name.replace(/\b(upi|neft|imps|rtgs|pos|ecom|mmt)\b/gi, " ").replace(/\s+/g, " ").trim();

  // Strip a trailing reference number glued to the name.
  name = name.replace(/[-_\s]*\d{6,}$/, "").trim();

  if (!name || name.length < 2) return null;
  if (MERCHANT_STOPWORDS.test(name)) return null;
  // All digits is a reference, not a shop.
  if (/^\d+$/.test(name)) return null;

  return name.slice(0, 60);
}

/**
 * Ordered merchant patterns, most specific first.
 *
 * These are the shapes issuers actually use. Isolated here for the same reason
 * as the extension's site adapters: when a bank changes its template, the fix
 * is one line in this list and a fixture, not a change to any logic.
 */
const MERCHANT_PATTERNS = [
  // "...trf to BLUE TOKAI Ref..."  /  "...transfer to X on..."
  /\b(?:trf|transfer|sent)\s+to\s+([A-Za-z0-9&.\-_' ]+?)(?=\s+(?:ref|on|dt|upi|txn|\d{2}[-/])|$)/i,
  // "...to VPA bluetokai@okhdfcbank..."
  /\bto\s+VPA\s+([^\s]+)/i,
  // "...spent at AMAZON on..."  /  "...at SWIGGY on 14-08-26"
  /\b(?:at|towards)\s+([A-Za-z0-9&.\-_' ]+?)(?=\s+(?:on|dt|ref|upi|txn|\d{2}[-/])|$)/i,
  // "...Info: UPI/BLUETOKAI/..."  — the segment after the scheme.
  /\bInfo:\s*(?:UPI|NEFT|IMPS)[/\-]([A-Za-z0-9&.\-_' ]+)/i,
  // "...credited by JOHN DOE..."
  /\b(?:by|from)\s+([A-Za-z0-9&.\-_' ]+?)(?=\s+(?:on|ref|dt|upi|txn|\d{2}[-/])|$)/i,
];

function merchantFrom(text) {
  for (const re of MERCHANT_PATTERNS) {
    const match = text.match(re);
    const name = cleanMerchant(match?.[1]);
    if (name) return name;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Issuer + reference                                                  */
/* ------------------------------------------------------------------ */

const ISSUERS = [
  { id: "hdfc", label: "HDFC Bank", re: /\bHDFC\b/i },
  { id: "icici", label: "ICICI Bank", re: /\bICICI\b/i },
  { id: "sbi", label: "State Bank of India", re: /\bSBI\b|State Bank/i },
  { id: "axis", label: "Axis Bank", re: /\bAxis\b/i },
  { id: "kotak", label: "Kotak", re: /\bKotak\b/i },
  { id: "paytm", label: "Paytm", re: /\bPaytm\b/i },
  { id: "phonepe", label: "PhonePe", re: /\bPhonePe\b/i },
  { id: "gpay", label: "Google Pay", re: /\bG(?:oogle)?\s?Pay\b/i },
];

function issuerFrom(text) {
  return ISSUERS.find((i) => i.re.test(text)) || null;
}

/** The bank's own reference — the strongest possible dedup key when present. */
const REFERENCE_RE = /\b(?:ref(?:erence)?(?:\s*(?:no|id|num))?|txn(?:\s*id)?|utr)\b\s*[:.#-]?\s*([A-Za-z0-9]{6,})/i;

function referenceFrom(text) {
  const match = text.match(REFERENCE_RE);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------ */
/* One message                                                         */
/* ------------------------------------------------------------------ */

/**
 * Confidence is about how much had to be guessed, and it drives which fields
 * the review sheet highlights. It is never used to auto-commit anything —
 * nothing imported is ever committed without a person looking at it.
 */
function confidenceFor({ amountPaise, date, merchant, direction }) {
  let score = 0;
  if (amountPaise) score += 0.45;
  if (direction) score += 0.2;
  if (date) score += 0.2;
  if (merchant) score += 0.15;
  return Math.round(score * 100) / 100; // not-money: confidence fraction
}

/**
 * @param {string} line one SMS
 * @returns {object|null} a draft, or null when there is no amount to anchor on
 */
function parseMessage(line, now = new Date()) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const amountPaise = amountPaiseFrom(text);
  // No amount means no transaction. An OTP or a balance alert lands here and
  // is correctly dropped rather than imported as a mystery row.
  if (amountPaise === null) return null;

  // A balance-only alert mentions money but records nothing.
  if (/\b(available balance|avl bal|bal is|balance is)\b/i.test(text) && !directionFrom(text)) {
    return null;
  }

  const direction = directionFrom(text);
  const date = dateFrom(text, now);
  const merchant = merchantFrom(text);
  const issuer = issuerFrom(text);

  return {
    amountPaise,
    /** Defaults to expense: the overwhelming majority, and the person can flip it. */
    type: direction || "expense",
    directionDetected: Boolean(direction),
    date: date || null,
    merchant,
    issuer: issuer?.id || null,
    issuerLabel: issuer?.label || null,
    reference: referenceFrom(text),
    confidence: confidenceFor({ amountPaise, date, merchant, direction }),
    source: "sms",
    raw: text.slice(0, 300),
  };
}

/**
 * Split a pasted block into candidate messages.
 *
 * People paste in every possible shape: one per line, blank-line separated, or
 * a wall with timestamps. Blank-line groups are preferred when present, since
 * a single SMS often wraps across several lines.
 */
function splitMessages(block) {
  const text = String(block || "").trim();
  if (!text) return [];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) return paragraphs;

  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * @returns {{drafts: object[], unparsed: string[]}}
 *   `unparsed` is what an LLM would be asked about — and only if a text key
 *   exists. It is never required for the feature to work.
 */
function parseBlock(block, now = new Date()) {
  const drafts = [];
  const unparsed = [];

  for (const message of splitMessages(block)) {
    const draft = parseMessage(message, now);
    if (draft) drafts.push(draft);
    // Only surface leftovers that plausibly held a transaction; an OTP is not
    // a parse failure, it is correctly ignored.
    else if (AMOUNT_RE.test(message)) unparsed.push(message.slice(0, 300));
  }

  return { drafts, unparsed };
}

module.exports = {
  parseMessage,
  parseBlock,
  splitMessages,
  amountPaiseFrom,
  directionFrom,
  dateFrom,
  merchantFrom,
  referenceFrom,
  issuerFrom,
  cleanMerchant,
};

const { toPaise } = require("../utils/money");

/**
 * What a WhatsApp message means.
 *
 * DETERMINISTIC FIRST, ALWAYS. `"450 dinner split with Goa"` is parsed by
 * regex on a server with no API key, no network call and no model — same
 * posture as the SMS importer in Milestone 4, and for a stronger reason here:
 * this text is a person's private message, and the ordinary path must not ship
 * it anywhere. The LLM is a fallback for the leftovers, invoked only when the
 * rules genuinely cannot tell what was meant.
 *
 * The parser is PURE. It takes a string and a little context (the user's group
 * names) and returns an intent object. It reads no database, writes nothing,
 * and sends nothing — which is what makes every message shape testable as a
 * one-line assertion.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * Merchant/keyword → category.
 *
 * Ordered longest-first at match time so "coffee shop" cannot be beaten by
 * "shop". Kept small and legible on purpose: this is a convenience, and the
 * review surface for a wrong guess is the app, where the category is one tap
 * to change.
 */
const CATEGORY_KEYWORDS = {
  Food: [
    "dinner", "lunch", "breakfast", "brunch", "food", "restaurant", "swiggy", "zomato",
    "coffee", "cafe", "chai", "snack", "pizza", "burger", "biryani", "takeaway", "dessert",
  ],
  Groceries: ["groceries", "grocery", "bigbasket", "blinkit", "zepto", "instamart", "vegetables", "milk", "supermarket"],
  Transport: ["uber", "ola", "rapido", "cab", "taxi", "auto", "metro", "bus", "petrol", "diesel", "fuel", "parking", "toll"],
  Travel: ["flight", "train", "irctc", "hotel", "airbnb", "oyo", "booking", "visa", "trip", "boarding"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "clothes", "shoes", "shopping", "nykaa", "meesho"],
  Bills: ["bill", "electricity", "water", "gas", "broadband", "wifi", "internet", "recharge", "airtel", "jio", "vodafone"],
  Rent: ["rent", "maintenance", "deposit"],
  Entertainment: ["movie", "cinema", "pvr", "inox", "concert", "game", "bowling", "party", "club", "bar", "drinks", "beer"],
  Health: ["medicine", "pharmacy", "doctor", "hospital", "clinic", "apollo", "gym", "dentist"],
  Subscriptions: ["netflix", "spotify", "prime", "hotstar", "subscription", "icloud", "youtube"],
  Education: ["course", "book", "tuition", "fees", "udemy", "coursera"],
};

/** Flattened once, longest keyword first so specific beats generic. */
const KEYWORD_INDEX = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, words]) => words.map((word) => ({ word, category })))
  .sort((a, b) => b.word.length - a.word.length);

const INCOME_MARKERS = /\b(got|received|salary|earned|income|refund|credited|bonus|freelance)\b/i;

/**
 * The amount.
 *
 * Accepts `450`, `₹450`, `Rs.450`, `INR 1,250.50`, and `1.2k`/`2k`. The `k`
 * suffix is common in exactly this medium and reading "2k" as ₹2 would be a
 * silent hundred-fold error in the wrong direction.
 */
const AMOUNT_RE = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?/i;

/**
 * `split with Goa`, `with Goa`, `in Goa`, `for the flat`, `@Goa`.
 *
 * Capturing to end-of-string rather than one word: group names have spaces,
 * and "Goa trip" losing its second half matches nothing.
 */
const GROUP_RE = /(?:split\s+with|with|in|for|@)\s+([a-z0-9][a-z0-9 &'’-]*)$/i;

const SPLIT_MARKERS = /\bsplit\b/i;
const WEIGHTED_MARKERS = /\b(by income|income[- ]weighted|weighted)\b/i;

/* ------------------------------------------------------------------ */
/* Intent detection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Exact-ish command intents, checked before anything tries to read an amount.
 *
 * Order matters: "settle up with Priya" contains "settle" and also a name that
 * would otherwise read as a group, and "what do I owe" must not be mistaken
 * for a settlement.
 */
const COMMANDS = [
  { intent: "help", re: /^\s*(help|\?|hi|hello|hey|start|menu)\s*$/i },
  { intent: "undo", re: /^\s*(undo|cancel|oops|delete that|remove that)\s*!?\s*$/i },
  {
    intent: "balance",
    re: /(what'?s my number|safe to spend|how much (can i|do i have)|my balance|budget left|how much left)/i,
  },
  { intent: "who_owes", re: /(who owes|what do i owe|owes what|balances|settle ?up\?)/i },
  { intent: "settle", re: /\b(settle|paid back|paid up|squared up|sent)\b/i },
];

/** Digits-only, 4–8 characters: a linking code and nothing else. */
const LINK_CODE_RE = /^\s*(\d{4,8})\s*$/;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function readAmountPaise(text) {
  const match = AMOUNT_RE.exec(text);
  if (!match) return null;

  const rupees = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(rupees) || rupees <= 0) return null;

  const thousands = Boolean(match[2]);
  const paise = toPaise(thousands ? rupees * 1000 : rupees);
  return paise > 0 ? paise : null;
}

function readCategory(text) {
  const haystack = text.toLowerCase();
  for (const { word, category } of KEYWORD_INDEX) {
    // Word-boundary matched so "bar" does not fire inside "barber".
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack)) {
      return category;
    }
  }
  return null;
}

/**
 * Resolve a spoken group name against the ones this person is actually in.
 *
 * Exact match, then prefix, then containment either way — "Goa" should find
 * "Goa trip", and "the goa trip" should find "Goa". Ambiguity resolves to
 * nothing rather than to a guess: booking an expense against the wrong shared
 * wallet is a mistake other people have to notice and unpick.
 *
 * @param {{_id: any, name: string}[]} groups
 */
function matchGroup(spoken, groups = []) {
  if (!spoken || groups.length === 0) return null;
  const needle = spoken.trim().toLowerCase().replace(/^the\s+/, "");
  if (!needle) return null;

  const named = groups.map((g) => ({ group: g, name: String(g.name || "").toLowerCase() }));

  const exact = named.filter((g) => g.name === needle);
  if (exact.length === 1) return exact[0].group;

  const prefix = named.filter((g) => g.name.startsWith(needle));
  if (prefix.length === 1) return prefix[0].group;

  const contains = named.filter((g) => g.name.includes(needle) || needle.includes(g.name));
  if (contains.length === 1) return contains[0].group;

  return null;
}

/**
 * The note: what is left once the amount and the group phrase are removed.
 * "450 dinner split with Goa" → "dinner".
 */
function readNote(text) {
  return text
    .replace(AMOUNT_RE, " ")
    .replace(GROUP_RE, " ")
    .replace(/\b(split|paid|spent|for|on|at|the|a|an)\b/gi, " ")
    .replace(/[₹]|(\brs\.?\b)|(\binr\b)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/* ------------------------------------------------------------------ */
/* The parser                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {string} raw the message text
 * @param {{groups?: {_id: any, name: string}[]}} [context]
 * @returns {object} an intent. `intent: "unknown"` means the rules gave up and
 *   the caller may try the model.
 */
function parseMessage(raw, context = {}) {
  const text = String(raw || "").trim();
  if (!text) return { intent: "unknown", reason: "empty" };

  const linkCode = LINK_CODE_RE.exec(text);
  if (linkCode) return { intent: "link_code", code: linkCode[1] };

  for (const command of COMMANDS) {
    if (command.re.test(text)) {
      if (command.intent !== "settle") return { intent: command.intent, text };

      // Settlement needs an amount and a counterparty to mean anything.
      const amountPaise = readAmountPaise(text);
      const who = /\b(?:to|with|back)\s+([a-z][a-z ]*)$/i.exec(text);
      return {
        intent: "settle",
        amountPaise,
        counterparty: who ? who[1].trim() : null,
        text,
      };
    }
  }

  const amountPaise = readAmountPaise(text);
  if (amountPaise === null) return { intent: "unknown", reason: "no_amount", text };

  /**
   * Modifiers are stripped BEFORE the group is read.
   *
   * `GROUP_RE` anchors to end-of-string because group names contain spaces and
   * capturing one word turns "Goa trip" into "Goa". That anchoring means a
   * trailing modifier gets swallowed into the name — "with Goa by income"
   * would look for a group called "Goa by income" and find nothing.
   */
  const weighted = WEIGHTED_MARKERS.test(text);
  const splitSaid = SPLIT_MARKERS.test(text);
  const withoutModifiers = text.replace(WEIGHTED_MARKERS, " ").replace(/\s+/g, " ").trim();

  const groupPhrase = GROUP_RE.exec(withoutModifiers);
  const group = groupPhrase ? matchGroup(groupPhrase[1], context.groups) : null;

  // A group was named but is not one of theirs — better to ask than to book it
  // into the wrong wallet, or silently into their personal ledger.
  if (groupPhrase && !group) {
    return {
      intent: "unknown",
      reason: "unknown_group",
      spokenGroup: groupPhrase[1].trim(),
      text,
    };
  }

  const isIncome = INCOME_MARKERS.test(text);

  return {
    intent: isIncome ? "log_income" : "log_expense",
    amountPaise,
    category: readCategory(withoutModifiers) || (isIncome ? "Income" : "Other"),
    note: readNote(withoutModifiers) || null,
    groupId: group ? String(group._id) : null,
    groupName: group ? group.name : null,
    /**
     * Naming a group implies splitting it. Logging a shared expense into a
     * shared wallet and leaving it unsplit creates no debt and helps nobody,
     * so the word "split" is optional — `450 dinner with Goa` and
     * `450 dinner split with Goa` mean the same thing.
     *
     * The group's own default is applied later by the controller, which can
     * read it; an explicit "by income" here overrides that.
     */
    splitMode: group ? (weighted ? "weighted" : "equal") : "none",
    splitModeExplicit: group ? weighted || splitSaid : false,
    text,
  };
}

module.exports = {
  parseMessage,
  normaliseForTest: { readAmountPaise, readCategory, matchGroup, readNote },
  CATEGORY_KEYWORDS,
};

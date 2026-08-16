const { toPaise, fromPaise } = require("../utils/money");
const { startOfDayIST, MS_DAY } = require("../utils/time");

/**
 * Duplicate detection. This is the feature that makes import trustworthy.
 *
 * People import the same week twice. They paste a block, get distracted, and
 * paste it again. They screenshot a payment they already logged by hand. If
 * Finget silently doubles their spending, the number that the entire product
 * rests on becomes wrong, and there is no way for them to know which of the
 * two rows is the fake one.
 *
 * So the rule is: FLAG, never silently drop and never silently merge. A
 * suspected duplicate arrives at the review sheet excluded by default, with
 * the row it matched shown next to it, and the person decides.
 */

/** A bank reference is unique per transaction — an exact match is certain. */
const MATCH_REFERENCE = "reference";
/** Same amount, near date, similar name. Strong but not certain. */
const MATCH_HEURISTIC = "amount+date+merchant";

/**
 * Dates ±1 day, because an SMS sent at 23:58 books on one day and the app
 * records it on the next, and because a person entering something by hand may
 * be a day out. Wider than that starts catching a genuine weekly coffee.
 */
const DATE_TOLERANCE_DAYS = 1;

/** Below this, two names are different shops. */
const MERCHANT_SIMILARITY_THRESHOLD = 0.72;

/* ------------------------------------------------------------------ */
/* Fuzzy names                                                         */
/* ------------------------------------------------------------------ */

/** Casing, punctuation and the payment-rail noise around a merchant name. */
function normaliseMerchant(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/@[\w.]+/g, " ") // strip a VPA domain
    .replace(/\b(pvt|ltd|limited|india|the|inc|llp|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic edit distance, iterative so a long note cannot blow the stack. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * 0–1 similarity.
 *
 * Containment counts as a strong match before edit distance is considered:
 * "BLUE TOKAI" and "BLUE TOKAI COFFEE ROASTERS" are the same shop, but they
 * are far apart by edit distance because one is twice as long.
 */
function merchantSimilarity(a, b) {
  const x = normaliseMerchant(a);
  const y = normaliseMerchant(b);

  if (!x || !y) return 0;
  if (x === y) return 1;

  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length >= 4 && longer.includes(shorter)) return 0.95;

  const distance = levenshtein(x, y);
  return 1 - distance / Math.max(x.length, y.length); // not-money: similarity ratio
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const daysApart = (a, b) =>
  Math.abs(startOfDayIST(new Date(a)) - startOfDayIST(new Date(b))) / MS_DAY;

/** Everything a transaction offers as a name, since notes carry it too. */
const nameOf = (tx) => tx.merchant || tx.note || "";

/**
 * @param {object} draft    a parsed import row
 * @param {object[]} existing  transactions already in scope
 * @returns {{transaction: object, reason: string, confidence: number}|null}
 */
function findDuplicate(draft, existing) {
  if (!draft || draft.amountPaise == null) return null;

  // A matching bank reference is proof, and it holds even when the amount was
  // edited or the date is missing.
  if (draft.reference) {
    const byReference = existing.find(
      (tx) => tx.importReference && tx.importReference === draft.reference
    );
    if (byReference) {
      return { transaction: byReference, reason: MATCH_REFERENCE, confidence: 1 };
    }
  }

  const draftDate = draft.date ? new Date(draft.date) : null;

  for (const tx of existing) {
    if (toPaise(tx.amount || 0) !== draft.amountPaise) continue;

    // Without a date on the draft, amount alone is too weak on its own — a
    // ₹150 chai twice in a week is not a duplicate.
    if (!draftDate || !tx.date) continue;
    if (daysApart(draftDate, tx.date) > DATE_TOLERANCE_DAYS) continue;

    const similarity = merchantSimilarity(draft.merchant, nameOf(tx));

    // Same amount, same day, and neither side names a merchant: treat as a
    // duplicate. Two unnamed identical amounts on one day is far more often a
    // double import than two real transactions.
    const bothUnnamed = !draft.merchant && !nameOf(tx);

    if (similarity >= MERCHANT_SIMILARITY_THRESHOLD || bothUnnamed) {
      return {
        transaction: tx,
        reason: MATCH_HEURISTIC,
        confidence: bothUnnamed ? 0.75 : Math.round(similarity * 100) / 100, // not-money: similarity
      };
    }
  }

  return null;
}

/**
 * Annotate a batch of drafts, checking each against what is already stored AND
 * against the rows before it in the same paste.
 *
 * The within-batch check matters: pasting the same block twice in one go is
 * exactly as common as pasting it twice on different days.
 */
function annotateDuplicates(drafts, existing) {
  const seen = [...existing];
  const out = [];

  for (const draft of drafts) {
    const match = findDuplicate(draft, seen);

    out.push({
      ...draft,
      duplicateOf: match
        ? {
            transactionId: match.transaction._id ? String(match.transaction._id) : null,
            reason: match.reason,
            confidence: match.confidence,
            amount: match.transaction.amount,
            date: match.transaction.date,
            label: nameOf(match.transaction) || null,
          }
        : null,
      // The review sheet's default. A duplicate arrives unticked; the person
      // can always tick it if they know better.
      include: !match,
    });

    /**
     * A row that was itself accepted becomes something later rows can match,
     * so two identical lines in one paste do not both come through.
     *
     * Amount-less rows are skipped: they can never match anything (findDuplicate
     * bails on them), and converting a null amount for the comparison shape
     * threw — which turned a person clearing one field into a 500.
     */
    if (!match && draft.amountPaise != null) {
      seen.push({
        _id: null,
        amount: fromPaise(draft.amountPaise),
        date: draft.date,
        merchant: draft.merchant,
        note: draft.merchant,
        importReference: draft.reference,
      });
    }
  }

  return out;
}

module.exports = {
  findDuplicate,
  annotateDuplicates,
  merchantSimilarity,
  normaliseMerchant,
  levenshtein,
  MATCH_REFERENCE,
  MATCH_HEURISTIC,
  DATE_TOLERANCE_DAYS,
  MERCHANT_SIMILARITY_THRESHOLD,
};

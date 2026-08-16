/**
 * A name for the deflection ledger, taken from the page.
 *
 * The ledger is worthless if it reads "₹8,499 · ₹12,400 · ₹3,200" — the point
 * is looking back and seeing *what* you walked away from. Retail titles are
 * long and SEO-stuffed, so this keeps the informative front of the string and
 * stops at the first separator.
 *
 * Pure and separately testable: it is the difference between a useful ledger
 * and a list of numbers.
 */

const FALLBACK = "Something I wanted";

/** " | ", " : ", " – ", " — ", and Amazon's "Buy X online" preamble. */
const SEPARATOR = /\s[|:–—]\s|\sBuy\s/i;

export function labelFrom(ogTitle: string | null | undefined, documentTitle: string | null | undefined): string {
  // Chosen on trimmed content but split UNTRIMMED: a title that opens with a
  // separator (" | Amazon.in") would otherwise lose the leading space the
  // pattern needs, and the label would become "| Amazon.in".
  const raw = (ogTitle || "").trim() ? String(ogTitle) : String(documentTitle || "");
  if (!raw.trim()) return FALLBACK;

  const head = raw.split(SEPARATOR)[0].trim().slice(0, 120);

  // Reject a head that is only punctuation — it names nothing.
  return /[\p{L}\p{N}]/u.test(head) ? head : FALLBACK;
}

export const LABEL_FALLBACK = FALLBACK;

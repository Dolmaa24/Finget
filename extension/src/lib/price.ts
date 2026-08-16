/**
 * Reading a price off a page someone else built.
 *
 * This is the part of the extension most likely to be wrong, so it is a pure
 * function with no DOM access and it is tested directly. Everything that knows
 * about a specific retailer lives in `src/adapters`; this file only knows what
 * an Indian rupee price looks like as text.
 *
 * Returns integer PAISE, because that is the contract `/api/finance/translate`
 * takes. The extension never sends rupees.
 */

/**
 * Below ₹10 a figure on these six sites is almost never a price. It is a star
 * rating ("4.5"), a discount multiplier, or a delivery-day count — and a
 * rating parsed as ₹4.50 would put a confident, wrong chip on the page. Retail
 * items under ₹10 effectively do not exist here, so the floor costs nothing
 * and removes the entire class.
 */
const MIN_PAISE = 1000; // ₹10
/** Above this it is a phone number, a pincode, or a review count. */
const MAX_PAISE = 10_00_00_000_00; // ₹10 crore

/**
 * Matches a rupee figure with Indian digit grouping and an optional fractional
 * part. Two deliberate choices:
 *
 * - No whitespace inside the number. "8,499 9,999" is a price next to a
 *   struck-through MRP and must read as the first one, not as 84,999,999.
 * - The fraction is `\d+`, not `\d{1,2}`. Capping it at two would truncate
 *   "1.499" to "1.49" here, and the grouping check below would then never see
 *   the third digit that proves the dot was a separator.
 */
const PRICE_RE = /\d[\d,]*(?:\.\d+)?/;

const CURRENCY_RE = /₹|\bRs\.?|\bINR\b|&#8377;|&#x20b9;/gi;

/**
 * @param raw text taken from a price element
 * @returns integer paise, or null when the text holds no usable price
 */
export function parsePriceToPaise(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const cleaned = String(raw)
    .replace(CURRENCY_RE, " ")
    // Non-breaking (U+00A0), narrow no-break (U+202F) and thin (U+2009) spaces
    // are all over price markup. Written as escapes rather than literals so
    // they survive copy-paste and stay visible in review.
    .replace(/[\u00a0\u202f\u2009]/g, " ");

  const match = cleaned.match(PRICE_RE);
  if (!match) return null;

  let digits = match[0].replace(/,/g, "");

  /**
   * A dot is a decimal separator on Indian retail sites. But "1.499" also
   * appears as European-style grouping in scraped or mis-localised markup, and
   * reading it as ₹1.50 would understate a ₹1,499 product by a thousand times.
   * Treat a dot as decimal ONLY when exactly 1–2 digits follow it; anything
   * else is grouping and gets stripped.
   */
  const dot = digits.indexOf(".");
  if (dot !== -1) {
    const decimals = digits.length - dot - 1;
    if (decimals > 2) digits = digits.replace(/\./g, "");
  }

  const rupees = Number(digits);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;

  // Integer paise, matching the server's `toPaise` rounding.
  const paise = Math.round(rupees * 100);

  if (paise < MIN_PAISE || paise > MAX_PAISE) return null;
  return paise;
}

/** Indian-format rupees for display in the chip. */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  const whole = Math.round(rupees);
  return `₹${whole.toLocaleString("en-IN")}`;
}

export const PRICE_BOUNDS = { MIN_PAISE, MAX_PAISE };

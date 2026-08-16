/**
 * The words on a share card.
 *
 * Lives apart from both renderers on purpose: the HTML page (`/s/:token`) and
 * the PNG (`/s/:token.png`) are the same card in two media, and when a link
 * unfurls in WhatsApp the reader sees both at once. Two copies of this switch
 * statement would drift, and the drift would be visible to the person sharing.
 *
 * Payloads reaching here have already passed `assertRedacted`.
 */

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/** Tone check: a card is something you'd want to send, never a scolding. */
function describe(card) {
  const p = (card && card.payload) || {};

  switch (card && card.kind) {
    case "translate":
      return {
        title: `${inr(p.amount)} = ${p.headline}`,
        description: "Finget prices things in what they actually cost you.",
      };

    case "deflection":
      return {
        title: `${inr(p.totalDeflected)} not spent`,
        description: p.goalName ? `That is ${p.goalName}, funded.` : "Money kept, on purpose.",
      };

    case "wrapped":
      return {
        /**
         * Personalised, because a generic recap does not get shared. Every
         * member mints their own card and each one leads with their own name —
         * that is the difference between "here is our trip" and "here is MY
         * trip", and only the second one gets posted.
         */
        title: p.highlightName
          ? `${p.emoji || "🧳"} ${p.highlightName}'s ${p.tripName} — wrapped`
          : `${p.emoji || "🧳"} ${p.tripName} — wrapped`,
        description: `${inr(p.totalSpent)} across ${p.days} days and ${p.memberCount} people.`,
      };

    case "trip_invite":
      return {
        title: `${p.emoji || "🧳"} Join ${p.tripName} on Finget`,
        description: `${p.inviterName} and ${Math.max(0, (p.memberCount || 1) - 1)} others are splitting this trip.`,
      };

    default:
      return { title: "Finget", description: "Know what's safe to spend." };
  }
}

/**
 * Risk stated as a fact about the buffer, never as a verdict about the person.
 * "You would still be Risky" reads as a scold and, worse, "still" implies
 * nothing changed — which is the opposite of what Risky means here.
 */
const RISK_LINE = {
  Safe: "You would still be Safe",
  Warning: "This gets close to your buffer",
  Risky: "This goes past your buffer",
};

/**
 * The single supporting figure under the headline, per kind. Returns null when
 * the payload has nothing worth saying — an empty pill is worse than none.
 */
function statLine(card) {
  const p = (card && card.payload) || {};

  switch (card && card.kind) {
    case "translate":
      return RISK_LINE[p.riskAfter] || null;
    case "deflection":
      return p.count
        ? `${p.count} ${p.count === 1 ? "decision" : "decisions"}, ${p.period || "this month"}`
        : null;
    case "wrapped": {
      // The viewer's own badge beats a trip-wide fact — it is the line they
      // will screenshot. Falls back to the category when they earned none.
      const mine = (p.superlatives || []).find((s) => s.name && s.name === p.highlightName);
      if (mine) return `${mine.title} · ${mine.detail}`;
      return p.topCategory ? `Most of it went on ${p.topCategory}` : null;
    }
    case "trip_invite":
      return p.memberCount ? `${p.memberCount} people so far` : null;
    default:
      return null;
  }
}

/** The trust line. It appears on every card because it is the positioning. */
const TRUST_LINE = "No ads. No selling data. Finget never holds your money.";

module.exports = { describe, statLine, inr, RISK_LINE, TRUST_LINE };

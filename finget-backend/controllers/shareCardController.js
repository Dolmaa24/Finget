const ShareCard = require("../models/ShareCard");
const { createCard, revokeCard, RedactionError } = require("../services/shareCardService");
const { isRendererAvailable } = require("../services/shareRenderer");
const { resolveScope, handleScopeError } = require("../services/scopeResolver");
const { translate } = require("../services/goalCurrencyService");
const { ledgerFor } = require("../services/vaultService");
const { toPaise, fromPaise } = require("../utils/money");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5001";

const publicUrl = (token) => `${API_BASE_URL}/s/${encodeURIComponent(token)}`;

/**
 * `POST /api/share` — turn a moment in the app into a link.
 *
 * The client sends an INTENT (kind + the amount), never a payload. The server
 * recomputes the figures and assembles the card itself, so a caller cannot
 * smuggle a field past redaction by constructing the payload themselves, and
 * cannot mint a card claiming numbers that were never true for them.
 *
 * Milestone 1 ships `translate`. The other kinds arrive with the features
 * that produce them (deflection in M2, wrapped and trip_invite in M3).
 */
exports.create = async (req, res) => {
  try {
    const { kind } = req.body;

    if (kind === "deflection") return createDeflectionCard(req, res);

    if (kind !== "translate") {
      return res.status(400).json({
        msg:
          kind && ["wrapped", "trip_invite"].includes(kind)
            ? `"${kind}" cards arrive with the feature that produces them.`
            : "Unsupported card kind",
      });
    }

    const { amountPaise, amount, context, groupId } = req.body;

    let paise;
    if (amountPaise !== undefined) {
      if (!Number.isInteger(amountPaise)) {
        return res.status(400).json({ msg: "amountPaise must be an integer number of paise" });
      }
      paise = amountPaise;
    } else if (amount !== undefined) {
      const rupees = Number(amount);
      if (!Number.isFinite(rupees)) return res.status(400).json({ msg: "amount must be a number" });
      paise = toPaise(rupees);
    } else {
      return res.status(400).json({ msg: "amountPaise is required" });
    }

    if (paise <= 0) return res.status(400).json({ msg: "amountPaise must be greater than zero" });

    const scope = await resolveScope({ userId: req.user, context, groupId });
    const translation = await translate(scope, paise);

    /**
     * Rounded rupees only, and the goal NAME without its figures. A share card
     * says "6 days of your Goa trip"; it never says how much of the Goa trip is
     * already saved, which is the part that is nobody else's business.
     */
    const top = translation.goalImpacts[0];
    const payload = {
      amount: Math.round(translation.amount),
      headline: translation.headline,
      headlineKind: translation.headlineKind,
      riskAfter: translation.riskAfter,
    };
    if (top?.name) payload.goalName = top.name;
    if (translation.daysOfSafeSpend !== null) {
      // Redaction requires integers; the fractional day is not worth sharing.
      payload.daysOfSafeSpend = Math.round(translation.daysOfSafeSpend);
    }

    const card = await createCard({
      kind: "translate",
      ownerId: req.user,
      groupId: scope.isGroup ? scope.group._id : undefined,
      payload,
    });

    res.status(201).json({
      token: card.token,
      kind: card.kind,
      url: publicUrl(card.token),
      // Null when this host cannot rasterise — the client hides the image
      // preview rather than showing a broken one.
      imageUrl: isRendererAvailable() ? `${publicUrl(card.token)}.png` : null,
      payload: card.payload,
      expiresAt: card.expiresAt,
    });
  } catch (err) {
    if (err instanceof RedactionError) {
      // A payload we built ourselves failing redaction is our bug, not the
      // caller's. Loud in the log, vague in the response.
      console.error("Share payload failed redaction:", err.message);
      return res.status(500).json({ error: "Could not build a shareable card" });
    }
    handleScopeError(err, res);
  }
};

/**
 * The quarter's deflection total, as a card.
 *
 * The figure is read from the ledger, never from the request — the same rule
 * as `translate`, and it matters more here: a card claiming ₹80,000 deflected
 * is a claim about the person, and it has to be one the server can stand
 * behind. Refuses to mint at zero rather than publishing "₹0 not spent".
 */
async function createDeflectionCard(req, res) {
  const { context, groupId } = req.body;

  const scope = await resolveScope({ userId: req.user, context, groupId });
  const ledger = await ledgerFor(scope, req.user);

  if (ledger.quarterPaise <= 0) {
    return res.status(409).json({
      msg: "Nothing to share yet — this card appears once you've walked away from something.",
    });
  }

  const translation = await translate(scope, ledger.quarterPaise);

  const payload = {
    totalDeflected: Math.round(fromPaise(ledger.quarterPaise)),
    period: "this quarter",
    headline: translation.headline,
    count: ledger.count.quarter,
  };
  if (translation.goalImpacts[0]?.name) payload.goalName = translation.goalImpacts[0].name;

  const card = await createCard({
    kind: "deflection",
    ownerId: req.user,
    groupId: scope.isGroup ? scope.group._id : undefined,
    payload,
  });

  return res.status(201).json({
    token: card.token,
    kind: card.kind,
    url: publicUrl(card.token),
    imageUrl: isRendererAvailable() ? `${publicUrl(card.token)}.png` : null,
    payload: card.payload,
    expiresAt: card.expiresAt,
  });
}

/** `GET /api/share` — the user's own live cards, newest first. */
exports.list = async (req, res) => {
  try {
    const cards = await ShareCard.find({
      ownerId: req.user,
      revoked: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("token kind payload createdAt expiresAt")
      .lean();

    res.json(
      cards.map((c) => ({
        ...c,
        url: publicUrl(c.token),
        imageUrl: isRendererAvailable() ? `${publicUrl(c.token)}.png` : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** `DELETE /api/share/:token` — kill the link. The row stays until its TTL. */
exports.remove = async (req, res) => {
  try {
    const card = await revokeCard(req.params.token, req.user);
    if (!card) return res.status(404).json({ msg: "Card not found" });
    res.json({ msg: "Link revoked", token: card.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

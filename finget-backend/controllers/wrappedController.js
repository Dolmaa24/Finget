const Group = require("../models/Group");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Settlement = require("../models/Settlement");
const { can, explain, CAPABILITIES } = require("../services/entitlements");
const { isGroupMember, idOf } = require("../utils/groupAuth");
const { computeWrapped, wrappedCardPayload } = require("../services/wrappedService");
const { createCard, RedactionError } = require("../services/shareCardService");
const { isRendererAvailable } = require("../services/shareRenderer");
const { getClient, isAiConfigured, MODEL } = require("../services/aiClient");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5001";
const publicUrl = (token) => `${API_BASE_URL}/s/${encodeURIComponent(token)}`;

/**
 * One optional sentence, written by the model, on top of facts it cannot
 * change.
 *
 * Everything the recap asserts is already computed deterministically by
 * `wrappedService`; this only rephrases. If there is no key, or the call
 * fails, or it takes too long, the card ships without it and nobody can tell
 * something was missing — that is the same rules-first/AI-second contract the
 * insights engine uses.
 */
async function aiOneLiner(wrapped) {
  if (!isAiConfigured()) return null;

  const facts = {
    trip: wrapped.tripName,
    days: wrapped.days,
    people: wrapped.memberCount,
    totalSpent: Math.round(wrapped.totalSpent),
    topCategory: wrapped.topCategory?.name,
    superlatives: wrapped.superlatives.map((s) => `${s.title}: ${s.name || "—"} (${s.detail})`),
  };

  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.8,
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "You write a single warm, funny one-liner to cap off a group trip expense recap. " +
            "Rules: under 18 words. Affectionate about the group, never mocking an individual. " +
            "Never mention money being wasted, overspending, or regret — this is a keepsake. " +
            "Do not invent facts. Do not use hashtags or emoji. Return the sentence only.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });

    const line = completion.choices?.[0]?.message?.content?.trim();
    if (!line) return null;

    // A model that ignores the word limit gets dropped rather than truncated
    // mid-sentence on a card someone is about to share.
    return line.split(/\s+/).length <= 24 ? line.replace(/^["']|["']$/g, "") : null;
  } catch (err) {
    console.error("Wrapped one-liner failed:", err.message);
    return null;
  }
}

async function loadTrip(groupId, userId) {
  const group = await Group.findById(groupId).populate("members", "name");
  if (!group || !isGroupMember(group, userId)) return null;
  return group;
}

/**
 * `GET /api/groups/:id/wrapped` — the recap.
 *
 * Readable by any member at any time. The spec generates it on endDate + 1,
 * but gating the read behind that date would mean a group that finished
 * yesterday sees a 404 for hours, and there is nothing sensitive here that
 * members cannot already see on the balances screen.
 */
exports.getWrapped = async (req, res) => {
  try {
    const group = await loadTrip(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    if (group.kind !== "trip") {
      return res.status(400).json({ msg: "Wrapped is for trips. Set this group's dates first." });
    }

    const [transactions, settlements] = await Promise.all([
      Transaction.find({ groupId: group._id }).lean(),
      Settlement.find({ groupId: group._id }).lean(),
    ]);

    if (transactions.filter((t) => t.type === "expense").length === 0) {
      return res.status(409).json({ msg: "Nothing to wrap up yet — no expenses were logged." });
    }

    const wrapped = computeWrapped({ group, transactions, settlements });

    // `?ai=0` lets the client render instantly and skip the model call.
    const oneLiner = req.query.ai === "0" ? null : await aiOneLiner(wrapped);

    res.json({
      ...wrapped,
      oneLiner,
      aiEnabled: isAiConfigured(),
      /** Whose card this is. Every member gets their own name highlighted. */
      viewerId: idOf(req.user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/groups/:id/wrapped/share` — mint this member's own card.
 *
 * Personalised deliberately: a card with your name on it gets sent to the
 * group chat, a generic one does not. Any member can mint theirs, and each
 * one is a separate card with a separate token they can revoke.
 */
exports.shareWrapped = async (req, res) => {
  try {
    const group = await loadTrip(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    if (group.kind !== "trip") {
      return res.status(400).json({ msg: "Wrapped is for trips." });
    }

    /**
     * SEEING the recap is free; MINTING a shareable card is the Plus feature.
     *
     * That split is deliberate. The recap is the payoff for a trip the group
     * already logged, and paywalling it would be charging for work they did.
     * The exportable card is the thing with a marketing cost attached — it
     * renders a PNG, it holds a public token for 90 days, and it is what gets
     * posted to a group chat.
     *
     * Group-grantable, so a ₹199 Trip Pass covers every member of the trip. The
     * organiser buying it is exactly who wants the card to exist.
     */
    const actor = await User.findById(req.user).select("entitlements").lean();
    if (!can(actor, CAPABILITIES.WRAPPED_EXPORT, { group })) {
      return res.status(403).json({
        msg: `${explain(CAPABILITIES.WRAPPED_EXPORT)} The recap itself stays open — this is only the shareable card.`,
        capability: CAPABILITIES.WRAPPED_EXPORT,
      });
    }

    const [transactions, settlements] = await Promise.all([
      Transaction.find({ groupId: group._id }).lean(),
      Settlement.find({ groupId: group._id }).lean(),
    ]);

    if (transactions.filter((t) => t.type === "expense").length === 0) {
      return res.status(409).json({ msg: "Nothing to wrap up yet — no expenses were logged." });
    }

    const wrapped = computeWrapped({ group, transactions, settlements });
    const payload = wrappedCardPayload(wrapped, req.user);

    const card = await createCard({
      kind: "wrapped",
      ownerId: req.user,
      groupId: group._id,
      payload,
    });

    if (!group.wrappedGeneratedAt) {
      group.wrappedGeneratedAt = new Date();
      await group.save();
    }

    res.status(201).json({
      token: card.token,
      kind: card.kind,
      url: publicUrl(card.token),
      imageUrl: isRendererAvailable() ? `${publicUrl(card.token)}.png` : null,
      payload: card.payload,
      expiresAt: card.expiresAt,
    });
  } catch (err) {
    if (err instanceof RedactionError) {
      console.error("Wrapped payload failed redaction:", err.message);
      return res.status(500).json({ error: "Could not build a shareable card" });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/groups/:id/invite-card` — the trip as a shareable card.
 *
 * Same redaction as the public preview, and for the same reason: this is the
 * artefact that recruits people, so it carries the name, the emoji and who is
 * already in — and NOT the total.
 */
exports.shareInvite = async (req, res) => {
  try {
    const group = await loadTrip(req.params.id, req.user);
    if (!group) return res.status(403).json({ msg: "Not authorized for this group" });

    const { firstNameOf } = require("../services/shareCardService");
    const { initialOf } = require("../services/tripPreviewService");
    const me = (group.members || []).find((m) => idOf(m) === idOf(req.user));

    const payload = {
      tripName: group.name,
      emoji: group.emoji || "🧳",
      memberCount: (group.members || []).length,
      initials: (group.members || []).map((m) => initialOf(m.name)),
      // The person doing the inviting is the person sharing it, not the creator.
      inviterName: firstNameOf(me?.name),
    };

    const card = await createCard({
      kind: "trip_invite",
      ownerId: req.user,
      groupId: group._id,
      payload,
    });

    res.status(201).json({
      token: card.token,
      kind: card.kind,
      url: publicUrl(card.token),
      imageUrl: isRendererAvailable() ? `${publicUrl(card.token)}.png` : null,
      /** The link that actually joins — the card is just the picture. */
      joinUrl: `${API_BASE_URL}/join/${encodeURIComponent(group.previewToken)}`,
      payload: card.payload,
      expiresAt: card.expiresAt,
    });
  } catch (err) {
    if (err instanceof RedactionError) {
      console.error("Invite payload failed redaction:", err.message);
      return res.status(500).json({ error: "Could not build a shareable card" });
    }
    res.status(500).json({ error: err.message });
  }
};

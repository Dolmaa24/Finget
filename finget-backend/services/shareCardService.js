const crypto = require("crypto");
const ShareCard = require("../models/ShareCard");

/**
 * Share cards are the only user data Finget serves without authentication, so
 * the payload rules are enforced by a validator, not by convention.
 *
 * Redaction is an ALLOW-LIST per card kind plus a deep scan for the things
 * that must never appear anywhere. A deny-list would silently pass the next
 * field someone adds.
 */

const DEFAULT_TTL_DAYS = Number(process.env.SHARE_CARD_TTL_DAYS || 90);

/** 16 random bytes → 22 URL-safe chars. Node's crypto, no dependency needed. */
function generateToken() {
  return crypto.randomBytes(16).toString("base64url");
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const OBJECT_ID_RE = /\b[a-f0-9]{24}\b/i;
/** Two capitalised words in a row reads as a full name. */
const FULL_NAME_RE = /^\p{Lu}\p{L}+\s+\p{Lu}\p{L}+/u;

/**
 * Keys that carry a *person's* name and must hold a first name only.
 * Deliberately excludes `tripName` and `goalName` — "Goa Trip" is two
 * capitalised words and is not a person.
 */
const NAME_KEYS = new Set([
  "name",
  "actor",
  "member",
  "inviterName",
  "highlightName",
  "fromName",
  "toName",
  "owner",
]);

/** Keys that must never appear in a payload at all. */
const FORBIDDEN_KEYS = new Set([
  "email",
  "userId",
  "_id",
  "id",
  "ownerId",
  "groupId",
  "inviteCode",
  "token",
  "password",
  "note",
  "notes",
  "monthlyIncome",
  "income",
  "salary",
]);

/** Fields each card kind is permitted to carry, at the top level. */
const ALLOWED_KEYS = {
  translate: new Set(["amount", "headline", "headlineKind", "goalName", "riskAfter", "daysOfSafeSpend"]),
  deflection: new Set(["totalDeflected", "period", "headline", "goalName", "count"]),
  wrapped: new Set([
    "tripName",
    "emoji",
    "totalSpent",
    "days",
    "memberCount",
    "members",
    "biggestExpense",
    "topCategory",
    "highlightName",
    "superlatives",
  ]),
  trip_invite: new Set(["tripName", "emoji", "memberCount", "initials", "inviterName"]),
};

class RedactionError extends Error {}

function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "Someone";
}

/**
 * Deep scan. Throws `RedactionError` on anything that would leak identity or
 * an unrounded figure.
 */
function assertRedacted(kind, payload, path = "payload") {
  const allowed = ALLOWED_KEYS[kind];
  if (!allowed) throw new RedactionError(`Unknown share card kind: ${kind}`);

  const walk = (value, currentPath, depth) => {
    if (depth > 6) throw new RedactionError(`${currentPath}: payload nested too deeply`);

    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      if (EMAIL_RE.test(value)) {
        throw new RedactionError(`${currentPath}: contains an email address`);
      }
      if (OBJECT_ID_RE.test(value)) {
        throw new RedactionError(`${currentPath}: contains a database id`);
      }
      return;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new RedactionError(`${currentPath}: not a finite number`);
      }
      // Share cards show rounded figures only — never paise-level precision.
      if (!Number.isInteger(value)) {
        throw new RedactionError(`${currentPath}: figures must be rounded (got ${value})`);
      }
      return;
    }

    if (typeof value === "boolean") return;

    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${currentPath}[${i}]`, depth + 1));
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${currentPath}.${key}`;

        if (FORBIDDEN_KEYS.has(key)) {
          throw new RedactionError(`${childPath}: forbidden field "${key}"`);
        }
        if (NAME_KEYS.has(key) && typeof child === "string" && FULL_NAME_RE.test(child.trim())) {
          throw new RedactionError(`${childPath}: full names are not allowed, use a first name`);
        }
        walk(child, childPath, depth + 1);
      }
      return;
    }

    throw new RedactionError(`${currentPath}: unsupported value type ${typeof value}`);
  };

  // Top-level keys are restricted to the kind's allow-list.
  for (const key of Object.keys(payload || {})) {
    if (!allowed.has(key)) {
      throw new RedactionError(`${path}.${key}: not permitted on a "${kind}" card`);
    }
  }

  walk(payload, path, 0);
  return true;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

async function createCard({ kind, ownerId, groupId, payload, ttlDays = DEFAULT_TTL_DAYS }) {
  assertRedacted(kind, payload);

  const expiresAt = new Date(Date.now() + ttlDays * 86400000);

  // Retry once on the vanishingly unlikely token collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await ShareCard.create({
        token: generateToken(),
        kind,
        ownerId,
        groupId,
        payload,
        expiresAt,
      });
    } catch (err) {
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
}

/** Public read. Returns null for unknown, revoked or expired tokens alike. */
async function readCard(token) {
  if (!token || typeof token !== "string") return null;
  const card = await ShareCard.findOne({ token }).lean();
  if (!card || card.revoked) return null;
  if (card.expiresAt && new Date(card.expiresAt) <= new Date()) return null;
  return card;
}

async function revokeCard(token, ownerId) {
  return ShareCard.findOneAndUpdate({ token, ownerId }, { $set: { revoked: true } }, { new: true });
}

module.exports = {
  generateToken,
  assertRedacted,
  firstNameOf,
  createCard,
  readCard,
  revokeCard,
  RedactionError,
  ALLOWED_KEYS,
  DEFAULT_TTL_DAYS,
};

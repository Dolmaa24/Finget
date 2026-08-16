const crypto = require("crypto");

/**
 * Opaque public tokens.
 *
 * Used by both share cards (`/s/:token`) and trip previews
 * (`/join/:previewToken`) so the two cannot drift into different entropy by
 * accident — they guard the same class of thing, a link anyone may hold.
 *
 * 16 bytes → 22 URL-safe characters. That is 128 bits: not guessable, not
 * enumerable, and short enough to sit in a WhatsApp message without wrapping.
 * Node's crypto, no dependency needed.
 *
 * NOT for credentials. `apiTokenService` mints 32 bytes for those, because a
 * share link is a thing you deliberately hand out while an API token is a
 * secret — see the comment there.
 */
function generatePublicToken() {
  return crypto.randomBytes(16).toString("base64url");
}

module.exports = { generatePublicToken };

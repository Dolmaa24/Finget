const Group = require("../models/Group");
const { firstNameOf } = require("./shareCardService");
const { idOf } = require("../utils/groupAuth");

/**
 * What a stranger holding a trip link is allowed to see.
 *
 * This is the second — and last — unauthenticated route that returns user
 * data, alongside `/s/:token`. It exists because a join flow that demands a
 * signup before showing what you are joining does not get used.
 *
 * WHAT IS DELIBERATELY ABSENT: the total. It is the thing people most want to
 * put on the link, and it is exactly what makes a leaked or guessed link
 * valuable. Names are first-initial only, and there is no spend, no member
 * emails, no ids, and no invite code anywhere in the response.
 *
 * The link carries a 22-char `previewToken`, never the 6-char invite code, so
 * seeing this page never confers the ability to join.
 */

/** Anonymous but human: "D · A · P" reads as three real people. */
function initialOf(name) {
  const first = firstNameOf(name);
  return (first[0] || "?").toUpperCase();
}

/**
 * @param {string} previewToken
 * @returns {Promise<object|null>} the redacted preview, or null
 */
async function previewByToken(previewToken) {
  if (!previewToken || typeof previewToken !== "string") return null;

  const group = await Group.findOne({ previewToken })
    .populate("members", "name")
    .populate("createdBy", "name")
    .lean();

  if (!group) return null;

  const members = group.members || [];

  return {
    name: group.name,
    emoji: group.emoji || "👥",
    kind: group.kind || "household",
    // Dates are the one detail that helps someone decide, and they reveal
    // nothing financial.
    startDate: group.startDate || null,
    endDate: group.endDate || null,
    memberCount: members.length,
    initials: members.map((m) => initialOf(m.name)),
    inviterName: firstNameOf(group.createdBy?.name),
    // NOT included, on purpose: potPaise, any spend, any balance, full names,
    // emails, member ids, and the invite code.
  };
}

/**
 * Resolve a token to the group id, for the authenticated join that follows the
 * preview. Returns null rather than the group so a caller cannot accidentally
 * serialise a full document to an unauthenticated client.
 */
async function groupIdForPreviewToken(previewToken) {
  if (!previewToken || typeof previewToken !== "string") return null;
  const group = await Group.findOne({ previewToken }).select("_id").lean();
  return group ? idOf(group._id) : null;
}

module.exports = { previewByToken, groupIdForPreviewToken, initialOf };

/**
 * Consistent ObjectId / string / populated-document safe membership checks.
 *
 * `members` may hold raw ObjectIds *or* populated User documents (several
 * controllers call `.populate("members")` to aggregate income). Calling
 * `.toString()` on a populated document returns the inspected document, never
 * the id, so ids must be unwrapped before comparing.
 */
function idOf(value) {
  if (!value) return null;
  if (value._id) return value._id.toString();
  return value.toString();
}

function isGroupMember(group, userId) {
  if (!group || !group.members || !userId) return false;
  const uid = idOf(userId);
  return group.members.some((m) => idOf(m) === uid);
}

function isGroupAdmin(group, userId) {
  if (!group || !group.admins || !userId) return false;
  const uid = idOf(userId);
  return group.admins.some((a) => idOf(a) === uid);
}

module.exports = { idOf, isGroupMember, isGroupAdmin };

/** Consistent ObjectId / string safe membership checks */
function isGroupMember(group, userId) {
  if (!group || !group.members || !userId) return false;
  const uid = userId.toString();
  return group.members.some((m) => m.toString() === uid);
}

module.exports = { isGroupMember };

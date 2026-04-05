const Group = require("../models/Group");
const { isGroupMember } = require("../utils/groupAuth");

exports.createGroup = async (req, res) => {
  try {
    const { name } = req.body;
    
    const group = await Group.create({
      name,
      members: [req.user],
      admins: [req.user]
    });

    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.joinGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ msg: "Group not found" });

    if (isGroupMember(group, req.user)) {
      return res.status(400).json({ msg: "Already a member" });
    }

    group.members.push(req.user);
    await group.save();

    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user }).select("-__v");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

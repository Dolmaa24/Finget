const mongoose = require("mongoose");

/** A recorded "X paid Y back ₹N" event inside a group. */
const settlementSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", index: true, required: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  note: String,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Settlement", settlementSchema);

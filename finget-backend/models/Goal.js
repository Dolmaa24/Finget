const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: false, index: true },
  name: String,
  targetAmount: Number,
  currentAmount: { type: Number, default: 0 },
  deadline: Date,
  priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
  sortOrder: { type: Number, default: 0 },
  /** Who put money in — powers the per-member breakdown on shared goals. */
  contributions: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      amount: Number,
      date: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model("Goal", goalSchema);

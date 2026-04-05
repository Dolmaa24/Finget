const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  groupId: { type: mongoose.Schema.Types.ObjectId, required: false },
  name: String,
  targetAmount: Number,
  currentAmount: Number,
  deadline: Date,
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  sortOrder: { type: Number, default: 0 }
});

module.exports = mongoose.model("Goal", goalSchema);

const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  emergencyBuffer: Number,
  savingsTarget: Number,
  activeBudget: {
    month: String,
    categories: mongoose.Schema.Types.Mixed,
  },
});

module.exports = mongoose.model("Settings", settingsSchema);

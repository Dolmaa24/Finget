const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  groupId: { type: mongoose.Schema.Types.ObjectId, required: false },
  amount: Number,
  category: String,
  type: String,
  date: { type: Date, default: Date.now },
  splits: [{
    userId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    status: { type: String, enum: ["pending", "settled"], default: "pending" }
  }]
});

module.exports = mongoose.model("Transaction", transactionSchema);

const mongoose = require("mongoose");

const aiConversationSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  groupId: { type: mongoose.Schema.Types.ObjectId, required: false },
  messages: [{
    role: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AIConversation", aiConversationSchema);

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    monthlyIncome: Number,

    /**
     * Personal plan only. A group's Trip Pass lives on the Group document, not
     * here — storing it per-user meant the buyer was the only one upgraded, and
     * two sources of truth for the same grant drift apart within a month.
     */
    entitlements: {
      plan: { type: String, enum: ["free", "plus"], default: "free" },
      planUntil: Date,
    },

    /**
     * Merchant → category, learned from this person's own import corrections.
     * A Map rather than a subdocument because the keys are arbitrary merchant
     * names; see `services/categoryLearner.js`. No ML, and deliberately
     * legible enough that it could be shown to the person as a plain list.
     */
    merchantCategories: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

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

    /**
     * UPI handle, e.g. `someone@okhdfcbank`. Optional, and used for exactly one
     * thing: building the `upi://pay` intent a debtor taps to pay this person
     * back. Finget never holds, moves, or sees the money — the link opens the
     * payer's own UPI app, they approve it there, and the settlement is
     * recorded here only once someone confirms it happened.
     *
     * Visible to co-members of a group where a debt is open, because that is
     * the whole point of it. Anyone who would rather not share it simply
     * leaves it blank and the reminder arrives without a pay button.
     */
    upiId: { type: String, trim: true, maxlength: 128 },

    /**
     * Silent Collector opt-outs, owned by the person being reminded.
     *
     * Deliberately a mute rather than a delete: the debt still exists and is
     * still visible in the app, they just stop being messaged about it. A
     * reminder system that cannot be turned off becomes a reason to leave.
     */
    reminderPrefs: {
      /** Kills every reminder, in every group. */
      mutedAll: { type: Boolean, default: false },
      mutedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

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
     * Free-tier AI coach usage for the current IST month.
     *
     * DELIBERATELY NOT COUNTED FROM `AIConversation`. That collection is the
     * chat history, and `DELETE /api/ai/coach/history` empties it — so a quota
     * derived from it would reset every time someone cleared their chat, which
     * is a one-tap bypass of the only metered cost in the product.
     *
     * `monthKey` is an IST `YYYY-MM` string rather than a rolling window: a
     * calendar month is what the pricing page promises, and a string comparison
     * makes the reset a single equality check with no date arithmetic at read
     * time.
     */
    coachUsage: {
      monthKey: String,
      count: { type: Number, default: 0 },
    },

    /**
     * WhatsApp number, in bare E.164 digits (no `+`, no spaces).
     *
     * ONE REPRESENTATION, ENFORCED. Meta reports `wa_id` as digits, people type
     * `+91 98765 43210`, and a webhook that fails to match a linked number
     * reads to the user as the bot ignoring them. Everything goes through
     * `whatsappService.normalisePhone` before it touches this field.
     *
     * Unique and sparse: one Finget account per number, because the number IS
     * the credential over WhatsApp — there is no password in that channel, so
     * two accounts claiming one number would mean messages authenticating as
     * whichever the query happened to return.
     *
     * Set ONLY after the code has been replied. An unverified number is stored
     * in `phoneLink.pendingPhone`, never here.
     */
    phone: { type: String, unique: true, sparse: true, index: true },
    phoneVerifiedAt: Date,

    /**
     * In-flight number linking.
     *
     * The code is stored HASHED. It is a short-lived credential that grants
     * write access to someone's ledger from a phone number, and a database
     * dump should not hand that over any more than it hands over passwords.
     */
    phoneLink: {
      pendingPhone: String,
      codeHash: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
      requestedAt: Date,
    },

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

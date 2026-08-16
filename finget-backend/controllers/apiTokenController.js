const { mint, listForUser, revoke } = require("../services/apiTokenService");
const { can, CAPABILITIES, explain } = require("../services/entitlements");
const User = require("../models/User");

/** Scopes a user is allowed to mint for themselves, and what each one gates on. */
const MINTABLE = {
  translate: CAPABILITIES.BROWSER_EXTENSION,
};

/**
 * `POST /api/tokens` — mint a scoped token.
 *
 * Requires the app JWT: a token can never mint another token, so a compromised
 * extension credential cannot escalate itself into a fresh one.
 */
exports.create = async (req, res) => {
  try {
    const scope = req.body.scope || "translate";
    const capability = MINTABLE[scope];

    if (!capability) {
      return res.status(400).json({ msg: `Unknown token scope: ${scope}` });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (!can(user, capability)) {
      return res.status(403).json({ msg: explain(capability), capability });
    }

    const { plaintext, doc } = await mint({
      userId: req.user,
      name: req.body.name,
      scope,
    });

    // The only time the plaintext is ever returned. Not logged, not re-readable.
    res.status(201).json({
      token: plaintext,
      apiToken: {
        _id: doc._id,
        name: doc.name,
        scope: doc.scope,
        prefix: doc.prefix,
        createdAt: doc.createdAt,
        expiresAt: doc.expiresAt,
      },
    });
  } catch (err) {
    console.error("Token mint error:", err.message);
    res.status(500).json({ error: "Could not create the token" });
  }
};

exports.list = async (req, res) => {
  try {
    res.json(await listForUser(req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await revoke(req.params.id, req.user);
    if (!doc) return res.status(404).json({ msg: "Token not found" });
    res.json({ msg: "Disconnected", _id: doc._id });
  } catch (err) {
    // A malformed ObjectId in the path is a client error, not a server one.
    if (err.name === "CastError") return res.status(404).json({ msg: "Token not found" });
    res.status(500).json({ error: err.message });
  }
};

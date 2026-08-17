const { mint, listForUser, revoke } = require("../services/apiTokenService");
const { can, CAPABILITIES, explain } = require("../services/entitlements");
const User = require("../models/User");

/** Scopes a user may mint for themselves, and what each one gates on. */
const MINTABLE = {
  translate: CAPABILITIES.BROWSER_EXTENSION,
  deflect: CAPABILITIES.BROWSER_EXTENSION,
  /**
   * Widgets are their own Plus capability, not the extension's — someone may
   * well want the number on their home screen without ever installing a
   * browser extension, and gating the two together would sell them the wrong
   * thing.
   */
  ambient: CAPABILITIES.WIDGETS,
};

/** What the browser extension asks for when nothing is specified. */
const DEFAULT_SCOPES = ["translate", "deflect"];

/**
 * `POST /api/tokens` — mint a scoped token.
 *
 * Requires the app JWT: a token can never mint another token, so a compromised
 * extension credential cannot escalate itself into a fresh one.
 */
exports.create = async (req, res) => {
  try {
    // Accepts `scopes: [...]`, or a single `scope` for callers written against
    // the Milestone 1 shape.
    const requested = Array.isArray(req.body.scopes)
      ? req.body.scopes
      : req.body.scope
        ? [req.body.scope]
        : DEFAULT_SCOPES;

    if (requested.length === 0) {
      return res.status(400).json({ msg: "A token needs at least one scope" });
    }

    const unknown = requested.find((s) => !MINTABLE[s]);
    if (unknown) {
      return res.status(400).json({ msg: `Unknown token scope: ${unknown}` });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Every requested scope must be permitted — a token is only as narrow as
    // its widest grant.
    for (const scope of requested) {
      const capability = MINTABLE[scope];
      if (!can(user, capability)) {
        return res.status(403).json({ msg: explain(capability), capability });
      }
    }

    const { plaintext, doc } = await mint({
      userId: req.user,
      name: req.body.name,
      scopes: requested,
    });

    // The only time the plaintext is ever returned. Not logged, not re-readable.
    res.status(201).json({
      token: plaintext,
      apiToken: {
        _id: doc._id,
        name: doc.name,
        scopes: doc.scopes,
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

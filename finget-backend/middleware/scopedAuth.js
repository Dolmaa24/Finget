const jwtAuth = require("./authMiddleware");
const { verify, touch, PREFIX } = require("../services/apiTokenService");

/**
 * Accepts EITHER the web app's JWT or a scoped API token, on routes that have
 * deliberately opted in to both.
 *
 * This is a factory, not a blanket middleware, because the scope has to be
 * named at the route: `allowApiToken("translate")` on `/finance/translate`
 * means an extension token reaches exactly that endpoint and nothing else. A
 * token that leaks out of a content script cannot list transactions, read
 * goals, or touch a group — those routes still use the plain JWT middleware,
 * and a `fgt_` token fails them at the `jwt.verify` step.
 *
 * Both paths set `req.user` to the user's id string, so controllers and the
 * rate limiter's `byUser` key need no knowledge of which was used.
 */
function allowApiToken(requiredScope) {
  if (!requiredScope) throw new Error("allowApiToken requires an explicit scope");

  return async (req, res, next) => {
    const header = req.header("Authorization") || "";
    const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    // Anything that is not one of ours goes to the JWT path unchanged.
    if (!raw.startsWith(PREFIX)) return jwtAuth(req, res, next);

    try {
      const doc = await verify(raw, requiredScope);
      if (!doc) {
        // Deliberately does not distinguish unknown / revoked / expired /
        // wrong-scope. The extension's response to all four is identical:
        // drop the token and ask the user to reconnect.
        return res.status(401).json({ msg: "Invalid or revoked API token", reconnect: true });
      }

      req.user = String(doc.userId);
      req.apiToken = { id: String(doc._id), scopes: doc.scopes, name: doc.name };

      // Fire-and-forget: a failed bookkeeping write must not fail the request,
      // but it must also not become an unhandled rejection.
      touch(doc).catch((err) => console.error("apiToken touch failed:", err.message));

      return next();
    } catch (err) {
      console.error("API token auth error:", err.message);
      return res.status(500).json({ error: "Could not verify credentials" });
    }
  };
}

module.exports = { allowApiToken };

const router = require("express").Router();
const { sharePublicLimiter } = require("../middleware/rateLimit");
const { getJoinPage, getJoinPreview } = require("../controllers/joinController");

/**
 * Public trip previews. Mounted at `/join`, outside `/api`, for the same
 * reason as `/s`: these return HTML to a browser, not JSON to the app.
 *
 * Together with `/s/:token` these are the ONLY unauthenticated routes in
 * Finget that return user data.
 *
 * `.json` is registered first so `/:previewToken` cannot swallow
 * `abc.json` whole and hand the service a token that does not exist.
 * The pattern matches the 22-char base64url token shape and nothing shorter,
 * which keeps a stray 6-char invite code from ever resolving here.
 */
router.get("/:previewToken([A-Za-z0-9_-]{16,64}).json", sharePublicLimiter, getJoinPreview);
router.get("/:previewToken([A-Za-z0-9_-]{16,64})", sharePublicLimiter, getJoinPage);

module.exports = router;

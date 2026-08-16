const router = require("express").Router();
const { sharePublicLimiter } = require("../middleware/rateLimit");
const { getSharePage, getShareImage } = require("../controllers/shareController");

/**
 * Public share cards. Mounted at `/s` — deliberately outside `/api`, because
 * these return HTML to a browser rather than JSON to the app.
 *
 * The `.png` route is registered first: `/:token` would otherwise swallow
 * `abc.png` whole and hand the renderer a token that does not exist.
 */
router.get("/:token([A-Za-z0-9_-]{16,64}).png", sharePublicLimiter, getShareImage);
router.get("/:token([A-Za-z0-9_-]{16,64})", sharePublicLimiter, getSharePage);

module.exports = router;

const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { shareCreateLimiter } = require("../middleware/rateLimit");
const { create, list, remove } = require("../controllers/shareCardController");

/**
 * Authenticated card management, at `/api/share`.
 *
 * Distinct from the public `/s` mount, which serves the cards themselves to
 * anyone holding a link. Nothing here is reachable with an extension token:
 * these take the plain JWT, so minting a share card is an act the person
 * performs in the app.
 */
router.post("/", auth, shareCreateLimiter, create);
router.get("/", auth, list);
router.delete("/:token", auth, remove);

module.exports = router;

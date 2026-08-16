const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { tokenMintLimiter } = require("../middleware/rateLimit");
const { create, list, remove } = require("../controllers/apiTokenController");

/**
 * Scoped credentials for non-app clients.
 *
 * Every route here takes the plain JWT middleware, never `allowApiToken`.
 * That is the rule that stops an extension token from minting or listing
 * credentials — it can only reach the one endpoint it was scoped for.
 */
router.post("/", auth, tokenMintLimiter, create);
router.get("/", auth, list);
router.delete("/:id", auth, remove);

module.exports = router;

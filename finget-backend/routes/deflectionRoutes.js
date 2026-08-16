const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { allowApiToken } = require("../middleware/scopedAuth");
const { create, resolve, ledger, pending } = require("../controllers/deflectionController");

/**
 * The 48-hour vault and the deflection ledger.
 *
 * `POST /` accepts an extension token as well as the app JWT, because the
 * whole point of the chip's "Think about it" button is that you press it on
 * the product page rather than switching apps. That is a second scope —
 * `deflect` — and it grants only this one route. Reading the ledger and
 * resolving a hold stay JWT-only: deciding is something you do in the app,
 * where the number you are deciding against is visible.
 */
router.post("/", allowApiToken("deflect"), create);
router.post("/:id/resolve", auth, resolve);
router.get("/ledger", auth, ledger);
router.get("/pending", auth, pending);

module.exports = router;

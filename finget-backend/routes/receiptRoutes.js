const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { importLimiter, aiLimiter } = require("../middleware/rateLimit");
const {
  parseScreenshot,
  parseSms,
  commitImport,
  getImportStatus,
} = require("../controllers/importController");

/**
 * Import. This route file previously held a 501 stub describing an OCR
 * architecture that uploaded images to object storage first; that step was
 * deliberately dropped, because not storing the image is the point.
 *
 * `/parse` costs a vision call, so it takes the AI limiter. `/parse-sms` costs
 * nothing but CPU and is the path that always works, so it gets the looser
 * import limiter. Nothing here is reachable with an extension token — import
 * writes to the ledger, and the extension has no business doing that.
 */
router.get("/status", auth, getImportStatus);
router.post("/parse", auth, aiLimiter, parseScreenshot);
router.post("/parse-sms", auth, importLimiter, parseSms);
router.post("/commit", auth, importLimiter, commitImport);

module.exports = router;

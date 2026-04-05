const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

/** OCR-ready hook: accept image upload later; wire to Textract / Vision API. */
router.post("/parse", auth, (req, res) => {
  res.status(501).json({
    msg: "Receipt OCR pipeline not yet connected",
    architecture: {
      step1: "Upload image to object storage",
      step2: "Call OCR (e.g. AWS Textract, Google Vision)",
      step3: "Map lines to Transaction draft { amount, category, merchant, date }",
    },
  });
});

module.exports = router;

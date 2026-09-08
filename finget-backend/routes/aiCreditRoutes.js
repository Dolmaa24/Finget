const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const {
  getDashboard,
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  createCredit,
  deleteCredit,
  getUsageLogs,
  logUsage,
  syncProvider,
  estimateCost,
  getModelCatalog,
} = require("../controllers/aiCreditController");

router.get("/dashboard", auth, getDashboard);
router.get("/providers", auth, getProviders);
router.post("/providers", auth, createProvider);
router.put("/providers/:id", auth, updateProvider);
router.delete("/providers/:id", auth, deleteProvider);

router.post("/credits", auth, createCredit);
router.delete("/credits/:id", auth, deleteCredit);

router.get("/usage", auth, getUsageLogs);
router.post("/usage/log", auth, logUsage);
router.post("/sync/:providerId", auth, syncProvider);

router.post("/estimate-cost", auth, estimateCost);
router.get("/models", auth, getModelCatalog);

module.exports = router;

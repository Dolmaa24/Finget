const router = require("express").Router();
const auth = require("../middleware/authMiddleware");

const {
  addTransaction,
  getTransactions,
  deleteTransaction,
  getCategories,
} = require("../controllers/transactionController");

router.get("/categories", auth, getCategories);
router.post("/", auth, addTransaction);
router.get("/", auth, getTransactions);
router.delete("/:id", auth, deleteTransaction);

module.exports = router;

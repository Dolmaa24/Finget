const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { signup, login, me, updateMe } = require("../controllers/authController");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", auth, me);
router.put("/me", auth, updateMe);

module.exports = router;

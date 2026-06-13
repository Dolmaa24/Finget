const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.signup = async (req, res) => {
  try {
    const { name, email, password, monthlyIncome } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: "Email already registered. Please log in." });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({ name, email, password: hash, monthlyIncome });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Email already registered. Please log in." });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

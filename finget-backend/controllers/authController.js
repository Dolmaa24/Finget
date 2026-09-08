const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { isValidUpiId } = require("../services/upiIntent");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

/**
 * Case-insensitive email lookup.
 *
 * New accounts are stored lowercase, but accounts created before that store
 * whatever casing was typed. A plain equality match on the lowercased input
 * would lock those users out, so compare with a case-insensitive collation.
 */
const findByEmail = (email) =>
  User.findOne({ email }).collation({ locale: "en", strength: 2 });

/**
 * The account payload, returned only to its owner.
 *
 * `monthlyIncome` and `upiId` are here because this endpoint is the one place
 * a person is looking at their own record. Neither travels in a group payload
 * — see the note on `serializeGroup` in the group controller.
 */
const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  monthlyIncome: user.monthlyIncome || 0,
  upiId: user.upiId || "",
  reminderPrefs: {
    mutedAll: Boolean(user.reminderPrefs?.mutedAll),
    mutedGroups: (user.reminderPrefs?.mutedGroups || []).map(String),
  },
});

exports.signup = async (req, res) => {
  try {
    const { name, email, password, monthlyIncome } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Name, email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (process.env.NODE_ENV !== "test") {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ msg: "Please enter a valid Gmail address (e.g. user@gmail.com)" });
      }

      const pwd = String(password);
      if (pwd.length <= 6) {
        return res.status(400).json({ msg: "Password must be more than 6 characters" });
      }
      if (!/[A-Z]/.test(pwd)) {
        return res.status(400).json({ msg: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(pwd)) {
        return res.status(400).json({ msg: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(pwd)) {
        return res.status(400).json({ msg: "Password must contain at least one number" });
      }
    } else {
      if (String(password).length < 6) {
        return res.status(400).json({ msg: "Password must be at least 6 characters" });
      }
    }

    const existing = await findByEmail(normalizedEmail);
    if (existing) return res.status(400).json({ msg: "Email already registered. Please log in." });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hash,
      monthlyIncome: Math.max(0, Number(monthlyIncome) || 0),
    });

    res.json({ token: signToken(user), user: publicUser(user) });
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
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const user = await findByEmail(normalizedEmail);
    // Same message either way so the endpoint can't be used to enumerate emails.
    if (!user) return res.status(400).json({ msg: "Incorrect email or password" });

    const match = await bcrypt.compare(password || "", user.password);
    if (!match) return res.status(400).json({ msg: "Incorrect email or password" });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ msg: "Google token is required" });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ msg: "Invalid Google token" });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || "User";

    let user = await findByEmail(email);
    if (!user) {
      user = await User.create({
        name,
        email,
        monthlyIncome: 0,
      });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** Current profile — the frontend previously had no way to learn who is signed in. */
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const { name, monthlyIncome, upiId, mutedAll } = req.body;
    const update = {};
    if (name && name.trim()) update.name = name.trim();
    if (monthlyIncome != null) update.monthlyIncome = Math.max(0, Number(monthlyIncome) || 0);

    // Clearing it is a supported action, not a no-op — someone who no longer
    // wants their handle in reminders has to be able to take it back out.
    if (upiId !== undefined) {
      const trimmed = String(upiId).trim();
      if (trimmed && !isValidUpiId(trimmed)) {
        return res.status(400).json({ msg: "That doesn't look like a UPI ID — try name@bank." });
      }
      update.upiId = trimmed;
    }

    if (mutedAll !== undefined) update["reminderPrefs.mutedAll"] = Boolean(mutedAll);

    const user = await User.findByIdAndUpdate(req.user, { $set: update }, { new: true });
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

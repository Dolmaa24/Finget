const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

const PASSWORD_REQUIREMENTS_MSG =
  "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, and a number.";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function isValidPassword(password) {
  return PASSWORD_REGEX.test(String(password || ""));
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  EMAIL_REGEX,
  PASSWORD_REQUIREMENTS_MSG,
};
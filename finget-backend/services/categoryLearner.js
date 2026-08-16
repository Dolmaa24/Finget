const User = require("../models/User");
const { normaliseMerchant } = require("./dedupeService");

/**
 * Merchant → category, learned from the person's own corrections.
 *
 * No ML, by design. A map on the user document is enough: the moment someone
 * files "BLUE TOKAI" under Food once, every future Blue Tokai import lands in
 * Food. That is the entire behaviour people actually want, and it is legible
 * enough that they could be shown the map and understand it.
 *
 * Order of authority, strongest first:
 *   1. What THIS person filed this merchant under before.
 *   2. A small built-in seed list of well-known Indian merchants.
 *   3. Nothing — the review sheet asks rather than guessing.
 *
 * Their own history always wins. Someone who books Swiggy under "Groceries"
 * because they order staples is not wrong, and the seed list must never argue.
 */

/**
 * Seeds, matched as substrings of the normalised merchant. Deliberately short:
 * a big list would be wrong more often than it was useful, and every miss is
 * corrected once and then learned permanently.
 */
const SEEDS = [
  [["swiggy", "zomato", "blinkit", "eatsure", "dominos", "mcdonald", "kfc", "starbucks", "tokai", "chaayos", "chai"], "Food"],
  [["bigbasket", "zepto", "dmart", "reliance fresh", "grofers", "instamart", "more retail"], "Groceries"],
  [["uber", "ola", "rapido", "irctc", "indigo", "vistara", "redbus", "metro"], "Transport"],
  [["amazon", "flipkart", "myntra", "nykaa", "ajio", "meesho", "tatacliq"], "Shopping"],
  [["netflix", "spotify", "hotstar", "prime video", "jiocinema", "sonyliv", "youtube", "bookmyshow"], "Entertainment"],
  [["airtel", "jio", "vodafone", "vi ", "bses", "tata power", "adani electricity", "gas", "broadband", "act fibernet"], "Bills"],
  [["apollo", "pharmeasy", "netmeds", "1mg", "practo", "hospital", "clinic", "diagnostic"], "Health"],
  [["udemy", "coursera", "byju", "unacademy", "school", "college", "tuition"], "Education"],
  [["rent", "landlord", "housing society", "maintenance"], "Rent"],
];

/** The seed list's guess, or null. */
function seedCategory(merchant) {
  const name = normaliseMerchant(merchant);
  if (!name) return null;

  for (const [needles, category] of SEEDS) {
    if (needles.some((n) => name.includes(n.trim()))) return category;
  }
  return null;
}

/**
 * The stored map uses normalised merchant names as keys, so "BLUE TOKAI",
 * "Blue Tokai Pvt Ltd" and "bluetokai@okhdfcbank" all resolve to one entry.
 */
function keyFor(merchant) {
  return normaliseMerchant(merchant) || null;
}

/**
 * @param {object} user  the user document (needs `merchantCategories`)
 * @returns {{category: string|null, source: 'learned'|'seed'|null}}
 */
function suggestCategory(user, merchant) {
  const key = keyFor(merchant);
  if (!key) return { category: null, source: null };

  const learned = user?.merchantCategories?.get?.(key) ?? user?.merchantCategories?.[key];
  if (learned) return { category: learned, source: "learned" };

  const seed = seedCategory(merchant);
  if (seed) return { category: seed, source: "seed" };

  return { category: null, source: null };
}

/**
 * Remember what they chose.
 *
 * Called on commit for every row that names a merchant — including rows where
 * they accepted the suggestion, since an accepted seed should become a learned
 * fact and stop depending on the built-in list.
 *
 * One write for the whole batch. Import commits several rows at once and a
 * write per row would turn a single action into a dozen round trips.
 */
async function learnFromCommit(userId, rows) {
  const updates = {};

  for (const row of rows) {
    const key = keyFor(row.merchant);
    if (!key || !row.category) continue;
    updates[`merchantCategories.${key}`] = row.category;
  }

  if (Object.keys(updates).length === 0) return 0;

  await User.updateOne({ _id: userId }, { $set: updates });
  return Object.keys(updates).length;
}

module.exports = { suggestCategory, seedCategory, learnFromCommit, keyFor };

const fs = require("fs");
const path = require("path");

/**
 * The 100× guard.
 *
 * Rupees and paise coexist in this codebase: the database stores rupees,
 * every calculation uses integer paise. That is only safe while conversion
 * happens in exactly two functions. A stray `* 100` or `/ 100` anywhere else
 * is the entire bug class, and this is the one moment it is cheap to catch.
 *
 * Legitimate non-money uses (percentages) opt out with a `not-money` comment
 * on the same line, which makes the exception visible in review.
 */

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["controllers", "services", "models", "routes", "middleware", "utils", "config"];
const ALLOWED_FILES = new Set([path.join("utils", "money.js")]);

function collectJsFiles(dir) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(rel);
    return entry.isFile() && entry.name.endsWith(".js") ? [rel] : [];
  });
}

const HUNDRED_RE = /(\*\s*100(?![\d.])|\/\s*100(?![\d.]))/;

describe("no bare rupee/paise conversions outside money.js", () => {
  const files = SCAN_DIRS.flatMap(collectJsFiles).filter((f) => !ALLOWED_FILES.has(f));

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("finds no unmarked * 100 or / 100", () => {
    const violations = [];

    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!HUNDRED_RE.test(line)) return;
        if (line.includes("not-money")) return; // explicit, reviewed opt-out
        violations.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(
      violations,
      `Convert through toPaise/fromPaise in utils/money.js, or mark the line ` +
        `"// not-money: <why>" if it is genuinely not a currency conversion.\n` +
        violations.join("\n")
    ).toEqual([]);
  });
});

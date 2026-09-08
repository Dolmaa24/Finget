const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { parseBlock } = require("../services/smsParser");
const { extractFromScreenshot } = require("../services/screenshotExtractor");
const { extractFromPdfText } = require("../services/pdfExtractor");
const pdfParse = require("pdf-parse");
const { annotateDuplicates } = require("../services/dedupeService");
const { suggestCategory, learnFromCommit } = require("../services/categoryLearner");
const {
  isVisionConfigured,
  VisionUnavailableError,
  VISION_PROVIDER_NAME,
  VISION_DISABLED_MESSAGE,
} = require("../services/visionClient");
const { resolveScope, handleScopeError } = require("../services/scopeResolver");
const { can, CAPABILITIES, explain } = require("../services/entitlements");
const { fromPaise, toPaise } = require("../utils/money");
const { startOfDayIST, MS_DAY } = require("../utils/time");

/**
 * Import: screenshots and pasted SMS into reviewed transaction drafts.
 *
 * TWO RULES GOVERN EVERYTHING HERE.
 *
 * 1. NOTHING AUTO-COMMITS. Every path ends at a review sheet the person
 *    confirms. Import that writes on its own is import nobody trusts, and a
 *    wrong row silently corrupts safe-to-spend — the number the whole product
 *    rests on.
 *
 * 2. NO IMAGE IS EVER STORED. Uploads live in memory for one request and are
 *    dropped when it returns. Nothing is written to disk, nothing goes to
 *    object storage, and the raw bytes are never logged. The UI states this,
 *    which makes it a promise rather than an implementation detail.
 */

/** Comfortably above a phone screenshot, far below anything worth storing. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** One paste is a few weeks of SMS, not a database dump. */
const MAX_SMS_BLOCK_CHARS = 60000;
const MAX_DRAFTS_PER_IMPORT = 200;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Only recent history can duplicate an import; scanning all of it is waste. */
const DEDUPE_WINDOW_DAYS = 120;

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

async function existingForScope(scope, userId, now = new Date()) {
  const since = new Date(startOfDayIST(now).getTime() - DEDUPE_WINDOW_DAYS * MS_DAY);

  const query = scope.isGroup
    ? { groupId: scope.group._id }
    : { userId, groupId: { $exists: false } };

  return Transaction.find({ ...query, date: { $gte: since } })
    .select("amount date note merchant importReference")
    .lean();
}

/** Adds duplicate flags and a category suggestion to every parsed row. */
function decorate(drafts, existing, user) {
  return annotateDuplicates(drafts, existing).map((row) => {
    const { category, source } = suggestCategory(user, row.merchant);
    return {
      ...row,
      amount: fromPaise(row.amountPaise),
      category,
      categorySource: source,
      /**
       * Which fields the sheet should highlight rather than present as fact.
       * Highlighting beats guessing: a wrong value the person did not notice
       * is worse than an empty one they had to fill.
       */
      needsAttention: [
        !row.date && "date",
        !row.merchant && "merchant",
        !category && "category",
        !row.directionDetected && "type",
      ].filter(Boolean),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Screenshot                                                          */
/* ------------------------------------------------------------------ */

/**
 * `POST /api/receipts/parse` — read one payment screenshot.
 *
 * Extends the Milestone 0 stub that used to 501 here with an architecture
 * note. The architecture it described (upload to object storage, then OCR) is
 * deliberately NOT what was built: storing the image is the part worth
 * avoiding.
 */
exports.parseScreenshot = async (req, res) => {
  try {
    if (!isVisionConfigured()) {
      return res.status(501).json({
        msg: VISION_DISABLED_MESSAGE,
        visionEnabled: false,
        /** The path that always works, named so this reads as a detour. */
        alternative: "sms",
      });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (!can(user, CAPABILITIES.IMPORT_SCREENSHOT)) {
      return res.status(403).json({
        msg: explain(CAPABILITIES.IMPORT_SCREENSHOT),
        capability: CAPABILITIES.IMPORT_SCREENSHOT,
      });
    }

    const { image, mimeType } = readImage(req.body);
    if (image.error) return res.status(image.status).json({ msg: image.error });

    const scope = await resolveScope({
      userId: req.user,
      context: req.body.context,
      groupId: req.body.groupId,
    });

    const result = await extractFromScreenshot(image.buffer, mimeType);
    if (!result.ok) return res.status(422).json({ msg: result.reason });

    const existing = await existingForScope(scope, req.user);
    const rows = decorate([result.draft], existing, user);

    res.json({
      rows,
      source: "screenshot",
      visionProvider: VISION_PROVIDER_NAME,
      /** Surfaced so the UI can state it, not merely imply it. */
      imageDiscarded: true,
    });
  } catch (err) {
    if (err instanceof VisionUnavailableError) {
      return res.status(501).json({ msg: err.message, visionEnabled: false, alternative: "sms" });
    }
    handleScopeError(err, res);
  }
  // `image.buffer` goes out of scope here and is collected. Nothing above
  // writes it anywhere; keep it that way.
};

/**
 * Decodes the upload without ever touching the filesystem.
 *
 * Base64 in a JSON body rather than multipart: it needs no disk-backed upload
 * middleware, which is the usual way an image ends up written to /tmp and
 * forgotten.
 */
function readImage(body) {
  const raw = String(body?.image || "");
  if (!raw) return { image: { error: "An image is required", status: 400 } };

  const match = raw.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  const mimeType = match ? match[1] : String(body?.mimeType || "image/png");
  const base64 = match ? match[2] : raw;

  if (!ALLOWED_MIME.has(mimeType)) {
    return { image: { error: `Unsupported image type: ${mimeType}. Use PNG, JPEG or WebP.`, status: 415 } };
  }

  // Checked before decoding, so an oversized payload never becomes a buffer.
  const approxBytes = Math.floor((base64.length * 3) / 4); // not-money: base64 size ratio
  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      image: {
        error: `That image is too large. Keep it under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
        status: 413,
      },
    };
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) return { image: { error: "That image could not be decoded", status: 400 } };

  return { image: { buffer }, mimeType };
}

/* ------------------------------------------------------------------ */
/* Bulk SMS                                                            */
/* ------------------------------------------------------------------ */

/**
 * `POST /api/receipts/parse-sms` — a pasted block of bank/UPI messages.
 *
 * Entirely deterministic and entirely local: no key, no network call, nothing
 * leaves the server. Bank SMS is among the most sensitive text a person owns,
 * so the ordinary import path never sends it anywhere.
 */
exports.parseSms = async (req, res) => {
  try {
    const block = String(req.body.text || "");
    if (!block.trim()) return res.status(400).json({ msg: "Paste some messages first" });

    if (block.length > MAX_SMS_BLOCK_CHARS) {
      return res.status(413).json({
        msg: `That is a lot of text. Paste up to ${MAX_SMS_BLOCK_CHARS.toLocaleString("en-IN")} characters at a time.`,
      });
    }

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (!can(user, CAPABILITIES.IMPORT_SMS)) {
      return res.status(403).json({
        msg: explain(CAPABILITIES.IMPORT_SMS),
        capability: CAPABILITIES.IMPORT_SMS,
      });
    }

    const scope = await resolveScope({
      userId: req.user,
      context: req.body.context,
      groupId: req.body.groupId,
    });

    const { drafts, unparsed } = parseBlock(block);
    const existing = await existingForScope(scope, req.user);
    const rows = decorate(drafts.slice(0, MAX_DRAFTS_PER_IMPORT), existing, user);

    res.json({
      rows,
      source: "sms",
      /**
       * Shown to the person rather than silently dropped, so a template this
       * parser does not know about is visible and can be reported — rather
       * than quietly losing a transaction.
       */
      unrecognised: unparsed.slice(0, 20),
      truncated: drafts.length > MAX_DRAFTS_PER_IMPORT,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

/* ------------------------------------------------------------------ */
/* PDF Statement                                                       */
/* ------------------------------------------------------------------ */

exports.parsePdf = async (req, res) => {
  try {
    const raw = String(req.body.pdf || "");
    if (!raw) return res.status(400).json({ msg: "A PDF file is required" });

    const match = raw.match(/^data:application\/pdf;base64,(.*)$/s);
    const base64 = match ? match[1] : raw;

    const approxBytes = Math.floor((base64.length * 3) / 4);
    // Limit to 5MB to avoid overwhelming the model with giant files
    if (approxBytes > 5 * 1024 * 1024) {
      return res.status(413).json({ msg: "That PDF is too large. Keep it under 5MB." });
    }

    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) return res.status(400).json({ msg: "That PDF could not be decoded" });

    const user = await User.findById(req.user);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || "";

    if (!text.trim()) {
      return res.status(400).json({ msg: "Could not extract text from that PDF. It might be scanned or image-based." });
    }

    const scope = await resolveScope({
      userId: req.user,
      context: req.body.context,
      groupId: req.body.groupId,
    });

    const result = await extractFromPdfText(text);
    if (!result.ok) return res.status(422).json({ msg: result.reason });

    const existing = await existingForScope(scope, req.user);
    const rows = decorate(result.drafts.slice(0, MAX_DRAFTS_PER_IMPORT), existing, user);

    res.json({
      rows,
      source: "pdf",
      truncated: result.drafts.length > MAX_DRAFTS_PER_IMPORT,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

/* ------------------------------------------------------------------ */
/* Commit                                                              */
/* ------------------------------------------------------------------ */

/**
 * `POST /api/receipts/commit` — write the rows the person confirmed.
 *
 * Takes reviewed rows, not the parse output: the client sends back what the
 * person actually approved, and anything they edited is what gets written.
 */
exports.commitImport = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ msg: "Nothing selected to import" });
    if (rows.length > MAX_DRAFTS_PER_IMPORT) {
      return res.status(413).json({ msg: "Too many rows in one import" });
    }

    const scope = await resolveScope({
      userId: req.user,
      context: req.body.context,
      groupId: req.body.groupId,
    });

    /**
     * Re-checked server-side, not trusted from the client. A stale review
     * sheet — left open while the same rows were imported in another tab — is
     * exactly how a double-import happens, and the whole feature's credibility
     * rests on that never occurring.
     */
    const existing = await existingForScope(scope, req.user);
    const rechecked = annotateDuplicates(
      rows.map((r) => ({
        amountPaise: readAmountPaise(r),
        date: r.date ? new Date(r.date) : null,
        merchant: r.merchant || null,
        reference: r.reference || null,
      })),
      existing
    );

    const docs = [];
    const skipped = [];

    rows.forEach((row, i) => {
      const amountPaise = readAmountPaise(row);
      if (!amountPaise || amountPaise <= 0) {
        skipped.push({ index: i, reason: "invalid amount" });
        return;
      }

      if (rechecked[i]?.duplicateOf) {
        skipped.push({ index: i, reason: "already imported" });
        return;
      }

      docs.push({
        userId: req.user,
        groupId: scope.isGroup ? scope.group._id : undefined,
        paidBy: req.user,
        amount: fromPaise(amountPaise),
        category: row.category || "Other",
        note: row.note || row.merchant || undefined,
        merchant: row.merchant || undefined,
        type: row.type === "income" ? "income" : "expense",
        date: row.date ? new Date(row.date) : new Date(),
        importSource: row.source === "screenshot" ? "screenshot" : "sms",
        importReference: row.reference || undefined,
        splitMode: "none",
        splits: [],
      });
    });

    const created = docs.length > 0 ? await Transaction.insertMany(docs) : [];

    // Learn from what they actually chose, including accepted suggestions.
    const learned = await learnFromCommit(req.user, rows);

    if (scope.isGroup && created.length > 0) {
      const io = req.app.get("io");
      if (io) {
        io.to(`group:${scope.group._id}`).emit("transaction:created", {
          groupId: String(scope.group._id),
        });
      }
    }

    res.status(201).json({
      imported: created.length,
      skipped,
      learnedCategories: learned,
    });
  } catch (err) {
    handleScopeError(err, res);
  }
};

/**
 * Rupees win here, which INVERTS the paise-first precedence every other
 * endpoint uses — deliberately, and this is the one place it is correct.
 *
 * A review row makes the round trip: the server sent `amountPaise` from the
 * parse, and the person edited the rupee field in the sheet. Reading
 * `amountPaise` first meant a corrected amount was silently discarded and the
 * misread original was written instead — the worst possible failure for a
 * feature whose entire promise is "check this before it goes in".
 */
function readAmountPaise(row) {
  /**
   * Keyed on PRESENCE, not on truthiness. A row that carries `amount: ""`
   * is one the person deliberately cleared, and falling back to the parsed
   * paise there would silently refill a field they emptied — the same failure
   * as ignoring an edit, wearing a different hat. Only a genuinely absent
   * `amount` defers to the paise the parse produced.
   */
  if (row && Object.prototype.hasOwnProperty.call(row, "amount")) {
    const rupees = Number(row.amount);
    if (row.amount === "" || row.amount === null || !Number.isFinite(rupees) || rupees <= 0) {
      return null;
    }
    return toPaise(rupees);
  }

  if (Number.isInteger(row?.amountPaise) && row.amountPaise > 0) return row.amountPaise;
  return null;
}

/** `GET /api/receipts/status` — what this server can actually do. */
exports.getImportStatus = (req, res) => {
  res.json({
    /** Always true: the SMS path needs no key and no provider. */
    smsEnabled: true,
    screenshotEnabled: isVisionConfigured(),
    visionProvider: VISION_PROVIDER_NAME,
    message: isVisionConfigured() ? null : VISION_DISABLED_MESSAGE,
    maxImageBytes: MAX_IMAGE_BYTES,
    maxSmsChars: MAX_SMS_BLOCK_CHARS,
    imagesStored: false,
  });
};

exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
exports.MAX_SMS_BLOCK_CHARS = MAX_SMS_BLOCK_CHARS;

const express = require("express");
const cors = require("cors");
const { isAiConfigured } = require("./services/aiClient");

/**
 * Builds the Express app without connecting to Mongo or binding a port, so
 * integration tests can mount it with supertest against an ephemeral database.
 * `server.js` owns the process concerns.
 */
function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header at all: curl, health checks, and — deliberately —
        // top-level browser navigations to /s/:token, which is a public page
        // rather than a cross-origin XHR. See the /s mount below.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);

        /**
         * The browser extension's service worker. Its requests already bypass
         * CORS via `host_permissions`, so refusing the header here would not
         * stop anything — it would only make the response confusing. The real
         * gate is the scoped `fgt_` token, which reaches exactly one endpoint.
         */
        if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
          return callback(null, true);
        }

        /**
         * Unknown origin: send no CORS headers and let the browser refuse the
         * response, which is what CORS is for. Throwing here instead would
         * turn a routine cross-origin probe into a 500 from our own error
         * handler, and would mask genuine server faults in the logs.
         */
        return callback(null, false);
      },
    })
  );
  /**
   * The WhatsApp webhook is mounted ABOVE the global JSON parser, with its own.
   *
   * Meta signs the RAW REQUEST BYTES. Express's parser consumes the stream and
   * keeps only the parsed object, and re-serialising that object produces
   * different bytes — different key order, different whitespace — so every
   * signature would fail. The `verify` hook is the documented way to keep a
   * copy, and it has to run on the first parser that touches the body.
   *
   * The 512 KB cap is generous for a webhook whose largest realistic payload
   * is a batch of text messages.
   */
  app.use(
    "/api/whatsapp",
    express.json({
      limit: "512kb",
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
    require("./routes/whatsappRoutes")
  );

  /**
   * The payment webhook, mounted above the global JSON parser for exactly the
   * same reason as the WhatsApp one: Razorpay signs the RAW bytes, and Express's
   * parser keeps only the parsed object. Re-serialising it produces different
   * bytes and every signature would fail.
   *
   * This one grants paid entitlements, so the raw-body handling is not a detail
   * — it is the whole authentication story for the endpoint.
   */
  app.use(
    "/api/payments",
    express.json({
      limit: "256kb",
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
    require("./routes/paymentRoutes")
  );

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/finance", require("./routes/financeRoutes"));
  app.use("/api/transactions", require("./routes/transactionRoutes"));
  app.use("/api/ai", require("./routes/aiRoutes"));
  app.use("/api/goals", require("./routes/goalRoutes"));
  app.use("/api/groups", require("./routes/groupRoutes"));
  /**
   * Import carries base64 screenshots, which the 1 MB global cap above would
   * reject with an opaque Express error before the controller could return its
   * own friendly one. Raised HERE ONLY — a 9 MB body limit on every route
   * would be an abuse surface on endpoints that need a few hundred bytes.
   * The controller still enforces the real 6 MB image cap.
   */
  app.use("/api/receipts", express.json({ limit: "9mb" }), require("./routes/receiptRoutes"));
  app.use("/api/tokens", require("./routes/apiTokenRoutes"));
  app.use("/api/deflections", require("./routes/deflectionRoutes"));
  app.use("/api/notifications", require("./routes/notificationRoutes"));
  app.use("/api/push", require("./routes/pushRoutes"));
  app.use("/api/share", require("./routes/shareCardRoutes"));

  /**
   * Public share cards — HTML, not JSON, and intentionally unauthenticated.
   * Mounted here so it sits ABOVE the JSON 404 handler below; registering it
   * after would make every share link return `{"msg":"Route not found"}`.
   */
  app.use("/s", require("./routes/shareRoutes"));

  /**
   * The trip preview — the second and last unauthenticated route that returns
   * user data. Same reasoning as `/s` above: mounted here so it sits ABOVE the
   * JSON 404 handler.
   */
  app.use("/join", require("./routes/joinRoutes"));

  app.get("/", (req, res) => res.send("Finget API Running"));

  /** Lets the client show an honest "AI not configured" state instead of guessing. */
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, aiEnabled: isAiConfigured() });
  });

  app.use((req, res) => res.status(404).json({ msg: "Route not found" }));

  // Four args are required for Express to treat this as an error handler.
  app.use((err, req, res, next) => {
    /**
     * A body over the parser's limit is the caller's problem, not a server
     * fault. Express raises it before any route runs, so without this it
     * surfaced as a 500 "Something went wrong" — which reads as broken rather
     * than as "that file is too big", and buries real faults in the logs.
     */
    if (err.type === "entity.too.large" || err.status === 413) {
      return res.status(413).json({ msg: "That upload is too large. Try a smaller image." });
    }

    /** Malformed JSON is likewise a client error. */
    if (err.type === "entity.parse.failed" || (err.status === 400 && err.body !== undefined)) {
      return res.status(400).json({ msg: "That request body could not be read as JSON." });
    }

    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}

module.exports = { createApp };

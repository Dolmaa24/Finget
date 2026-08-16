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
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/finance", require("./routes/financeRoutes"));
  app.use("/api/transactions", require("./routes/transactionRoutes"));
  app.use("/api/ai", require("./routes/aiRoutes"));
  app.use("/api/goals", require("./routes/goalRoutes"));
  app.use("/api/groups", require("./routes/groupRoutes"));
  app.use("/api/receipts", require("./routes/receiptRoutes"));
  app.use("/api/tokens", require("./routes/apiTokenRoutes"));
  app.use("/api/deflections", require("./routes/deflectionRoutes"));
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
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}

module.exports = { createApp };

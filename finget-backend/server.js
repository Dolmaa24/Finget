require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const Group = require("./models/Group");
const { isGroupMember } = require("./utils/groupAuth");
const { isAiConfigured, PROVIDER_NAME, MODEL } = require("./services/aiClient");

if (!process.env.JWT_SECRET) {
  console.error("Fatal: JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();

connectDB();

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/tools with no Origin header (curl, health checks).
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
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

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS },
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("joinGroup", async (payload) => {
    try {
      const { token, groupId } = payload || {};
      if (!token || !groupId) return;

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, decoded.id)) {
        socket.emit("error", { msg: "Not authorized for this group" });
        return;
      }
      socket.userId = decoded.id;
      socket.join(`group:${groupId}`);
      socket.emit("joined", { groupId });
    } catch {
      socket.emit("error", { msg: "Invalid token" });
    }
  });

  socket.on("leaveGroup", (payload) => {
    const groupId = payload?.groupId;
    if (groupId) socket.leave(`group:${groupId}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  if (isAiConfigured()) {
    console.log(`AI provider: ${PROVIDER_NAME} (${MODEL})`);
  } else {
    console.log("Note: no GROQ_API_KEY set — AI coach and AI insights run in degraded mode.");
  }
});

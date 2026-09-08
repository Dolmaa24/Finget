require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const Group = require("./models/Group");
const { isGroupMember } = require("./utils/groupAuth");
const { isAiConfigured, PROVIDER_NAME, MODEL } = require("./services/aiClient");
const { isPaywallEnabled } = require("./services/entitlements");
const { startVaultSweep } = require("./jobs/vaultSweep");
const { startReminderSweep } = require("./jobs/reminderSweep");
const { startPushSweep } = require("./jobs/pushSweep");
const { createApp } = require("./app");

if (!process.env.JWT_SECRET) {
  console.error("Fatal: JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

connectDB();

const app = createApp();

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

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

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  if (isAiConfigured()) {
    console.log(`AI provider: ${PROVIDER_NAME} (${MODEL})`);
  } else {
    console.log("Note: no GROQ_API_KEY set — AI coach and AI insights run in degraded mode.");
  }
  console.log(`Paywall: ${isPaywallEnabled() ? "ENABLED" : "disabled (all gates open)"}`);

  // Lives here rather than in app.js so supertest can mount the app without
  // starting timers.
  startVaultSweep();
  console.log("Vault sweep: running every 15 minutes");

  startReminderSweep();
  console.log("Silent Collector: running hourly");

  const { startAiCreditSweep } = require("./jobs/aiCreditSweep");
  startAiCreditSweep();
  console.log("AI Credit Engine: sweep running hourly");

  if (startPushSweep()) console.log("Web Push: sweeping every 15 minutes");
});

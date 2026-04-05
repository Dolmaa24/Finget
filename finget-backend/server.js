require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const Group = require("./models/Group");
const { isGroupMember } = require("./utils/groupAuth");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/finance", require("./routes/financeRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/goals", require("./routes/goalRoutes"));
app.use("/api/groups", require("./routes/groupRoutes"));
app.use("/api/receipts", require("./routes/receiptRoutes"));

app.get("/", (req, res) => {
  res.send("Finget API Running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("joinGroup", async (payload) => {
    try {
      const token = payload?.token;
      const groupId = payload?.groupId;
      if (!token || !groupId) return;

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      const group = await Group.findById(groupId);
      if (!group || !isGroupMember(group, userId)) {
        socket.emit("error", { msg: "Not authorized for this group" });
        return;
      }
      socket.userId = userId;
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

server.listen(PORT, () => console.log(`Server running on ${PORT}`));

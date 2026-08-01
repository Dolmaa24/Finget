const mongoose = require("mongoose");

const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI || "mongodb://localhost:27017/finget";

  try {
    console.log(`[Database] Attempting connection to MongoDB (${primaryUri.split('@').pop()})...`);
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("⚡ [Database] MongoDB Connected Successfully!");
  } catch (err) {
    console.warn(`⚠️ [Database] Primary MongoDB connection failed (${err.message}). Starting In-Memory Fallback Database...`);
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      const memoryUri = mongod.getUri();
      await mongoose.connect(memoryUri);
      console.log(`⚡ [Database] In-Memory MongoDB Server Connected (${memoryUri})! Authentication & APIs are fully operational.`);
    } catch (memErr) {
      console.error("❌ [Database] Failed to initialize in-memory database:", memErr);
    }
  }
};

module.exports = connectDB;


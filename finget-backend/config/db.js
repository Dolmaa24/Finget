const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/finget";
    console.log(`Connecting to MongoDB at: ${uri}...`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log("MongoDB Connected");
  } catch (err) {
    console.log("Local MongoDB not detected. Starting in-memory MongoDB server as fallback...");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      console.log(`In-memory MongoDB started at: ${mongoUri}`);
      await mongoose.connect(mongoUri);
      console.log("Connected to in-memory MongoDB");
    } catch (fallbackErr) {
      console.error("Failed to start or connect to in-memory MongoDB:");
      console.error(fallbackErr);
      process.exit(1);
    }
  }
};

module.exports = connectDB;


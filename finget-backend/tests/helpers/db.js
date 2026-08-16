const mongoose = require("mongoose");

/**
 * Test database.
 *
 * Set `MONGO_TEST_URI` to point at a real Mongo and skip mongodb-memory-server
 * entirely — useful in CI images, on locked-down networks, and anywhere the
 * ~170 MB binary download is unwelcome. Set `MONGOMS_DOWNLOAD_DIR` (see
 * .env.example) so that binary is cached once per machine, not per clone.
 */

let memoryServer = null;

async function connectTestDb() {
  const externalUri = process.env.MONGO_TEST_URI;

  if (externalUri) {
    await mongoose.connect(externalUri);
    return { uri: externalUri, inMemory: false };
  }

  const { MongoMemoryServer } = require("mongodb-memory-server");
  memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();
  await mongoose.connect(uri);
  return { uri, inMemory: true };
}

async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

async function disconnectTestDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectTestDb, clearTestDb, disconnectTestDb };

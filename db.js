const mongoose = require("mongoose");

// Serverless functions reuse a warm container between requests, so the
// connection is cached at module level and reused rather than reopened on
// every invocation. Locally this simply connects once at startup.
let connectionPromise = null;

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      return Promise.reject(new Error("MONGODB_URI is not set — check your .env file"));
    }

    connectionPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 15000,
        // Serverless containers are many and short-lived; a small pool each
        // keeps well clear of the cluster's connection limit.
        maxPoolSize: 5,
      })
      .then((m) => {
        console.log(`MongoDB connected → database "${m.connection.name}"`);
        return m.connection;
      })
      .catch((err) => {
        // Clear the cache so a later invocation can retry rather than being
        // stuck with a permanently rejected promise.
        connectionPromise = null;
        throw err;
      });
  }

  return connectionPromise;
}

// The session store shares this one connection instead of opening its own.
function clientPromise() {
  return connectDB().then((conn) => conn.getClient());
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err.message);
});

module.exports = connectDB;
module.exports.clientPromise = clientPromise;

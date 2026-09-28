const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set — check your .env file");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`MongoDB connected → database "${mongoose.connection.name}"`);

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });
}

module.exports = connectDB;

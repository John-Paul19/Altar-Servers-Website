const serverless = require("serverless-http");
const app = require("../../app");
const connectDB = require("../../db");

const handler = serverless(app);

exports.handler = async (event, context) => {
  // Without this the function waits for the pooled MongoDB connection to go
  // idle before returning, which would add seconds to every response.
  context.callbackWaitsForEmptyEventLoop = false;

  // Depending on how the request arrives, Netlify may hand over either the
  // original "/api/..." path or the rewritten "/.netlify/functions/api/...".
  // Express only has routes for the former, so normalise it.
  if (event.path) {
    const stripped = event.path.replace(/^\/\.netlify\/functions\/api/, "");
    event.path = stripped.startsWith("/api") ? stripped : `/api${stripped}`;
  }

  try {
    await connectDB();
  } catch (err) {
    console.error("Database unavailable:", err.message);
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "The database is unavailable. Please try again shortly." }),
    };
  }

  return handler(event, context);
};

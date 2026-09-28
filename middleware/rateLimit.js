const rateLimit = require("express-rate-limit");

// Serverless invocations have no socket, so req.ip can be undefined and the
// default key generator throws. Netlify forwards the real client address in
// these headers instead.
function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (
    req.ip ||
    req.headers["x-nf-client-connection-ip"] ||
    forwarded ||
    "unknown"
  );
}

// NOTE: the counters live in memory, so each warm container keeps its own.
// That is weaker than a shared store — acceptable for a handful of admins,
// but worth moving into MongoDB if this ever needs to be airtight.
function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    // We supply our own key, so the built-in IP check is not meaningful here.
    validate: { ip: false, keyGeneratorIpFallback: false },
  });
}

module.exports = { createLimiter, clientKey };

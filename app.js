// Builds the Express app. Deliberately does not call listen() or connect to
// MongoDB, so the same app can be started by server.js locally and wrapped as
// a Netlify function in production.
require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
// connect-mongo v6 is ESM-first; under CommonJS the store lives on .default
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");

const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const rosterRoutes = require("./routes/roster");
const announcementRoutes = require("./routes/announcements");

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is not set — check your environment variables");
}

const isProduction = process.env.NODE_ENV === "production";

const app = express();

// Required for secure cookies and correct client IPs behind a host's proxy.
app.set("trust proxy", 1);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: connectDB.clientPromise(),
      collectionName: "sessions",
      ttl: 60 * 60 * 8, // 8 hours, matching the cookie
    }),
    cookie: {
      httpOnly: true, // not readable by JavaScript, so XSS can't steal it
      sameSite: "lax", // blocks the cookie on cross-site form posts (CSRF)
      secure: isProduction, // HTTPS-only in production; off locally so http://localhost works
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/roster", rosterRoutes);
app.use("/api/announcements", announcementRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// In production Netlify's CDN serves these directly and only /api/* reaches
// the function, so this matters for local development.
app.use(express.static(path.join(__dirname, "public")));

module.exports = app;

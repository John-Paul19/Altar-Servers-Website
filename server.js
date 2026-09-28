require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
// connect-mongo v6 is ESM-first; under CommonJS the store lives on .default
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");

const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const rosterRoutes = require("./routes/roster");
const announcementRoutes = require("./routes/announcements");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is not set — check your .env file");
  process.exit(1);
}

// Required for secure cookies and correct client IPs behind a host's proxy
// (Render, Railway, etc). Harmless in local development.
app.set("trust proxy", 1);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
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
app.use("/api/roster", rosterRoutes);
app.use("/api/announcements", announcementRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use(express.static(path.join(__dirname, "public")));

// Connect first, then listen — so the server never starts up in a state
// where it serves pages but cannot read or write any data.
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed — could not connect to MongoDB");
    console.error(err.message);
    process.exit(1);
  });

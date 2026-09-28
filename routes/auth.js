const express = require("express");
const rateLimit = require("express-rate-limit");
const Admin = require("../models/Admin");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// Slows down password guessing against a publicly reachable login form.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() })
      .select("+passwordHash");

    // An invited account has no password yet, so it must not be able to sign in
    // until its owner has been through the emailed link.
    const valid =
      admin && admin.canSignIn() && (await admin.verifyPassword(String(password)));
    if (!valid) {
      // Same response whether the account is missing, not yet activated, or the
      // password is wrong — so the form can't be used to discover which emails
      // are registered.
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // New session id on login, so a pre-existing cookie can't be reused
    // to ride along on the authenticated session (session fixation).
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate failed:", err.message);
        return res.status(500).json({ error: "Could not start session" });
      }
      req.session.adminId = admin._id.toString();
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("Session save failed:", saveErr.message);
          return res.status(500).json({ error: "Could not start session" });
        }
        res.json({ id: admin._id, name: admin.name, email: admin.email });
      });
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.post("/logout", (req, res) => {
  if (!req.session) return res.json({ ok: true });

  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err.message);
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// Called on every page load to decide whether to show the admin controls.
// Being signed out is a normal answer here, not an error — returning 401 would
// make browsers log a red console error on every visit by an ordinary visitor.
router.get("/me", async (req, res) => {
  if (!req.session || !req.session.adminId) {
    return res.json({ admin: null });
  }

  try {
    const admin = await Admin.findById(req.session.adminId);
    if (!admin) {
      // Account deleted while a session was still live.
      return req.session.destroy(() => res.json({ admin: null }));
    }
    res.json({ admin: { id: admin._id, name: admin.name, email: admin.email } });
  } catch (err) {
    console.error("/me error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;

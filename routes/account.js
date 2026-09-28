const express = require("express");
const Admin = require("../models/Admin");
const { sendPasswordReset, isConfigured } = require("../mailer");
const { createLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const MIN_PASSWORD_LENGTH = 10;

// Stops the reset form being used to spray email at someone's inbox.
const forgotLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Please try again in 15 minutes.",
});

const tokenLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts. Please try again in 15 minutes.",
});

// Looks up an account by the raw token from the emailed link. Returns null for
// anything invalid, unknown or expired — the caller must not distinguish
// between those cases in its response.
async function findByToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) return null;

  const admin = await Admin.findOne({
    tokenHash: Admin.hashToken(rawToken),
    tokenExpiresAt: { $gt: new Date() },
  }).select("+tokenHash");

  return admin || null;
}

// The set-password page calls this on load to decide what to render.
router.get("/setup/:token", tokenLimiter, async (req, res) => {
  try {
    const admin = await findByToken(req.params.token);
    if (!admin) {
      return res.status(404).json({ error: "This link is invalid or has expired." });
    }
    res.json({
      valid: true,
      name: admin.name,
      email: admin.email,
      purpose: admin.tokenPurpose,
    });
  } catch (err) {
    console.error("GET /api/account/setup:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.post("/setup/:token", tokenLimiter, async (req, res) => {
  const password = String((req.body && req.body.password) || "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  try {
    const admin = await findByToken(req.params.token);
    if (!admin) {
      return res.status(404).json({ error: "This link is invalid or has expired." });
    }

    admin.passwordHash = await Admin.hashPassword(password);
    admin.status = "active";
    // Single use: consuming the link destroys it.
    admin.clearToken();
    await admin.save();

    res.json({ ok: true, email: admin.email });
  } catch (err) {
    console.error("POST /api/account/setup:", err.message);
    res.status(500).json({ error: "Could not set your password" });
  }
});

router.post("/forgot", forgotLimiter, async (req, res) => {
  const email = String((req.body && req.body.email) || "").toLowerCase().trim();

  // Always the same answer, whether or not the account exists — otherwise this
  // form becomes a way to discover who has an account.
  const genericResponse = {
    ok: true,
    message: "If that email belongs to an administrator, a reset link is on its way.",
  };

  if (!email) return res.json(genericResponse);

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.json(genericResponse);

    if (!isConfigured) {
      console.error("Password reset requested but email is not configured");
      return res.status(503).json({
        error: "Email is not configured on the server. Contact the site administrator.",
      });
    }

    const rawToken = admin.issueToken("reset");
    await admin.save();

    try {
      await sendPasswordReset({ to: admin.email, name: admin.name, token: rawToken });
    } catch (mailErr) {
      console.error("Reset email failed:", mailErr.message);
      return res.status(502).json({ error: "Could not send the reset email. Please try again later." });
    }

    res.json(genericResponse);
  } catch (err) {
    console.error("POST /api/account/forgot:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;

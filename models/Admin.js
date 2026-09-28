const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 24;

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },

    // Not required: an invited account exists before its owner has chosen a
    // password. Logging in is gated on status, not on this field.
    passwordHash: { type: String, select: false },

    status: {
      type: String,
      enum: ["invited", "active"],
      default: "invited",
    },

    // The emailed link carries the raw token; only its hash is stored, so a
    // leaked database cannot be used to claim a pending invite or reset.
    tokenHash: { type: String, select: false },
    tokenPurpose: { type: String, enum: ["invite", "reset", null], default: null },
    tokenExpiresAt: { type: Date },
  },
  { timestamps: true }
);

adminSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.tokenHash;
    return ret;
  },
});

adminSchema.statics.hashPassword = function (plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

// Tokens are 32 random bytes, so a fast hash is the right tool — bcrypt's key
// stretching exists to slow down guessing of low-entropy human passwords, and
// buys nothing against a value this large.
adminSchema.statics.hashToken = function (rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
};

adminSchema.methods.issueToken = function (purpose) {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  this.tokenHash = adminSchema.statics.hashToken(raw);
  this.tokenPurpose = purpose;
  this.tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  return raw;
};

adminSchema.methods.clearToken = function () {
  this.tokenHash = undefined;
  this.tokenPurpose = null;
  this.tokenExpiresAt = undefined;
};

// Requires the document to have been loaded with .select("+passwordHash")
adminSchema.methods.verifyPassword = function (plainPassword) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, this.passwordHash);
};

adminSchema.methods.canSignIn = function () {
  return this.status === "active" && Boolean(this.passwordHash);
};

const Admin = mongoose.model("Admin", adminSchema);

Admin.TOKEN_TTL_HOURS = TOKEN_TTL_HOURS;

module.exports = Admin;

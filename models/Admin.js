const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

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
    // select:false keeps the hash out of ordinary query results, so it
    // cannot leak through an API response by accident.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

adminSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

adminSchema.statics.hashPassword = function (plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

// Requires the document to have been loaded with .select("+passwordHash")
adminSchema.methods.verifyPassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model("Admin", adminSchema);

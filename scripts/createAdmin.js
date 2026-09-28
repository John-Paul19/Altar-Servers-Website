require("dotenv").config({ quiet: true });

const readline = require("readline");
const mongoose = require("mongoose");
const connectDB = require("../db");
const Admin = require("../models/Admin");

const MIN_PASSWORD_LENGTH = 10;

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, (a) => resolve(a.trim())));
}

// Echoes nothing while the password is typed.
function askHidden(rl, query) {
  return new Promise((resolve) => {
    let muted = false;
    const original = rl._writeToOutput;
    rl._writeToOutput = function (str) {
      if (!muted) original.call(rl, str);
    };
    rl.question(query, (answer) => {
      rl._writeToOutput = original;
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error("This script must be run in an interactive terminal.");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await connectDB();
    console.log("\n=== Create an admin account ===\n");

    const name = await ask(rl, "Full name       : ");
    if (!name) throw new Error("Name is required");

    const email = (await ask(rl, "Email           : ")).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("That is not a valid email address");

    const existing = await Admin.findOne({ email });
    if (existing) throw new Error(`An admin with the email ${email} already exists`);

    const password = await askHidden(rl, "Password        : ");
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const confirm = await askHidden(rl, "Confirm password: ");
    if (password !== confirm) throw new Error("Passwords do not match");

    const passwordHash = await Admin.hashPassword(password);
    const admin = await Admin.create({ name, email, passwordHash });

    console.log("\nAdmin account created:");
    console.log(`  name  : ${admin.name}`);
    console.log(`  email : ${admin.email}`);
    console.log(`  id    : ${admin._id}`);
    console.log("\nYou can now sign in at /login.html\n");
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
})();

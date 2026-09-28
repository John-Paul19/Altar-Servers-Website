// Creates an administrator account and emails them a one-time link to choose
// their own password. Whoever runs this never learns the password.
require("dotenv").config({ quiet: true });

const readline = require("readline");
const mongoose = require("mongoose");
const connectDB = require("../db");
const Admin = require("../models/Admin");
const { sendInvite, isConfigured, appUrl } = require("../mailer");

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, (a) => resolve(a.trim())));
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
    console.log("\n=== Invite an administrator ===\n");

    const name = await ask(rl, "Full name : ");
    if (!name) throw new Error("Name is required");

    const email = (await ask(rl, "Email     : ")).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("That is not a valid email address");

    const existing = await Admin.findOne({ email });
    if (existing) {
      throw new Error(
        existing.status === "invited"
          ? `${email} has already been invited but has not set a password yet. Use "npm run resend-invite" to send a fresh link.`
          : `An active admin with the email ${email} already exists`
      );
    }

    const admin = new Admin({ name, email, status: "invited" });
    const rawToken = admin.issueToken("invite");
    await admin.save();

    const link = `${appUrl()}/set-password.html?token=${rawToken}`;

    console.log(`\nAccount created for ${admin.name} <${admin.email}>`);
    console.log(`Status: invited (cannot sign in until a password is set)\n`);

    if (!isConfigured) {
      console.log("Email is not configured (EMAIL_USER / EMAIL_PASS missing).");
      console.log("Send them this link yourself — it expires in 24 hours:\n");
      console.log(`  ${link}\n`);
    } else {
      try {
        await sendInvite({ to: admin.email, name: admin.name, token: rawToken });
        console.log(`Invitation emailed to ${admin.email}`);
        console.log("The link expires in 24 hours and can only be used once.\n");
      } catch (mailErr) {
        console.log(`Could not send the email: ${mailErr.message}`);
        console.log("The account was still created. Send them this link instead:\n");
        console.log(`  ${link}\n`);
      }
    }
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  }
})();

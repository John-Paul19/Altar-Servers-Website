// Issues a fresh invite link for someone who never used theirs, or whose link
// expired. The old link stops working the moment a new one is issued.
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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    await connectDB();

    const pending = await Admin.find({ status: "invited" }).select("name email tokenExpiresAt").lean();
    if (!pending.length) {
      console.log("\nThere are no pending invitations.\n");
      return;
    }

    console.log("\nPending invitations:");
    pending.forEach((a) => {
      const expired = !a.tokenExpiresAt || a.tokenExpiresAt < new Date();
      console.log(`  ${a.email}  (${a.name})  ${expired ? "— link expired" : "— link still valid"}`);
    });

    const email = (await ask(rl, "\nEmail to resend to: ")).toLowerCase();
    const admin = await Admin.findOne({ email, status: "invited" });
    if (!admin) throw new Error(`No pending invitation for ${email}`);

    const rawToken = admin.issueToken("invite");
    await admin.save();
    const link = `${appUrl()}/set-password.html?token=${rawToken}`;

    if (!isConfigured) {
      console.log("\nEmail is not configured. Send them this link — it expires in 24 hours:\n");
      console.log(`  ${link}\n`);
    } else {
      try {
        await sendInvite({ to: admin.email, name: admin.name, token: rawToken });
        console.log(`\nA fresh invitation has been emailed to ${admin.email}.`);
        console.log("Any previous link for this account no longer works.\n");
      } catch (mailErr) {
        console.log(`\nCould not send the email: ${mailErr.message}`);
        console.log("Send them this link instead:\n");
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

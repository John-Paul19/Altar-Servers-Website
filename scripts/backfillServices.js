// One-off migration: gives every pre-existing roster entry a service, inferred
// from its day and time. Additive and idempotent — entries that already have a
// service are left alone, so it is safe to run more than once.
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../db");
const RosterEntry = require("../models/RosterEntry");

function inferService(entry) {
  const isPM = /PM$/i.test(String(entry.time).trim());

  if (entry.day === "Sunday" && !isPM) {
    // Sunday's two morning celebrations are the parish's first and second Mass.
    if (/^6:/.test(entry.time)) return "First Mass";
    if (/^9:/.test(entry.time)) return "Second Mass";
  }

  return isPM ? "Evening Mass" : "Morning Mass";
}

(async () => {
  try {
    await connectDB();

    const pending = await RosterEntry.find({
      $or: [{ service: { $exists: false } }, { service: null }, { service: "" }],
    }).lean();

    if (!pending.length) {
      console.log("\nNothing to migrate — every entry already has a service.\n");
      await mongoose.disconnect();
      return;
    }

    const counts = {};
    const operations = pending.map((entry) => {
      const service = inferService(entry);
      counts[service] = (counts[service] || 0) + 1;
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { service, serviceLabel: "" } },
        },
      };
    });

    await RosterEntry.bulkWrite(operations);

    console.log(`\nMigrated ${pending.length} entries:`);
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([service, count]) => console.log(`  ${String(count).padStart(3)}  ${service}`));
    console.log("\nAll inferred from day and time — edit any that are wrong in the UI.\n");

    await mongoose.disconnect();
  } catch (err) {
    console.error(`\nMigration failed: ${err.message}\n`);
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
})();

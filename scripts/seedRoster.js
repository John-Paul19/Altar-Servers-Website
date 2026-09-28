// One-off migration: moves the roster and announcements that were hardcoded in
// roaster.html into MongoDB, so the page has real data to render on day one.
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../db");
const RosterEntry = require("../models/RosterEntry");
const Announcement = require("../models/Announcement");
const { startOfWeek, formatWeekRange, toWeekKey } = require("../lib/weeks");

const ROSTER = [
  ["Sunday", "6:00 AM", "Thurifer", "Iguegbe Enyiolisa"],
  ["Sunday", "6:00 AM", "Bolt Boy", "Peter Okafor"],
  ["Sunday", "6:00 AM", "Cross Bearer", "Chidi Nwankwo"],
  ["Sunday", "6:00 AM", "MC", "Chibuike Eze"],
  ["Sunday", "6:00 AM", "Acolyte", "Achioya Victor"],
  ["Sunday", "6:00 AM", "Acolyte", "Ohaeri Wisdom"],
  ["Sunday", "9:00 AM", "Thurifer", "Daniel Okafor"],
  ["Sunday", "9:00 AM", "Bolt Boy", "Samuel Udoh"],
  ["Sunday", "9:00 AM", "Cross Bearer", "Michael Ugochukwu"],
  ["Sunday", "9:00 AM", "MC", "Anyanwu Davis"],
  ["Sunday", "9:00 AM", "Acolyte", "Chrisantus Damian"],
  ["Sunday", "9:00 AM", "Acolyte", "Anamege Samuel"],

  ["Monday", "6:00 AM", "MC", "Tunde Ajayi"],
  ["Monday", "6:00 AM", "Acolyte", "David Obi"],
  ["Monday", "6:30 PM", "MC", "Samuel Adeyemi"],
  ["Monday", "6:30 PM", "Acolyte", "Kolawole Bello"],

  ["Tuesday", "6:00 AM", "MC", "Festus Ikechi"],
  ["Tuesday", "6:00 AM", "Acolyte", "Blessing Okafor"],
  ["Tuesday", "6:30 PM", "MC", "Emeka Nwosu"],
  ["Tuesday", "6:30 PM", "Acolyte", "Ifeanyi Nkoli"],

  ["Wednesday", "6:00 AM", "MC", "Chinedu Okonkwo"],
  ["Wednesday", "6:00 AM", "Acolyte", "Obinna Ugwu"],
  ["Wednesday", "6:30 PM", "MC", "Nonso Anyanwu"],
  ["Wednesday", "6:30 PM", "Acolyte", "Chisom Ekene"],

  ["Thursday", "6:00 AM", "MC", "Victor Nnadi"],
  ["Thursday", "6:00 AM", "Acolyte", "Kenechukwu Mba"],
  ["Thursday", "6:30 PM", "MC", "Ikechukwu Njoku"],
  ["Thursday", "6:30 PM", "Acolyte", "Amarachi Okeke"],

  ["Friday", "6:00 AM", "MC", "Chibueze Okeke"],
  ["Friday", "6:00 AM", "Acolyte", "Onyekachi Obi"],
  ["Friday", "6:30 PM", "MC", "Sopuruchukwu Ndukwu"],
  ["Friday", "6:30 PM", "Acolyte", "Ifeoluwa Adebayo"],

  ["Saturday", "7:00 AM", "Acolyte", "Kelechi Uche"],
  ["Saturday", "7:00 AM", "Acolyte", "Gideon Mwangi"],
  ["Saturday", "7:00 AM", "Cross Bearer", "Tunde Adeyemi"],
  ["Saturday", "7:00 AM", "MC", "Tunde Adeyemi"],
];

const ANNOUNCEMENTS = [
  {
    title: "Training Session This Saturday",
    body: "All new and experienced servers are invited to our monthly training session on the first Saturday of the month at 12:00 PM in the sacristy. Topics include liturgical procedures and proper protocols.",
  },
  {
    title: "Funeral Services Available",
    body: "If you'd like to be placed on the standby roster for funeral services, please contact the sacristy or speak with the Altar Server Coordinator. Serving at funerals is a profound act of mercy and service.",
  },
  {
    title: "Weekly Meeting Reminder",
    body: "All altar servers are expected to attend our weekly meetings held on Sundays immediately after the 9:00 AM Mass in the parish hall. Announcements, formation, and updates on liturgical duties will be discussed.",
  },
  {
    title: "Advent Season Extra Servers Needed",
    body: "We are looking for volunteers to assist during our special Advent services. Sign-up sheets are posted in the parish hall and sacristy. Contact the coordinator if you have any questions.",
  },
];

(async () => {
  try {
    await connectDB();

    const weekOf = startOfWeek(new Date());
    const existing = await RosterEntry.countDocuments({ weekOf });

    if (existing > 0) {
      console.log(
        `\nA roster already exists for ${formatWeekRange(weekOf)} (${existing} entries).`
      );
      console.log("Nothing seeded — delete that week first if you want to re-seed.\n");
    } else {
      await RosterEntry.insertMany(
        ROSTER.map(([day, time, post, serverName]) => ({
          weekOf,
          day,
          time,
          post,
          serverName,
          published: true,
        }))
      );
      console.log(`\nSeeded ${ROSTER.length} roster entries`);
      console.log(`  week    : ${formatWeekRange(weekOf)}`);
      console.log(`  key     : ${toWeekKey(weekOf)}`);
      console.log(`  status  : published`);
    }

    const announcementCount = await Announcement.countDocuments();
    if (announcementCount > 0) {
      console.log(`\n${announcementCount} announcements already exist — skipped.\n`);
    } else {
      await Announcement.insertMany(ANNOUNCEMENTS);
      console.log(`\nSeeded ${ANNOUNCEMENTS.length} announcements\n`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(`\nSeeding failed: ${err.message}\n`);
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
})();

const mongoose = require("mongoose");

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const POSTS = [
  "Thurifer",
  "Bolt Boy",
  "Cross Bearer",
  "MC",
  "Acolyte",
  "Decoration",
];

// "Other" is the escape hatch: the occasion is then typed into serviceLabel,
// so one-off celebrations don't require a schema change.
const SERVICES = [
  "First Mass",
  "Second Mass",
  "Children Mass",
  "Benediction",
  "Adoration",
  "Wedding Mass",
  "Funeral Mass",
  "Morning Mass",
  "Evening Mass",
  "Other",
];

const rosterEntrySchema = new mongoose.Schema(
  {
    // Midnight UTC on the Sunday that begins the week this entry belongs to.
    weekOf: { type: Date, required: true },
    day: { type: String, required: true, enum: DAYS },
    time: { type: String, required: true, trim: true }, // e.g. "6:00 AM"
    service: { type: String, required: true, enum: SERVICES, default: "Morning Mass" },

    // Only meaningful when service is "Other" — holds the occasion's own name.
    serviceLabel: { type: String, trim: true, default: "", maxlength: 80 },

    post: { type: String, required: true, enum: POSTS },

    // Deliberately not required: a draft week is filled in gradually, so a
    // slot may sit blank while it is being built. Publishing checks for blanks.
    serverName: { type: String, trim: true, default: "" },

    // Drafts are invisible to the public until an admin publishes the week.
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rosterEntrySchema.index({ weekOf: 1, day: 1 });
rosterEntrySchema.index({ published: 1, weekOf: -1 });

// What the service is actually called on screen.
rosterEntrySchema.methods.displayService = function () {
  return this.service === "Other" && this.serviceLabel
    ? this.serviceLabel
    : this.service;
};

const RosterEntry = mongoose.model("RosterEntry", rosterEntrySchema);

RosterEntry.DAYS = DAYS;
RosterEntry.POSTS = POSTS;
RosterEntry.SERVICES = SERVICES;

module.exports = RosterEntry;

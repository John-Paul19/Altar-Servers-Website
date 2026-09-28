const express = require("express");
const mongoose = require("mongoose");
const RosterEntry = require("../models/RosterEntry");
const requireAdmin = require("../middleware/requireAdmin");
const {
  nextWeek,
  toWeekKey,
  parseWeekKey,
  formatWeekRange,
  dateForDay,
  DAY_NAMES,
} = require("../lib/weeks");

const router = express.Router();

const isAdmin = (req) => Boolean(req.session && req.session.adminId);

// "6:00 AM" -> 360, so masses sort chronologically rather than alphabetically
// (a plain string sort would put "10:00 AM" before "6:00 AM").
function timeToMinutes(time) {
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  let hours = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(m[2]);
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const dayDiff = DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    const timeDiff = timeToMinutes(a.time) - timeToMinutes(b.time);
    if (timeDiff !== 0) return timeDiff;
    return RosterEntry.POSTS.indexOf(a.post) - RosterEntry.POSTS.indexOf(b.post);
  });
}

// What a service is actually called on screen.
function serviceLabelOf(entry) {
  return entry.service === "Other" && entry.serviceLabel
    ? entry.serviceLabel
    : entry.service;
}

// Entries sharing a service, occasion name and time are one celebration.
function groupByService(dayEntries) {
  const groups = new Map();

  for (const entry of dayEntries) {
    const key = `${entry.service}|${entry.serviceLabel || ""}|${entry.time}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        service: entry.service,
        serviceLabel: entry.serviceLabel || "",
        label: serviceLabelOf(entry),
        time: entry.time,
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  }

  return [...groups.values()].sort(
    (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
  );
}

// Shapes one week into what the page needs: the heading, each day with its
// calendar date, and that day's celebrations with their assignments.
function buildWeekPayload(weekOf, entries) {
  const sorted = sortEntries(entries.map((e) => (e.toObject ? e.toObject() : e)));
  const published = sorted.length > 0 && sorted.every((e) => e.published);

  const days = DAY_NAMES.map((day) => {
    const dayEntries = sorted.filter((e) => e.day === day);
    return {
      day,
      date: dateForDay(weekOf, day),
      entries: dayEntries,
      services: groupByService(dayEntries),
    };
  }).filter((d) => d.entries.length > 0);

  return {
    weekOf: toWeekKey(weekOf),
    label: formatWeekRange(weekOf),
    published,
    entryCount: sorted.length,
    blankCount: sorted.filter((e) => !e.serverName || !e.serverName.trim()).length,
    days,
    // Sent with the week so the edit UI's dropdowns can never drift out of
    // sync with what the model actually accepts.
    posts: RosterEntry.POSTS,
    services: RosterEntry.SERVICES,
  };
}

function validateEntry(raw) {
  const day = String(raw.day || "");
  const post = String(raw.post || "");
  const time = String(raw.time || "").trim();
  const service = String(raw.service || "");
  const serviceLabel = String(raw.serviceLabel || "").trim();

  if (!DAY_NAMES.includes(day)) return { error: `Invalid day: "${day}"` };
  if (!RosterEntry.POSTS.includes(post)) return { error: `Invalid post: "${post}"` };
  if (!RosterEntry.SERVICES.includes(service)) return { error: `Invalid service: "${service}"` };
  if (!time) return { error: "Time is required" };

  if (service === "Other" && !serviceLabel) {
    return { error: 'Choosing "Other" requires naming the occasion' };
  }
  if (serviceLabel.length > 80) {
    return { error: "Occasion name is too long (max 80 characters)" };
  }

  return {
    value: {
      day,
      post,
      time,
      service,
      // Only "Other" carries a custom name; anything else keeps it empty so
      // stale labels can't linger after switching service type.
      serviceLabel: service === "Other" ? serviceLabel : "",
      serverName: String(raw.serverName || "").trim(),
    },
  };
}

// Every week that exists, newest first. The public only sees published ones.
router.get("/weeks", async (req, res) => {
  try {
    const match = isAdmin(req) ? {} : { published: true };
    const weeks = await RosterEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$weekOf",
          entryCount: { $sum: 1 },
          publishedCount: { $sum: { $cond: ["$published", 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    res.json(
      weeks.map((w) => ({
        weekOf: toWeekKey(w._id),
        label: formatWeekRange(w._id),
        entryCount: w.entryCount,
        published: w.publishedCount === w.entryCount,
      }))
    );
  } catch (err) {
    console.error("GET /api/roster/weeks:", err.message);
    res.status(500).json({ error: "Could not load weeks" });
  }
});

// The newest roster the requester may see — what the page opens on.
router.get("/latest", async (req, res) => {
  try {
    const scope = isAdmin(req) ? {} : { published: true };
    const newest = await RosterEntry.findOne(scope).sort({ weekOf: -1 }).lean();

    if (!newest) {
      return res.json({
        weekOf: null,
        label: null,
        published: false,
        entryCount: 0,
        blankCount: 0,
        days: [],
      });
    }

    const entries = await RosterEntry.find({ weekOf: newest.weekOf, ...scope }).lean();
    res.json(buildWeekPayload(newest.weekOf, entries));
  } catch (err) {
    console.error("GET /api/roster/latest:", err.message);
    res.status(500).json({ error: "Could not load the roster" });
  }
});

router.get("/:weekKey", async (req, res) => {
  const weekOf = parseWeekKey(req.params.weekKey);
  if (!weekOf) {
    return res.status(400).json({ error: "Invalid week, expected YYYY-MM-DD" });
  }

  try {
    const scope = isAdmin(req) ? {} : { published: true };
    const entries = await RosterEntry.find({ weekOf, ...scope }).lean();
    res.json(buildWeekPayload(weekOf, entries));
  } catch (err) {
    console.error("GET /api/roster/:weekKey:", err.message);
    res.status(500).json({ error: "Could not load the roster" });
  }
});

// Creates next week by duplicating the most recent one — same days, times and
// posts, same names pre-filled — as an unpublished draft.
router.post("/next", requireAdmin, async (req, res) => {
  try {
    const newest = await RosterEntry.findOne().sort({ weekOf: -1 }).lean();
    if (!newest) {
      return res.status(400).json({ error: "There is no existing roster to copy from" });
    }

    // Only one draft may be in flight at a time. Without this, a stray second
    // click just silently creates another week further into the future, since
    // "the week after the newest" is empty by definition.
    const draft = await RosterEntry.findOne({ published: false }).sort({ weekOf: -1 }).lean();
    if (draft) {
      return res.status(409).json({
        error: `There is already an unpublished roster for ${formatWeekRange(draft.weekOf)}. Publish or delete it before creating another.`,
        weekOf: toWeekKey(draft.weekOf),
      });
    }

    const target = nextWeek(newest.weekOf);
    const existing = await RosterEntry.countDocuments({ weekOf: target });
    if (existing > 0) {
      return res.status(409).json({
        error: `A roster for ${formatWeekRange(target)} already exists`,
        weekOf: toWeekKey(target),
      });
    }

    const source = await RosterEntry.find({ weekOf: newest.weekOf }).lean();
    await RosterEntry.insertMany(
      source.map((e) => ({
        weekOf: target,
        day: e.day,
        time: e.time,
        service: e.service,
        serviceLabel: e.serviceLabel,
        post: e.post,
        serverName: e.serverName,
        published: false,
      }))
    );

    const entries = await RosterEntry.find({ weekOf: target }).lean();
    res.status(201).json(buildWeekPayload(target, entries));
  } catch (err) {
    console.error("POST /api/roster/next:", err.message);
    res.status(500).json({ error: "Could not create next week's roster" });
  }
});

// Saves a whole week at once. The list sent becomes the complete set for that
// week: entries with an id are updated, ones without are created, and anything
// missing from the list is deleted.
router.patch("/:weekKey", requireAdmin, async (req, res) => {
  const weekOf = parseWeekKey(req.params.weekKey);
  if (!weekOf) {
    return res.status(400).json({ error: "Invalid week, expected YYYY-MM-DD" });
  }

  const incoming = Array.isArray(req.body && req.body.entries) ? req.body.entries : null;
  if (!incoming) return res.status(400).json({ error: "Expected an 'entries' array" });
  if (incoming.length > 500) return res.status(400).json({ error: "Too many entries" });

  try {
    const existing = await RosterEntry.find({ weekOf }).lean();
    const existingIds = new Set(existing.map((e) => String(e._id)));
    // A row added to an already-published week should be visible straight away.
    const weekIsPublished = existing.length > 0 && existing.every((e) => e.published);

    const keptIds = new Set();
    const operations = [];

    for (const raw of incoming) {
      const { value, error } = validateEntry(raw);
      if (error) return res.status(400).json({ error });

      const id = raw._id && mongoose.isValidObjectId(raw._id) ? String(raw._id) : null;

      if (id && existingIds.has(id)) {
        keptIds.add(id);
        operations.push({ updateOne: { filter: { _id: id }, update: { $set: value } } });
      } else {
        operations.push({
          insertOne: { document: { ...value, weekOf, published: weekIsPublished } },
        });
      }
    }

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    if (toDelete.length) {
      operations.push({ deleteMany: { filter: { _id: { $in: toDelete } } } });
    }

    if (operations.length) await RosterEntry.bulkWrite(operations);

    const entries = await RosterEntry.find({ weekOf }).lean();
    res.json(buildWeekPayload(weekOf, entries));
  } catch (err) {
    console.error("PATCH /api/roster/:weekKey:", err.message);
    res.status(500).json({ error: "Could not save the roster" });
  }
});

router.post("/:weekKey/publish", requireAdmin, async (req, res) => {
  const weekOf = parseWeekKey(req.params.weekKey);
  if (!weekOf) {
    return res.status(400).json({ error: "Invalid week, expected YYYY-MM-DD" });
  }

  try {
    const entries = await RosterEntry.find({ weekOf }).lean();
    if (!entries.length) {
      return res.status(404).json({ error: "No roster exists for that week" });
    }

    const blanks = entries.filter((e) => !e.serverName || !e.serverName.trim());
    if (blanks.length) {
      return res.status(400).json({
        error: `${blanks.length} slot${blanks.length === 1 ? " has" : "s have"} no server name yet`,
      });
    }

    await RosterEntry.updateMany({ weekOf }, { $set: { published: true } });
    const updated = await RosterEntry.find({ weekOf }).lean();
    res.json(buildWeekPayload(weekOf, updated));
  } catch (err) {
    console.error("POST /api/roster/:weekKey/publish:", err.message);
    res.status(500).json({ error: "Could not publish the roster" });
  }
});

router.delete("/:weekKey", requireAdmin, async (req, res) => {
  const weekOf = parseWeekKey(req.params.weekKey);
  if (!weekOf) {
    return res.status(400).json({ error: "Invalid week, expected YYYY-MM-DD" });
  }

  try {
    const result = await RosterEntry.deleteMany({ weekOf });
    if (!result.deletedCount) {
      return res.status(404).json({ error: "No roster exists for that week" });
    }
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/roster/:weekKey:", err.message);
    res.status(500).json({ error: "Could not delete the roster" });
  }
});

module.exports = router;

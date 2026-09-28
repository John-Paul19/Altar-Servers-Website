const express = require("express");
const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

function validateBody(body) {
  const title = String((body && body.title) || "").trim();
  const text = String((body && body.body) || "").trim();

  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title is too long (max 200 characters)" };
  if (!text) return { error: "Content is required" };
  if (text.length > 5000) return { error: "Content is too long (max 5000 characters)" };

  return { value: { title, body: text } };
}

router.get("/", async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).lean();
    res.json(announcements);
  } catch (err) {
    console.error("GET /api/announcements:", err.message);
    res.status(500).json({ error: "Could not load announcements" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const { value, error } = validateBody(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const announcement = await Announcement.create(value);
    res.status(201).json(announcement);
  } catch (err) {
    console.error("POST /api/announcements:", err.message);
    res.status(500).json({ error: "Could not create the announcement" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid announcement id" });
  }

  const { value, error } = validateBody(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const announcement = await Announcement.findByIdAndUpdate(req.params.id, value, {
      new: true,
      runValidators: true,
    });
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });
    res.json(announcement);
  } catch (err) {
    console.error("PUT /api/announcements/:id:", err.message);
    res.status(500).json({ error: "Could not update the announcement" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid announcement id" });
  }

  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/announcements/:id:", err.message);
    res.status(500).json({ error: "Could not delete the announcement" });
  }
});

module.exports = router;

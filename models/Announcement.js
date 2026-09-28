const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcement", announcementSchema);

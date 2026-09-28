// All week maths is done in UTC so results never shift with the server's
// timezone. A "week" runs Sunday 00:00 UTC through the following Saturday.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Midnight UTC on the Sunday on or before the given date.
function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const sunday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - d.getUTCDay()
  );
  return new Date(sunday);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY);
}

function nextWeek(weekOf) {
  return addDays(startOfWeek(weekOf), 7);
}

// The calendar date a given day name falls on within a week.
function dateForDay(weekOf, dayName) {
  const index = DAY_NAMES.indexOf(dayName);
  if (index === -1) return null;
  return addDays(startOfWeek(weekOf), index);
}

function formatDay(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(date));
}

// "27 September – 3 October 2026", collapsing repeated month/year.
function formatWeekRange(weekOf) {
  const start = startOfWeek(weekOf);
  const end = addDays(start, 6);

  const part = (date, opts) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(date);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  const startText = sameMonth
    ? part(start, { day: "numeric" })
    : part(start, { day: "numeric", month: "long" }) +
      (sameYear ? "" : ` ${start.getUTCFullYear()}`);

  const endText = part(end, { day: "numeric", month: "long", year: "numeric" });

  return `${startText} – ${endText}`;
}

// "2026-09-27" — the form used in URLs and query strings.
function toWeekKey(date) {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function parseWeekKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : startOfWeek(date);
}

module.exports = {
  DAY_NAMES,
  startOfWeek,
  addDays,
  nextWeek,
  dateForDay,
  formatDay,
  formatWeekRange,
  toWeekKey,
  parseWeekKey,
};

// Renders the roster and announcements from the API, and — when an admin is
// signed in — turns the roster into an editable form.

const state = {
  admin: null,
  week: null,
  weeks: [],
  editing: false,
  posts: [],
  services: [],
  announcements: [],
};

const el = (id) => document.getElementById(id);

// Every value that reaches innerHTML goes through this. Server names are typed
// by admins, but escaping is what guarantees a stray "<" can never become markup.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDayDate(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(iso));
}

async function api(path, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (opts.body) opts.headers["Content-Type"] = "application/json";
  const response = await fetch(path, opts);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

function toast(message, kind = "error") {
  const box = el("pageMessage");
  box.textContent = message;
  box.className = `page-message page-message-${kind}`;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

function options(list, selected) {
  return list
    .map(
      (item) =>
        `<option value="${esc(item)}"${item === selected ? " selected" : ""}>${esc(item)}</option>`
    )
    .join("");
}

/* ---------------------------------------------------------------- roster -- */

function renderRoster() {
  const week = state.week;
  const container = el("rosterDays");
  const heading = el("weekLabel");
  const badge = el("draftBadge");

  if (!week || !week.weekOf) {
    heading.textContent = "No roster published yet";
    badge.hidden = true;
    container.innerHTML =
      '<p class="roster-empty">No serving roster has been published yet.</p>';
    return;
  }

  heading.textContent = week.label;
  badge.hidden = week.published;
  // Lets the stylesheet lay edit mode out differently without relying on :has().
  container.classList.toggle("is-editing", state.editing);

  if (!week.days.length) {
    container.innerHTML = '<p class="roster-empty">This week has no entries.</p>';
    return;
  }

  container.innerHTML = week.days
    .map(
      (day) => `
      <div class="roster-day" data-day="${esc(day.day)}">
        <h3>
          <i class="fas fa-${day.day === "Sunday" ? "sun" : "calendar-day"} me-2"></i>${esc(day.day)}
          <span class="roster-day-date">${esc(formatDayDate(day.date))}</span>
        </h3>
        ${day.services.map((service) => renderService(day.day, service)).join("")}
        ${
          state.editing
            ? `<button type="button" class="add-service-btn" data-add-service="${esc(day.day)}">
                 <i class="fas fa-plus me-1"></i>Add a service
               </button>`
            : ""
        }
      </div>`
    )
    .join("");
}

function renderService(day, service) {
  const isOther = service.service === "Other";

  const header = state.editing
    ? `<div class="service-edit">
         <select class="roster-input service-type" aria-label="Service">
           ${options(state.services, service.service)}
         </select>
         <input
           type="text"
           class="roster-input service-label${isOther ? "" : " is-hidden"}"
           value="${esc(service.serviceLabel)}"
           placeholder="Name the occasion"
           maxlength="80"
           aria-label="Occasion name"
         />
         <input
           type="text"
           class="roster-input service-time"
           value="${esc(service.time)}"
           placeholder="6:00 AM"
           aria-label="Time"
         />
         <button type="button" class="service-remove-btn" title="Remove this service" aria-label="Remove this service">
           <i class="fas fa-trash"></i>
         </button>
       </div>`
    : `<div class="service-title">
         <span class="service-name">${esc(service.label)}</span>
         <span class="service-time-badge"><i class="far fa-clock me-1"></i>${esc(service.time)}</span>
       </div>`;

  return `
    <div class="service-group" data-day="${esc(day)}">
      ${header}
      <div class="table-responsive">
        <table class="table table-hover roster-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Name</th>
              ${state.editing ? '<th class="roster-actions-col"></th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${service.entries.map(renderRow).join("")}
          </tbody>
        </table>
      </div>
      ${
        state.editing
          ? `<button type="button" class="add-slot-btn" data-add-slot>
               <i class="fas fa-plus me-1"></i>Add slot
             </button>`
          : ""
      }
    </div>`;
}

function renderRow(entry) {
  if (!state.editing) {
    return `
      <tr>
        <td class="post-cell">${esc(entry.post)}</td>
        <td>${esc(entry.serverName) || '<span class="roster-blank">—</span>'}</td>
      </tr>`;
  }

  return `
    <tr data-id="${esc(entry._id || "")}">
      <td><select class="roster-input roster-post" aria-label="Post">${options(state.posts, entry.post)}</select></td>
      <td><input type="text" class="roster-input roster-name" value="${esc(entry.serverName)}" placeholder="Server name" aria-label="Server name" /></td>
      <td class="roster-actions-col">
        <button type="button" class="row-remove-btn" title="Remove this slot" aria-label="Remove this slot">
          <i class="fas fa-xmark"></i>
        </button>
      </td>
    </tr>`;
}

// Reads the whole page back out of the DOM as the complete set for this week.
// Service and time live on the group header and apply to every row beneath it.
function collectEntries() {
  const entries = [];

  document.querySelectorAll(".service-group").forEach((group) => {
    const day = group.dataset.day;
    const service = group.querySelector(".service-type").value;
    const serviceLabel = group.querySelector(".service-label").value.trim();
    const time = group.querySelector(".service-time").value.trim();

    group.querySelectorAll("tbody tr").forEach((row) => {
      const entry = {
        day,
        service,
        serviceLabel,
        time,
        post: row.querySelector(".roster-post").value,
        serverName: row.querySelector(".roster-name").value.trim(),
      };
      if (row.dataset.id) entry._id = row.dataset.id;
      entries.push(entry);
    });
  });

  return entries;
}

function renderControls() {
  const isAdmin = Boolean(state.admin);
  el("adminBar").hidden = !isAdmin;
  if (!isAdmin) return;

  el("adminName").textContent = state.admin.name;

  const hasWeek = Boolean(state.week && state.week.weekOf);
  const published = hasWeek && state.week.published;

  el("editRosterBtn").hidden = state.editing || !hasWeek;
  el("saveRosterBtn").hidden = !state.editing;
  el("cancelEditBtn").hidden = !state.editing;
  el("nextWeekBtn").hidden = state.editing;
  el("publishBtn").hidden = state.editing || !hasWeek || published;
  el("addAnnouncementBtn").hidden = state.editing;
}

function renderWeekNav() {
  const select = el("weekSelect");
  if (!state.weeks.length) {
    select.hidden = true;
    return;
  }
  select.hidden = false;
  select.innerHTML = state.weeks
    .map(
      (w) =>
        `<option value="${esc(w.weekOf)}"${
          state.week && w.weekOf === state.week.weekOf ? " selected" : ""
        }>${esc(w.label)}${w.published ? "" : " (draft)"}</option>`
    )
    .join("");
}

function applyWeek(week) {
  state.week = week;
  state.posts = week.posts || state.posts;
  state.services = week.services || state.services;
}

async function loadWeek(weekKey) {
  applyWeek(await api(weekKey ? `/api/roster/${weekKey}` : "/api/roster/latest"));
  renderRoster();
  renderWeekNav();
  renderControls();
}

async function loadWeeks() {
  state.weeks = await api("/api/roster/weeks");
  renderWeekNav();
}

/* --------------------------------------------------------- announcements -- */

function renderAnnouncements(list) {
  const container = el("announcementList");

  if (!list.length) {
    container.innerHTML =
      '<p class="roster-empty">No announcements at the moment.</p>';
    return;
  }

  container.innerHTML = list
    .map(
      (item) => `
      <div class="col-md-6">
        <div class="announcement-card">
          <h4><i class="fas fa-thumbtack me-2"></i>${esc(item.title)}</h4>
          <p>${esc(item.body)}</p>
          ${
            state.admin
              ? `<div class="announcement-actions">
                   <button type="button" class="link-btn" data-edit-announcement="${esc(item._id)}">
                     <i class="fas fa-pen-to-square me-1"></i>Edit
                   </button>
                   <button type="button" class="link-btn link-btn-danger" data-delete-announcement="${esc(item._id)}">
                     <i class="fas fa-trash me-1"></i>Delete
                   </button>
                 </div>`
              : ""
          }
        </div>
      </div>`
    )
    .join("");
}

async function loadAnnouncements() {
  state.announcements = await api("/api/announcements");
  renderAnnouncements(state.announcements);
}

/* ------------------------------------------------------------- handlers -- */

function handleEdit() {
  state.editing = true;
  renderRoster();
  renderControls();
}

async function handleCancel() {
  state.editing = false;
  await loadWeek(state.week.weekOf);
}

async function handleSave() {
  const button = el("saveRosterBtn");
  button.disabled = true;

  try {
    applyWeek(
      await api(`/api/roster/${state.week.weekOf}`, {
        method: "PATCH",
        body: JSON.stringify({ entries: collectEntries() }),
      })
    );
    state.editing = false;
    renderRoster();
    renderControls();
    toast("Roster saved.", "success");
  } catch (err) {
    toast(err.message);
  } finally {
    button.disabled = false;
  }
}

async function handleNextWeek() {
  const button = el("nextWeekBtn");
  button.disabled = true;
  try {
    applyWeek(await api("/api/roster/next", { method: "POST" }));
    state.editing = true;
    await loadWeeks();
    renderRoster();
    renderControls();
    toast(`Draft created for ${state.week.label}. Edit the names, then publish.`, "success");
  } catch (err) {
    toast(err.message);
  } finally {
    button.disabled = false;
  }
}

async function handlePublish() {
  const button = el("publishBtn");
  button.disabled = true;
  try {
    applyWeek(await api(`/api/roster/${state.week.weekOf}/publish`, { method: "POST" }));
    await loadWeeks();
    renderRoster();
    renderControls();
    toast("Roster published — it is now visible to everyone.", "success");
  } catch (err) {
    toast(err.message);
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
    window.location.reload();
  } catch (err) {
    toast(err.message);
  }
}

function openAnnouncementModal(item) {
  el("announcementId").value = item ? item._id : "";
  el("announcementTitle").value = item ? item.title : "";
  el("announcementBody").value = item ? item.body : "";
  el("announcementModalLabel").innerHTML = item
    ? '<i class="fas fa-pen-to-square me-2"></i>Edit Announcement'
    : '<i class="fas fa-plus me-2"></i>New Announcement';
  el("announcementError").hidden = true;
  bootstrap.Modal.getOrCreateInstance(el("announcementModal")).show();
}

async function handleAnnouncementSave() {
  const id = el("announcementId").value;
  const payload = {
    title: el("announcementTitle").value.trim(),
    body: el("announcementBody").value.trim(),
  };

  const button = el("announcementSaveBtn");
  button.disabled = true;

  try {
    await api(id ? `/api/announcements/${id}` : "/api/announcements", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    bootstrap.Modal.getOrCreateInstance(el("announcementModal")).hide();
    await loadAnnouncements();
    toast(id ? "Announcement updated." : "Announcement added.", "success");
  } catch (err) {
    const box = el("announcementError");
    box.textContent = err.message;
    box.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function handleAnnouncementDelete(id) {
  const item = state.announcements.find((a) => a._id === id);
  if (!window.confirm(`Delete "${item ? item.title : "this announcement"}"? This cannot be undone.`)) {
    return;
  }
  try {
    await api(`/api/announcements/${id}`, { method: "DELETE" });
    await loadAnnouncements();
    toast("Announcement deleted.", "success");
  } catch (err) {
    toast(err.message);
  }
}

/* ---------------------------------------------------------------- wiring -- */

function addSlotTo(group) {
  const tbody = group.querySelector("tbody");
  const lastPost = tbody.querySelector("tr:last-child .roster-post");
  tbody.insertAdjacentHTML(
    "beforeend",
    renderRow({
      post: lastPost ? lastPost.value : state.posts[0],
      serverName: "",
    })
  );
  tbody.querySelector("tr:last-child .roster-name").focus();
}

function addServiceTo(day) {
  const dayEl = document.querySelector(`.roster-day[data-day="${day}"]`);
  const addButton = dayEl.querySelector("[data-add-service]");
  addButton.insertAdjacentHTML(
    "beforebegin",
    renderService(day, {
      service: state.services[0],
      serviceLabel: "",
      label: state.services[0],
      time: "6:00 AM",
      entries: [{ post: state.posts[0], serverName: "" }],
    })
  );
  dayEl.querySelector(".service-group:last-of-type .service-time").focus();
}

function wireEvents() {
  el("editRosterBtn").addEventListener("click", handleEdit);
  el("cancelEditBtn").addEventListener("click", handleCancel);
  el("saveRosterBtn").addEventListener("click", handleSave);
  el("nextWeekBtn").addEventListener("click", handleNextWeek);
  el("publishBtn").addEventListener("click", handlePublish);
  el("logoutBtn").addEventListener("click", handleLogout);
  el("addAnnouncementBtn").addEventListener("click", () => openAnnouncementModal(null));
  el("announcementSaveBtn").addEventListener("click", handleAnnouncementSave);

  el("weekSelect").addEventListener("change", async (event) => {
    state.editing = false;
    try {
      await loadWeek(event.target.value);
    } catch (err) {
      toast(err.message);
    }
  });

  // Delegated so everything keeps working after each re-render.
  el("rosterDays").addEventListener("click", (event) => {
    const removeRow = event.target.closest(".row-remove-btn");
    if (removeRow) {
      const group = removeRow.closest(".service-group");
      removeRow.closest("tr").remove();
      // A service with no assignments left has nothing to save.
      if (!group.querySelector("tbody tr")) group.remove();
      return;
    }

    const removeService = event.target.closest(".service-remove-btn");
    if (removeService) {
      removeService.closest(".service-group").remove();
      return;
    }

    const addSlot = event.target.closest("[data-add-slot]");
    if (addSlot) {
      addSlotTo(addSlot.closest(".service-group"));
      return;
    }

    const addService = event.target.closest("[data-add-service]");
    if (addService) addServiceTo(addService.dataset.addService);
  });

  // The occasion name only applies to "Other", so it appears with it.
  el("rosterDays").addEventListener("change", (event) => {
    const select = event.target.closest(".service-type");
    if (!select) return;
    const label = select.closest(".service-edit").querySelector(".service-label");
    label.classList.toggle("is-hidden", select.value !== "Other");
    if (select.value === "Other") label.focus();
  });

  el("announcementList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-announcement]");
    if (edit) {
      const item = state.announcements.find((a) => a._id === edit.dataset.editAnnouncement);
      if (item) openAnnouncementModal(item);
      return;
    }

    const remove = event.target.closest("[data-delete-announcement]");
    if (remove) handleAnnouncementDelete(remove.dataset.deleteAnnouncement);
  });
}

async function init() {
  wireEvents();

  // Returns { admin: null } for ordinary visitors — not an error.
  try {
    state.admin = (await api("/api/auth/me")).admin;
  } catch {
    state.admin = null;
  }

  try {
    await Promise.all([loadWeek(null), loadWeeks(), loadAnnouncements()]);
  } catch (err) {
    toast(err.message);
  }

  renderControls();
  el("signInLink").hidden = Boolean(state.admin);
}

document.addEventListener("DOMContentLoaded", init);

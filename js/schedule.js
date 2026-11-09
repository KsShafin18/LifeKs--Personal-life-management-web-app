"use strict";

/* ===== Schedule & Planner ===== */
ui.schedule = { view: "day", date: todayKey() };
const REMINDER_OPTIONS = [["", "No reminder"], ["0", "At start"], ["5", "5 minutes before"], ["15", "15 minutes before"], ["30", "30 minutes before"], ["60", "1 hour before"]];
const RECURRENCE_OPTIONS = [["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"]];

function occursOn(entry, key) {
  if (key < entry.date) return false;
  if (entry.until && key > entry.until) return false;
  if (entry.recurrence === "daily") return true;
  if (entry.recurrence === "weekly") return dateFromKey(key).getDay() === dateFromKey(entry.date).getDay();
  return key === entry.date;
}

function occurrencesOn(key) {
  return db.schedules.filter((e) => occursOn(e, key))
    .map((entry) => ({ entry, date: key, done: (entry.doneDates || []).includes(key) }))
    .sort((a, b) => toMin(a.entry.start) - toMin(b.entry.start));
}

function occStatus(occ) {
  if (occ.done) return "completed";
  const today = todayKey();
  if (occ.date > today) return "upcoming";
  if (occ.date < today) return "missed";
  const now = nowMin();
  if (now < toMin(occ.entry.start)) return "upcoming";
  if (now < toMin(occ.entry.end)) return "active";
  return "missed";
}

function nextOccurrence() {
  const today = todayKey();
  for (let i = 0; i < 60; i += 1) {
    const key = addDays(today, i);
    const found = occurrencesOn(key).find((o) => occStatus(o) === "upcoming");
    if (found) {
      const start = dateFromKey(key);
      const [h, m] = found.entry.start.split(":").map(Number);
      start.setHours(h, m, 0, 0);
      return { occ: found, msUntil: start.getTime() - Date.now() };
    }
  }
  return null;
}

const STATUS_PILL = {
  completed: ["is-green", "Completed"], active: ["is-red", "Happening now"],
  upcoming: ["", "Upcoming"], missed: ["is-amber", "Missed"]
};
const statusPill = (status) => `<span class="pill ${STATUS_PILL[status][0]}">${STATUS_PILL[status][1]}</span>`;
const priorityPill = (p) => `<span class="pill ${p === "high" ? "is-red" : p === "medium" ? "is-amber" : ""}">${esc(label(CONFIG.priorities, p))}</span>`;

function weekStart(key) { return addDays(key, -((dateFromKey(key).getDay() + 6) % 7)); }

function scheduleRow(occ) {
  const e = occ.entry;
  const status = occStatus(occ);
  return `<div class="row${occ.done ? " is-done" : ""}">
    <button class="check${occ.done ? " is-on" : ""}" data-action="sched-toggle" data-id="${e.id}" data-date="${occ.date}" aria-label="${occ.done ? "Mark not completed" : "Mark completed"}: ${esc(e.title)}">${occ.done ? icon("check") : ""}</button>
    <div class="row-main"><strong>${esc(e.title)}</strong>
      <small>${fmtTime(e.start)} – ${fmtTime(e.end)} · ${esc(e.category)}${e.recurrence !== "none" ? " · repeats " + (e.recurrence === "daily" ? "daily" : "weekly") : ""}</small>
      ${e.description ? `<small>${esc(e.description)}</small>` : ""}
      <span class="pills">${statusPill(status)}${priorityPill(e.priority)}</span></div>
    <div class="row-actions">
      <button class="icon-button" data-action="sched-edit" data-id="${e.id}" aria-label="Edit ${esc(e.title)}">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="sched-delete" data-id="${e.id}" aria-label="Delete ${esc(e.title)}">${icon("trash-2")}</button>
    </div></div>`;
}

function renderDayView() {
  const key = ui.schedule.date;
  const occs = occurrencesOn(key);
  const counts = { completed: 0, upcoming: 0, missed: 0, active: 0 };
  occs.forEach((o) => { counts[occStatus(o)] += 1; });
  const stats = `<div class="stat-row">
    <div class="stat"><small>Planned</small><strong>${occs.length}</strong></div>
    <div class="stat"><small>Completed</small><strong class="pos">${counts.completed}</strong></div>
    <div class="stat"><small>Upcoming</small><strong>${counts.upcoming + counts.active}</strong></div>
    <div class="stat"><small>Missed</small><strong class="${counts.missed ? "neg" : ""}">${counts.missed}</strong></div></div>`;
  const list = occs.length
    ? `<div class="list">${occs.map(scheduleRow).join("")}</div>`
    : emptyCard("Nothing planned for this day.", `<button class="button button-primary button-sm" data-action="sched-add">${icon("plus")} Add activity</button>`);
  return `${stats}<div class="card"><div class="card-head"><h2>${esc(fmtDateLong(key))}</h2></div>${list}</div>`;
}

function renderWeekView() {
  const start = weekStart(ui.schedule.date);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((key) => {
    const events = occurrencesOn(key).map((o) => `<button class="mini-event${o.done ? " is-done" : ""}" data-action="sched-open-day" data-date="${key}">${fmtTime(o.entry.start)} ${esc(o.entry.title)}</button>`).join("");
    return `<div class="week-day${key === today ? " is-today" : ""}"><h3><button class="text-button" data-action="sched-open-day" data-date="${key}">${esc(fmtDateShort(key))}</button></h3>${events || `<small class="muted">Free</small>`}</div>`;
  }).join("");
  return `<div class="week-grid">${days}</div>`;
}

function renderMonthView() {
  const first = dateFromKey(ui.schedule.date.slice(0, 8) + "01");
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const gridStart = addDays(dateKeyFromLocalDate(first), -offset);
  const today = todayKey();
  const cells = Array.from({ length: total }, (_, i) => {
    const key = addDays(gridStart, i);
    const count = occurrencesOn(key).length;
    const outside = dateFromKey(key).getMonth() !== first.getMonth();
    return `<button class="day-cell${key === today ? " is-today" : ""}${outside ? " is-outside" : ""}" data-action="sched-open-day" data-date="${key}" aria-label="${esc(fmtDateLong(key))}, ${plural(count, "activity")}"><b>${dateFromKey(key).getDate()}</b>${count ? `<span>${plural(count, "item")}</span>` : ""}</button>`;
  }).join("");
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("");
  return `<div class="card"><div class="month-grid">${dows}${cells}</div></div>`;
}

function scheduleTitle() {
  const { view, date } = ui.schedule;
  if (view === "day") return fmtDateShort(date);
  if (view === "week") { const s = weekStart(date); return `${fmtDateShort(s)} – ${fmtDateShort(addDays(s, 6))}`; }
  return fmtMonthYear(date);
}

PAGES.schedule = {
  title: "Schedule & Planner",
  render() {
    const v = ui.schedule.view;
    const body = v === "day" ? renderDayView() : v === "week" ? renderWeekView() : renderMonthView();
    const seg = ["day", "week", "month"].map((x) => `<button class="${v === x ? "is-active" : ""}" data-action="sched-view" data-view="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join("");
    return storageBanner() + pageHeader("PLAN YOUR TIME", "Schedule & planner", "Plan activities by day, week and month. Reminders show while LifeKS is open.",
      `<button class="button button-primary" data-action="sched-add">${icon("plus")} Add activity</button>`) +
      `<div class="toolbar"><div class="segmented" role="group" aria-label="Calendar view">${seg}</div>
        <div class="date-nav"><button class="icon-button" data-action="sched-nav" data-dir="-1" aria-label="Previous">${icon("chevron-left")}</button><strong>${esc(scheduleTitle())}</strong><button class="icon-button" data-action="sched-nav" data-dir="1" aria-label="Next">${icon("chevron-right")}</button></div>
        <button class="button button-outline button-sm" data-action="sched-nav" data-dir="0">Today</button></div>${body}`;
  }
};

function scheduleFields() {
  return [
    { name: "title", label: "Title", required: true, wide: true, max: 120 },
    { name: "description", label: "Description", type: "textarea", wide: true, max: 500 },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "category", label: "Category", type: "select", options: categoryOptions("schedule") },
    { name: "start", label: "Start time", type: "time", required: true },
    { name: "end", label: "End time", type: "time", required: true },
    { name: "priority", label: "Priority", type: "select", options: CONFIG.priorities, default: "medium" },
    { name: "reminder", label: "Reminder", type: "select", options: REMINDER_OPTIONS },
    { name: "recurrence", label: "Repeat", type: "select", options: RECURRENCE_OPTIONS },
    { name: "until", label: "Repeat until (optional)", type: "date" }
  ];
}

function validateSchedule(v) {
  if (!validDateKey(v.date)) return "Enter a valid date.";
  if (!/^\d{2}:\d{2}$/.test(v.start) || !/^\d{2}:\d{2}$/.test(v.end)) return "Enter a start and end time.";
  if (toMin(v.end) <= toMin(v.start)) return "End time must be after the start time.";
  if (v.until && (!validDateKey(v.until) || v.until < v.date)) return "“Repeat until” must be on or after the date.";
  return "";
}

function overlapWarning(entry) {
  const clash = occurrencesOn(entry.date).find((o) => o.entry.id !== entry.id && toMin(o.entry.start) < toMin(entry.end) && toMin(entry.start) < toMin(o.entry.end));
  return clash ? `Saved, but it overlaps with “${clash.entry.title}” (${fmtTime(clash.entry.start)} – ${fmtTime(clash.entry.end)}).` : "";
}

function openScheduleForm(existing) {
  const base = existing || { date: ui.schedule.date, start: "09:00", end: "10:00", priority: "medium", recurrence: "none", reminder: "", category: db.categories.schedule[0] };
  openForm({
    title: existing ? "Edit activity" : "Add activity",
    intro: existing && existing.recurrence !== "none" ? "This changes every repeat of this activity." : "",
    fields: scheduleFields(), values: base,
    validate: validateSchedule,
    onSubmit(v) {
      const next = Object.assign({}, existing || { id: uid(), doneDates: [], createdAt: new Date().toISOString() }, {
        title: v.title, description: v.description, date: v.date, start: v.start, end: v.end, category: v.category,
        priority: v.priority, reminder: v.reminder, recurrence: v.recurrence, until: v.recurrence === "none" ? "" : v.until
      });
      const ok = commit(["schedules"], () => {
        if (existing) { const i = db.schedules.findIndex((e) => e.id === existing.id); db.schedules[i] = next; } else db.schedules.push(next);
      });
      if (!ok) return false;
      const warn = overlapWarning(next);
      showToast(warn || (existing ? "Activity updated." : "Activity added."), false);
      ui.schedule.date = next.date;
      renderPage();
      return true;
    }
  });
}

ACTIONS["sched-add"] = () => openScheduleForm();
ACTIONS["sched-edit"] = (el) => openScheduleForm(db.schedules.find((e) => e.id === el.dataset.id));
ACTIONS["sched-view"] = (el) => { ui.schedule.view = el.dataset.view; renderPage(); };
ACTIONS["sched-open-day"] = (el) => { ui.schedule.date = el.dataset.date; ui.schedule.view = "day"; renderPage(); };
ACTIONS["sched-nav"] = (el) => {
  const dir = Number(el.dataset.dir);
  const s = ui.schedule;
  if (dir === 0) s.date = todayKey();
  else if (s.view === "day") s.date = addDays(s.date, dir);
  else if (s.view === "week") s.date = addDays(s.date, 7 * dir);
  else { const d = dateFromKey(s.date.slice(0, 8) + "01"); d.setMonth(d.getMonth() + dir); s.date = dateKeyFromLocalDate(d); }
  renderPage();
};
ACTIONS["sched-toggle"] = (el) => {
  const { id, date } = el.dataset;
  commit(["schedules"], () => {
    const e = db.schedules.find((x) => x.id === id);
    e.doneDates = e.doneDates || [];
    const i = e.doneDates.indexOf(date);
    if (i >= 0) e.doneDates.splice(i, 1); else e.doneDates.push(date);
  });
  renderPage();
};
ACTIONS["sched-delete"] = (el) => {
  const entry = db.schedules.find((e) => e.id === el.dataset.id);
  askConfirm({
    title: "Delete activity?",
    message: entry.recurrence !== "none" ? `“${entry.title}” and all of its repeats will be deleted.` : `“${entry.title}” will be deleted.`,
    confirmLabel: "Delete",
    onConfirm() {
      if (!commit(["schedules"], () => { db.schedules = db.schedules.filter((e) => e.id !== entry.id); })) return false;
      showToast("Activity deleted.");
      renderPage();
    }
  });
};

/* In-app reminders (only while LifeKS is open). */
const firedReminders = new Set();
function checkReminders() {
  const key = todayKey();
  const now = nowMin();
  occurrencesOn(key).forEach((o) => {
    const e = o.entry;
    if (o.done || e.reminder === "" || e.reminder === undefined) return;
    const until = toMin(e.start) - now;
    const token = `${e.id}|${key}`;
    if (until >= 0 && until <= Number(e.reminder) && !firedReminders.has(token)) {
      firedReminders.add(token);
      showToast(until === 0 ? `Starting now: ${e.title}` : `In ${until} min: ${e.title} at ${fmtTime(e.start)}`);
    }
  });
}

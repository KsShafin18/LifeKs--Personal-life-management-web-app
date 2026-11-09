"use strict";

/* ===== Notes & Ideas ===== */
ui.notes = { q: "", tag: "" };
const parseTags = (text) => [...new Set(String(text || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

function noteCard(n) {
  return `<article class="card"><div class="card-head"><h2>${n.pinned ? icon("pin") + " " : ""}${esc(n.title)}</h2>
      <div class="row-actions">
        <button class="icon-button" data-action="note-pin" data-id="${n.id}" aria-label="${n.pinned ? "Unpin" : "Pin"} ${esc(n.title)}">${icon(n.pinned ? "pin-off" : "pin")}</button>
        <button class="icon-button" data-action="note-edit" data-id="${n.id}" aria-label="Edit ${esc(n.title)}">${icon("pencil")}</button>
        <button class="icon-button is-danger" data-action="note-delete" data-id="${n.id}" aria-label="Delete ${esc(n.title)}">${icon("trash-2")}</button></div></div>
    <p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${esc(n.content)}</p>
    ${n.tags.length ? `<span class="pills">${n.tags.map((t) => `<span class="pill">#${esc(t)}</span>`).join("")}</span>` : ""}
    <p class="muted" style="margin:10px 0 0;font-size:12px">Created ${esc(fmtDateTime(n.createdAt))}${n.updatedAt !== n.createdAt ? " · updated " + esc(fmtDateTime(n.updatedAt)) : ""}</p></article>`;
}

PAGES.notes = {
  title: "Notes & Ideas",
  render() {
    const f = ui.notes;
    const q = f.q.trim().toLowerCase();
    const tags = [...new Set(db.notes.flatMap((n) => n.tags))].sort().map((t) => [t, "#" + t]);
    const list = db.notes.filter((n) => (!q || (n.title + " " + n.content + " " + n.tags.join(" ")).toLowerCase().includes(q)) && (!f.tag || n.tags.includes(f.tag)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
    return storageBanner() + pageHeader("A PLACE TO PUT IT DOWN", "Notes & ideas", "Capture ideas, pin the important ones and find them fast.",
      `<button class="button button-primary" data-action="note-add">${icon("plus")} New note</button>`) +
      `<div class="toolbar"><div class="field"><label for="b_notes_q">Search</label><input type="search" ${bindAttr("notes.q", f.q)} placeholder="Search notes"></div>${bindSelect("notes.tag", f.tag, [["", "All tags"], ...tags], "Tag")}</div>` +
      (list.length ? `<div class="grid grid-2">${list.map(noteCard).join("")}</div>` : emptyCard(db.notes.length ? "No notes match your search." : "No notes yet.", db.notes.length ? "" : `<button class="button button-primary button-sm" data-action="note-add">${icon("plus")} Write your first note</button>`));
  }
};

function openNoteForm(existing) {
  openForm({
    title: existing ? "Edit note" : "New note",
    fields: [
      { name: "title", label: "Title", required: true, wide: true, max: 120 },
      { name: "content", label: "Note", type: "textarea", required: true, wide: true, max: 5000 },
      { name: "tags", label: "Tags (comma separated)", wide: true, max: 120 },
      { name: "pinned", label: "Pin this note", type: "checkbox" }
    ],
    values: existing ? Object.assign({}, existing, { tags: existing.tags.join(", ") }) : {},
    onSubmit(v) {
      const now = new Date().toISOString();
      const next = Object.assign({}, existing || { id: uid(), createdAt: now }, { title: v.title, content: v.content, tags: parseTags(v.tags), pinned: v.pinned, updatedAt: now });
      if (!commit(["notes"], () => { if (existing) db.notes[db.notes.findIndex((n) => n.id === existing.id)] = next; else db.notes.push(next); })) return false;
      showToast(existing ? "Note saved." : "Note added.");
      renderPage();
      return true;
    }
  });
}
ACTIONS["note-add"] = () => openNoteForm();
ACTIONS["note-edit"] = (el) => openNoteForm(db.notes.find((n) => n.id === el.dataset.id));
ACTIONS["note-pin"] = (el) => { if (commit(["notes"], () => { const n = db.notes.find((x) => x.id === el.dataset.id); n.pinned = !n.pinned; })) renderPage(); };
ACTIONS["note-delete"] = (el) => {
  const n = db.notes.find((x) => x.id === el.dataset.id);
  askConfirm({ title: "Delete note?", message: `“${n.title}” will be deleted.`, confirmLabel: "Delete", onConfirm() {
    if (!commit(["notes"], () => { db.notes = db.notes.filter((x) => x.id !== n.id); })) return false;
    showToast("Note deleted.");
    renderPage();
  } });
};

/* ===== Goals & Habits ===== */
const habitDone = (h, key) => (h.done || []).includes(key);
function habitStreak(h) {
  let key = todayKey();
  if (!habitDone(h, key)) key = addDays(key, -1);
  let n = 0;
  while (habitDone(h, key)) { n += 1; key = addDays(key, -1); }
  return n;
}
const currentPeriodKey = (period) => (period === "week" ? weekStart(todayKey()) : todayKey().slice(0, 7));
const goalIsCurrent = (g) => g.periodKey === currentPeriodKey(g.period);
const goalPeriodText = (g) => (g.period === "week" ? `Week of ${fmtDateShort(g.periodKey)}` : dateFromKey(g.periodKey + "-01").toLocaleDateString([], { month: "long", year: "numeric" }));

function habitRow(h) {
  const today = todayKey();
  const dots = Array.from({ length: 14 }, (_, i) => addDays(today, -(13 - i))).map((k) => `<span title="${esc(fmtDateShort(k))}" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:3px;background:${habitDone(h, k) ? "var(--green)" : "var(--surface-2)"}"></span>`).join("");
  const rate = Math.round((Array.from({ length: 30 }, (_, i) => addDays(today, -i)).filter((k) => habitDone(h, k)).length / 30) * 100);
  const history = (h.done || []).slice().sort().reverse().slice(0, 30);
  return `<div class="row"><button class="check${habitDone(h, today) ? " is-on" : ""}" data-action="habit-toggle" data-id="${h.id}" aria-label="${habitDone(h, today) ? "Undo" : "Mark done today"}: ${esc(h.title)}">${habitDone(h, today) ? icon("check") : ""}</button>
    <div class="row-main"><strong>${esc(h.title)}</strong><small>${dots}</small>
      <span class="pills"><span class="pill ${habitStreak(h) ? "is-green" : ""}">${plural(habitStreak(h), "day")} streak</span><span class="pill">${rate}% last 30 days</span><span class="pill">${plural((h.done || []).length, "completion")}</span></span>
      <details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12px">Completion history</summary><small>${history.length ? history.map((k) => esc(fmtDateShort(k))).join(" · ") : "No completions yet."}</small></details></div>
    <div class="row-actions"><button class="icon-button" data-action="habit-edit" data-id="${h.id}" aria-label="Rename ${esc(h.title)}">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="habit-delete" data-id="${h.id}" aria-label="Delete ${esc(h.title)}">${icon("trash-2")}</button></div></div>`;
}

function goalRow(g, editable) {
  const pct = Math.min(100, barPct(g.progress, g.target));
  return `<div class="row"><div class="row-main"><strong>${esc(g.title)}</strong><small>${esc(goalPeriodText(g))} · ${g.progress} of ${g.target}</small>${progressBar(pct)}
      <span class="pills"><span class="pill ${pct >= 100 ? "is-green" : ""}">${pct}%</span></span></div>
    <div class="row-actions">${editable ? `<button class="icon-button" data-action="goal-step" data-id="${g.id}" data-step="-1" aria-label="Decrease progress of ${esc(g.title)}">${icon("minus")}</button><button class="icon-button" data-action="goal-step" data-id="${g.id}" data-step="1" aria-label="Increase progress of ${esc(g.title)}">${icon("plus")}</button>` : ""}
      <button class="icon-button" data-action="goal-edit" data-id="${g.id}" aria-label="Edit ${esc(g.title)}">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="goal-delete" data-id="${g.id}" aria-label="Delete ${esc(g.title)}">${icon("trash-2")}</button></div></div>`;
}

PAGES.goals = {
  title: "Goals & Habits",
  render() {
    const current = db.goals.filter(goalIsCurrent);
    const past = db.goals.filter((g) => !goalIsCurrent(g)).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    const doneToday = db.habits.filter((h) => habitDone(h, todayKey())).length;
    return storageBanner() + pageHeader("BUILD THE LIFE YOU WANT", "Goals & habits", "Daily habits with streaks, plus weekly and monthly goals.",
      `<button class="button button-primary" data-action="habit-add">${icon("plus")} Add habit</button><button class="button button-outline" data-action="goal-add">${icon("plus")} Add goal</button>`) +
      `<div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Daily habits</h2><span class="muted">${doneToday} of ${db.habits.length} done today</span></div>
          ${db.habits.length ? `<div class="list">${db.habits.map(habitRow).join("")}</div>` : emptyCard("No habits yet.", `<button class="button button-primary button-sm" data-action="habit-add">${icon("plus")} Add a habit</button>`)}</div>
        <div class="card"><div class="card-head"><h2>Goals this week and month</h2></div>
          ${current.length ? `<div class="list">${current.map((g) => goalRow(g, true)).join("")}</div>` : emptyCard("No goals for the current week or month.", `<button class="button button-primary button-sm" data-action="goal-add">${icon("plus")} Add a goal</button>`)}
          ${past.length ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700">Past goals (${past.length})</summary><div class="list">${past.map((g) => goalRow(g, false)).join("")}</div></details>` : ""}</div></div>`;
  }
};

function openHabitForm(existing) {
  openForm({ title: existing ? "Rename habit" : "Add habit", fields: [{ name: "title", label: "Habit", required: true, wide: true, max: 80 }], values: existing || {},
    onSubmit(v) {
      if (!commit(["habits"], () => { if (existing) db.habits.find((h) => h.id === existing.id).title = v.title; else db.habits.push({ id: uid(), title: v.title, done: [], createdAt: new Date().toISOString() }); })) return false;
      showToast(existing ? "Habit updated." : "Habit added.");
      renderPage();
      return true;
    } });
}

function openGoalForm(existing) {
  openForm({
    title: existing ? "Edit goal" : "Add goal",
    fields: [
      { name: "title", label: "Goal", required: true, wide: true, max: 100 },
      { name: "period", label: "Period", type: "select", options: [["week", "This week"], ["month", "This month"]] },
      { name: "target", label: "Target (number of times)", type: "number", required: true, min: "1", step: "1" },
      { name: "progress", label: "Progress so far", type: "number", min: "0", step: "1" }
    ],
    values: existing || { period: "week", target: "5", progress: "0" },
    validate(v) {
      if (!/^\d+$/.test(v.target) || Number(v.target) < 1) return "Target must be a whole number of at least 1.";
      if (v.progress && !/^\d+$/.test(v.progress)) return "Progress must be a whole number.";
      return "";
    },
    onSubmit(v) {
      const base = existing || { id: uid(), createdAt: new Date().toISOString(), periodKey: currentPeriodKey(v.period) };
      const next = Object.assign({}, base, { title: v.title, period: v.period, target: Number(v.target), progress: Number(v.progress || 0) });
      if (existing && existing.period !== v.period) next.periodKey = currentPeriodKey(v.period);
      if (!commit(["goals"], () => { if (existing) db.goals[db.goals.findIndex((g) => g.id === existing.id)] = next; else db.goals.push(next); })) return false;
      showToast(existing ? "Goal updated." : "Goal added.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["habit-add"] = () => openHabitForm();
ACTIONS["habit-edit"] = (el) => openHabitForm(db.habits.find((h) => h.id === el.dataset.id));
ACTIONS["habit-toggle"] = (el) => {
  const today = todayKey();
  if (commit(["habits"], () => { const h = db.habits.find((x) => x.id === el.dataset.id); h.done = h.done || []; const i = h.done.indexOf(today); if (i >= 0) h.done.splice(i, 1); else h.done.push(today); })) renderPage();
};
ACTIONS["habit-delete"] = (el) => {
  const h = db.habits.find((x) => x.id === el.dataset.id);
  askConfirm({ title: "Delete habit?", message: `“${h.title}” and its ${plural((h.done || []).length, "completion")} will be deleted.`, confirmLabel: "Delete", onConfirm() {
    if (!commit(["habits"], () => { db.habits = db.habits.filter((x) => x.id !== h.id); })) return false;
    showToast("Habit deleted.");
    renderPage();
  } });
};
ACTIONS["goal-add"] = () => openGoalForm();
ACTIONS["goal-edit"] = (el) => openGoalForm(db.goals.find((g) => g.id === el.dataset.id));
ACTIONS["goal-step"] = (el) => { if (commit(["goals"], () => { const g = db.goals.find((x) => x.id === el.dataset.id); g.progress = Math.max(0, g.progress + Number(el.dataset.step)); })) renderPage(); };
ACTIONS["goal-delete"] = (el) => {
  const g = db.goals.find((x) => x.id === el.dataset.id);
  askConfirm({ title: "Delete goal?", message: `“${g.title}” will be deleted.`, confirmLabel: "Delete", onConfirm() {
    if (!commit(["goals"], () => { db.goals = db.goals.filter((x) => x.id !== g.id); })) return false;
    showToast("Goal deleted.");
    renderPage();
  } });
};

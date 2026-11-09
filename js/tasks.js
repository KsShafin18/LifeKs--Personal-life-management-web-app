"use strict";

/* ===== Task Manager ===== */
ui.tasks = { q: "", status: "", priority: "", category: "", date: "" };
const TASK_STATUSES = [["pending", "Pending"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const isOpenTask = (t) => t.status === "pending" || t.status === "in_progress";
const isOverdue = (t) => isOpenTask(t) && t.deadline && t.deadline < todayKey();

function filteredTasks() {
  const f = ui.tasks;
  const q = f.q.trim().toLowerCase();
  return db.tasks.filter((t) =>
    (!q || t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)) &&
    (!f.status || t.status === f.status) && (!f.priority || t.priority === f.priority) &&
    (!f.category || t.category === f.category) && (!f.date || t.deadline === f.date));
}

function taskRow(t) {
  const done = t.status === "completed";
  const link = t.scheduleId ? db.schedules.find((s) => s.id === t.scheduleId) : null;
  const deadline = t.deadline ? `Due ${fmtDateShort(t.deadline)}` : "No deadline";
  return `<div class="row${done || t.status === "cancelled" ? " is-done" : ""}">
    <button class="check${done ? " is-on" : ""}" data-action="task-toggle" data-id="${t.id}" aria-label="${done ? "Reopen" : "Complete"} ${esc(t.title)}">${done ? icon("check") : ""}</button>
    <div class="row-main"><strong>${esc(t.title)}</strong>
      <small>${esc(deadline)} · ${esc(t.category)}${link ? " · linked to " + esc(link.title) : ""}</small>
      ${t.description ? `<small>${esc(t.description)}</small>` : ""}
      <span class="pills">${isOverdue(t) ? `<span class="pill is-red">Overdue</span>` : ""}<span class="pill ${done ? "is-green" : ""}">${esc(label(TASK_STATUSES, t.status))}</span>${priorityPill(t.priority)}</span></div>
    <div class="row-actions">
      <button class="icon-button" data-action="task-edit" data-id="${t.id}" aria-label="Edit ${esc(t.title)}">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="task-delete" data-id="${t.id}" aria-label="Delete ${esc(t.title)}">${icon("trash-2")}</button>
    </div></div>`;
}

PAGES.tasks = {
  title: "Task Manager",
  render() {
    const all = db.tasks.filter((t) => t.status !== "cancelled");
    const completed = all.filter((t) => t.status === "completed").length;
    const pct = barPct(completed, all.length);
    const shown = filteredTasks();
    const overdue = shown.filter(isOverdue).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const open = shown.filter((t) => isOpenTask(t) && !isOverdue(t)).sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    const closed = shown.filter((t) => !isOpenTask(t));
    const section = (title, list) => list.length ? `<h3 class="group-title">${title} (${list.length})</h3><div class="list">${list.map(taskRow).join("")}</div>` : "";
    const f = ui.tasks;
    const body = !db.tasks.length
      ? emptyCard("No tasks yet.", `<button class="button button-primary button-sm" data-action="task-add">${icon("plus")} Add your first task</button>`)
      : !shown.length ? emptyCard("No tasks match these filters.")
      : section("Overdue", overdue) + section("To do", open) + section("Done or cancelled", closed);
    return storageBanner() + pageHeader("GET IT DONE", "Task manager", "Track what is pending, in progress, completed or overdue.",
      `<button class="button button-primary" data-action="task-add">${icon("plus")} Add task</button>`) +
      `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Progress</h2><span class="muted">${completed} of ${all.length} completed</span></div>${progressBar(pct)}<div class="progress-label"><span>${plural(overdue.length === 0 ? db.tasks.filter(isOverdue).length : db.tasks.filter(isOverdue).length, "overdue task")}</span><span>${pct}%</span></div></div>
      <div class="toolbar"><div class="field"><label for="b_tasks_q">Search</label><input type="search" ${bindAttr("tasks.q", f.q)} placeholder="Search tasks"></div>
        ${bindSelect("tasks.status", f.status, [["", "All statuses"], ...TASK_STATUSES], "Status")}
        ${bindSelect("tasks.priority", f.priority, [["", "All priorities"], ...CONFIG.priorities], "Priority")}
        ${bindSelect("tasks.category", f.category, [["", "All categories"], ...categoryOptions("task")], "Category")}
        <div class="field"><label for="b_tasks_date">Due on</label><input type="date" ${bindAttr("tasks.date", f.date)}></div></div>
      <div class="card">${body}</div>`;
  }
};

function openTaskForm(existing) {
  const links = [["", "None"], ...db.schedules.map((s) => [s.id, `${s.title} (${fmtDateShort(s.date)})`])];
  openForm({
    title: existing ? "Edit task" : "Add task",
    fields: [
      { name: "title", label: "Title", required: true, wide: true, max: 120 },
      { name: "description", label: "Description", type: "textarea", wide: true, max: 500 },
      { name: "deadline", label: "Deadline", type: "date" },
      { name: "priority", label: "Priority", type: "select", options: CONFIG.priorities, default: "medium" },
      { name: "category", label: "Category", type: "select", options: categoryOptions("task") },
      { name: "status", label: "Status", type: "select", options: TASK_STATUSES, default: "pending" },
      { name: "scheduleId", label: "Linked schedule (optional)", type: "select", options: links, wide: true }
    ],
    values: existing || { priority: "medium", status: "pending", category: db.categories.task[0] },
    validate: (v) => (v.deadline && !validDateKey(v.deadline) ? "Enter a valid deadline." : ""),
    onSubmit(v) {
      const prev = existing || { id: uid(), createdAt: new Date().toISOString(), completedAt: null };
      const next = Object.assign({}, prev, v);
      if (next.status === "completed" && !prev.completedAt) next.completedAt = new Date().toISOString();
      if (next.status !== "completed") next.completedAt = null;
      const ok = commit(["tasks"], () => {
        if (existing) db.tasks[db.tasks.findIndex((t) => t.id === existing.id)] = next; else db.tasks.push(next);
      });
      if (!ok) return false;
      showToast(existing ? "Task updated." : "Task added.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["task-add"] = () => openTaskForm();
ACTIONS["task-edit"] = (el) => openTaskForm(db.tasks.find((t) => t.id === el.dataset.id));
ACTIONS["task-toggle"] = (el) => {
  commit(["tasks"], () => {
    const t = db.tasks.find((x) => x.id === el.dataset.id);
    if (t.status === "completed") { t.status = "pending"; t.completedAt = null; } else { t.status = "completed"; t.completedAt = new Date().toISOString(); }
  });
  renderPage();
};
ACTIONS["task-delete"] = (el) => {
  const task = db.tasks.find((t) => t.id === el.dataset.id);
  askConfirm({
    title: "Delete task?", message: `“${task.title}” will be deleted.`, confirmLabel: "Delete",
    onConfirm() {
      if (!commit(["tasks"], () => { db.tasks = db.tasks.filter((t) => t.id !== task.id); })) return false;
      showToast("Task deleted.");
      renderPage();
    }
  });
};

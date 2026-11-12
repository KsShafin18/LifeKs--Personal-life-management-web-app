"use strict";

/* ===== Dashboard ===== */
function backupNudge() {
  const hasData = db.transactions.length + db.tasks.length + db.notes.length + db.sleep.length + db.schedules.length + db.habits.length + db.goals.length > 0;
  if (!hasData) return "";
  const at = db.settings.lastBackupAt;
  const old = !at || Date.now() - new Date(at) > 7 * 86400000;
  return old ? `<div class="notice">${icon("hard-drive")}<p><strong>${at ? "It’s been over a week since your last backup." : "You haven’t backed up yet."}</strong> Your data lives only in this browser. <button class="text-button" data-action="export-backup">Download a backup</button></p></div>` : "";
}

function productivityToday() {
  const today = todayKey();
  const occs = occurrencesOn(today);
  const tasks = db.tasks.filter((t) => t.status !== "cancelled" && (t.deadline === today || (t.completedAt && isoDay(t.completedAt) === today)));
  const total = occs.length + tasks.length;
  const done = occs.filter((o) => o.done).length + tasks.filter((t) => t.status === "completed").length;
  return { total, done, pct: barPct(done, total) };
}

PAGES.dashboard = {
  title: "Dashboard",
  render() {
    const now = new Date();
    const today = todayKey();
    const occs = occurrencesOn(today);
    const active = occs.filter((o) => occStatus(o) === "active");
    const next = nextOccurrence();
    const open = db.tasks.filter(isOpenTask);
    const doneTasks = db.tasks.filter((t) => t.status === "completed").length;
    const overdue = open.filter(isOverdue).length;
    const prod = productivityToday();
    const ongoing = ongoingSleep();
    const lastSleep = db.sleep.filter((s) => s.end).sort((a, b) => new Date(b.end) - new Date(a.end))[0];
    const recent = db.transactions.slice().sort(byTimeDesc).slice(0, 5);
    const habitsDone = db.habits.filter((h) => habitDone(h, today)).length;
    const activeChallenges = db.challenges.filter((challenge) => !challenge.endedAt);
    const link = (page, text) => `<button class="text-button" data-page="${page}">${text} ${icon("arrow-right")}</button>`;

    const nowNext = (active.length ? active.map((o) => `<div class="row"><div class="row-main"><strong>${esc(o.entry.title)}</strong><small>${fmtTime(o.entry.start)} – ${fmtTime(o.entry.end)} · ${fmtDur((toMin(o.entry.end) - nowMin()) * 60000)} left</small></div><span class="pill is-red">Happening now</span></div>`).join("") : "") +
      (next ? `<div class="row"><div class="row-main"><strong>${esc(next.occ.entry.title)}</strong><small>${next.occ.date === today ? "Today" : esc(fmtDateShort(next.occ.date))} at ${fmtTime(next.occ.entry.start)} · in ${fmtDur(next.msUntil)}</small></div><span class="pill">Next</span></div>` : "");

    const sleepBody = ongoing
      ? `<p style="margin:0">Asleep since ${esc(fmtDateTime(ongoing.start))}. <strong data-elapsed-from="${ongoing.start}">${fmtDur(Date.now() - new Date(ongoing.start))}</strong> so far.</p>`
      : lastSleep ? `<div class="stat-row"><div class="stat"><small>Latest session</small><strong>${fmtDur(sleepDuration(lastSleep))}</strong></div><div class="stat"><small>Slept today</small><strong>${fmtDur(sleepTotal(today))}</strong></div></div><p class="muted" style="margin:0;font-size:12px">${esc(fmtDateTime(lastSleep.start))} → ${esc(fmtClock(lastSleep.end))}</p>`
      : emptyCard("No sleep logged yet.");

    return storageBanner() + backupNudge() +
      `<section class="welcome-row"><div><span class="eyebrow">YOUR DAY, YOUR WAY</span><h1>${esc(greeting(now))}</h1></div>
        <div class="welcome-datetime"><span>${icon("calendar-days")}${esc(fmtDateLong(today))}</span><strong>${icon("clock-3")}${esc(fmtClock(now))}</strong></div></section>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Now and next</h2>${link("schedule", "Schedule")}</div>${nowNext || emptyCard(occs.length ? "Nothing else is coming up." : "No activity planned.", `<button class="button button-primary button-sm" data-page="schedule">Plan your day</button>`)}</div>
        <div class="card"><div class="card-head"><h2>Tasks</h2>${link("tasks", "Tasks")}</div>
          ${db.tasks.length ? `<div class="stat-row"><div class="stat"><small>Pending</small><strong>${open.length}</strong></div><div class="stat"><small>Completed</small><strong class="pos">${doneTasks}</strong></div><div class="stat"><small>Overdue</small><strong class="${overdue ? "neg" : ""}">${overdue}</strong></div></div>` : emptyCard("No tasks yet.", `<button class="button button-primary button-sm" data-page="tasks">Add a task</button>`)}</div>
        <div class="card"><div class="card-head"><h2>Today’s progress</h2></div>${prod.total ? `${progressBar(prod.pct)}<div class="progress-label"><span>${prod.done} of ${prod.total} done</span><span>${prod.pct}%</span></div><p class="muted" style="margin:10px 0 0;font-size:12px">Counts today’s schedule and tasks due or finished today.</p>` : emptyCard("Nothing scheduled or due today.")}
          ${db.habits.length ? `<p style="margin:12px 0 0">Habits: <strong>${habitsDone} of ${db.habits.length}</strong> done today. ${link("goals", "Habits")}</p>` : ""}</div>
        <div class="card"><div class="card-head"><h2>Sleep</h2>${link("sleep", "Sleep")}</div>${sleepBody}</div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Your 30-day challenges</h2>${link("challenges", "View all")}</div>
        ${activeChallenges.length ? `<div class="stack">${activeChallenges.map(challengeActiveCard).join("")}</div>` : emptyCard("No active challenges yet.", `<button class="button button-primary button-sm" data-action="challenge-add">${icon("plus")} Add a challenge</button>`)}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2><button class="text-button" type="button" data-action="dashboard-history-toggle" aria-expanded="${!!ui.dashboardHistoryOpen}" aria-controls="dashboardHistoryList">Transaction history ${icon(ui.dashboardHistoryOpen ? "chevron-up" : "chevron-down")}</button></h2>${link("transactions", "See all")}</div>
        <div class="list" id="dashboardHistoryList"${ui.dashboardHistoryOpen ? "" : " hidden"}>${ui.dashboardHistoryOpen ? (recent.length ? recent.map(txRow).join("") : emptyCard("Nothing here until you record a transaction.")) : ""}</div></div>`;
  }
};

ACTIONS["dashboard-history-toggle"] = () => {
  ui.dashboardHistoryOpen = !ui.dashboardHistoryOpen;
  renderPage();
};

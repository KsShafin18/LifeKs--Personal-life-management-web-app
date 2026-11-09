"use strict";

/* ===== Sleep Tracker =====
 * Each session is stored separately: { id, start, end|null, note } with ISO timestamps.
 * A session belongs to the day it STARTED (so 1:30 AM–7:00 AM counts for that calendar day,
 * and a 11 PM–6 AM session counts for the evening it began). It may cross midnight.
 * An ongoing session (end = null) is shown as ongoing and never counted as a finished duration.
 * Times use this device's timezone. */
ui.sleep = { date: todayKey() };

const sleepDuration = (s) => (s.end ? new Date(s.end) - new Date(s.start) : null);
const ongoingSleep = () => db.sleep.find((s) => !s.end) || null;
const sleepOn = (key) => db.sleep.filter((s) => isoDay(s.start) === key).sort((a, b) => new Date(a.start) - new Date(b.start));
const sleepTotal = (key) => sleepOn(key).reduce((sum, s) => sum + (sleepDuration(s) || 0), 0);

function validateSleepRange(startIso, endIso, ignoreId) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "Enter a valid start time.";
  const now = Date.now();
  if (start.getTime() > now + 60000) return "Start time can’t be in the future.";
  let end = null;
  if (endIso) {
    end = new Date(endIso);
    if (Number.isNaN(end.getTime())) return "Enter a valid end time.";
    if (end <= start) return "End time must be after the start time.";
    if (end.getTime() > now + 60000) return "End time can’t be in the future.";
  } else if (db.sleep.some((s) => !s.end && s.id !== ignoreId)) {
    return "Another sleep session is still ongoing. Wake up from it first.";
  }
  const myEnd = end ? end.getTime() : now;
  const clash = db.sleep.find((s) => s.id !== ignoreId && new Date(s.start).getTime() < myEnd && start.getTime() < (s.end ? new Date(s.end).getTime() : now));
  if (clash) return `This overlaps with another session (${fmtDateTime(clash.start)}${clash.end ? " – " + fmtClock(clash.end) : " – ongoing"}).`;
  return "";
}

function sleepSessionRow(s) {
  const dur = sleepDuration(s);
  const crosses = s.end && isoDay(s.start) !== isoDay(s.end);
  return `<div class="row"><div class="row-main">
      <strong>${fmtClock(s.start)} → ${s.end ? fmtClock(s.end) : "ongoing"}</strong>
      <small>${dur === null ? `Sleeping for <span data-elapsed-from="${s.start}">${fmtDur(Date.now() - new Date(s.start))}</span> so far` : fmtDur(dur)}${s.note ? " · " + esc(s.note) : ""}</small>
      <span class="pills">${dur === null ? `<span class="pill is-red">Ongoing</span>` : ""}${crosses ? `<span class="pill">Crosses midnight (ends ${esc(fmtDateShort(isoDay(s.end)))})</span>` : ""}</span></div>
    <div class="row-actions">
      <button class="icon-button" data-action="sleep-edit" data-id="${s.id}" aria-label="Edit session">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="sleep-delete" data-id="${s.id}" aria-label="Delete session">${icon("trash-2")}</button></div></div>`;
}

function awakeGaps(sessions) {
  const done = sessions.filter((s) => s.end);
  const gaps = [];
  for (let i = 1; i < done.length; i += 1) {
    const gap = new Date(done[i].start) - new Date(done[i - 1].end);
    if (gap > 0) gaps.push(`Awake ${fmtDur(gap)} between ${fmtClock(done[i - 1].end)} and ${fmtClock(done[i].start)}`);
  }
  return gaps;
}

function sleepAverage(days) {
  const today = todayKey();
  const totals = Array.from({ length: days }, (_, i) => sleepTotal(addDays(today, -i))).filter((t) => t > 0);
  return { logged: totals.length, avg: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0, total: totals.reduce((a, b) => a + b, 0) };
}

PAGES.sleep = {
  title: "Sleep Tracker",
  render() {
    const key = ui.sleep.date;
    const sessions = sleepOn(key);
    const ongoing = ongoingSleep();
    const w = sleepAverage(7);
    const m = sleepAverage(30);
    const control = ongoing
      ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>You’re asleep</h2><span class="pill is-red">Ongoing</span></div>
          <p class="muted" style="margin:0 0 12px">Started ${esc(fmtDateTime(ongoing.start))} · <strong data-elapsed-from="${ongoing.start}">${fmtDur(Date.now() - new Date(ongoing.start))}</strong> so far. This isn’t counted in totals until you wake up.</p>
          <button class="button button-primary" data-action="sleep-wake">${icon("sun")} Wake up</button></div>`
      : `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Going to sleep?</h2></div>
          <p class="muted" style="margin:0 0 12px">Start a session now, then tap Wake up when you’re up. You can log several sessions in one day.</p>
          <button class="button button-primary" data-action="sleep-start">${icon("moon-star")} Start sleep</button></div>`;
    const gaps = awakeGaps(sessions);
    const days = Array.from({ length: 14 }, (_, i) => addDays(todayKey(), -(13 - i)));
    const totals = days.map(sleepTotal);
    const max = Math.max(...totals, 1);
    const bars = days.map((d, i) => `<div class="bar-col" title="${esc(fmtDateShort(d))}: ${fmtDur(totals[i])}"><div class="bar-pair"><div class="bar" style="height:${barPct(totals[i], max)}%"></div></div><small>${dateFromKey(d).getDate()}</small></div>`).join("");
    return storageBanner() + pageHeader("REST WELL", "Sleep tracker", "Log every sleep session, including several in one day. Times follow this device’s timezone.",
      `<button class="button button-outline" data-action="sleep-add">${icon("plus")} Add past session</button>`) + control +
      `<div class="stat-row">
        <div class="stat"><small>7-day average</small><strong>${w.logged ? fmtDur(w.avg) : "No data"}</strong></div>
        <div class="stat"><small>30-day average</small><strong>${m.logged ? fmtDur(m.avg) : "No data"}</strong></div>
        <div class="stat"><small>Last 7 days total</small><strong>${w.logged ? fmtDur(w.total) : "No data"}</strong></div>
        <div class="stat"><small>Days logged (30)</small><strong>${m.logged}</strong></div></div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Sessions</h2>
          <div class="date-nav"><button class="icon-button" data-action="sleep-nav" data-dir="-1" aria-label="Previous day">${icon("chevron-left")}</button><strong>${esc(fmtDateShort(key))}</strong><button class="icon-button" data-action="sleep-nav" data-dir="1" aria-label="Next day">${icon("chevron-right")}</button></div></div>
          <div class="stat-row"><div class="stat"><small>Total sleep</small><strong>${fmtDur(sleepTotal(key))}</strong></div><div class="stat"><small>Sessions</small><strong>${sessions.length}</strong></div></div>
          ${sessions.length ? `<div class="list">${sessions.map(sleepSessionRow).join("")}</div>` : emptyCard("No sleep logged for this day.")}
          ${gaps.length ? `<p class="muted" style="margin:12px 0 0">${gaps.map(esc).join("<br>")}</p>` : ""}
          <p class="muted" style="margin:12px 0 0;font-size:12px">A session counts for the day it started.</p></div>
        <div class="card"><div class="card-head"><h2>Last 14 days</h2></div><div class="bars">${bars}</div><p class="muted" style="margin:10px 0 0;font-size:12px">Each bar is total finished sleep for that date.</p></div></div>`;
  }
};

function sleepForm(existing) {
  openForm({
    title: existing ? "Edit sleep session" : "Add past sleep session",
    intro: existing && !existing.end ? "Leave the end time empty to keep this session ongoing." : "",
    fields: [
      { name: "start", label: "Fell asleep", type: "datetime-local", required: true },
      { name: "end", label: "Woke up", type: "datetime-local", required: !existing || !!existing.end },
      { name: "note", label: "Notes (optional)", wide: true, max: 200 }
    ],
    values: existing ? { start: toLocalInput(existing.start), end: existing.end ? toLocalInput(existing.end) : "", note: existing.note || "" } : {},
    validate: (v) => validateSleepRange(v.start ? fromLocalInput(v.start) : "", v.end ? fromLocalInput(v.end) : null, existing && existing.id),
    onSubmit(v) {
      const next = Object.assign({}, existing || { id: uid(), createdAt: new Date().toISOString() }, { start: fromLocalInput(v.start), end: v.end ? fromLocalInput(v.end) : null, note: v.note });
      if (!commit(["sleep"], () => { if (existing) db.sleep[db.sleep.findIndex((s) => s.id === existing.id)] = next; else db.sleep.push(next); })) return false;
      ui.sleep.date = isoDay(next.start);
      showToast(existing ? "Session updated." : "Session added.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["sleep-add"] = () => sleepForm();
ACTIONS["sleep-edit"] = (el) => sleepForm(db.sleep.find((s) => s.id === el.dataset.id));
ACTIONS["sleep-nav"] = (el) => { ui.sleep.date = addDays(ui.sleep.date, Number(el.dataset.dir)); renderPage(); };
ACTIONS["sleep-start"] = () => {
  const now = new Date().toISOString();
  const problem = validateSleepRange(now, null, null);
  if (problem) { showToast(problem, true); return; }
  if (commit(["sleep"], () => db.sleep.push({ id: uid(), start: now, end: null, note: "", createdAt: now }))) {
    ui.sleep.date = isoDay(now);
    showToast("Sleep session started. Sleep well.");
    renderPage();
  }
};
ACTIONS["sleep-wake"] = () => {
  const s = ongoingSleep();
  if (!s) return;
  const now = new Date().toISOString();
  if (new Date(now) <= new Date(s.start)) { showToast("Wait a moment before waking up.", true); return; }
  if (commit(["sleep"], () => { s.end = now; })) {
    showToast(`Good morning. You slept ${fmtDur(new Date(now) - new Date(s.start))}.`);
    renderPage();
  }
};
ACTIONS["sleep-delete"] = (el) => {
  const s = db.sleep.find((x) => x.id === el.dataset.id);
  askConfirm({
    title: "Delete sleep session?", message: `The session starting ${fmtDateTime(s.start)} will be deleted.`, confirmLabel: "Delete",
    onConfirm() {
      if (!commit(["sleep"], () => { db.sleep = db.sleep.filter((x) => x.id !== s.id); })) return false;
      showToast("Session deleted.");
      renderPage();
    }
  });
};

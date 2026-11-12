"use strict";

/* ===== 30-day challenges ===== */
const CHALLENGE_LENGTH = 30;

function challengeDaysKept(challenge, endDate = todayKey()) {
  const end = endDate < challenge.startDate ? challenge.startDate : endDate;
  return Math.round((dateForKey(end) - dateForKey(challenge.startDate)) / 86400000) + 1;
}

function challengeProgress(challenge) {
  return barPct(challengeDaysKept(challenge), CHALLENGE_LENGTH);
}

function challengeRing(pct) {
  return `<span class="challenge-ring" style="--challenge-angle:${pct * 3.6}deg" role="img" aria-label="${pct}% of 30 days">${pct}%</span>`;
}

function challengeActiveCard(challenge) {
  const days = challengeDaysKept(challenge);
  const pct = challengeProgress(challenge);
  const targetDays = Math.min(days, CHALLENGE_LENGTH);
  return `<article class="challenge-item">
    <span class="challenge-emoji" aria-hidden="true">${esc(challenge.emoji)}</span>
    <div class="challenge-copy"><strong>${esc(challenge.title)}</strong>
      <small>Started ${esc(fmtDateShort(challenge.startDate))} · ${plural(days, "day")} so far</small>
      ${progressBar(pct)}<div class="progress-label"><span>${targetDays} of ${CHALLENGE_LENGTH} target days${days > CHALLENGE_LENGTH ? " · 30-day mark reached" : ""}</span><span>${pct}%</span></div>
    </div>${challengeRing(pct)}
    <button class="button button-outline button-sm" data-action="challenge-end" data-id="${esc(challenge.id)}">End challenge</button>
  </article>`;
}

function challengeHistoryCard(challenge) {
  const days = challengeDaysKept(challenge, isoDay(challenge.endedAt));
  const pct = barPct(days, CHALLENGE_LENGTH);
  return `<article class="card challenge-history">
    <div class="card-head"><div class="challenge-history-title"><span class="challenge-emoji" aria-hidden="true">${esc(challenge.emoji)}</span><div><h2>${esc(challenge.title)}</h2>
      <p class="muted" style="margin:3px 0 0">Started ${esc(fmtDateShort(challenge.startDate))} · ended ${esc(fmtDateShort(isoDay(challenge.endedAt)))}</p></div></div>${challengeRing(pct)}</div>
    <div class="stat-row"><div class="stat"><small>Days kept</small><strong>${plural(days, "day")}</strong></div><div class="stat"><small>30-day target</small><strong>${pct}%</strong></div></div>
    <p class="muted" style="margin:0">${pct === 100 ? "You reached the 30-day target." : `${CHALLENGE_LENGTH - days} ${CHALLENGE_LENGTH - days === 1 ? "day" : "days"} short of the target.`}</p>
  </article>`;
}

PAGES.challenges = {
  title: "30-day Challenges",
  render() {
    const active = db.challenges.filter((challenge) => !challenge.endedAt)
      .slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    const history = db.challenges.filter((challenge) => challenge.endedAt)
      .slice().sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    const addButton = `<button class="button button-primary" data-action="challenge-add">${icon("plus")} Start a challenge</button>`;
    return storageBanner() + pageHeader("YOUR MIND", "30-day challenges", "Build momentum at your own pace. Run multiple challenges together; they stay active until you end them.", addButton) +
      `<div class="card"><div class="card-head"><h2>In progress</h2><span class="muted">${active.length} active</span></div>
        ${active.length ? `<div class="challenge-list">${active.map(challengeActiveCard).join("")}</div>` : emptyCard("No active challenges. Choose a goal and start your first 30-day challenge.", addButton)}</div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Challenge records</h2><span class="muted">${history.length} ended</span></div>
        ${history.length ? `<div class="grid grid-2">${history.map(challengeHistoryCard).join("")}</div>` : emptyCard("Ended challenges will stay here with the days you kept and your completion percentage.")}</div>`;
  }
};

function openChallengeForm(startedEarlier) {
  const today = todayKey();
  openForm({
    title: "Start a 30-day challenge",
    intro: startedEarlier ? "Add the date you actually started. Your progress will be calculated from that date." : "Your challenge starts today. Add a name and a target emoji.",
    fields: [
      { name: "title", label: "Challenge", required: true, wide: true, max: 100 },
      { name: "emoji", label: "Target emoji", required: true, max: 12 },
      ...(startedEarlier ? [{ name: "startDate", label: "Start date", type: "date", required: true }] : [])
    ],
    values: { emoji: "🎯", startDate: today },
    validate(values) {
      if (startedEarlier && (!validDateKey(values.startDate) || values.startDate > today)) return "Choose a valid start date that is today or earlier.";
      return "";
    },
    onSubmit(values) {
      const challenge = {
        id: uid(), title: values.title, emoji: values.emoji,
        startDate: startedEarlier ? values.startDate : today,
        endedAt: null, createdAt: new Date().toISOString()
      };
      if (!commit(["challenges"], () => { db.challenges.push(challenge); })) return false;
      showToast("30-day challenge started.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["challenge-add"] = () => askConfirm({
  title: "Have you already started?",
  message: "If you started this challenge earlier, choose Yes and enter the original date. Otherwise, choose No to start today.",
  confirmLabel: "Yes, choose a date",
  cancelLabel: "No, start today",
  danger: false,
  onConfirm() { openChallengeForm(true); },
  onCancel() { openChallengeForm(false); }
});

ACTIONS["challenge-end"] = (el) => {
  const challenge = db.challenges.find((item) => item.id === el.dataset.id && !item.endedAt);
  if (!challenge) return;
  const days = challengeDaysKept(challenge);
  const pct = barPct(days, CHALLENGE_LENGTH);
  askConfirm({
    title: "End this challenge?",
    message: `You kept “${challenge.title}” for ${plural(days, "day")}. Your recorded completion will be ${pct}%. This will move it to challenge records.`,
    confirmLabel: "End challenge",
    danger: false,
    onConfirm() {
      if (!commit(["challenges"], () => { challenge.endedAt = new Date().toISOString(); })) return false;
      showToast(`Challenge ended · ${pct}% of the 30-day target.`);
      renderPage();
    }
  });
};

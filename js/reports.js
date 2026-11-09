"use strict";

/* ===== Reports & Analytics (all numbers are calculated from saved records) =====
 * Income and expenses count ONLY "income" and "expense" ledger entries.
 * Transfers, loan principal and repayments are never counted, so nothing is double-counted. */
ui.reports = { range: "7", from: "", to: "" };
const RANGE_OPTIONS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["month", "This month"], ["custom", "Custom range"]];

function reportDays() {
  const r = ui.reports;
  const today = todayKey();
  let from;
  let to = today;
  if (r.range === "7") from = addDays(today, -6);
  else if (r.range === "30") from = addDays(today, -29);
  else if (r.range === "month") from = today.slice(0, 8) + "01";
  else { from = r.from; to = r.to; }
  if (!validDateKey(from) || !validDateKey(to) || from > to) return { days: [], error: r.range === "custom" ? "Choose a valid start and end date (start on or before end)." : "" };
  const days = [];
  for (let k = from; k <= to && days.length < 366; k = addDays(k, 1)) days.push(k);
  return { days, error: "" };
}

function dualBars(days, valueA, valueB) {
  const size = days.length <= 31 ? 1 : 7;
  const buckets = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    buckets.push({ label: days.length <= 31 ? String(dateFromKey(slice[0]).getDate()) : `${dateFromKey(slice[0]).getDate()}/${dateFromKey(slice[0]).getMonth() + 1}`, title: size === 1 ? fmtDateShort(slice[0]) : `${fmtDateShort(slice[0])} – ${fmtDateShort(slice[slice.length - 1])}`, a: slice.reduce((s, d) => s + valueA(d), 0), b: valueB ? slice.reduce((s, d) => s + valueB(d), 0) : null });
  }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.a, b.b || 0)));
  return `<div class="bars">${buckets.map((b) => `<div class="bar-col" title="${esc(b.title)}"><div class="bar-pair"><div class="bar is-green" style="height:${barPct(b.a, max)}%"></div>${b.b !== null ? `<div class="bar" style="height:${barPct(b.b, max)}%"></div>` : ""}</div><small>${esc(b.label)}</small></div>`).join("")}</div>`;
}

function balanceAtEnd(dayKey) {
  const wallets = activeWallets();
  const ids = new Set(wallets.map((w) => w.id));
  let total = wallets.reduce((s, w) => s + (w.opening || 0), 0);
  db.transactions.forEach((t) => { if (isoDay(t.at) <= dayKey) ids.forEach((id) => { total += txEffect(t, id); }); });
  return total;
}

function sparkline(values) {
  if (values.length < 2) return emptyCard("Pick a range of at least two days to see the balance history.");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(36 - ((v - min) / span) * 32).toFixed(2)}`).join(" ");
  return `<svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Total balance over time"><path d="${pts}"></path></svg><div class="progress-label"><span>Low ${fmtMoney(min)}</span><span>High ${fmtMoney(max)}</span></div>`;
}

function hbars(items, formatter) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => `<div class="hbar"><span>${esc(i.label)}</span>${progressBar(barPct(i.value, max))}<strong>${formatter(i.value)}</strong></div>`).join("");
}

PAGES.reports = {
  title: "Reports & Analytics",
  render() {
    const r = ui.reports;
    const { days, error } = reportDays();
    const filters = `<div class="toolbar">${bindSelect("reports.range", r.range, RANGE_OPTIONS, "Date range")}
      ${r.range === "custom" ? `<div class="field"><label for="b_reports_from">From</label><input type="date" ${bindAttr("reports.from", r.from)}></div><div class="field"><label for="b_reports_to">To</label><input type="date" ${bindAttr("reports.to", r.to)}></div>` : ""}</div>`;
    const header = storageBanner() + pageHeader("SEE THE PATTERN", "Reports & analytics", "Charts and totals calculated from your saved records.",
      `<button class="button button-outline" data-action="export-csv">${icon("download")} Transactions CSV</button><button class="button button-outline" data-action="export-backup">${icon("download")} Full backup</button>`) + filters;
    if (error || !days.length) return header + emptyCard(error || "Choose a date range.");

    const inRange = db.transactions.filter((t) => isoDay(t.at) >= days[0] && isoDay(t.at) <= days[days.length - 1]);
    const income = sumType(inRange, "income");
    const expense = sumType(inRange, "expense");
    const catTotals = {};
    inRange.filter((t) => t.type === "expense").forEach((t) => { const c = t.category || "Uncategorised"; catTotals[c] = (catTotals[c] || 0) + t.amount; });
    const cats = Object.entries(catTotals).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const dayIncome = (d) => txOn(d).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const dayExpense = (d) => txOn(d).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const walletItems = activeWallets().map((w) => ({ label: w.name, value: Math.max(0, walletBalance(w)) }));
    const receivable = db.loans.filter((l) => l.direction === "lent").reduce((s, l) => s + loanOutstanding(l), 0);
    const payable = db.loans.filter((l) => l.direction === "borrowed").reduce((s, l) => s + loanOutstanding(l), 0);
    const balances = days.length <= 120 ? days.map(balanceAtEnd) : days.filter((_, i) => i % 7 === 0 || i === days.length - 1).map(balanceAtEnd);

    const finance = `<div class="card"><div class="card-head"><h2>Finance</h2></div>
      <div class="stat-row"><div class="stat"><small>Income</small><strong class="pos">${fmtMoney(income)}</strong></div><div class="stat"><small>Expenses</small><strong class="neg">${fmtMoney(expense)}</strong></div><div class="stat"><small>Savings (net cash flow)</small><strong class="${income - expense < 0 ? "neg" : "pos"}">${fmtMoney(income - expense)}</strong></div></div>
      ${inRange.length ? dualBars(days, dayIncome, dayExpense) : emptyCard("No transactions in this range.")}
      <div class="legend"><span><i class="is-green"></i>Income</span><span><i></i>Expenses</span></div></div>
      <div class="grid grid-2"><div class="card"><div class="card-head"><h2>Expenses by category</h2></div>${cats.length ? hbars(cats, fmtMoney) : emptyCard("No expenses in this range.")}</div>
        <div class="card"><div class="card-head"><h2>Wallet balances now</h2></div>${walletItems.length ? hbars(walletItems, fmtMoney) : emptyCard("No active wallets.")}</div></div>
      <div class="grid grid-2"><div class="card"><div class="card-head"><h2>Balance history</h2></div>${sparkline(balances)}</div>
        <div class="card"><div class="card-head"><h2>Lending &amp; borrowing now</h2></div><div class="stat-row"><div class="stat"><small>Owed to you</small><strong class="pos">${fmtMoney(receivable)}</strong></div><div class="stat"><small>You owe</small><strong class="neg">${fmtMoney(payable)}</strong></div></div><p class="muted" style="margin:0;font-size:12px">Loans and repayments are kept separate from income and expenses.</p></div></div>`;

    const sleepDays = days.filter((d) => sleepTotal(d) > 0);
    const sleepSessions = db.sleep.filter((s) => s.end && isoDay(s.start) >= days[0] && isoDay(s.start) <= days[days.length - 1]);
    const sleepAvg = sleepDays.length ? sleepDays.reduce((s, d) => s + sleepTotal(d), 0) / sleepDays.length : 0;
    const sleep = `<div class="card"><div class="card-head"><h2>Sleep</h2></div>
      <div class="stat-row"><div class="stat"><small>Average per day logged</small><strong>${sleepDays.length ? fmtDur(sleepAvg) : "No data"}</strong></div><div class="stat"><small>Finished sessions</small><strong>${sleepSessions.length}</strong></div><div class="stat"><small>Days logged</small><strong>${sleepDays.length}</strong></div></div>
      ${sleepDays.length ? dualBars(days, (d) => sleepTotal(d) / 60000, null) : emptyCard("No finished sleep sessions in this range.")}<p class="muted" style="margin:8px 0 0;font-size:12px">Bar height is total minutes of finished sleep. Ongoing sessions are excluded.</p></div>`;

    const doneTasks = db.tasks.filter((t) => t.status === "completed" && t.completedAt && isoDay(t.completedAt) >= days[0] && isoDay(t.completedAt) <= days[days.length - 1]).length;
    const open = db.tasks.filter(isOpenTask);
    const pastDays = days.filter((d) => d <= todayKey());
    const occs = pastDays.flatMap(occurrencesOn);
    const occDone = occs.filter((o) => o.done).length;
    const habitChecks = db.habits.reduce((s, h) => s + days.filter((d) => habitDone(h, d)).length, 0);
    const goals = db.goals.filter(goalIsCurrent);
    const goalPct = goals.length ? Math.round(goals.reduce((s, g) => s + Math.min(100, barPct(g.progress, g.target)), 0) / goals.length) : null;
    const weekly = Array.from({ length: 4 }, (_, i) => { const start = addDays(weekStart(todayKey()), -7 * (3 - i)); return { label: fmtDateShort(start), value: db.tasks.filter((t) => t.completedAt && isoDay(t.completedAt) >= start && isoDay(t.completedAt) <= addDays(start, 6)).length }; });
    const productivity = `<div class="card"><div class="card-head"><h2>Productivity</h2></div>
      <div class="stat-row"><div class="stat"><small>Tasks completed</small><strong class="pos">${doneTasks}</strong></div><div class="stat"><small>Tasks pending now</small><strong>${open.filter((t) => !isOverdue(t)).length}</strong></div><div class="stat"><small>Overdue now</small><strong class="${open.some(isOverdue) ? "neg" : ""}">${open.filter(isOverdue).length}</strong></div>
        <div class="stat"><small>Schedule completion</small><strong>${occs.length ? Math.round((occDone / occs.length) * 100) + "%" : "No data"}</strong></div><div class="stat"><small>Habit check-ins</small><strong>${habitChecks}</strong></div><div class="stat"><small>Goal progress now</small><strong>${goalPct === null ? "No goals" : goalPct + "%"}</strong></div></div>
      <h3 class="group-title">Tasks completed per week (last 4 weeks)</h3>${hbars(weekly, (v) => String(v))}</div>`;
    return header + `<div class="stack">${finance}${sleep}${productivity}</div>`;
  }
};

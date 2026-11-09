"use strict";

/* ===== Personal Finance =====
 * Money is stored as integer paisa (minor units); amounts are never floating point.
 * The ledger (db.transactions) is the source of truth. Wallet balances are DERIVED:
 *   balance = opening balance + every ledger movement touching that wallet.
 * Nothing stores a balance, so editing or deleting a transaction cannot leave a stale total.
 *
 * Ledger types and their effect on the wallet:
 *   income, loan_borrowed, repay_received  -> increase the wallet
 *   expense, loan_lent, repay_paid         -> decrease the wallet
 *   transfer                               -> decrease source, increase destination (one record, so it can't be counted twice)
 * Reports count ONLY "income" and "expense" as income/expense. Transfers, loan principal and
 * repayments are never income or expense.
 */
ui.finance = { date: todayKey(), wallet: "", type: "", person: "", category: "" };
ui.tx = { from: "", to: "", wallet: "", type: "", person: "", category: "", q: "" };

const TX_TYPES = [
  ["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"],
  ["loan_lent", "Money lent"], ["loan_borrowed", "Money borrowed"],
  ["repay_received", "Repayment received"], ["repay_paid", "Repayment paid"]
];
const TX_IN = ["income", "loan_borrowed", "repay_received"];
const TX_OUT = ["expense", "loan_lent", "repay_paid"];

function txEffect(tx, walletId) {
  if (TX_IN.includes(tx.type)) return tx.walletId === walletId ? tx.amount : 0;
  if (TX_OUT.includes(tx.type)) return tx.walletId === walletId ? -tx.amount : 0;
  if (tx.type === "transfer") return (tx.walletId === walletId ? -tx.amount : 0) + (tx.toWalletId === walletId ? tx.amount : 0);
  return 0;
}
const walletBalance = (w) => db.transactions.reduce((sum, tx) => sum + txEffect(tx, w.id), w.opening || 0);
const activeWallets = () => db.wallets.filter((w) => !w.archived);
const totalBalance = () => activeWallets().reduce((sum, w) => sum + walletBalance(w), 0);
const walletName = (id) => (db.wallets.find((w) => w.id === id) || { name: "Deleted wallet" }).name;
const walletOptions = () => activeWallets().map((w) => [w.id, w.name]);
const loanRepaid = (loan) => db.transactions.filter((t) => t.loanId === loan.id && (t.type === "repay_received" || t.type === "repay_paid")).reduce((s, t) => s + t.amount, 0);
const loanOutstanding = (loan) => loan.principal - loanRepaid(loan);
const txOn = (key) => db.transactions.filter((t) => isoDay(t.at) === key);
const byTimeDesc = (a, b) => new Date(b.at) - new Date(a.at);
const sumType = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

function txDescription(tx) {
  const person = tx.person || "—";
  switch (tx.type) {
    case "income": return `From ${person}${tx.category ? " · " + tx.category : ""}`;
    case "expense": return `To ${person}${tx.category ? " · " + tx.category : ""}`;
    case "transfer": return `${walletName(tx.walletId)} → ${walletName(tx.toWalletId)}`;
    case "loan_lent": return `Lent to ${person}`;
    case "loan_borrowed": return `Borrowed from ${person}`;
    case "repay_received": return `Repayment from ${person}`;
    case "repay_paid": return `Repayment to ${person}`;
    default: return person;
  }
}

function txRow(tx) {
  const amountClass = TX_IN.includes(tx.type) ? "pos" : TX_OUT.includes(tx.type) ? "neg" : "";
  const sign = TX_IN.includes(tx.type) ? "+" : TX_OUT.includes(tx.type) ? "−" : "";
  const loanTx = !!tx.loanId;
  return `<div class="row"><div class="row-main">
      <strong>${esc(txDescription(tx))}</strong>
      <small>${esc(fmtDateTime(tx.at))} · ${tx.type === "transfer" ? "Internal transfer" : esc(walletName(tx.walletId))}${tx.note ? " · " + esc(tx.note) : ""}</small>
      <span class="pills"><span class="pill ${tx.type === "income" ? "is-green" : tx.type === "expense" ? "is-red" : ""}">${esc(label(TX_TYPES, tx.type))}</span></span></div>
    <div class="row-amount ${amountClass}">${sign}${fmtMoney(tx.amount)}</div>
    <div class="row-actions">
      ${loanTx ? "" : `<button class="icon-button" data-action="tx-edit" data-id="${tx.id}" aria-label="Edit transaction">${icon("pencil")}</button>`}
      <button class="icon-button is-danger" data-action="tx-delete" data-id="${tx.id}" aria-label="Delete transaction">${icon("trash-2")}</button></div></div>`;
}

function matchTx(tx, f) {
  const person = f.person.trim().toLowerCase();
  return (!f.wallet || tx.walletId === f.wallet || tx.toWalletId === f.wallet) && (!f.type || tx.type === f.type) &&
    (!person || (tx.person || "").toLowerCase().includes(person)) && (!f.category || tx.category === f.category) &&
    (!f.q || (txDescription(tx) + " " + (tx.note || "")).toLowerCase().includes(f.q.trim().toLowerCase()));
}

const allCategories = () => [...new Set([...db.categories.income, ...db.categories.expense])].map((c) => [c, c]);

/* ----- Finance page ----- */
function loanRow(loan) {
  const out = loanOutstanding(loan);
  const overdue = out > 0 && loan.due && loan.due < todayKey();
  return `<div class="row"><div class="row-main"><strong>${esc(loan.person)}</strong>
      <small>${fmtMoney(loan.principal)} ${loan.direction === "lent" ? "lent" : "borrowed"} on ${esc(fmtDateShort(isoDay(loan.date)))} · repaid ${fmtMoney(loanRepaid(loan))}${loan.due ? " · due " + esc(fmtDateShort(loan.due)) : ""}${loan.reason ? " · " + esc(loan.reason) : ""}</small>
      <span class="pills"><span class="pill ${out === 0 ? "is-green" : overdue ? "is-red" : "is-amber"}">${out === 0 ? "Settled" : overdue ? "Overdue" : "Outstanding"}</span></span></div>
    <div class="row-amount ${loan.direction === "lent" ? "pos" : "neg"}">${fmtMoney(out)}</div>
    <div class="row-actions">
      ${out > 0 ? `<button class="button button-outline button-sm" data-action="loan-repay" data-id="${loan.id}">${loan.direction === "lent" ? "Record repayment" : "Repay"}</button>` : ""}
      <button class="icon-button" data-action="loan-edit" data-id="${loan.id}" aria-label="Edit loan">${icon("pencil")}</button>
      <button class="icon-button is-danger" data-action="loan-delete" data-id="${loan.id}" aria-label="Delete loan">${icon("trash-2")}</button></div></div>`;
}

PAGES.finance = {
  title: "Personal Finance",
  render() {
    const f = ui.finance;
    const dayTx = txOn(f.date);
    const income = sumType(dayTx, "income");
    const expense = sumType(dayTx, "expense");
    const shown = dayTx.filter((t) => matchTx(t, Object.assign({ q: "" }, f))).sort(byTimeDesc);
    const lent = db.loans.filter((l) => l.direction === "lent");
    const borrowed = db.loans.filter((l) => l.direction === "borrowed");
    const receivable = lent.reduce((s, l) => s + loanOutstanding(l), 0);
    const payable = borrowed.reduce((s, l) => s + loanOutstanding(l), 0);
    const wallets = activeWallets().map((w) => { const b = walletBalance(w); return `<div class="stat"><small>${esc(w.name)}</small><strong class="${b < 0 ? "neg" : ""}">${fmtMoney(b)}</strong></div>`; }).join("");
    const actions = `<button class="button button-primary" data-action="tx-add" data-type="income">${icon("arrow-down-left")} Income</button>
      <button class="button button-primary" data-action="tx-add" data-type="expense">${icon("arrow-up-right")} Expense</button>
      <button class="button button-outline" data-action="tx-add" data-type="transfer">${icon("arrow-left-right")} Transfer</button>
      <button class="button button-outline" data-action="loan-add" data-dir="lent">Lend</button>
      <button class="button button-outline" data-action="loan-add" data-dir="borrowed">Borrow</button>
      <button class="button button-outline" data-page="fees">${icon("graduation-cap")} Pay university fees</button>
      <button class="button button-outline" data-page="debts">${icon("hand-coins")} Pay debt</button>`;
    return storageBanner() + pageHeader("YOUR MONEY", "Personal finance", "Income, expenses, transfers and loans. Amounts are in " + db.settings.currency + ".", actions) +
      `<div class="stat-row"><div class="stat"><small>Total available</small><strong class="${totalBalance() < 0 ? "neg" : ""}">${fmtMoney(totalBalance())}</strong></div>${wallets}</div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Daily money activity</h2>
          <div class="date-nav"><button class="icon-button" data-action="fin-nav" data-dir="-1" aria-label="Previous day">${icon("chevron-left")}</button><strong>${esc(fmtDateShort(f.date))}</strong><button class="icon-button" data-action="fin-nav" data-dir="1" aria-label="Next day">${icon("chevron-right")}</button></div></div>
          <div class="stat-row"><div class="stat"><small>Income</small><strong class="pos">${fmtMoney(income)}</strong></div><div class="stat"><small>Expenses</small><strong class="neg">${fmtMoney(expense)}</strong></div><div class="stat"><small>Net cash flow</small><strong class="${income - expense < 0 ? "neg" : "pos"}">${fmtMoney(income - expense)}</strong></div></div>
          <div class="toolbar">${bindSelect("finance.wallet", f.wallet, [["", "All wallets"], ...db.wallets.map((w) => [w.id, w.name])], "Wallet")}
            ${bindSelect("finance.type", f.type, [["", "All types"], ...TX_TYPES], "Type")}
            ${bindSelect("finance.category", f.category, [["", "All categories"], ...allCategories()], "Category")}
            <div class="field"><label for="b_finance_person">Person</label><input type="search" ${bindAttr("finance.person", f.person)} placeholder="Name"></div></div>
          ${shown.length ? `<div class="list">${shown.map(txRow).join("")}</div>` : emptyCard(dayTx.length ? "No activity matches these filters." : "No money activity on this day.")}
          <p class="muted" style="margin:10px 0 0;font-size:12px">Transfers and loans move money but are not counted as income or expenses.</p></div>
        <div class="card"><div class="card-head"><h2>Lending &amp; borrowing</h2></div>
          <div class="stat-row"><div class="stat"><small>Owed to you</small><strong class="pos">${fmtMoney(receivable)}</strong></div><div class="stat"><small>You owe</small><strong class="neg">${fmtMoney(payable)}</strong></div></div>
          ${db.loans.length ? `${lent.length ? `<h3 class="group-title">Owed to you</h3><div class="list">${lent.map(loanRow).join("")}</div>` : ""}${borrowed.length ? `<h3 class="group-title">You owe</h3><div class="list">${borrowed.map(loanRow).join("")}</div>` : ""}` : emptyCard("No loans recorded.")}</div></div>`;
  }
};

/* ----- Transactions page ----- */
PAGES.transactions = {
  title: "Transaction History",
  render() {
    const f = ui.tx;
    const list = db.transactions.filter((t) => (!f.from || isoDay(t.at) >= f.from) && (!f.to || isoDay(t.at) <= f.to) && matchTx(t, f)).sort(byTimeDesc);
    const income = sumType(list, "income");
    const expense = sumType(list, "expense");
    const limited = list.slice(0, 300);
    return storageBanner() + pageHeader("EVERY MOVEMENT", "Transaction history", "Search and filter every money movement. Editing or deleting updates balances and reports.",
      `<button class="button button-outline" data-action="export-csv">${icon("download")} Export CSV</button>`) +
      `<div class="toolbar"><div class="field"><label for="b_tx_q">Search</label><input type="search" ${bindAttr("tx.q", f.q)} placeholder="Search"></div>
        <div class="field"><label for="b_tx_from">From</label><input type="date" ${bindAttr("tx.from", f.from)}></div>
        <div class="field"><label for="b_tx_to">To</label><input type="date" ${bindAttr("tx.to", f.to)}></div>
        ${bindSelect("tx.wallet", f.wallet, [["", "All wallets"], ...db.wallets.map((w) => [w.id, w.name])], "Wallet")}
        ${bindSelect("tx.type", f.type, [["", "All types"], ...TX_TYPES], "Type")}
        ${bindSelect("tx.category", f.category, [["", "All categories"], ...allCategories()], "Category")}
        <div class="field"><label for="b_tx_person">Person</label><input type="search" ${bindAttr("tx.person", f.person)} placeholder="Name"></div></div>
      <div class="stat-row"><div class="stat"><small>Matching</small><strong>${list.length}</strong></div><div class="stat"><small>Income</small><strong class="pos">${fmtMoney(income)}</strong></div><div class="stat"><small>Expenses</small><strong class="neg">${fmtMoney(expense)}</strong></div></div>
      <div class="card">${limited.length ? `<div class="list">${limited.map(txRow).join("")}</div>${list.length > limited.length ? `<p class="muted">Showing the newest ${limited.length}. Narrow the filters to see the rest.</p>` : ""}` : emptyCard(db.transactions.length ? "No transactions match these filters." : "No transactions yet. Record income or an expense from Personal finance.", db.transactions.length ? "" : `<button class="text-button" data-page="finance">Open Personal finance</button>`)}</div>`;
  }
};

/* ----- Wallets page ----- */
PAGES.wallets = {
  title: "Wallet Management",
  render() {
    const rows = db.wallets.map((w) => {
      const b = walletBalance(w);
      return `<div class="row${w.archived ? " is-done" : ""}"><div class="row-main"><strong>${esc(w.name)}</strong>
        <small>${esc(label(CONFIG.walletTypes, w.type))} · opening ${fmtMoney(w.opening || 0)} · created ${esc(fmtDateShort(isoDay(w.createdAt)))}</small>
        <span class="pills">${w.archived ? `<span class="pill">Archived</span>` : `<span class="pill is-green">Active</span>`}</span></div>
        <div class="row-amount ${b < 0 ? "neg" : ""}">${fmtMoney(b)}</div>
        <div class="row-actions">
          <button class="icon-button" data-action="wallet-reconcile" data-id="${w.id}" aria-label="Show how ${esc(w.name)} balance is calculated" title="How is this calculated?">${icon("scale")}</button>
          <button class="icon-button" data-action="wallet-edit" data-id="${w.id}" aria-label="Edit ${esc(w.name)}">${icon("pencil")}</button>
          <button class="icon-button" data-action="wallet-archive" data-id="${w.id}" aria-label="${w.archived ? "Restore" : "Archive"} ${esc(w.name)}">${icon(w.archived ? "archive-restore" : "archive")}</button>
          <button class="icon-button is-danger" data-action="wallet-delete" data-id="${w.id}" aria-label="Delete ${esc(w.name)}">${icon("trash-2")}</button></div></div>`;
    }).join("");
    return storageBanner() + pageHeader("WHERE YOUR MONEY LIVES", "Wallets", "Balances are calculated from the opening balance plus every transaction, never typed in by hand.",
      `<button class="button button-primary" data-action="wallet-add">${icon("plus")} Add wallet</button>`) +
      `<div class="stat-row"><div class="stat"><small>Total across active wallets</small><strong>${fmtMoney(totalBalance())}</strong></div><div class="stat"><small>Active wallets</small><strong>${activeWallets().length}</strong></div></div>
      <div class="card">${db.wallets.length ? `<div class="list">${rows}</div>` : emptyCard("No wallets yet.", `<button class="button button-primary button-sm" data-action="wallet-add">${icon("plus")} Add a wallet</button>`)}</div>`;
  }
};

/* ----- Forms ----- */
const validAmount = (text) => { const m = parseMoney(text); return m !== null && m > 0 ? m : null; };

function warnIfNegative(walletIds) {
  [...new Set(walletIds)].forEach((id) => {
    const w = db.wallets.find((x) => x.id === id);
    if (w && walletBalance(w) < 0) showToast(`${w.name} is now negative (${fmtMoney(walletBalance(w))}). Check its opening balance.`, true);
  });
}

function txFormConfig(type, existing) {
  const person = type === "income" ? "Received from" : "Paid to";
  const fields = type === "transfer"
    ? [{ name: "amount", label: "Amount", type: "money", required: true },
       { name: "walletId", label: "From wallet", type: "select", options: walletOptions(), required: true },
       { name: "toWalletId", label: "To wallet", type: "select", options: walletOptions(), required: true },
       { name: "at", label: "Date and time", type: "datetime-local", required: true },
       { name: "note", label: "Notes (optional)", wide: true, max: 200 }]
    : [{ name: "amount", label: "Amount", type: "money", required: true },
       { name: "person", label: person + " (person or organization)", required: true },
       { name: "category", label: type === "income" ? "Source" : "Category", type: "select", options: categoryOptions(type) },
       { name: "walletId", label: type === "income" ? "Destination wallet" : "Source wallet", type: "select", options: walletOptions(), required: true },
       { name: "at", label: "Date and time", type: "datetime-local", required: true },
       { name: "note", label: "Notes (optional)", wide: true, max: 200 }];
  return fields;
}

function openTxForm(type, existing) {
  if (!activeWallets().length) { showToast("Add a wallet first.", true); return; }
  if (type === "transfer" && activeWallets().length < 2) { showToast("A transfer needs at least two active wallets.", true); return; }
  const defaults = { at: toDhakaInput(new Date()), walletId: activeWallets()[0].id, toWalletId: (activeWallets()[1] || activeWallets()[0]).id, category: db.categories[type] ? db.categories[type][0] : "" };
  const values = existing ? Object.assign({}, existing, { amount: minorToInput(existing.amount), at: toDhakaInput(existing.at) }) : defaults;
  const names = { income: "income", expense: "expense", transfer: "transfer" };
  openForm({
    title: `${existing ? "Edit" : "Add"} ${names[type]}`,
    intro: type === "transfer" ? "Moves money between your wallets. It is not income or an expense." : "",
    fields: txFormConfig(type), values,
    validate(v) {
      if (!validAmount(v.amount)) return "Enter an amount greater than zero, like 250 or 250.50.";
      if (Number.isNaN(new Date(v.at).getTime())) return "Enter a valid date and time.";
      if (type === "transfer" && v.walletId === v.toWalletId) return "Choose two different wallets.";
      return "";
    },
    onSubmit(v) {
      const next = Object.assign({}, existing || { id: uid(), createdAt: new Date().toISOString() }, {
        type, amount: validAmount(v.amount), walletId: v.walletId, toWalletId: type === "transfer" ? v.toWalletId : undefined,
        person: type === "transfer" ? "" : v.person, category: type === "transfer" ? "" : v.category, note: v.note, at: fromDhakaInput(v.at)
      });
      if (!commit(["transactions"], () => { if (existing) db.transactions[db.transactions.findIndex((t) => t.id === existing.id)] = next; else db.transactions.push(next); })) return false;
      ui.finance.date = isoDay(next.at);
      showToast(existing ? "Transaction updated." : `${label(TX_TYPES, type)} saved.`);
      warnIfNegative([next.walletId]);
      renderPage();
      return true;
    }
  });
}

function openLoanForm(direction, existing) {
  const lent = direction === "lent";
  if (!existing && !activeWallets().length) { showToast("Add a wallet first.", true); return; }
  const fields = existing
    ? [{ name: "person", label: "Person", required: true }, { name: "due", label: "Expected repayment date", type: "date" }, { name: "reason", label: "Reason", wide: true, max: 200 }]
    : [{ name: "person", label: lent ? "Lent to" : "Borrowed from", required: true },
       { name: "amount", label: "Amount", type: "money", required: true },
       { name: "walletId", label: lent ? "Paid from wallet" : "Received into wallet", type: "select", options: walletOptions(), required: true },
       { name: "at", label: "Date and time", type: "datetime-local", required: true },
       { name: "due", label: "Expected repayment date", type: "date" },
       { name: "reason", label: "Reason", wide: true, max: 200 }];
  openForm({
    title: existing ? "Edit loan" : lent ? "Lend money" : "Borrow money",
    intro: existing ? "To change the amount, delete this loan and record it again." : lent ? "This reduces the wallet now. It is tracked as owed to you, not as an expense." : "This increases the wallet now. It is tracked as a debt, not as income.",
    fields, values: existing || { at: toDhakaInput(new Date()), walletId: activeWallets()[0].id },
    validate(v) {
      if (!existing && !validAmount(v.amount)) return "Enter an amount greater than zero.";
      if (v.due && !validDateKey(v.due)) return "Enter a valid repayment date.";
      return "";
    },
    onSubmit(v) {
      if (existing) {
        if (!commit(["loans", "transactions"], () => {
          const loan = db.loans.find((l) => l.id === existing.id);
          Object.assign(loan, { person: v.person, due: v.due, reason: v.reason });
          db.transactions.forEach((t) => { if (t.loanId === loan.id) t.person = v.person; });
        })) return false;
        showToast("Loan updated.");
      } else {
        const loan = { id: uid(), direction, person: v.person, principal: validAmount(v.amount), walletId: v.walletId, date: fromDhakaInput(v.at), reason: v.reason, due: v.due };
        const tx = { id: uid(), type: lent ? "loan_lent" : "loan_borrowed", amount: loan.principal, walletId: v.walletId, person: v.person, category: "", note: v.reason, at: loan.date, loanId: loan.id, createdAt: new Date().toISOString() };
        if (!commit(["loans", "transactions"], () => { db.loans.push(loan); db.transactions.push(tx); })) return false;
        showToast(lent ? "Loan recorded." : "Borrowing recorded.");
        warnIfNegative([v.walletId]);
      }
      renderPage();
      return true;
    }
  });
}

function openRepayForm(loan) {
  const outstanding = loanOutstanding(loan);
  const lent = loan.direction === "lent";
  openForm({
    title: lent ? `Repayment from ${loan.person}` : `Repay ${loan.person}`,
    intro: `Outstanding: ${fmtMoney(outstanding)}. Repayments reduce the loan; they are not income or expenses.`,
    fields: [
      { name: "amount", label: "Amount", type: "money", required: true },
      { name: "walletId", label: lent ? "Received into wallet" : "Paid from wallet", type: "select", options: walletOptions(), required: true },
      { name: "at", label: "Date and time", type: "datetime-local", required: true },
      { name: "note", label: "Notes (optional)", wide: true, max: 200 }
    ],
    values: { amount: minorToInput(outstanding), walletId: loan.walletId && activeWallets().some((w) => w.id === loan.walletId) ? loan.walletId : activeWallets()[0].id, at: toDhakaInput(new Date()) },
    validate(v) {
      const amount = validAmount(v.amount);
      if (!amount) return "Enter an amount greater than zero.";
      if (amount > outstanding) return `That is more than the outstanding ${fmtMoney(outstanding)}.`;
      return "";
    },
    onSubmit(v) {
      const tx = { id: uid(), type: lent ? "repay_received" : "repay_paid", amount: validAmount(v.amount), walletId: v.walletId, person: loan.person, category: "", note: v.note, at: fromDhakaInput(v.at), loanId: loan.id, createdAt: new Date().toISOString() };
      if (!commit(["transactions"], () => db.transactions.push(tx))) return false;
      showToast(loanOutstanding(loan) === 0 ? "Loan fully settled." : "Repayment recorded.");
      if (!lent) warnIfNegative([v.walletId]);
      renderPage();
      return true;
    }
  });
}

function openWalletForm(existing) {
  openForm({
    title: existing ? "Edit wallet" : "Add wallet",
    fields: [
      { name: "name", label: "Name", required: true, max: 40 },
      { name: "type", label: "Type", type: "select", options: CONFIG.walletTypes },
      { name: "opening", label: "Opening balance", type: "money", hint: "What this wallet held before you started tracking." }
    ],
    values: existing ? { name: existing.name, type: existing.type, opening: minorToInput(existing.opening || 0) } : { type: "cash", opening: "0.00" },
    validate(v) {
      if (parseMoney(v.opening || "0") === null) return "Enter the opening balance as a number, like 1500 or 1500.50.";
      if (db.wallets.some((w) => w.name.toLowerCase() === v.name.toLowerCase() && (!existing || w.id !== existing.id))) return "You already have a wallet with this name.";
      return "";
    },
    onSubmit(v) {
      const next = Object.assign({}, existing || { id: uid(), createdAt: new Date().toISOString(), archived: false, currency: db.settings.currency }, { name: v.name, type: v.type, opening: parseMoney(v.opening || "0") });
      if (!commit(["wallets"], () => { if (existing) db.wallets[db.wallets.findIndex((w) => w.id === existing.id)] = next; else db.wallets.push(next); })) return false;
      showToast(existing ? "Wallet updated." : "Wallet added.");
      renderPage();
      return true;
    }
  });
}

function openInfo(title, html) {
  const form = byId("formDialogForm");
  form.innerHTML = `<div class="dialog-header"><h2 id="formDialogTitle">${esc(title)}</h2><button type="button" class="icon-button" data-close-dialog aria-label="Close">${icon("x")}</button></div>${html}<div class="dialog-actions"><button type="button" class="button button-primary" data-close-dialog>Done</button></div>`;
  form.onsubmit = (e) => e.preventDefault();
  refreshIcons(form);
  byId("formDialog").showModal();
}

/* ----- Actions ----- */
ACTIONS["tx-add"] = (el) => openTxForm(el.dataset.type);
ACTIONS["tx-edit"] = (el) => { const tx = db.transactions.find((t) => t.id === el.dataset.id); if (tx) openTxForm(tx.type, tx); };
ACTIONS["fin-nav"] = (el) => { ui.finance.date = addDays(ui.finance.date, Number(el.dataset.dir)); renderPage(); };
ACTIONS["loan-add"] = (el) => openLoanForm(el.dataset.dir);
ACTIONS["loan-edit"] = (el) => { const loan = db.loans.find((l) => l.id === el.dataset.id); openLoanForm(loan.direction, loan); };
ACTIONS["loan-repay"] = (el) => openRepayForm(db.loans.find((l) => l.id === el.dataset.id));
ACTIONS["wallet-add"] = () => openWalletForm();
ACTIONS["wallet-edit"] = (el) => openWalletForm(db.wallets.find((w) => w.id === el.dataset.id));

ACTIONS["tx-delete"] = (el) => {
  const tx = db.transactions.find((t) => t.id === el.dataset.id);
  const loan = tx.loanId ? db.loans.find((l) => l.id === tx.loanId) : null;
  const isPrincipal = tx.type === "loan_lent" || tx.type === "loan_borrowed";
  const repayCount = loan ? db.transactions.filter((t) => t.loanId === loan.id && t.id !== tx.id).length : 0;
  askConfirm({
    title: "Delete transaction?",
    message: isPrincipal && loan ? `This also deletes the loan with ${loan.person} and its ${plural(repayCount, "repayment")}. Wallet balances will be recalculated.` : `${txDescription(tx)} (${fmtMoney(tx.amount)}) will be deleted and wallet balances recalculated.`,
    confirmLabel: "Delete",
    onConfirm() {
      const ok = isPrincipal && loan
        ? commit(["loans", "transactions"], () => { db.loans = db.loans.filter((l) => l.id !== loan.id); db.transactions = db.transactions.filter((t) => t.loanId !== loan.id); })
        : commit(["transactions"], () => { db.transactions = db.transactions.filter((t) => t.id !== tx.id); });
      if (!ok) return false;
      showToast("Transaction deleted.");
      renderPage();
    }
  });
};

ACTIONS["loan-delete"] = (el) => {
  const loan = db.loans.find((l) => l.id === el.dataset.id);
  const count = db.transactions.filter((t) => t.loanId === loan.id).length;
  askConfirm({
    title: "Delete loan?", message: `The loan with ${loan.person} and its ${plural(count, "linked transaction")} will be deleted. Wallet balances will be recalculated.`, confirmLabel: "Delete",
    onConfirm() {
      if (!commit(["loans", "transactions"], () => { db.loans = db.loans.filter((l) => l.id !== loan.id); db.transactions = db.transactions.filter((t) => t.loanId !== loan.id); })) return false;
      showToast("Loan deleted.");
      renderPage();
    }
  });
};

ACTIONS["wallet-archive"] = (el) => {
  const w = db.wallets.find((x) => x.id === el.dataset.id);
  if (!w.archived && walletBalance(w) !== 0) { showToast(`Move or spend the ${fmtMoney(walletBalance(w))} in ${w.name} before archiving it.`, true); return; }
  if (commit(["wallets"], () => { w.archived = !w.archived; })) { showToast(w.archived ? "Wallet archived." : "Wallet restored."); renderPage(); }
};

ACTIONS["wallet-delete"] = (el) => {
  const w = db.wallets.find((x) => x.id === el.dataset.id);
  const used = db.transactions.some((t) => t.walletId === w.id || t.toWalletId === w.id) || db.loans.some((l) => l.walletId === w.id);
  if (used) { showToast(`${w.name} has transactions, so it can’t be deleted. Archive it instead.`, true); return; }
  askConfirm({
    title: "Delete wallet?", message: `${w.name} has no transactions and will be deleted.`, confirmLabel: "Delete",
    onConfirm() {
      if (!commit(["wallets"], () => { db.wallets = db.wallets.filter((x) => x.id !== w.id); })) return false;
      showToast("Wallet deleted.");
      renderPage();
    }
  });
};

ACTIONS["wallet-reconcile"] = (el) => {
  const w = db.wallets.find((x) => x.id === el.dataset.id);
  const mine = db.transactions.filter((t) => t.walletId === w.id || t.toWalletId === w.id);
  const line = (text, minor, strong) => `<div class="row"><div class="row-main">${strong ? `<strong>${text}</strong>` : text}</div><div class="row-amount ${minor < 0 ? "neg" : minor > 0 ? "pos" : ""}">${strong ? "" : minor > 0 ? "+" : ""}${fmtMoney(minor)}</div></div>`;
  const sum = (types, sign) => mine.filter((t) => types.includes(t.type) && t.walletId === w.id).reduce((s, t) => s + sign * t.amount, 0);
  const transferIn = mine.filter((t) => t.type === "transfer" && t.toWalletId === w.id).reduce((s, t) => s + t.amount, 0);
  const transferOut = mine.filter((t) => t.type === "transfer" && t.walletId === w.id).reduce((s, t) => s - t.amount, 0);
  openInfo(`${w.name} balance`, `<p class="muted" style="margin:0 0 8px">Balance = opening balance + every transaction touching this wallet.</p><div class="list">
    ${line("Opening balance", w.opening || 0)}${line("Income", sum(["income"], 1))}${line("Expenses", sum(["expense"], -1))}
    ${line("Transfers in", transferIn)}${line("Transfers out", transferOut)}
    ${line("Money borrowed", sum(["loan_borrowed"], 1))}${line("Money lent", sum(["loan_lent"], -1))}
    ${line("Repayments received", sum(["repay_received"], 1))}${line("Repayments paid", sum(["repay_paid"], -1))}
    ${line("Calculated balance", walletBalance(w), true)}</div>`);
};

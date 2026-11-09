"use strict";

/* ===== Debt records ===== */
const debtPaidTotal = (record) => (record.payments || []).reduce((total, payment) => total + payment.amount, 0);
const debtOutstanding = (record) => record.principal - debtPaidTotal(record);
const DEBT_DIRECTIONS = [["i_owe", "I owe"], ["owed_to_me", "Owed to me"]];

function debtRow(record) {
  const paid = debtPaidTotal(record);
  const outstanding = debtOutstanding(record);
  const overdue = outstanding > 0 && record.due && record.due < todayKey();
  const payments = (record.payments || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  return `<article class="card">
    <div class="card-head"><div><h2>${esc(record.person)}</h2><p class="muted" style="margin:3px 0 0">${esc(label(DEBT_DIRECTIONS, record.direction))}${record.due ? ` · due ${esc(fmtDateShort(record.due))}` : ""}${record.description ? ` · ${esc(record.description)}` : ""}</p></div>
      <span class="pill ${outstanding === 0 ? "is-green" : overdue ? "is-red" : "is-amber"}">${outstanding === 0 ? "Paid" : overdue ? "Overdue" : "Outstanding"}</span></div>
    <div class="stat-row"><div class="stat"><small>Total debt</small><strong>${fmtMoney(record.principal)}</strong></div><div class="stat"><small>Paid</small><strong class="pos">${fmtMoney(paid)}</strong></div><div class="stat"><small>Remaining</small><strong class="${outstanding ? "neg" : "pos"}">${fmtMoney(outstanding)}</strong></div></div>
    ${payments.length ? `<details><summary class="muted" style="cursor:pointer">Payment history (${payments.length})</summary><div class="list">${payments.map((payment) => `<div class="row"><div class="row-main"><strong>${fmtMoney(payment.amount)}</strong><small>${esc(fmtDateTime(payment.at))}${payment.note ? ` · ${esc(payment.note)}` : ""}</small></div><button class="icon-button is-danger" data-action="debt-payment-delete" data-id="${record.id}" data-payment-id="${payment.id}" aria-label="Delete payment">${icon("trash-2")}</button></div>`).join("")}</div></details>` : `<p class="muted" style="margin:0">No repayments recorded yet.</p>`}
    <div class="title-actions" style="margin-top:12px">${outstanding ? `<button class="button button-primary button-sm" data-action="debt-payment" data-id="${record.id}">${record.direction === "i_owe" ? "Record repayment" : "Record received payment"}</button>` : ""}
      <button class="button button-outline button-sm" data-action="debt-edit" data-id="${record.id}">Edit</button><button class="button button-outline button-sm" data-action="debt-delete" data-id="${record.id}">Delete</button></div>
  </article>`;
}

PAGES.debts = {
  title: "Debt Records",
  render() {
    const records = db.debts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const owedToMe = records.filter((record) => record.direction === "owed_to_me").reduce((total, record) => total + debtOutstanding(record), 0);
    const iOwe = records.filter((record) => record.direction === "i_owe").reduce((total, record) => total + debtOutstanding(record), 0);
    return storageBanner() + pageHeader("TRACK WHAT IS OWED", "Debt records", "Track money you owe or money owed to you, including partial repayments. These records are separate from wallet transactions.",
      `<button class="button button-primary" data-action="debt-add">${icon("plus")} Add debt</button>`) +
      `<div class="stat-row"><div class="stat"><small>I owe</small><strong class="neg">${fmtMoney(iOwe)}</strong></div><div class="stat"><small>Owed to me</small><strong class="pos">${fmtMoney(owedToMe)}</strong></div></div>
      ${records.length ? `<div class="stack">${records.map(debtRow).join("")}</div>` : emptyCard("No debt records yet.", `<button class="button button-primary button-sm" data-action="debt-add">${icon("plus")} Add a debt record</button>`)}`;
  }
};

function openDebtForm(existing) {
  const paid = existing ? debtPaidTotal(existing) : 0;
  openForm({
    title: existing ? "Edit debt record" : "Add debt record",
    fields: [
      { name: "direction", label: "Debt direction", type: "select", options: DEBT_DIRECTIONS, required: true },
      { name: "person", label: "Person or organization", required: true, max: 100 },
      { name: "principal", label: "Total amount", type: "money", required: true },
      { name: "due", label: "Due date", type: "date" },
      { name: "description", label: "Description (optional)", wide: true, max: 200 }
    ],
    values: existing ? Object.assign({}, existing, { principal: minorToInput(existing.principal) }) : { direction: "i_owe" },
    validate(values) {
      const principal = validAmount(values.principal);
      if (!principal) return "Enter an amount greater than zero.";
      if (principal < paid) return `The total cannot be less than the ${fmtMoney(paid)} already paid.`;
      if (values.due && !validDateKey(values.due)) return "Enter a valid due date.";
      return "";
    },
    onSubmit(values) {
      const next = Object.assign({}, existing || { id: uid(), createdAt: new Date().toISOString(), payments: [] }, {
        direction: values.direction, person: values.person, principal: validAmount(values.principal),
        due: values.due, description: values.description
      });
      if (!commit(["debts"], () => {
        if (existing) db.debts[db.debts.findIndex((record) => record.id === existing.id)] = next;
        else db.debts.push(next);
      })) return false;
      showToast(existing ? "Debt record updated." : "Debt record added.");
      renderPage();
      return true;
    }
  });
}

function openDebtPaymentForm(record) {
  const outstanding = debtOutstanding(record);
  openForm({
    title: record.direction === "i_owe" ? `Repay ${record.person}` : `Record payment from ${record.person}`,
    intro: `Remaining: ${fmtMoney(outstanding)}.`,
    fields: [
      { name: "amount", label: "Payment amount", type: "money", required: true },
      { name: "at", label: "Date and time", type: "datetime-local", required: true },
      { name: "note", label: "Note (optional)", wide: true, max: 200 }
    ],
    values: { at: toDhakaInput(new Date()) },
    validate(values) {
      const amount = validAmount(values.amount);
      if (!amount) return "Enter an amount greater than zero.";
      if (amount > outstanding) return `That is more than the remaining ${fmtMoney(outstanding)}.`;
      if (Number.isNaN(new Date(values.at).getTime())) return "Enter a valid payment date and time.";
      return "";
    },
    onSubmit(values) {
      const payment = { id: uid(), amount: validAmount(values.amount), at: fromDhakaInput(values.at), note: values.note };
      if (!commit(["debts"], () => { record.payments.push(payment); })) return false;
      showToast(debtOutstanding(record) === 0 ? "Debt fully settled." : "Payment recorded.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["debt-add"] = () => openDebtForm();
ACTIONS["debt-edit"] = (el) => { const record = db.debts.find((item) => item.id === el.dataset.id); if (record) openDebtForm(record); };
ACTIONS["debt-payment"] = (el) => { const record = db.debts.find((item) => item.id === el.dataset.id); if (record && debtOutstanding(record) > 0) openDebtPaymentForm(record); };
ACTIONS["debt-payment-delete"] = (el) => {
  const record = db.debts.find((item) => item.id === el.dataset.id);
  if (!record) return;
  askConfirm({ title: "Delete payment?", message: "This repayment will be removed and the remaining debt will increase.", confirmLabel: "Delete", onConfirm() {
    if (!commit(["debts"], () => { record.payments = record.payments.filter((payment) => payment.id !== el.dataset.paymentId); })) return false;
    showToast("Payment deleted.");
    renderPage();
  } });
};
ACTIONS["debt-delete"] = (el) => {
  const record = db.debts.find((item) => item.id === el.dataset.id);
  if (!record) return;
  askConfirm({ title: "Delete debt record?", message: `${record.person} and its payment history will be deleted.`, confirmLabel: "Delete", onConfirm() {
    if (!commit(["debts"], () => { db.debts = db.debts.filter((item) => item.id !== record.id); })) return false;
    showToast("Debt record deleted.");
    renderPage();
  } });
};

/* ===== University fees ===== */
const FEE_TYPES = [["monthly", "Monthly"], ["semester", "Semester"], ["custom", "Custom"]];
const feePaidTotal = (record) => (record.payments || []).reduce((total, payment) => total + payment.amount, 0);
const feeOutstanding = (record) => record.amount - feePaidTotal(record);

function feeRow(record) {
  const paid = feePaidTotal(record);
  const outstanding = feeOutstanding(record);
  const overdue = outstanding > 0 && record.due && record.due < todayKey();
  const payments = (record.payments || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  return `<article class="card">
    <div class="card-head"><div><h2>${esc(record.name)}</h2><p class="muted" style="margin:3px 0 0">${esc(label(FEE_TYPES, record.type))} · ${esc(record.period)}${record.due ? ` · due ${esc(fmtDateShort(record.due))}` : ""}${record.note ? ` · ${esc(record.note)}` : ""}</p></div>
      <span class="pill ${outstanding === 0 ? "is-green" : overdue ? "is-red" : "is-amber"}">${outstanding === 0 ? "Paid" : overdue ? "Overdue" : "Due"}</span></div>
    <div class="stat-row"><div class="stat"><small>Fee</small><strong>${fmtMoney(record.amount)}</strong></div><div class="stat"><small>Paid</small><strong class="pos">${fmtMoney(paid)}</strong></div><div class="stat"><small>Remaining</small><strong class="${outstanding ? "neg" : "pos"}">${fmtMoney(outstanding)}</strong></div></div>
    ${payments.length ? `<details><summary class="muted" style="cursor:pointer">Payment history (${payments.length})</summary><div class="list">${payments.map((payment) => `<div class="row"><div class="row-main"><strong>${fmtMoney(payment.amount)}</strong><small>${esc(fmtDateTime(payment.at))}${payment.note ? ` · ${esc(payment.note)}` : ""}</small></div><button class="icon-button is-danger" data-action="fee-payment-delete" data-id="${record.id}" data-payment-id="${payment.id}" aria-label="Delete fee payment">${icon("trash-2")}</button></div>`).join("")}</div></details>` : `<p class="muted" style="margin:0">No payments recorded yet.</p>`}
    <div class="title-actions" style="margin-top:12px">${outstanding ? `<button class="button button-primary button-sm" data-action="fee-payment" data-id="${record.id}">Record payment</button>` : ""}
      <button class="button button-outline button-sm" data-action="fee-edit" data-id="${record.id}">Edit</button><button class="button button-outline button-sm" data-action="fee-delete" data-id="${record.id}">Delete</button></div>
  </article>`;
}

PAGES.fees = {
  title: "University Fees",
  render() {
    const records = db.educationFees.slice().sort((a, b) => (b.period || "").localeCompare(a.period || ""));
    const total = records.reduce((sum, record) => sum + record.amount, 0);
    const paid = records.reduce((sum, record) => sum + feePaidTotal(record), 0);
    const outstanding = records.reduce((sum, record) => sum + feeOutstanding(record), 0);
    const university = db.settings.universityName || "";
    return storageBanner() + pageHeader("EDUCATION COSTS", "University fees", university ? `Fees and payment records for ${university}. Add a separate record for each billing period.` : "Set your university name, then track monthly, semester and custom fees by billing period. Fee records are separate from wallet transactions.",
      `${university ? `<button class="button button-outline" data-action="university-edit">${icon("pencil")} ${esc(university)}</button>` : `<button class="button button-outline" data-action="university-edit">${icon("plus")} Set university name</button>`}<button class="button button-primary" data-action="fee-add">${icon("plus")} Add fee record</button>`) +
      `<div class="stat-row"><div class="stat"><small>Total fees</small><strong>${fmtMoney(total)}</strong></div><div class="stat"><small>Paid so far</small><strong class="pos">${fmtMoney(paid)}</strong></div><div class="stat"><small>Still due</small><strong class="${outstanding ? "neg" : "pos"}">${fmtMoney(outstanding)}</strong></div></div>
      ${records.length ? `<div class="stack">${records.map(feeRow).join("")}</div>` : emptyCard("No university fee records yet. Add monthly, semester, or custom fees to see what you have paid and what remains.", `<button class="button button-primary button-sm" data-action="fee-add">${icon("plus")} Add fee record</button>`)}`;
  }
};

function openUniversityForm() {
  openForm({
    title: db.settings.universityName ? "Edit university name" : "Set university name",
    fields: [{ name: "universityName", label: "University name", required: true, max: 120 }],
    values: { universityName: db.settings.universityName || "" },
    onSubmit(values) {
      if (!commit(["settings"], () => { db.settings.universityName = values.universityName; })) return false;
      showToast("University name saved.");
      renderPage();
      return true;
    }
  });
}

function openFeeForm(existing) {
  const paid = existing ? feePaidTotal(existing) : 0;
  openForm({
    title: existing ? "Edit fee record" : "Add fee record",
    intro: "Create one record for each monthly, semester, or custom charge. Record payments against it to track the remaining amount.",
    fields: [
      { name: "type", label: "Fee type", type: "select", options: FEE_TYPES, required: true },
      { name: "name", label: "Fee name (e.g. Tuition, Lab fee)", required: true, max: 100 },
      { name: "period", label: "Billing period (e.g. Nov 2026, Spring 2027)", required: true, max: 80 },
      { name: "amount", label: "Total fee", type: "money", required: true },
      { name: "due", label: "Due date", type: "date" },
      { name: "note", label: "Note (optional)", wide: true, max: 200 }
    ],
    values: existing ? Object.assign({}, existing, { amount: minorToInput(existing.amount) }) : { type: "monthly" },
    validate(values) {
      const amount = validAmount(values.amount);
      if (!amount) return "Enter an amount greater than zero.";
      if (amount < paid) return `The fee cannot be less than the ${fmtMoney(paid)} already paid.`;
      if (values.due && !validDateKey(values.due)) return "Enter a valid due date.";
      return "";
    },
    onSubmit(values) {
      const next = Object.assign({}, existing || { id: uid(), createdAt: new Date().toISOString(), payments: [] }, {
        type: values.type, name: values.name, period: values.period, amount: validAmount(values.amount),
        due: values.due, note: values.note
      });
      if (!commit(["educationFees"], () => {
        if (existing) db.educationFees[db.educationFees.findIndex((record) => record.id === existing.id)] = next;
        else db.educationFees.push(next);
      })) return false;
      showToast(existing ? "Fee record updated." : "Fee record added.");
      renderPage();
      return true;
    }
  });
}

function openFeePaymentForm(record) {
  const outstanding = feeOutstanding(record);
  openForm({
    title: `Record payment · ${record.name}`,
    intro: `Remaining for ${record.period}: ${fmtMoney(outstanding)}.`,
    fields: [
      { name: "amount", label: "Payment amount", type: "money", required: true },
      { name: "at", label: "Date and time", type: "datetime-local", required: true },
      { name: "note", label: "Note (optional)", wide: true, max: 200 }
    ],
    values: { at: toDhakaInput(new Date()) },
    validate(values) {
      const amount = validAmount(values.amount);
      if (!amount) return "Enter an amount greater than zero.";
      if (amount > outstanding) return `That is more than the remaining ${fmtMoney(outstanding)}.`;
      if (Number.isNaN(new Date(values.at).getTime())) return "Enter a valid payment date and time.";
      return "";
    },
    onSubmit(values) {
      const payment = { id: uid(), amount: validAmount(values.amount), at: fromDhakaInput(values.at), note: values.note };
      if (!commit(["educationFees"], () => { record.payments.push(payment); })) return false;
      showToast(feeOutstanding(record) === 0 ? "Fee fully paid." : "Payment recorded.");
      renderPage();
      return true;
    }
  });
}

ACTIONS["university-edit"] = openUniversityForm;
ACTIONS["fee-add"] = () => openFeeForm();
ACTIONS["fee-edit"] = (el) => { const record = db.educationFees.find((item) => item.id === el.dataset.id); if (record) openFeeForm(record); };
ACTIONS["fee-payment"] = (el) => { const record = db.educationFees.find((item) => item.id === el.dataset.id); if (record && feeOutstanding(record) > 0) openFeePaymentForm(record); };
ACTIONS["fee-payment-delete"] = (el) => {
  const record = db.educationFees.find((item) => item.id === el.dataset.id);
  if (!record) return;
  askConfirm({ title: "Delete fee payment?", message: "This payment will be removed and the remaining fee will increase.", confirmLabel: "Delete", onConfirm() {
    if (!commit(["educationFees"], () => { record.payments = record.payments.filter((payment) => payment.id !== el.dataset.paymentId); })) return false;
    showToast("Payment deleted.");
    renderPage();
  } });
};
ACTIONS["fee-delete"] = (el) => {
  const record = db.educationFees.find((item) => item.id === el.dataset.id);
  if (!record) return;
  askConfirm({ title: "Delete fee record?", message: `${record.name} for ${record.period} and its payment history will be deleted.`, confirmLabel: "Delete", onConfirm() {
    if (!commit(["educationFees"], () => { db.educationFees = db.educationFees.filter((item) => item.id !== record.id); })) return false;
    showToast("Fee record deleted.");
    renderPage();
  } });
};

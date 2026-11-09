"use strict";

/* ===== Config (edit here) ===== */
const CONFIG = {
  app: { name: "LifeKS", version: "v0.1.0", lastUpdated: "09/11/2026", footerLine: "Made for your life, one day at a time" },
  collections: ["schedules", "tasks", "sleep", "wallets", "transactions", "loans", "notes", "goals", "habits"],
  currencies: { BDT: "৳", USD: "$", INR: "₹", EUR: "€" },
  defaultWallets: [
    { name: "Cash", type: "cash" }, { name: "bKash", type: "mobile" },
    { name: "Nagad", type: "mobile" }, { name: "Bank Account", type: "bank" }
  ],
  walletTypes: [["cash", "Cash"], ["mobile", "Mobile wallet"], ["bank", "Bank account"], ["card", "Card"], ["other", "Other"]],
  defaultCategories: {
    income: ["Family", "Friends", "Salary", "Freelance work", "Refund", "Other income"],
    expense: ["Food", "Transport", "Shopping", "Education", "Internet", "Personal", "Entertainment", "Bills", "Other"],
    schedule: ["Study", "Work", "Personal", "Health", "Social", "Other"],
    task: ["Study", "Work", "Personal", "Health", "Errands", "Other"]
  },
  priorities: [["high", "High"], ["medium", "Medium"], ["low", "Low"]]
};

/* ===== Data (loaded from this browser's storage) ===== */
const db = {};
const appState = { page: "dashboard", storageProblem: "", seeded: false };
const ui = {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const byId = (id) => document.getElementById(id);
const PAGES = {};
const ACTIONS = {};

function loadAll() {
  const problems = [];
  CONFIG.collections.forEach((name) => {
    const result = Store.read(name, []);
    if (result.status === "unavailable") problems.push("This browser is blocking storage, so nothing can be saved.");
    if (result.status === "unreadable" || (result.status === "ok" && !Array.isArray(result.value))) {
      if (result.status === "ok") Store.lock(name);
      problems.push(`Saved ${name} could not be read. LifeKS keeps a copy and will not overwrite it.`);
      db[name] = [];
    } else {
      db[name] = result.value;
    }
  });
  const settings = Store.read("settings", {});
  db.settings = settings.status === "ok" && settings.value && typeof settings.value === "object" && !Array.isArray(settings.value) ? settings.value : {};
  if (settings.status === "unreadable") problems.push("Saved settings could not be read.");
  db.settings = Object.assign({ name: "", currency: "BDT", lastBackupAt: null }, db.settings);

  const cats = Store.read("categories", null);
  const valid = cats.status === "ok" && cats.value && ["income", "expense", "schedule", "task"].every((k) => Array.isArray(cats.value[k]));
  db.categories = valid ? cats.value : JSON.parse(JSON.stringify(CONFIG.defaultCategories));
  if (cats.status === "unreadable") problems.push("Saved categories could not be read.");

  // First run only: create the four default wallets with zero balance (not demo data).
  const walletRead = Store.read("wallets", null);
  if (walletRead.status === "empty") {
    db.wallets = CONFIG.defaultWallets.map((w) => ({ id: uid(), name: w.name, type: w.type, opening: 0, currency: db.settings.currency, createdAt: new Date().toISOString(), archived: false }));
    Store.write("wallets", db.wallets);
    appState.seeded = true;
  }
  if (cats.status === "empty") Store.write("categories", db.categories);
  appState.storageProblem = [...new Set(problems)].join(" ");
}

function saveFailMessage(reason) {
  if (reason === "blocked") return "Existing saved data could not be read, so LifeKS will not overwrite it. Export a backup and check Settings.";
  if (reason === "quota") return "Browser storage is full. Export a backup and free up space.";
  return "Could not save on this device. Nothing was changed.";
}

/* Change one or more collections atomically: if any write fails, everything is rolled back. */
function commit(names, mutator) {
  const snapshot = {};
  names.forEach((name) => { snapshot[name] = JSON.stringify(db[name]); });
  const rollback = () => names.forEach((name) => { db[name] = JSON.parse(snapshot[name]); });
  try {
    mutator();
  } catch (error) {
    console.error(error);
    rollback();
    showToast("Something went wrong. Nothing was changed.", true);
    return false;
  }
  const written = [];
  for (const name of names) {
    const result = Store.write(name, db[name]);
    if (!result.ok) {
      rollback();
      written.forEach((done) => Store.write(done, db[done]));
      showToast(saveFailMessage(result.reason), true);
      return false;
    }
    written.push(name);
  }
  Store.requestPersistence();
  updateNavCounts();
  return true;
}

/* ===== Helpers ===== */
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateFromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dateKey(new Date());
const addDays = (k, n) => { const d = dateFromKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const validDateKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(dateFromKey(k)) === k;
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function fmtTime(t) { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; }
const fmtDateLong = (k) => dateFromKey(k).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDateShort = (k) => dateFromKey(k).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function fmtDur(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function toLocalInput(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v) => new Date(v).toISOString();
const isoDay = (iso) => dateKey(new Date(iso));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const label = (pairs, value) => (pairs.find((p) => p[0] === value) || [value, value])[1];

/* Money is stored as integer paisa (minor units): no floating-point arithmetic. */
function parseMoney(text) {
  const s = String(text ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}
const currencySymbol = () => CONFIG.currencies[db.settings.currency] || "৳";
function fmtMoney(minor) {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${neg ? "−" : ""}${currencySymbol()}${whole.toLocaleString("en-IN")}.${pad(frac)}`;
}
const minorToInput = (minor) => `${Math.floor(minor / 100)}.${pad(minor % 100)}`;

function icon(name) { return `<i data-lucide="${name}" aria-hidden="true"></i>`; }
function refreshIcons(root = document) { if (window.lucide) window.lucide.createIcons({ root }); }
const emptyCard = (text, actionHtml = "") => `<div class="empty-card"><p>${text}</p>${actionHtml}</div>`;
const pageHeader = (eyebrow, title, desc, actions = "") =>
  `<div class="page-title-row"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${actions ? `<div class="title-actions">${actions}</div>` : ""}</div>`;
const barPct = (value, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0);
const progressBar = (pct) => `<div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;

function optionList(items) {
  return items.map((item) => (Array.isArray(item) ? { value: item[0], label: item[1] } : { value: item, label: item }));
}
const categoryOptions = (kind) => db.categories[kind].map((c) => [c, c]);

/* ===== Toasts ===== */
function showToast(message, isError = false) {
  const region = byId("toastRegion");
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " is-error" : "");
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), isError ? 6000 : 3200);
}

/* ===== Dialogs ===== */
function fieldHtml(field, value) {
  const id = "f_" + field.name;
  const hint = field.hint ? `<small>${esc(field.hint)}</small>` : "";
  const wide = field.wide ? " field-wide" : "";
  const req = field.required ? " required aria-required=\"true\"" : "";
  const v = value ?? field.default ?? "";
  if (field.type === "checkbox") {
    return `<div class="field field-check${wide}"><input id="${id}" name="${field.name}" type="checkbox"${v ? " checked" : ""}><label for="${id}">${esc(field.label)}</label></div>`;
  }
  let control;
  if (field.type === "textarea") {
    control = `<textarea id="${id}" name="${field.name}" rows="3" maxlength="${field.max || 2000}"${req}>${esc(v)}</textarea>`;
  } else if (field.type === "select") {
    const options = optionList(field.options).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? " selected" : ""}>${esc(o.label)}</option>`).join("");
    control = `<select id="${id}" name="${field.name}"${req}>${options}</select>`;
  } else if (field.type === "money") {
    control = `<input id="${id}" name="${field.name}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(v)}"${req}>`;
  } else {
    control = `<input id="${id}" name="${field.name}" type="${field.type || "text"}" value="${esc(v)}" maxlength="${field.max || 200}"${field.step ? ` step="${field.step}"` : ""}${field.min ? ` min="${field.min}"` : ""}${req}>`;
  }
  return `<div class="field${wide}"><label for="${id}">${esc(field.label)}${field.required ? " *" : ""}</label>${control}${hint}</div>`;
}

function openForm(config) {
  const dialog = byId("formDialog");
  const form = byId("formDialogForm");
  const values = config.values || {};
  form.innerHTML = `<div class="dialog-header"><h2 id="formDialogTitle">${esc(config.title)}</h2><button type="button" class="icon-button" data-close-dialog aria-label="Close">${icon("x")}</button></div>
    ${config.intro ? `<p class="muted" style="margin:0 0 12px">${esc(config.intro)}</p>` : ""}
    <p class="form-error" id="formError" role="alert"></p>
    <div class="form-grid">${config.fields.map((f) => fieldHtml(f, values[f.name])).join("")}</div>
    <div class="dialog-actions"><button type="button" class="button button-quiet" data-close-dialog>Cancel</button><button type="submit" class="button button-primary" id="formSubmit">${esc(config.submitLabel || "Save")}</button></div>`;
  refreshIcons(form);
  let busy = false;
  const showError = (message) => { byId("formError").textContent = message; };
  form.onsubmit = (event) => {
    event.preventDefault();
    if (busy) return;
    const out = {};
    config.fields.forEach((f) => {
      const el = form.elements[f.name];
      out[f.name] = f.type === "checkbox" ? el.checked : String(el.value || "").trim();
    });
    const missing = config.fields.find((f) => f.required && !out[f.name]);
    if (missing) { showError(`${missing.label} is required.`); form.elements[missing.name].focus(); return; }
    const problem = config.validate ? config.validate(out) : "";
    if (problem) { showError(problem); return; }
    busy = true;
    byId("formSubmit").disabled = true;
    const ok = config.onSubmit(out);
    busy = false;
    byId("formSubmit").disabled = false;
    if (ok === false) return;
    dialog.close();
  };
  if (!dialog.open) dialog.showModal();
  const first = form.querySelector("input:not([type=checkbox]), select, textarea");
  if (first) first.focus();
}

function askConfirm(config) {
  const dialog = byId("confirmDialog");
  const form = byId("confirmDialogForm");
  form.innerHTML = `<div class="dialog-header"><h2 id="confirmDialogTitle">${esc(config.title)}</h2></div>
    <p style="margin:0 0 14px">${esc(config.message)}</p>
    ${config.typeWord ? `<div class="field"><label for="confirmWord">Type ${esc(config.typeWord)} to confirm</label><input id="confirmWord" autocomplete="off"></div>` : ""}
    <div class="dialog-actions"><button type="button" class="button button-quiet" data-close-dialog>Cancel</button><button type="submit" class="button ${config.danger === false ? "button-primary" : "button-danger"}" id="confirmYes">${esc(config.confirmLabel || "Confirm")}</button></div>`;
  form.onsubmit = (event) => {
    event.preventDefault();
    if (config.typeWord && byId("confirmWord").value.trim() !== config.typeWord) { byId("confirmWord").focus(); return; }
    byId("confirmYes").disabled = true;
    const ok = config.onConfirm();
    byId("confirmYes").disabled = false;
    if (ok !== false) dialog.close();
  };
  if (!dialog.open) dialog.showModal();
}

/* ===== Theme (harmless UI preference only) ===== */
function themeMode() { try { return localStorage.getItem("lifeKS.theme.v1") || "system"; } catch (e) { return "system"; } }
function resolvedTheme(mode) { return mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode; }
function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", resolvedTheme(mode));
  const toggle = byId("themeToggle");
  if (toggle) {
    const dark = resolvedTheme(mode) === "dark";
    toggle.innerHTML = icon(dark ? "sun" : "moon");
    toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    refreshIcons(toggle);
  }
}
function setThemeMode(mode) {
  try { localStorage.setItem("lifeKS.theme.v1", mode); } catch (e) { showToast("Theme applied, but could not be remembered on this device.", true); }
  applyTheme(mode);
}

/* ===== Routing and rendering ===== */
const PAGE_ORDER = ["dashboard", "schedule", "tasks", "sleep", "finance", "wallets", "transactions", "notes", "goals", "reports", "settings"];

function showPage(name, { updateHash = true } = {}) {
  if (!PAGES[name]) name = "dashboard";
  appState.page = name;
  PAGE_ORDER.forEach((p) => byId("page-" + p).classList.toggle("is-hidden", p !== name));
  $$(".nav-item, .mobile-nav-item[data-page]").forEach((el) => el.classList.toggle("is-active", el.dataset.page === name));
  byId("breadcrumbPage").textContent = PAGES[name].title;
  document.title = `${PAGES[name].title} · LifeKS`;
  renderPage();
  if (updateHash && location.hash !== "#/" + name) history.replaceState(null, "", "#/" + name);
  window.scrollTo(0, 0);
}

function renderPage() {
  const name = appState.page;
  const active = document.activeElement;
  const focusId = active && active.id && byId("page-" + name).contains(active) ? active.id : null;
  const caret = focusId && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
  const root = byId("page-" + name);
  root.innerHTML = PAGES[name].render();
  refreshIcons(root);
  if (focusId) {
    const node = byId(focusId);
    if (node) { node.focus(); if (caret) { try { node.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text input */ } } }
  }
}

function updateNavCounts() {
  const open = db.tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const tasks = byId("tasksCount");
  const notes = byId("notesCount");
  if (tasks) tasks.textContent = open;
  if (notes) notes.textContent = db.notes.length;
}

function storageBanner() {
  return appState.storageProblem
    ? `<div class="notice" role="alert">${icon("triangle-alert")}<p><strong>Storage problem.</strong> ${esc(appState.storageProblem)} Open Settings to export a backup.</p></div>` : "";
}

function setUi(path, value) {
  const parts = path.split(".");
  let target = ui;
  while (parts.length > 1) { const key = parts.shift(); target = target[key] = target[key] || {}; }
  target[parts[0]] = value;
}

function bindAttr(path, value) { return `data-bind="${path}" id="b_${path.replace(/\./g, "_")}" value="${esc(value ?? "")}"`; }
function bindSelect(path, current, options, labelText) {
  const opts = optionList(options).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(current ?? "") ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  return `<div class="field"><label for="b_${path.replace(/\./g, "_")}">${esc(labelText)}</label><select data-bind="${path}" id="b_${path.replace(/\./g, "_")}">${opts}</select></div>`;
}

/* ===== Global events ===== */
function initEvents() {
  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-dialog]");
    if (close) { const dlg = close.closest("dialog"); if (dlg) dlg.close(); return; }
    const nav = event.target.closest("[data-page]");
    if (nav) { const more = byId("moreDialog"); if (more.open) more.close(); showPage(nav.dataset.page); return; }
    const act = event.target.closest("[data-action]");
    if (act && ACTIONS[act.dataset.action]) { ACTIONS[act.dataset.action](act, event); }
  });
  byId("pageContent").addEventListener("input", (event) => {
    const el = event.target.closest("[data-bind]");
    if (!el) return;
    setUi(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    renderPage();
  });
  byId("mobileMore").addEventListener("click", () => byId("moreDialog").showModal());
  byId("themeToggle").addEventListener("click", () => setThemeMode(resolvedTheme(themeMode()) === "dark" ? "light" : "dark"));
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#\//, "");
    if (PAGES[name] && name !== appState.page) showPage(name, { updateHash: false });
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (themeMode() === "system") applyTheme("system"); });
  $$("dialog").forEach((dlg) => dlg.addEventListener("click", (event) => { if (event.target === dlg) dlg.close(); }));
}

/* Greeting helper shared by pages. */
function greeting(date = new Date()) {
  const h = date.getHours();
  const word = h < 4 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night";
  return db.settings.name ? `${word}, ${db.settings.name}` : word;
}

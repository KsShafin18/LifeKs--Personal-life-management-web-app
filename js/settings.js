"use strict";

/* ===== Settings, backup and data safety ===== */
const BACKUP_FORMAT = { app: "LifeKS", schemaVersion: 1 };
const CATEGORY_KINDS = [["income", "Income sources"], ["expense", "Expense categories"], ["schedule", "Schedule categories"], ["task", "Task categories"]];
let storageInfo = null;

function buildBackup() {
  const data = {};
  CONFIG.collections.forEach((name) => { data[name] = db[name]; });
  data.settings = db.settings;
  data.categories = db.categories;
  return Object.assign({}, BACKUP_FORMAT, { exportedAt: new Date().toISOString(), data });
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "LifeKS" || !obj.data || typeof obj.data !== "object") return "This file is not a LifeKS backup.";
  if (obj.schemaVersion !== 1) return "This backup was made by a newer version of LifeKS and can’t be restored here.";
  const d = obj.data;
  for (const name of CONFIG.collections) {
    if (!Array.isArray(d[name])) return `The backup is missing “${name}”.`;
    if (!d[name].every((r) => r && typeof r === "object" && typeof r.id === "string")) return `Some ${name} in the backup are damaged.`;
    if (new Set(d[name].map((r) => r.id)).size !== d[name].length) return `Some ${name} in the backup have duplicate IDs.`;
  }
  if (!d.transactions.every((t) => Number.isSafeInteger(t.amount) && t.amount > 0 && TX_TYPES.some((x) => x[0] === t.type) && !Number.isNaN(new Date(t.at).getTime()))) return "Some transactions in the backup are damaged.";
  if (!d.wallets.every((w) => typeof w.name === "string" && Number.isSafeInteger(w.opening || 0))) return "Some wallets in the backup are damaged.";
  if (!d.loans.every((l) => Number.isSafeInteger(l.principal))) return "Some loans in the backup are damaged.";
  if (!d.sleep.every((s) => !Number.isNaN(new Date(s.start).getTime()))) return "Some sleep sessions in the backup are damaged.";
  if (!d.settings || typeof d.settings !== "object") return "The backup is missing settings.";
  if (!d.categories || !["income", "expense", "schedule", "task"].every((k) => Array.isArray(d.categories[k]) && d.categories[k].every((c) => typeof c === "string"))) return "The backup is missing categories.";
  return "";
}

function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; /* stop spreadsheet formula injection */
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const header = ["Date", "Time", "Type", "Amount", "Wallet", "To wallet", "Person", "Category", "Note"];
  const rows = db.transactions.slice().sort(byTimeDesc).map((t) => {
    const d = new Date(t.at);
    return [dateKey(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, label(TX_TYPES, t.type), minorToInput(t.amount), walletName(t.walletId), t.toWalletId ? walletName(t.toWalletId) : "", t.person, t.category, t.note].map(csvCell).join(",");
  });
  downloadFile(`lifeks-transactions-${todayKey()}.csv`, "\ufeff" + [header.join(","), ...rows].join("\r\n"), "text/csv;charset=utf-8");
  showToast(db.transactions.length ? "Transactions exported." : "Exported an empty file: there are no transactions yet.");
}

function exportBackup() {
  const backup = buildBackup();
  downloadFile(`lifeks-backup-${todayKey()}.json`, JSON.stringify(backup, null, 2), "application/json");
  commit(["settings"], () => { db.settings.lastBackupAt = backup.exportedAt; });
  showToast("Backup downloaded. Keep the file somewhere safe, outside this browser.");
  if (appState.page === "settings") renderPage();
}

function readBackup(mode) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast("That file could not be read.", true);
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { showToast("That file is not valid JSON.", true); return; }
      const problem = validateBackup(parsed);
      if (problem) { showToast(problem, true); return; }
      const d = parsed.data;
      const merging = mode === "merge";
      askConfirm({
        title: merging ? "Add previous data?" : "Restore this backup?",
        message: `It contains ${plural(d.transactions.length, "transaction")}, ${plural(d.schedules.length, "schedule item")}, ${plural(d.tasks.length, "task")}, ${plural(d.sleep.length, "sleep session")} and ${plural(d.notes.length, "note")}, exported ${fmtDateTime(parsed.exportedAt)}.${merging ? " New records will be added; matching IDs and your current data are kept." : " It replaces what is on this device now."} A safety copy of your current data is kept first.`,
        confirmLabel: merging ? "Add data" : "Restore", danger: false,
        onConfirm() {
          const safety = Store.write("preRestore", buildBackup());
          if (!safety.ok) { showToast("Could not make a safety copy, so nothing was changed.", true); return false; }
          const names = [...CONFIG.collections, "settings", "categories"];
          if (merging) {
            let added = 0;
            const saved = commit(names, () => {
              CONFIG.collections.forEach((name) => {
                const ids = new Set(db[name].map((record) => record.id));
                const fresh = d[name].filter((record) => !ids.has(record.id));
                added += fresh.length;
                db[name] = db[name].concat(fresh);
              });
              CATEGORY_KINDS.forEach(([kind]) => {
                const existing = new Set(db.categories[kind].map((category) => category.toLowerCase()));
                db.categories[kind] = db.categories[kind].concat(d.categories[kind].filter((category) => {
                  const key = category.toLowerCase();
                  if (existing.has(key)) return false;
                  existing.add(key);
                  return true;
                }));
              });
              db.settings = Object.assign({}, d.settings, db.settings);
            });
            if (!saved) return false;
            showToast(added ? `Added ${plural(added, "record")}. Existing records were kept.` : "No new records to add. Existing data was kept.");
          } else {
            const before = {};
            names.forEach((n) => { before[n] = db[n]; });
            const failed = names.find((n) => !Store.write(n, d[n]).ok);
            if (failed) {
              names.forEach((n) => Store.write(n, before[n]));
              showToast("Restore failed, so your existing data was kept.", true);
              return false;
            }
            loadAll();
            showToast("Backup restored.");
          }
          updateNavCounts();
          showPage("dashboard");
        }
      });
    };
    reader.readAsText(file);
  };
  input.click();
}

function restoreBackup() { readBackup("replace"); }
function addPreviousData() { readBackup("merge"); }

function clearAllData() {
  askConfirm({
    title: "Clear all LifeKS data?",
    message: "This permanently deletes every schedule, task, sleep session, wallet, transaction, loan, note, goal and habit stored on this device. It can’t be undone. Export a backup first if you might want anything back.",
    typeWord: "DELETE", confirmLabel: "Delete everything",
    onConfirm() {
      Store.dataKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
      Store.blocked.clear();
      CONFIG.collections.forEach((n) => { db[n] = []; });
      loadAll();
      updateNavCounts();
      showToast("All data cleared.");
      showPage("dashboard");
    }
  });
}

function backupAgeText() {
  const at = db.settings.lastBackupAt;
  if (!at) return "You haven’t downloaded a backup yet.";
  const days = Math.floor((Date.now() - new Date(at)) / 86400000);
  return `Last backup: ${fmtDateTime(at)} (${days === 0 ? "today" : plural(days, "day") + " ago"}).`;
}

PAGES.settings = {
  title: "Settings",
  render() {
    const mode = themeMode();
    const themeButtons = [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Match device", "monitor"]].map(([v, l, ic]) =>
      `<button class="button ${mode === v ? "button-primary" : "button-outline"}" data-action="theme-set" data-mode="${v}" aria-pressed="${mode === v}">${icon(ic)} ${l}</button>`).join("");
    const cats = CATEGORY_KINDS.map(([kind, title]) => `<div style="margin-bottom:14px"><strong>${title}</strong><div class="pills">${db.categories[kind].map((c, i) => `<span class="pill">${esc(c)} <button class="text-button" style="padding:0" data-action="cat-remove" data-kind="${kind}" data-index="${i}" aria-label="Remove ${esc(c)}">×</button></span>`).join("")}<button class="button button-outline button-sm" data-action="cat-add" data-kind="${kind}">${icon("plus")} Add</button></div></div>`).join("");
    const used = storageInfo && storageInfo.usage !== null ? `${(storageInfo.usage / 1024).toFixed(0)} KB used` : "usage unknown";
    const persisted = storageInfo === null ? "checking…" : storageInfo.persisted === true ? "Yes. The browser promised not to evict it." : storageInfo.persisted === false ? "Not guaranteed. Download backups regularly." : "Not supported by this browser.";
    return storageBanner() + pageHeader("MAKE IT YOURS", "Settings", "Theme, profile, categories and your data.") +
      `<div class="stack">
      <div class="card"><div class="card-head"><h2>Appearance</h2></div><div class="title-actions">${themeButtons}</div></div>
      <div class="card"><div class="card-head"><h2>Profile and region</h2></div><div class="list">
        <div class="row"><div class="row-main"><strong>Your name</strong><small>${esc(db.settings.name || "Not set")}. Shown in the dashboard greeting.</small></div><button class="button button-outline button-sm" data-action="set-name">Change</button></div>
        <div class="row"><div class="row-main"><strong>Currency</strong><small>${esc(db.settings.currency)} (${esc(currencySymbol())}). Changes the symbol only; amounts are not converted.</small></div><button class="button button-outline button-sm" data-action="set-currency">Change</button></div>
        <div class="row"><div class="row-main"><strong>Timezone</strong><small>${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. LifeKS follows this device’s timezone for every date and time.</small></div></div></div></div>
      <div class="card"><div class="card-head"><h2>Categories</h2></div>${cats}<p class="muted" style="margin:0;font-size:12px">Removing a category doesn’t change records that already use it. Wallets are managed on the <button class="text-button" data-page="wallets">Wallets page</button>.</p></div>
      <div class="card"><div class="card-head"><h2>Your data and backups</h2></div>
        <div class="notice is-info">${icon("hard-drive")}<p><strong>Your data lives only in this browser on this device.</strong> It does not sync, and clearing browser data, switching browser or losing the device removes it. Download a backup regularly and keep the file somewhere else.</p></div>
        <p style="margin:0 0 12px">${esc(backupAgeText())}</p>
        <div class="title-actions"><button class="button button-primary" data-action="export-backup">${icon("download")} Download / transfer data</button><button class="button button-outline" data-action="add-previous-data">${icon("folder-plus")} Add previous data</button><button class="button button-outline" data-action="restore-backup">${icon("upload")} Restore from backup</button><button class="button button-outline" data-action="export-csv">${icon("file-spreadsheet")} Transactions CSV</button></div>
        <p class="muted" style="margin:14px 0 0;font-size:12px">Persistent storage: ${esc(persisted)} · ${esc(used)}.</p></div>
      <div class="card"><div class="card-head"><h2>Clear data</h2></div><p class="muted" style="margin:0 0 12px">Deletes everything LifeKS has saved on this device. You will be asked to type DELETE.</p><button class="button button-danger" data-action="clear-data">${icon("trash-2")} Clear all data</button></div>
      <div class="card"><div class="card-head"><h2>About</h2></div><p style="margin:0">${esc(CONFIG.app.name)} ${esc(CONFIG.app.version)}. There is no sign-in in this version; everything stays on this device.</p></div></div>`;
  }
};

ACTIONS["theme-set"] = (el) => { setThemeMode(el.dataset.mode); renderPage(); };
ACTIONS["export-backup"] = exportBackup;
ACTIONS["export-csv"] = exportCsv;
ACTIONS["restore-backup"] = restoreBackup;
ACTIONS["add-previous-data"] = addPreviousData;
ACTIONS["clear-data"] = clearAllData;
ACTIONS["set-name"] = () => openForm({
  title: "Your name", fields: [{ name: "name", label: "Name (optional)", max: 40, wide: true }], values: { name: db.settings.name },
  onSubmit(v) { if (!commit(["settings"], () => { db.settings.name = v.name; })) return false; showToast(v.name ? "Name saved." : "Name cleared."); renderPage(); return true; }
});
ACTIONS["set-currency"] = () => openForm({
  title: "Currency", intro: "Only the symbol changes. Existing amounts are not converted.",
  fields: [{ name: "currency", label: "Currency", type: "select", options: Object.entries(CONFIG.currencies).map(([c, s]) => [c, `${c} (${s})`]), wide: true }], values: { currency: db.settings.currency },
  onSubmit(v) { if (!commit(["settings"], () => { db.settings.currency = v.currency; })) return false; showToast("Currency updated."); renderPage(); return true; }
});
ACTIONS["cat-add"] = (el) => {
  const kind = el.dataset.kind;
  openForm({
    title: "Add category", fields: [{ name: "name", label: "Name", required: true, max: 40, wide: true }],
    validate: (v) => (db.categories[kind].some((c) => c.toLowerCase() === v.name.toLowerCase()) ? "That category already exists." : ""),
    onSubmit(v) { if (!commit(["categories"], () => { db.categories[kind].push(v.name); })) return false; showToast("Category added."); renderPage(); return true; }
  });
};
ACTIONS["cat-remove"] = (el) => {
  const { kind, index } = el.dataset;
  if (db.categories[kind].length <= 1) { showToast("Keep at least one category in each list.", true); return; }
  if (commit(["categories"], () => { db.categories[kind].splice(Number(index), 1); })) renderPage();
};

async function refreshStorageInfo() {
  storageInfo = await Store.status();
  if (appState.page === "settings" && !document.querySelector("dialog[open]")) renderPage();
}

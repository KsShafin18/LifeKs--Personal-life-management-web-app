"use strict";

/* ===== Start-up ===== */
function updateLiveText() {
  $$("[data-elapsed-from]").forEach((el) => { el.textContent = fmtDur(Date.now() - new Date(el.dataset.elapsedFrom)); });
  byId("headerDate").textContent = fmtDateShort(todayKey());
}

let lastMinute = "";
function tick() {
  updateLiveText();
  const d = new Date();
  const parts = dhakaDateTimeParts(d);
  const minute = `${dateKey(d)} ${parts.hour}:${parts.minute}`;
  if (minute !== lastMinute) {
    lastMinute = minute;
    checkReminders();
    const idle = !document.querySelector("dialog[open]") && !(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName));
    if (idle && ["dashboard", "schedule"].includes(appState.page)) renderPage();
  }
}

function init() {
  loadAll();
  byId("sidebarVersion").textContent = CONFIG.app.version;
  byId("footerLine").textContent = CONFIG.app.footerLine;
  byId("footerVersion").textContent = `${CONFIG.app.name} ·${CONFIG.app.version}`;
  byId("footerUpdated").textContent = `Last Updated ${CONFIG.app.lastUpdated}`;
  applyTheme(themeMode());
  initEvents();
  updateNavCounts();
  refreshIcons();
  const fromHash = location.hash.replace(/^#\//, "");
  showPage(PAGES[fromHash] ? fromHash : "dashboard");
  updateLiveText();
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !document.querySelector("dialog[open]")) renderPage(); });
  refreshStorageInfo();
}

init();

"use strict";

/*
 * LifeKS storage layer (same protection rules as MY DTI).
 *  - Versioned keys: lifeKS.<name>.v1. Never call localStorage.clear().
 *  - An unreadable stored value is copied to "<key>.unreadable" and then LOCKED:
 *    LifeKS will not overwrite it, so a bug can never wipe existing data.
 *  - Every write is read back and compared. "Saved" is only reported after that check.
 */
const Store = (() => {
  const PREFIX = "lifeKS.";
  const SUFFIX = ".v1";
  const blocked = new Set();
  const keyOf = (name) => PREFIX + name + SUFFIX;

  function read(name, fallback) {
    let raw;
    try {
      raw = localStorage.getItem(keyOf(name));
    } catch (error) {
      blocked.add(name);
      return { value: fallback, status: "unavailable" };
    }
    if (raw === null) return { value: fallback, status: "empty" };
    try {
      return { value: JSON.parse(raw), status: "ok" };
    } catch (error) {
      try { localStorage.setItem(keyOf(name) + ".unreadable", raw); } catch (ignored) { /* best effort */ }
      blocked.add(name);
      return { value: fallback, status: "unreadable" };
    }
  }

  function lock(name) {
    const raw = localStorage.getItem(keyOf(name));
    try { if (raw !== null) localStorage.setItem(keyOf(name) + ".unreadable", raw); } catch (ignored) { /* best effort */ }
    blocked.add(name);
  }

  function write(name, value) {
    if (blocked.has(name)) return { ok: false, reason: "blocked" };
    try {
      const text = JSON.stringify(value);
      localStorage.setItem(keyOf(name), text);
      if (localStorage.getItem(keyOf(name)) !== text) return { ok: false, reason: "verify" };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error && error.name === "QuotaExceededError" ? "quota" : "error" };
    }
  }

  function remove(name) {
    try { localStorage.removeItem(keyOf(name)); return true; } catch (error) { return false; }
  }

  function dataKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX) && key !== "lifeKS.theme.v1") keys.push(key);
      }
    } catch (error) { /* storage unavailable */ }
    return keys;
  }

  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch (error) { /* not supported */ }
    return false;
  }

  async function status() {
    const info = { persisted: null, usage: null, quota: null };
    try {
      if (navigator.storage && navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        info.usage = estimate.usage ?? null;
        info.quota = estimate.quota ?? null;
      }
    } catch (error) { /* not supported */ }
    return info;
  }

  return { PREFIX, SUFFIX, blocked, keyOf, read, write, remove, lock, dataKeys, requestPersistence, status };
})();

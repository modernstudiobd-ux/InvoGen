// backup.js — export everything (documents, clients, products, settings) to one
// JSON file, and restore from it. Also reads backups made by the old v3 app.

import { downloadBlob } from "./dom.js";
import { exportSnapshot, replaceAll, setSettings, getState } from "./state.js";
import { migrateLegacy } from "./migrate.js";
import { todayISO } from "./format.js";

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(exportSnapshot())], { type: "application/json" });
  downloadBlob(blob, `InvoGen backup ${todayISO()}.json`);
  setSettings({ lastBackupAt: Date.now(), changesSinceBackup: 0, backupSnoozeUntil: 0 }, "ui");
}

// Reads a backup file. Resolves to { data, counts, createdAt } without applying it,
// so the caller can ask for confirmation first. Throws Error("not-backup" | "too-large" | "unreadable").
export async function readBackup(file) {
  if (file.size > 60e6) throw new Error("too-large");
  let j;
  try { j = JSON.parse(await file.text()); } catch { throw new Error("unreadable"); }
  let data = null;
  if (j && j.kind === "invogen-backup" && j.data && typeof j.data === "object") data = j.data;
  else if (j && j.kind === "backup" && j.data && typeof j.data === "object") {
    // v3.x backup: a copy of the old app's localStorage keys
    data = migrateLegacy(k => (typeof j.data[k] === "string" ? j.data[k] : null));
    if (data) data = { ...data, settings: { ...getState().settings, ...data.settings } };
  }
  if (!data) throw new Error("not-backup");
  const counts = { docs: (data.docs || []).length, clients: (data.clients || []).length, products: (data.products || []).length };
  return { data, counts, createdAt: j.exportedAt || j.createdAt || "" };
}

export function applyBackup(data) {
  const lang = getState().settings.appLang;
  replaceAll({ ...data, settings: { ...(data.settings || {}), appLang: data.settings?.appLang || lang } });
}

// Show the reminder when there are documents, changes since the last backup,
// and the last backup is missing or older than 14 days (snoozed for 7 days by "Later").
export function backupDue(state, now = Date.now()) {
  const s = state.settings;
  if (!state.docs.some(d => !d.sample)) return false;
  if (now < (s.backupSnoozeUntil || 0)) return false;
  if (!s.changesSinceBackup) return false;
  return !s.lastBackupAt || now - s.lastBackupAt > 14 * 864e5;
}
export function snoozeBackup() { setSettings({ backupSnoozeUntil: Date.now() + 7 * 864e5 }, "ui"); }

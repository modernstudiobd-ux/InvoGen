// autoBackup.js — automatic backups to a folder the person chooses (File System Access
// API: Chrome and Edge on computers). After every change, a copy of all data is written
// to "InvoGen backup YYYY-MM-DD.json" in that folder (one file per day, the last 30 days
// kept). Pick a folder your cloud drive syncs and the backups leave the device too.
// The browser may ask again for permission after a restart; the app then shows "Allow".

import { kvGet, kvSet, kvDelete, storageMode } from "./storage.js";
import { exportSnapshot, subscribe, setSettings } from "./state.js";
import { todayISO } from "./format.js";

const KEY = "autoBackup";
const KEEP = 30;
const FILE_RE = /^InvoGen backup (\d{4}-\d{2}-\d{2})\.json$/;
const DELAY = 3000;

// status: "unsupported" | "off" | "on" | "permission" (needs a tap to allow again) | "error"
let info = { status: "off", folder: "", lastAt: 0, lastFile: "", error: "" };
let handle = null, timer = 0, writing = null, pending = false, started = false;
const listeners = new Set();

export function autoBackupSupported() {
  try { return typeof window.showDirectoryPicker === "function" && window.isSecureContext && window.self === window.top; }
  catch { return false; }
}
export const autoBackupInfo = () => ({ ...info });
export const autoBackupActive = () => info.status === "on" || info.status === "error";
export const autoBackupNeedsPermission = () => info.status === "permission";
export function onAutoBackupChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => { try { fn(autoBackupInfo()); } catch (e) { console.error(e); } }); }
function set(patch) { info = { ...info, ...patch }; emit(); }

async function remember() {
  await kvSet(KEY, { handle, folder: info.folder, lastAt: info.lastAt, lastFile: info.lastFile });
}

async function permission(h, ask) {
  try {
    const opts = { mode: "readwrite" };
    if ((await h.queryPermission(opts)) === "granted") return true;
    return ask ? (await h.requestPermission(opts)) === "granted" : false;
  } catch { return false; }
}

// Called once when the app starts.
export async function initAutoBackup() {
  if (started) return;
  started = true;
  if (!autoBackupSupported() || storageMode() !== "idb") { info.status = "unsupported"; return; }
  const saved = await kvGet(KEY);
  if (saved && saved.handle) {
    handle = saved.handle;
    info = { ...info, folder: saved.folder || handle.name || "", lastAt: saved.lastAt || 0, lastFile: saved.lastFile || "" };
    info.status = (await permission(handle, false)) ? "on" : "permission";
  }
  subscribe((st, reason) => {
    // Every real change (not view settings, saves or other tabs) schedules a backup.
    if (reason === "ui" || reason === "storage" || reason === "sync") return;
    if (handle && info.status !== "permission") schedule();
  });
  if (info.status === "on") schedule(500);
  emit();
}

function schedule(ms = DELAY) {
  clearTimeout(timer);
  timer = setTimeout(() => { backupNow().catch(() => {}); }, ms);
}

// Lets the person pick the folder (must run from a click). Writes the first backup at once.
export async function chooseFolder() {
  if (!autoBackupSupported()) return false;
  let h;
  try { h = await window.showDirectoryPicker({ id: "invogen-backups", mode: "readwrite", startIn: "documents" }); }
  catch { return false; }                       // cancelled
  if (!(await permission(h, true))) return false;
  handle = h;
  info = { ...info, folder: h.name || "", status: "on", error: "" };
  await remember();
  emit();
  return backupNow();
}

// "Allow" after the browser forgot the permission (must run from a click).
export async function resumeAutoBackup() {
  if (!handle) return false;
  if (!(await permission(handle, true))) { set({ status: "permission" }); return false; }
  set({ status: "on", error: "" });
  return backupNow();
}

export async function stopAutoBackup() {
  clearTimeout(timer);
  handle = null;
  await kvDelete(KEY);
  set({ status: "off", folder: "", lastAt: 0, lastFile: "", error: "" });
}

// Writes today's backup file now. Resolves true when it was written.
export async function backupNow() {
  clearTimeout(timer);
  if (!handle) return false;
  if (writing) { pending = true; return writing; }
  writing = (async () => {
    if (!(await permission(handle, false))) { set({ status: "permission" }); return false; }
    const name = `InvoGen backup ${todayISO()}.json`;
    try {
      const fh = await handle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(new Blob([JSON.stringify(exportSnapshot())], { type: "application/json" }));
      await w.close();
      await prune();
      info = { ...info, status: "on", lastAt: Date.now(), lastFile: name, error: "" };
      await remember();
      setSettings({ lastBackupAt: info.lastAt, changesSinceBackup: 0, backupSnoozeUntil: 0 }, "ui");
      emit();
      return true;
    } catch (e) {
      console.error(e);
      set({ status: e && e.name === "NotAllowedError" ? "permission" : "error", error: String((e && e.message) || e) });
      return false;
    }
  })();
  try { return await writing; }
  finally {
    writing = null;
    if (pending) { pending = false; schedule(); }
  }
}

// Keeps the newest 30 daily files this app wrote; never touches other files.
async function prune() {
  const ours = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === "file" && FILE_RE.test(name)) ours.push(name);
  }
  ours.sort().reverse();
  for (const name of ours.slice(KEEP)) { try { await handle.removeEntry(name); } catch {} }
}

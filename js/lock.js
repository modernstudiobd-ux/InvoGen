// lock.js — app lock with a PIN (4–8 digits). When set, InvoGen asks for the PIN when it
// opens and again after it was left alone for the chosen time. The PIN itself is never
// stored: only a salted PBKDF2-SHA-256 hash, on this device only (not in backups).
// It keeps other people out of the app on a shared device; it does not encrypt the data
// the browser stores. A forgotten PIN can only be cleared by erasing this device's data.

import { esc } from "./dom.js";
import { icon } from "./icons.js";
import { t, getLanguage } from "./i18n.js";
import { eraseEverything } from "./state.js";

const KEY = "invogen.lock";
const FAIL_KEY = "invogen.lock.fails";
const ITER = 150000;
export const LOCK_AFTER = [0, 1, 5, 15, 60];          // minutes; 0 = as soon as the app is left
const safe = fn => { try { return fn(); } catch { return null; } };

let locked = false, hiddenAt = 0, idleTimer = 0, wired = false;
const listeners = new Set();
export const onLockChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(locked); } catch {} });

export const lockSupported = () => !!(window.crypto && crypto.subtle && window.isSecureContext);
function config() {
  const c = safe(() => JSON.parse(localStorage.getItem(KEY) || "null"));
  return c && c.hash && c.salt ? c : null;
}
export const isLockSet = () => !!config();
export const isLocked = () => locked;
export const lockAfter = () => { const c = config(); return c && LOCK_AFTER.includes(c.after) ? c.after : 5; };
export const validPin = pin => /^\d{4,8}$/.test(pin);

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pin, salt, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}

export async function setPin(pin, after = lockAfter()) {
  if (!validPin(pin) || !lockSupported()) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITER);
  safe(() => localStorage.setItem(KEY, JSON.stringify({ v: 1, salt: b64(salt), hash: b64(hash), iter: ITER, after })));
  safe(() => localStorage.removeItem(FAIL_KEY));
  wire();
  emit();
  return isLockSet();
}
export function setLockAfter(after) {
  const c = config();
  if (!c || !LOCK_AFTER.includes(after)) return;
  c.after = after;
  safe(() => localStorage.setItem(KEY, JSON.stringify(c)));
  resetIdle();
}
export function removePin() {
  safe(() => localStorage.removeItem(KEY));
  safe(() => localStorage.removeItem(FAIL_KEY));
  clearTimeout(idleTimer);
  emit();
}

export async function checkPin(pin) {
  const c = config();
  if (!c || !validPin(pin)) return false;
  const got = new Uint8Array(await derive(pin, unb64(c.salt), c.iter || ITER));
  const want = unb64(c.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

// After 5 wrong PINs, wait 30 seconds; each further miss doubles the wait (up to 15 minutes).
function fails() { return safe(() => JSON.parse(localStorage.getItem(FAIL_KEY) || "null")) || { n: 0, until: 0 }; }
function noteFail() {
  const f = fails();
  f.n++;
  if (f.n >= 5) f.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (f.n - 5));
  safe(() => localStorage.setItem(FAIL_KEY, JSON.stringify(f)));
  return f;
}
const waitLeft = () => Math.max(0, fails().until - Date.now());

/* ---------------- locking ---------------- */
// Called once at start-up (after the interface language is loaded).
export function initLock() {
  wire();
  if (isLockSet()) lock();
}

function wire() {
  if (wired) return;
  wired = true;
  // While locked, the app's own keyboard shortcuts (N, /, Ctrl+P, Ctrl+Z …) do nothing;
  // inside the lock screen only typing, editing keys and copy/paste work.
  window.addEventListener("keydown", e => {
    if (!locked) return;
    const inLock = e.target && e.target.closest && e.target.closest("#lockScreen");
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    if (inLock && !(mod && !["a", "c", "v", "x"].includes(String(e.key).toLowerCase()))) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (!isLockSet()) return;
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && !locked && Date.now() - hiddenAt >= lockAfter() * 60e3) lock();
  });
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true, capture: true }));
  resetIdle();
}
function resetIdle() {
  clearTimeout(idleTimer);
  if (!isLockSet() || locked) return;
  const min = lockAfter();
  idleTimer = setTimeout(() => { if (isLockSet() && !locked) lock(); }, Math.max(1, min) * 60e3);
}

export function lock() {
  if (!isLockSet() || locked) return;
  locked = true;
  clearTimeout(idleTimer);
  // Anything open (menus, forms) closes; the editor has already saved every change.
  document.querySelectorAll("dialog[open]").forEach(d => { try { d.close(); } catch {} });
  document.body.classList.add("is-locked");
  ["rail", "main", "tabbar", "toasts", "skipLink"].forEach(id => { const el = document.getElementById(id); if (el) el.inert = true; });
  renderLockScreen();
  emit();
}

function unlock() {
  locked = false;
  document.body.classList.remove("is-locked");
  ["rail", "main", "tabbar", "toasts", "skipLink"].forEach(id => { const el = document.getElementById(id); if (el) el.inert = false; });
  const scr = document.getElementById("lockScreen");
  if (scr) scr.remove();
  safe(() => localStorage.removeItem(FAIL_KEY));
  hiddenAt = 0;
  resetIdle();
  const h = document.querySelector("#pageTitle") || document.getElementById("main");
  if (h) h.focus({ preventScroll: true });
  emit();
}

function renderLockScreen() {
  let scr = document.getElementById("lockScreen");
  if (!scr) { scr = document.createElement("div"); scr.id = "lockScreen"; document.body.appendChild(scr); }
  scr.className = "lock";
  scr.setAttribute("role", "dialog");
  scr.setAttribute("aria-modal", "true");
  scr.setAttribute("aria-labelledby", "lockTitle");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  scr.innerHTML = `<form class="lock-card" id="lockForm" novalidate>
      <span class="lock-icon" aria-hidden="true">${icon("lock", 28)}</span>
      <h1 class="h2" id="lockTitle">${esc(t("lock.title"))}</h1>
      <p class="hint" id="lockHint">${esc(t("lock.enter"))}</p>
      <label class="visually-hidden" for="lockPin">${esc(t("lock.pin"))}</label>
      <input class="input lock-input" id="lockPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-describedby="lockHint lockErr" dir="ltr">
      <p class="err" id="lockErr" role="alert" hidden></p>
      <div class="lock-pad" role="group" aria-label="${esc(t("lock.keypad"))}">
        ${keys.map(k => k === "" ? "<span></span>" : k === "del"
          ? `<button type="button" class="lock-key" data-key="del" aria-label="${esc(t("lock.delete"))}">${icon("delete", 22)}</button>`
          : `<button type="button" class="lock-key" data-key="${k}">${k}</button>`).join("")}
      </div>
      <button type="submit" class="btn btn-primary btn-block">${esc(t("lock.unlock"))}</button>
      <button type="button" class="link-btn lock-forgot" data-act="forgot">${esc(t("lock.forgot"))}</button>
    </form>`;
  const input = scr.querySelector("#lockPin"), err = scr.querySelector("#lockErr"), form = scr.querySelector("#lockForm");
  const showErr = msg => { err.textContent = msg; err.hidden = !msg; input.setAttribute("aria-invalid", msg ? "true" : "false"); };
  const showWait = () => {
    const ms = waitLeft();
    if (!ms) return false;
    { const s = Math.ceil(ms / 1000); showErr(t("lock.wait", { s, n: s })); }
    setTimeout(() => { if (locked && !waitLeft()) showErr(""); }, Math.min(ms, 30000) + 50);
    return true;
  };
  scr.addEventListener("click", e => {
    const k = e.target.closest("[data-key]");
    if (k) {
      if (k.dataset.key === "del") input.value = input.value.slice(0, -1);
      else if (input.value.length < 8) input.value += k.dataset.key;
      input.focus();
      return;
    }
    if (e.target.closest("[data-act=forgot]")) forgot(scr);
  });
  input.addEventListener("input", () => { input.value = input.value.replace(/\D+/g, "").slice(0, 8); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (showWait()) return;
    const pin = input.value;
    if (await checkPin(pin)) { unlock(); return; }
    input.value = "";
    const f = noteFail();
    if (!showWait()) showErr(f.n >= 3 ? t("lock.wrongLeft", { n: 5 - f.n }) : t("lock.wrong"));
    input.focus();
  });
  // Keep keyboard focus inside the lock screen.
  scr.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const f = [...scr.querySelectorAll("input, button")].filter(x => !x.disabled && x.offsetParent !== null);
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  showWait();
  setTimeout(() => input.focus(), 30);
}

// Forgot the PIN: the only way in is to erase this device's data (then restore a backup).
function forgot(scr) {
  const word = t("set.eraseWord");
  const card = scr.querySelector(".lock-card");
  card.innerHTML = `<span class="lock-icon" aria-hidden="true">${icon("lock", 28)}</span>
    <h1 class="h2" id="lockTitle" tabindex="-1">${esc(t("lock.forgotTitle"))}</h1>
    <p>${esc(t("lock.forgotMsg"))}</p>
    <div class="field"><label for="lockErase">${esc(t("set.eraseType", { word }))}</label>
      <input class="input" id="lockErase" autocomplete="off" spellcheck="false" autocapitalize="characters"></div>
    <button type="button" class="btn btn-danger btn-block" id="lockEraseGo" disabled>${icon("trash-2", 18)}${esc(t("lock.eraseBtn"))}</button>
    <button type="button" class="btn btn-outline btn-block" id="lockBack">${esc(t("lock.back"))}</button>`;
  const input = card.querySelector("#lockErase"), go = card.querySelector("#lockEraseGo");
  const same = (a, b) => a.localeCompare(b, getLanguage(), { sensitivity: "base" }) === 0;
  const ok = () => { const v = input.value.trim(); return !!v && (same(v, word) || same(v, "ERASE")); };
  input.addEventListener("input", () => { go.disabled = !ok(); });
  card.querySelector("#lockBack").addEventListener("click", () => renderLockScreen());
  go.addEventListener("click", async () => {
    if (!ok()) return;
    await eraseEverything();
    removePin();
    unlock();
    location.hash = "#/documents";
  });
  card.querySelector("#lockTitle").focus();
}

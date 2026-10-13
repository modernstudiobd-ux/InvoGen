// datePicker.js — every <input type="date"> becomes a field in the same style as the other
// drop-downs: the date shows in the order of your date format (e.g. 13/10/2026), a calendar
// opens on the first click, and a second click (or just typing on a computer) lets you type it.
//   Calendar keys: ← → a day · ↑ ↓ a week · PageUp/PageDown a month (with Shift a year) ·
//   Home/End start/end of the week · Enter picks · Esc closes.
//   Typing accepts 13/10/2026, 13.10.26, 13-10, 13102026 or 2026-10-13, in your format's order.
// The original input stays (hidden) with the YYYY-MM-DD value, so screens keep working:
// picking sets it and fires "input" and "change"; setting .value from code updates the field.

import { esc } from "./dom.js";
import { icon } from "./icons.js";
import { t, getLanguage } from "./i18n.js";
import { settings } from "./state.js";
import { todayISO, parseISO } from "./format.js";
import { claimOpen, releaseOpen, placePop, relabel } from "./picker.js";

const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Bengali, Devanagari, Arabic-Indic and Persian digits typed on a phone keyboard count too.
const latinDigits = s => s.replace(/[০-৯०-९٠-٩۰-۹]/g, c => {
  const n = c.charCodeAt(0);
  for (const z of [0x09E6, 0x0966, 0x0660, 0x06F0]) if (n >= z && n <= z + 9) return String(n - z);
  return c;
});

// The order (DMY, MDY or YMD) and separator from the chosen date format.
function pattern() {
  const f = (settings() && settings().dateFormat) || "D MMM YYYY";
  const pos = { D: f.search(/D/), M: f.search(/M/), Y: f.search(/Y/) };
  const order = Object.keys(pos).sort((a, b) => pos[a] - pos[b]).join("");
  const numeric = !/MMM/.test(f) && /^[DMY]+[./-][DMY]+[./-][DMY]+$/.test(f);
  const sep = numeric ? f.match(/[./-]/)[0] : order === "YMD" ? "-" : "/";
  const ph = order.split("").map(c => ({ D: "DD", M: "MM", Y: "YYYY" })[c]).join(sep);
  return { order, sep, ph };
}
const shown = (v, p = pattern()) => { const d = parseISO(v); if (!d) return ""; const part = { D: pad(d.getDate()), M: pad(d.getMonth() + 1), Y: String(d.getFullYear()) }; return p.order.split("").map(c => part[c]).join(p.sep); };

export function parseTyped(text, p = pattern()) {
  const s = latinDigits(String(text || "").trim());
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let Y, M, D;
  if (m) [Y, M, D] = [+m[1], +m[2], +m[3]];
  else {
    let parts = s.split(/[^0-9]+/).filter(Boolean);
    if (parts.length === 1 && /^\d{8}$/.test(parts[0])) {
      const x = parts[0];
      parts = p.order === "YMD" ? [x.slice(0, 4), x.slice(4, 6), x.slice(6)] : [x.slice(0, 2), x.slice(2, 4), x.slice(4)];
    } else if (parts.length === 1 && /^\d{6}$/.test(parts[0]) && p.order !== "YMD") {
      const x = parts[0]; parts = [x.slice(0, 2), x.slice(2, 4), x.slice(4)];
    }
    const keys = p.order.split("");
    if (parts.length === 2) { const noY = keys.filter(k => k !== "Y"); parts = noY.map((k, i) => [k, parts[i]]); parts.push(["Y", String(new Date().getFullYear())]); }
    else if (parts.length === 3) parts = keys.map((k, i) => [k, parts[i]]);
    else return null;
    const v = Object.fromEntries(parts);
    Y = +v.Y; M = +v.M; D = +v.D;
    if (String(v.Y).length <= 2) Y += 2000;
  }
  if (!(Y >= 1900 && Y <= 2200 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null;
  const d = new Date(Y, M - 1, D);
  return d.getMonth() === M - 1 ? iso(d) : null;
}

function locale() {
  const lang = getLanguage();
  const s = settings() || {};
  return s.numberFormat === "native" ? lang : `${lang}-u-nu-latn`;
}
function weekStart() {
  try {
    const lang = getLanguage(), nav = navigator.language || "";
    const loc = new Intl.Locale(nav.toLowerCase().startsWith(lang) ? nav : lang);
    const wi = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo;
    if (wi && wi.firstDay) return wi.firstDay % 7;             // 0 = Sunday
  } catch { /* older browsers */ }
  return 1;
}

export function enhanceDate(inp) {
  if (inp.dataset.cp || inp.hasAttribute("data-native")) return;
  inp.dataset.cp = "1";
  const id = inp.id ? `${inp.id}-cb` : "dp-" + Math.random().toString(36).slice(2, 10);
  const gridId = id + "-grid", titleId = id + "-title", hintId = id + "-hint";
  const wrap = document.createElement("div");
  wrap.className = "cp dp";
  wrap.innerHTML = `<input class="input cp-input dp-input" id="${id}" type="text" role="combobox" readonly inputmode="numeric"
      aria-haspopup="grid" aria-expanded="false" aria-controls="${gridId}" autocomplete="off" spellcheck="false">
    <span class="cp-icon" aria-hidden="true">${icon("calendar", 18)}</span>
    <div class="cp-pop dp-pop" hidden>
      <p class="cp-hint" id="${hintId}">${icon("pencil", 16)}<span></span></p>
      <div class="dp-head">
        <button type="button" class="icon-btn" tabindex="-1" data-dp="prev">${icon("chevron-left", 18)}</button>
        <span class="dp-title" id="${titleId}" aria-live="polite"></span>
        <button type="button" class="icon-btn" tabindex="-1" data-dp="next">${icon("chevron-right", 18)}</button>
      </div>
      <table class="dp-grid" role="grid" id="${gridId}" aria-labelledby="${titleId}"><thead><tr></tr></thead><tbody></tbody></table>
      <div class="dp-foot">
        <button type="button" class="btn btn-ghost" tabindex="-1" data-dp="today"></button>
        <button type="button" class="btn btn-ghost" tabindex="-1" data-dp="clear"></button>
      </div>
    </div>`;
  inp.after(wrap);
  inp.hidden = true;
  inp.tabIndex = -1;
  inp.setAttribute("aria-hidden", "true");

  const input = wrap.querySelector("input"), pop = wrap.querySelector(".dp-pop");
  const hint = wrap.querySelector(".cp-hint span"), title = wrap.querySelector(".dp-title");
  const head = wrap.querySelector("thead tr"), body = wrap.querySelector("tbody");
  relabel(inp, input, hintId);
  inp.focus = opts => input.focus(opts);

  let open = false, typing = false, view = null, act = null;
  const val = () => valueDesc.get.call(inp);
  const bound = k => parseISO(inp.getAttribute(k));
  const allowed = d => { const lo = bound("min"), hi = bound("max"); return !(lo && d < lo) && !(hi && d > hi); };
  const show = () => {
    const p = pattern();
    input.value = shown(val(), p);
    input.placeholder = p.ph;
    input.disabled = inp.disabled;
    input.required = inp.required;
  };

  Object.defineProperty(inp, "value", {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); if (!open) show(); }
  });

  function labels() {
    const p = pattern();
    hint.textContent = typing ? t("date.typeHint", { format: p.ph }) : t("date.hint");
    wrap.querySelector('[data-dp="prev"]').setAttribute("aria-label", t("date.prev"));
    wrap.querySelector('[data-dp="next"]').setAttribute("aria-label", t("date.next"));
    wrap.querySelector('[data-dp="today"]').textContent = t("date.today");
    const clear = wrap.querySelector('[data-dp="clear"]');
    clear.textContent = t("date.clear");
    clear.hidden = inp.required;
  }

  function render() {
    const loc = locale(), ws = weekStart(), today = parseISO(todayISO()), sel = parseISO(val());
    title.textContent = new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(view);
    const wdShort = new Intl.DateTimeFormat(loc, { weekday: "short" }), wdLong = new Intl.DateTimeFormat(loc, { weekday: "long" });
    const ref = new Date(2024, 0, 7);                            // a Sunday
    head.innerHTML = Array.from({ length: 7 }, (_, i) => { const d = new Date(ref); d.setDate(7 + ((ws + i) % 7)); return `<th scope="col" abbr="${esc(wdLong.format(d))}">${esc(wdShort.format(d))}</th>`; }).join("");
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() - ws + 7) % 7));
    const num = new Intl.NumberFormat(loc), full = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    let html = "";
    for (let w = 0; w < 6; w++) {
      html += "<tr>";
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + w * 7 + i);
        const out = d.getMonth() !== view.getMonth(), ok = allowed(d);
        const cls = ["dp-day", out ? "is-out" : "", sameDay(d, today) ? "is-today" : "", sameDay(d, act) ? "is-active" : ""].filter(Boolean).join(" ");
        html += `<td role="gridcell" id="${id}-${iso(d)}" class="${cls}" data-d="${iso(d)}" aria-selected="${sameDay(d, sel)}"${ok ? "" : ' aria-disabled="true"'} aria-label="${esc(full.format(d))}${sameDay(d, today) ? ` (${esc(t("date.today"))})` : ""}">${esc(num.format(d.getDate()))}</td>`;
      }
      html += "</tr>";
    }
    body.innerHTML = html;
    if (act && !typing) input.setAttribute("aria-activedescendant", `${id}-${iso(act)}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function moveTo(d) {
    act = d;
    if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) view = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  }

  function openCal() {
    if (open || inp.disabled) return;
    claimOpen(closeCal);
    open = true; typing = false;
    act = parseISO(val()) || parseISO(todayISO());
    view = new Date(act.getFullYear(), act.getMonth(), 1);
    input.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    pop.hidden = false;
    labels(); render();
    placePop(wrap, pop);
    document.addEventListener("pointerdown", outside, true);
  }
  function closeCal(restore = true) {
    if (!open) return;
    open = false; typing = false;
    releaseOpen(closeCal);
    input.readOnly = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.removeAttribute("aria-invalid");
    wrap.classList.remove("is-open", "is-search", "is-bad");
    pop.hidden = true;
    if (restore) show();
    document.removeEventListener("pointerdown", outside, true);
  }
  function startTyping(initial) {
    if (!open) openCal();
    typing = true;
    input.readOnly = false;
    wrap.classList.add("is-search");
    labels(); render();
    if (initial != null) input.value = initial;
    if (document.activeElement === input) input.blur();
    input.focus();
    if (initial == null) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
  }
  function commit(v) {
    const changed = v !== val();
    closeCal(false);
    if (changed) valueDesc.set.call(inp, v);
    show();
    input.focus();
    if (changed) { inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  function commitTyped() {
    const v = parseTyped(input.value);
    if (v === "" && !inp.required) return commit("");
    const d = v && parseISO(v);
    if (!d || !allowed(d)) {
      wrap.classList.add("is-bad"); input.setAttribute("aria-invalid", "true");
      hint.textContent = t("date.bad", { format: pattern().ph });
      return false;
    }
    commit(v);
    return true;
  }
  function outside(e) {
    if (!wrap.isConnected) { document.removeEventListener("pointerdown", outside, true); releaseOpen(closeCal); return; }
    if (wrap.contains(e.target)) return;
    if (typing && parseTyped(input.value)) commitTyped(); else closeCal();
  }

  input.addEventListener("click", () => {
    if (!open) openCal();
    else if (!typing) startTyping();
  });
  input.addEventListener("input", () => {
    if (!typing) return;
    wrap.classList.remove("is-bad"); input.removeAttribute("aria-invalid");
    hint.textContent = t("date.typeHint", { format: pattern().ph });
    const v = parseTyped(input.value);
    if (v) { act = parseISO(v); view = new Date(act.getFullYear(), act.getMonth(), 1); render(); }
  });
  input.addEventListener("keydown", e => {
    const k = e.key, rtl = getComputedStyle(wrap).direction === "rtl";
    if (typing) {
      if (k === "Enter") { e.preventDefault(); commitTyped(); }
      else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeCal(); }
      else if (k === "Tab") { if (!commitTyped()) closeCal(); }
      else if (k === "ArrowDown" && !input.value.trim()) { e.preventDefault(); }
      return;
    }
    if (!open) {
      if (k === "Enter" || k === " " || k === "ArrowDown" || (k === "ArrowUp" && e.altKey)) { e.preventDefault(); openCal(); }
      else if (/^[0-9০-৯०-९٠-٩۰-۹]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); startTyping(k); }
      else if ((k === "Delete" || k === "Backspace") && !inp.required && val()) { e.preventDefault(); commit(""); }
      return;
    }
    const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 }[k];
    if (step) { e.preventDefault(); const d = new Date(act); d.setDate(d.getDate() + step); moveTo(d); return; }
    if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      const d = new Date(act), n = (k === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1);
      const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      moveTo(d); return;
    }
    if (k === "Home" || k === "End") {
      e.preventDefault(); const ws = weekStart(), d = new Date(act), off = (d.getDay() - ws + 7) % 7;
      d.setDate(d.getDate() + (k === "Home" ? -off : 6 - off)); moveTo(d); return;
    }
    if (k === "Enter" || k === " ") { e.preventDefault(); if (act && allowed(act)) commit(iso(act)); return; }
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeCal(); return; }
    if (k === "Tab") { closeCal(); return; }
    if (/^[0-9০-৯०-९٠-٩۰-۹]$/.test(k) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); startTyping(k); }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!open || wrap.contains(document.activeElement)) return;
      if (typing && parseTyped(input.value)) commitTyped(); else closeCal();
    }, 0);
  });
  wrap.querySelector(".cp-icon").addEventListener("click", () => { if (!open) { input.focus(); openCal(); } else closeCal(); });
  pop.addEventListener("pointerdown", e => e.preventDefault());         // keep focus in the field
  pop.addEventListener("click", e => {
    const b = e.target.closest("[data-dp]");
    if (b) {
      const a = b.dataset.dp;
      if (a === "prev" || a === "next") { view = new Date(view.getFullYear(), view.getMonth() + (a === "prev" ? -1 : 1), 1); const d = new Date(act); d.setFullYear(view.getFullYear(), view.getMonth(), Math.min(act.getDate(), new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate())); act = d; render(); }
      else if (a === "today") commit(todayISO());
      else if (a === "clear") commit("");
      return;
    }
    const c = e.target.closest("[data-d]");
    if (c && c.getAttribute("aria-disabled") !== "true") commit(c.dataset.d);
  });
  wrap.querySelector(".cp-hint").addEventListener("click", () => { if (!typing) startTyping(); });
  show();
}

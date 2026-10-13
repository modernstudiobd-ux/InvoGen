// picker.js — one look for every drop-down in the app (from the approved currency field).
// Each <select class="select"> becomes a field that opens a styled list:
//   • First click (or Enter, Space, Alt+↓) opens the list. On phones the keyboard stays closed.
//   • Long lists (currencies, countries, languages) are searchable: click the field again, or
//     just start typing on a computer, to filter. Short lists jump to the typed letter instead.
//   • ↑ ↓ Home End PageUp PageDown move, Enter picks, Esc closes.
// The original <select> stays in the page (hidden) and keeps the value, so every screen's own
// code keeps working: picking sets it and fires "change"; setting .value or the options from
// code updates the field; .focus() focuses the field.
// Date fields (<input type="date">) are handled by datePicker.js with the same look.

import { esc, uid } from "./dom.js";
import { icon } from "./icons.js";
import { t, currencyName } from "./i18n.js";
import { CURRENCIES, COMMON_CURRENCIES } from "./currencies.js";
import { enhanceDate } from "./datePicker.js";

const SEARCH_MIN = 11;                       // lists longer than this get a search box
export const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const curLabel = r => `${r[0]} · ${r[1]} · ${currencyName(r[0], r[2])}`;

/* ---------- shared popup helpers (also used by datePicker.js) ---------- */
let openOne = null;                          // only one list open at a time
export function claimOpen(close) { if (openOne && openOne !== close) openOne(); openOne = close; }
export function releaseOpen(close) { if (openOne === close) openOne = null; }

// Keeps the popup inside the screen: opens upwards when there is no room below,
// and lines up with the field's far edge when it would run off the side.
export function placePop(wrap, pop) {
  pop.classList.remove("is-up", "is-end");
  const r = wrap.getBoundingClientRect(), p = pop.getBoundingClientRect();
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const bar = document.querySelector(".tabbar");
  const bottom = bar && getComputedStyle(bar).display !== "none" && !document.querySelector("dialog[open]") ? Math.min(vh, bar.getBoundingClientRect().top) : vh;
  if (r.bottom + p.height + 8 > bottom && r.top - p.height - 8 > 0) pop.classList.add("is-up");
  const rtl = getComputedStyle(wrap).direction === "rtl";
  if (!rtl && r.left + p.width > document.documentElement.clientWidth - 8) pop.classList.add("is-end");
  if (rtl && r.right - p.width < 8) pop.classList.add("is-end");
  // Scroll it fully into view, clear of the phone tab bar.
  pop.style.scrollMarginBottom = `${Math.max(0, vh - bottom) + 8}px`;
  if (!pop.classList.contains("is-up")) pop.scrollIntoView({ block: "nearest" });
}

// Points the field's <label for> at the new control and copies descriptions.
export function relabel(orig, input, extraDesc) {
  const lab = orig.id && orig.ownerDocument.querySelector(`label[for="${CSS.escape(orig.id)}"]`);
  if (lab) { lab.htmlFor = input.id; if (!lab.id) lab.id = input.id + "-lab"; }
  const al = orig.getAttribute("aria-label"), alb = orig.getAttribute("aria-labelledby");
  if (al) input.setAttribute("aria-label", al);
  if (alb) input.setAttribute("aria-labelledby", alb);
  const desc = [orig.getAttribute("aria-describedby"), extraDesc].filter(Boolean).join(" ");
  if (desc) input.setAttribute("aria-describedby", desc);
  if (orig.getAttribute("aria-invalid")) input.setAttribute("aria-invalid", orig.getAttribute("aria-invalid"));
  return lab;
}

/* ---------- select ---------- */
function enhanceSelect(sel) {
  if (sel.dataset.cp || sel.multiple || sel.hasAttribute("data-native")) return;
  sel.dataset.cp = "1";
  const isCur = sel.hasAttribute("data-currency");
  const id = sel.id ? `${sel.id}-cb` : "cp-" + uid().slice(0, 8), listId = id + "-list", hintId = id + "-hint";
  const wrap = document.createElement("div");
  wrap.className = "cp";
  const cls = [...sel.classList].filter(c => c !== "select").join(" ");
  wrap.innerHTML = `<input class="input select cp-input ${esc(cls)}" id="${id}" type="text" role="combobox" readonly
      aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" autocomplete="off" spellcheck="false" dir="auto">
    <span class="cp-icon" aria-hidden="true">${icon("chevron-down", 18)}</span>
    <div class="cp-pop" hidden><p class="cp-hint" id="${hintId}" hidden>${icon("search", 16)}<span>${esc(t("cur.searchHint"))}</span></p><ul class="cp-list" id="${listId}" role="listbox"></ul></div>`;
  sel.after(wrap);
  sel.hidden = true;
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");

  const input = wrap.querySelector("input"), pop = wrap.querySelector(".cp-pop"), list = wrap.querySelector("ul");
  const hint = wrap.querySelector(".cp-hint"), iconBox = wrap.querySelector(".cp-icon");
  const lab = relabel(sel, input);
  if (lab) list.setAttribute("aria-labelledby", lab.id); else if (input.getAttribute("aria-label")) list.setAttribute("aria-label", input.getAttribute("aria-label"));
  sel.focus = opts => input.focus(opts);

  const searchable = () => isCur || sel.options.length >= SEARCH_MIN;
  let open = false, searching = false, active = -1, shown = [], typed = "", typedAt = 0;

  const show = () => {
    if (isCur) { const r = CURRENCIES.find(x => x[0] === sel.value); input.value = r ? curLabel(r) : sel.value; }
    else { const o = sel.options[sel.selectedIndex]; input.value = o ? o.textContent.trim() : ""; }
    input.disabled = sel.disabled;
    if (searchable()) input.setAttribute("aria-describedby", [sel.getAttribute("aria-describedby"), hintId].filter(Boolean).join(" "));
  };

  // Programmatic changes to the hidden select (presets, redraws) update the field too.
  Object.defineProperty(sel, "value", {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); if (!open) show(); }
  });
  new MutationObserver(() => { if (open) renderList(searching ? input.value : ""); else show(); })
    .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected"] });

  /* rows: { h } for a group heading, or { v, text, lang, html } for an option */
  function rows(q) {
    if (isCur) {
      if (!q) {
        const common = COMMON_CURRENCIES.map(c => CURRENCIES.find(r => r[0] === c)).filter(Boolean);
        const rest = CURRENCIES.filter(r => !COMMON_CURRENCIES.includes(r[0])).sort((a, b) => a[0].localeCompare(b[0]));
        return [{ h: t("ed.commonCurrencies") }, ...common.map(curRow), { h: t("ed.allCurrencies") }, ...rest.map(curRow)];
      }
      const f = fold(q.trim());
      const score = r => {
        const code = fold(r[0]), name = fold(currencyName(r[0], r[2])), en = fold(r[2]), sym = fold(r[1]);
        if (code === f || sym === f) return 0;
        if (code.startsWith(f)) return 1;
        if (name.startsWith(f) || en.startsWith(f)) return 2;
        if (name.split(/[\s-]+/).some(w => w.startsWith(f)) || en.split(/[\s-]+/).some(w => w.startsWith(f))) return 3;
        if (name.includes(f) || en.includes(f) || sym.includes(f) || code.includes(f)) return 4;
        return -1;
      };
      return CURRENCIES.map(r => [score(r), r]).filter(([s]) => s >= 0).sort((a, b) => a[0] - b[0] || a[1][0].localeCompare(b[1][0])).map(x => curRow(x[1]));
    }
    const out = [], seen = new Set(), f = q ? fold(q.trim()) : "";
    for (const node of sel.children) {
      const opts = node.tagName === "OPTGROUP" ? [...node.children] : [node];
      if (node.tagName === "OPTGROUP" && !f) out.push({ h: node.label });
      for (const o of opts) {
        if (o.tagName !== "OPTION" || o.hidden) continue;
        const text = o.textContent.trim();
        if (f) {
          if (seen.has(o.value) || !fold(text).includes(f) && !fold(o.value).includes(f)) continue;
          seen.add(o.value);
        }
        out.push({ v: o.value, text, lang: o.getAttribute("lang") || "", disabled: o.disabled, html: `<span class="cp-text">${esc(text)}</span>` });
      }
    }
    if (f) out.sort((a, b) => (fold(a.text).startsWith(f) ? 0 : 1) - (fold(b.text).startsWith(f) ? 0 : 1));
    return out;
  }
  function curRow(r) {
    return { v: r[0], text: curLabel(r), html: `<span class="cp-code">${r[0]}</span><span class="cp-sym">${esc(r[1])}</span><span class="cp-name">${esc(currencyName(r[0], r[2]))}</span>` };
  }

  function renderList(q = "") {
    const rs = rows(q);
    shown = rs.filter(r => !r.h);
    if (!shown.length) {
      list.innerHTML = `<li class="cp-empty" role="presentation">${esc(t(isCur ? "cur.none" : "pick.none", { q: q.trim() }))}</li>`;
      active = -1; input.removeAttribute("aria-activedescendant");
      return;
    }
    let i = 0;
    const cur = sel.value;
    list.innerHTML = rs.map(r => r.h != null
      ? `<li class="cp-group" role="presentation">${esc(r.h)}</li>`
      : `<li class="cp-opt" role="option" id="${id}-o${i++}" data-v="${esc(r.v)}" aria-selected="${r.v === cur}"${r.disabled ? ' aria-disabled="true"' : ""}${r.lang ? ` lang="${esc(r.lang)}"` : ""}>
          ${r.html}${r.v === cur ? `<span class="cp-check" aria-hidden="true">${icon("check", 16)}</span>` : ""}</li>`).join("");
    setActive(q ? 0 : Math.max(0, shown.findIndex(r => r.v === cur)), !q);
  }

  function setActive(i, center) {
    const opts = list.querySelectorAll(".cp-opt");
    if (!opts.length) return;
    active = Math.max(0, Math.min(opts.length - 1, i));
    opts.forEach((o, k) => o.classList.toggle("is-active", k === active));
    input.setAttribute("aria-activedescendant", opts[active].id);
    const o = opts[active];
    if (center) list.scrollTop = o.offsetTop - list.clientHeight / 2 + o.offsetHeight / 2;
    else if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop;
    else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight;
  }

  function openList() {
    if (open || sel.disabled) return;
    claimOpen(closeList);
    open = true; searching = false;
    input.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    pop.hidden = false;
    hint.hidden = !searchable();
    renderList();
    placePop(wrap, pop);
    document.addEventListener("pointerdown", outside, true);
  }
  function closeList(restore = true) {
    if (!open) return;
    open = false; searching = false;
    releaseOpen(closeList);
    input.readOnly = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.removeAttribute("placeholder");
    wrap.classList.remove("is-open", "is-search");
    pop.hidden = true;
    iconBox.innerHTML = icon("chevron-down", 18);
    if (restore) show();
    document.removeEventListener("pointerdown", outside, true);
  }
  function startSearch(initial = "") {
    if (!open) openList();
    searching = true;
    input.readOnly = false;
    input.placeholder = isCur ? t("cur.search") : t("pick.search");
    input.value = initial;
    wrap.classList.add("is-search");
    hint.hidden = true;
    iconBox.innerHTML = icon("search", 18);
    renderList(initial);
    // Re-focusing inside the tap makes phones show the keyboard now that the field is editable.
    if (document.activeElement === input) input.blur();
    input.focus();
    if (!initial) input.select(); else input.setSelectionRange(initial.length, initial.length);
  }
  function choose(v) {
    const opt = shown.find(r => r.v === v);
    if (opt && opt.disabled) return;
    const changed = v != null && v !== sel.value;
    closeList(false);
    if (changed) valueDesc.set.call(sel, v);
    show();
    input.focus();
    if (changed) { sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
  }
  function outside(e) {
    if (!wrap.isConnected) { document.removeEventListener("pointerdown", outside, true); releaseOpen(closeList); return; }
    if (!wrap.contains(e.target)) closeList();
  }
  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt < 700 ? typed + ch : ch; typedAt = now;
    const f = fold(typed);
    const start = typed.length === 1 ? active + 1 : active;
    const order = shown.map((r, i) => (start + i) % shown.length);
    const hit = order.find(i => fold(shown[i].text).startsWith(f));
    if (hit != null) setActive(hit);
  }

  input.addEventListener("click", () => {
    if (!open) openList();
    else if (searchable() && !searching) startSearch();
    else if (!searchable()) closeList();
  });
  input.addEventListener("input", () => { if (searching) renderList(input.value); });
  input.addEventListener("keydown", e => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!open) { openList(); return; }
      if (e.altKey && k === "ArrowUp") { if (active >= 0 && shown[active]) choose(shown[active].v); return; }
      setActive(active + (k === "ArrowDown" ? 1 : -1));
    } else if ((k === "Home" || k === "End") && open && !searching) {
      e.preventDefault(); setActive(k === "Home" ? 0 : shown.length - 1);
    } else if (k === "PageDown" || k === "PageUp") {
      if (open) { e.preventDefault(); setActive(active + (k === "PageDown" ? 8 : -8)); }
    } else if (k === "Enter") {
      e.preventDefault();
      if (!open) openList();
      else if (active >= 0 && shown[active]) choose(shown[active].v);
    } else if (k === " " && !searching) {
      e.preventDefault();
      if (!open) openList(); else if (active >= 0 && shown[active]) choose(shown[active].v);
    } else if (k === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); closeList(); }
    } else if (k === "Tab") {
      if (open) closeList();
    } else if (!searching && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      if (searchable()) startSearch(k);
      else { if (!open) openList(); typeahead(k); }
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => { if (open && !wrap.contains(document.activeElement)) closeList(); }, 0);
  });
  iconBox.addEventListener("click", () => input.click());
  pop.addEventListener("pointerdown", e => e.preventDefault());         // keep focus in the field
  hint.addEventListener("click", () => startSearch());
  list.addEventListener("click", e => { const o = e.target.closest(".cp-opt"); if (o) choose(o.dataset.v); });
  list.addEventListener("pointermove", e => {
    const o = e.target.closest(".cp-opt");
    if (o) { const i = [...list.querySelectorAll(".cp-opt")].indexOf(o); if (i !== active) setActive(i); }
  });
  show();
}

/* ---------- wiring ---------- */
const SEL = "select.select:not([data-cp]), input[type=date]:not([data-cp])";
export function enhancePickers(root = document) {
  if (root.matches && root.matches(SEL)) one(root);
  root.querySelectorAll(SEL).forEach(one);
}
const one = el => (el.tagName === "SELECT" ? enhanceSelect(el) : enhanceDate(el));

// A screen that redraws and then focuses a field straight away gets the new field focused,
// even before the page watcher has run.
function patchFocus(proto, match) {
  const orig = proto.focus;
  proto.focus = function (opts) {
    if (!this.dataset.cp && this.isConnected && this.matches(match)) one(this);
    if (this.dataset.cp && Object.prototype.hasOwnProperty.call(this, "focus")) return this.focus(opts);
    return orig.call(this, opts);
  };
}

// Enhances fields as screens, sections and sheets draw them.
export function watchPickers(root = document.body) {
  patchFocus(HTMLSelectElement.prototype, "select.select:not([multiple]):not([data-native])");
  patchFocus(HTMLInputElement.prototype, "input[type=date]:not([data-native])");
  enhancePickers(root);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhancePickers(n);
  }).observe(root, { childList: true, subtree: true });
}

// currencyPicker.js — turns every <select data-currency> into a searchable currency field.
// First click (or Enter / Alt+↓) opens the list without bringing up the phone keyboard.
// A second click on the field switches it to search: type a code, symbol or name to filter.
// On a computer, typing while the field has focus also starts the search.
// The original <select> stays in the page (hidden) and keeps the value, so every screen's
// existing change handling keeps working: picking a currency sets it and fires "change".

import { esc, uid } from "./dom.js";
import { icon } from "./icons.js";
import { t, currencyName } from "./i18n.js";
import { CURRENCIES, COMMON_CURRENCIES } from "./currencies.js";

const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const label = r => `${r[0]} · ${r[1]} · ${currencyName(r[0], r[2])}`;
const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");

function enhance(sel) {
  if (sel.dataset.cp) return;
  sel.dataset.cp = "1";
  const id = "cp-" + uid().slice(0, 8), listId = id + "-list", hintId = id + "-hint";
  const wrap = document.createElement("div");
  wrap.className = "cp";
  wrap.innerHTML = `<input class="input cp-input" id="${id}" type="text" role="combobox" readonly
      aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" aria-describedby="${hintId}" autocomplete="off" spellcheck="false" dir="auto">
    <span class="cp-icon" aria-hidden="true">${icon("chevron-down", 18)}</span>
    <div class="cp-pop" hidden><p class="cp-hint" id="${hintId}">${icon("search", 16)}<span>${esc(t("cur.searchHint"))}</span></p><ul class="cp-list" id="${listId}" role="listbox"></ul></div>`;
  sel.after(wrap);
  sel.hidden = true;
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");

  const input = wrap.querySelector("input"), pop = wrap.querySelector(".cp-pop"), list = wrap.querySelector("ul");
  const hint = wrap.querySelector(".cp-hint"), iconBox = wrap.querySelector(".cp-icon");
  // Point the field's label (and any description) at the new control.
  const lab = sel.id && sel.ownerDocument.querySelector(`label[for="${CSS.escape(sel.id)}"]`);
  if (lab) { lab.htmlFor = id; lab.id = lab.id || id + "-lab"; list.setAttribute("aria-labelledby", lab.id); }
  if (sel.getAttribute("aria-describedby")) input.setAttribute("aria-describedby", `${sel.getAttribute("aria-describedby")} ${hintId}`);

  let open = false, searching = false, active = -1, shown = [];
  const current = () => CURRENCIES.find(r => r[0] === sel.value);
  const show = () => { const r = current(); input.value = r ? label(r) : sel.value; };

  // Programmatic changes to the hidden select (e.g. a country preset) update the field too.
  Object.defineProperty(sel, "value", {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); if (!open) show(); }
  });

  function rows(q) {
    if (!q) {
      const common = COMMON_CURRENCIES.map(c => CURRENCIES.find(r => r[0] === c)).filter(Boolean);
      const all = CURRENCIES.slice().sort((a, b) => a[0].localeCompare(b[0]));
      return [["h", t("ed.commonCurrencies")], ...common, ["h", t("ed.allCurrencies")], ...all.filter(r => !COMMON_CURRENCIES.includes(r[0]))];
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
    return CURRENCIES.map(r => [score(r), r]).filter(([s]) => s >= 0).sort((a, b) => a[0] - b[0] || a[1][0].localeCompare(b[1][0])).map(x => x[1]);
  }

  function renderList(q = "") {
    const rs = rows(q);
    shown = rs.filter(r => r[0] !== "h");
    if (!shown.length) {
      list.innerHTML = `<li class="cp-empty" role="presentation">${esc(t("cur.none", { q: q.trim() }))}</li>`;
      active = -1; input.removeAttribute("aria-activedescendant");
      return;
    }
    let i = 0;
    list.innerHTML = rs.map(r => r[0] === "h"
      ? `<li class="cp-group" role="presentation">${esc(r[1])}</li>`
      : `<li class="cp-opt" role="option" id="${id}-o${i++}" data-v="${r[0]}" aria-selected="${r[0] === sel.value}">
          <span class="cp-code">${r[0]}</span><span class="cp-sym">${esc(r[1])}</span><span class="cp-name">${esc(currencyName(r[0], r[2]))}</span>
          ${r[0] === sel.value ? `<span class="cp-check" aria-hidden="true">${icon("check", 16)}</span>` : ""}</li>`).join("");
    setActive(q ? 0 : Math.max(0, shown.findIndex(r => r[0] === sel.value)), !q);
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
    if (open) return;
    open = true; searching = false;
    input.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    pop.hidden = false;
    hint.hidden = false;
    renderList();
    // Keep the whole list on screen (above the phone tab bar).
    requestAnimationFrame(() => pop.scrollIntoView({ block: "nearest" }));
    document.addEventListener("pointerdown", outside, true);
  }
  function closeList(restore = true) {
    if (!open) return;
    open = false; searching = false;
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
    input.placeholder = t("cur.search");
    input.value = initial;
    wrap.classList.add("is-search");
    hint.hidden = true;
    iconBox.innerHTML = icon("search", 18);
    renderList(initial);
    // Re-focusing inside the tap makes phones show the keyboard now that the field is editable.
    if (document.activeElement === input) input.blur();
    input.focus();
    if (!initial) input.select();
    else input.setSelectionRange(initial.length, initial.length);
  }
  function choose(code) {
    const changed = code && code !== sel.value;
    closeList(false);
    if (code) valueDesc.set.call(sel, code);
    show();
    input.focus();
    if (changed) sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function outside(e) { if (!wrap.contains(e.target)) closeList(); }

  input.addEventListener("click", () => {
    if (!open) openList();
    else if (!searching) startSearch();
  });
  input.addEventListener("input", () => { if (searching) renderList(input.value); });
  input.addEventListener("keydown", e => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      if (!open) { openList(); return; }
      setActive(active + (k === "ArrowDown" ? 1 : -1));
    } else if (k === "Home" && open && !searching || k === "End" && open && !searching) {
      e.preventDefault(); setActive(k === "Home" ? 0 : shown.length - 1);
    } else if (k === "PageDown" || k === "PageUp") {
      if (open) { e.preventDefault(); setActive(active + (k === "PageDown" ? 8 : -8)); }
    } else if (k === "Enter") {
      e.preventDefault();
      if (!open) openList();
      else if (active >= 0 && shown[active]) choose(shown[active][0]);
    } else if (k === " " && !searching) {
      e.preventDefault();
      if (!open) openList(); else if (active >= 0 && shown[active]) choose(shown[active][0]);
    } else if (k === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); closeList(); }
    } else if (k === "Tab") {
      if (open) closeList();
    } else if (!searching && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      startSearch(k);
    }
  });
  input.addEventListener("blur", () => {
    // Leaving the field (keyboard) closes the list; clicks inside the list keep it.
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

export function enhanceCurrencies(root = document) {
  root.querySelectorAll("select[data-currency]:not([data-cp])").forEach(enhance);
}

// Enhances currency fields as screens and sections draw them.
export function watchCurrencies(root = document.body) {
  enhanceCurrencies(root);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches("select[data-currency]")) enhance(n);
      else if (n.querySelector("select[data-currency]")) enhanceCurrencies(n);
    }
  }).observe(root, { childList: true, subtree: true });
}

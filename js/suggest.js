// suggest.js — type-ahead suggestions under a text field, in the same style as the drop-downs.
// Used for the client name: typing shows matching saved clients; pick one to fill in all
// their details, or keep typing a new name. ↑ ↓ move, Enter picks, Esc closes.

import { esc } from "./dom.js";
import { claimOpen, releaseOpen, placePop, fold } from "./picker.js";

export function attachSuggest(input, { items, onPick, label = "" }) {
  if (!input || input.dataset.suggest) return;
  input.dataset.suggest = "1";
  const host = input.closest(".field") || input.parentElement;
  host.classList.add("cp", "has-suggest");
  const listId = input.id + "-sg";
  const pop = document.createElement("div");
  pop.className = "cp-pop";
  pop.hidden = true;
  pop.innerHTML = `<ul class="cp-list" id="${listId}" role="listbox"${label ? ` aria-label="${esc(label)}"` : ""}></ul>`;
  host.appendChild(pop);
  const list = pop.firstChild;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.removeAttribute("list");

  let open = false, active = -1, shown = [];
  function close() {
    if (!open) return;
    open = false; releaseOpen(close);
    pop.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", outside, true);
  }
  function outside(e) { if (!host.isConnected || !host.contains(e.target)) close(); }
  function setActive(i) {
    const opts = list.querySelectorAll(".cp-opt");
    active = opts.length ? (i + opts.length) % opts.length : -1;
    opts.forEach((o, k) => o.classList.toggle("is-active", k === active));
    if (active >= 0) { input.setAttribute("aria-activedescendant", opts[active].id); opts[active].scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function update() {
    const q = fold(input.value.trim());
    shown = q ? items().filter(x => fold(x.label + " " + (x.sub || "")).includes(q) && fold(x.label) !== q)
      .sort((a, b) => (fold(a.label).startsWith(q) ? 0 : 1) - (fold(b.label).startsWith(q) ? 0 : 1)).slice(0, 6) : [];
    if (!shown.length) { close(); return; }
    list.innerHTML = shown.map((x, i) => `<li class="cp-opt" role="option" id="${listId}-${i}" aria-selected="false" data-i="${i}"><span class="cp-text" dir="auto">${esc(x.label)}</span>${x.sub ? `<span class="cp-sub" dir="auto">${esc(x.sub)}</span>` : ""}</li>`).join("");
    active = -1; input.removeAttribute("aria-activedescendant");
    if (!open) {
      open = true; claimOpen(close);
      pop.hidden = false;
      input.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
    }
    placePop(host, pop);
  }
  function pick(i) { const x = shown[i]; close(); if (x) onPick(x.id); }

  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive(active + (e.key === "ArrowDown" ? 1 : -1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); e.stopPropagation(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (open && !host.contains(document.activeElement)) close(); }, 0));
  pop.addEventListener("pointerdown", e => e.preventDefault());
  list.addEventListener("click", e => { const o = e.target.closest(".cp-opt"); if (o) pick(+o.dataset.i); });
  list.addEventListener("pointermove", e => { const o = e.target.closest(".cp-opt"); if (o && +o.dataset.i !== active) setActive(+o.dataset.i); });
}

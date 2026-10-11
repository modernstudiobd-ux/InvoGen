// toast.js — short messages at the bottom of the screen, with an optional action
// (e.g. Undo). One toast at a time; it pauses while hovered or focused.

import { esc } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

let region, timer = 0, remaining = 0, started = 0, current = null;

function ensureRegion() {
  if (region) return region;
  region = document.getElementById("toasts");
  return region;
}

export function dismissToast() {
  clearTimeout(timer);
  if (current) { current.remove(); current = null; }
}

// toast("Deleted INV-0042", { action: "Undo", onAction: () => … })
export function toast(message, { action, onAction, duration } = {}) {
  const root = ensureRegion();
  if (!root) return;
  dismissToast();
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="toast-msg">${esc(message)}</span>` +
    (action ? `<button type="button" class="btn" data-toast="act">${esc(action)}</button>` : "") +
    `<button type="button" class="icon-btn" data-toast="close" aria-label="${esc(t("common.dismiss"))}">${icon("x", 18)}</button>`;
  root.appendChild(el);
  current = el;
  const ms = duration ?? (action ? 7000 : 4000);
  const run = ms2 => { remaining = ms2; started = Date.now(); clearTimeout(timer); timer = setTimeout(() => { if (current === el) dismissToast(); }, ms2); };
  const pause = () => { clearTimeout(timer); remaining -= Date.now() - started; };
  const resume = () => run(Math.max(1500, remaining));
  el.addEventListener("mouseenter", pause);
  el.addEventListener("mouseleave", resume);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", resume);
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-toast]");
    if (!b) return;
    if (b.dataset.toast === "act" && onAction) onAction();
    dismissToast();
  });
  run(ms);
}

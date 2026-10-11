// sheet.js — dialogs built on the native <dialog> element (keyboard focus is kept
// inside, Esc closes, focus returns to the button that opened it). Shown as a bottom
// sheet on phones and a centred card on larger screens.

import { esc, uid } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

// openSheet({ title, body, foot, wide, onOpen(dlg), onClose(value) }) → <dialog>
// Buttons inside with data-close="value" close the sheet and pass that value to onClose.
export function openSheet({ title, body = "", foot = "", wide = false, onOpen, onClose, label } = {}) {
  const opener = document.activeElement;
  const id = "sh-" + uid().slice(0, 8);
  const dlg = document.createElement("dialog");
  dlg.className = "sheet" + (wide ? " wide" : "");
  dlg.setAttribute("aria-labelledby", id);
  dlg.innerHTML = `
    <div class="sheet-head">
      <h2 class="h2" id="${id}">${esc(title)}</h2>
      <button type="button" class="icon-btn" data-close="" aria-label="${esc(label || t("common.close"))}">${icon("x")}</button>
    </div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ""}`;
  document.body.appendChild(dlg);
  let result = "";
  dlg.addEventListener("click", e => {
    if (e.target === dlg) { dlg.close(); return; }          // click on the backdrop
    const b = e.target.closest("[data-close]");
    if (b && dlg.contains(b) && b.type !== "submit") { result = b.dataset.close; dlg.close(); }
  });
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (onClose) onClose(result);
    if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
  });
  dlg.tabIndex = -1;
  dlg.showModal();
  dlg.focus();                     // screen readers announce the title; Tab moves to the first control
  if (onOpen) onOpen(dlg);
  dlg.setResult = v => { result = v; };
  return dlg;
}

// Promise<boolean> confirmation.
export function confirmSheet({ title, message, confirm, cancel, danger = false }) {
  return new Promise(resolve => {
    openSheet({
      title,
      body: `<p>${esc(message)}</p>`,
      foot: `<button type="button" class="btn btn-outline" data-close="no">${esc(cancel || t("common.cancel"))}</button>
             <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-close="yes">${esc(confirm)}</button>`,
      onClose: v => resolve(v === "yes")
    });
  });
}

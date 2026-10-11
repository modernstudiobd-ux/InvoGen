// pdfExport.js — "Download PDF" (carried over from v3.41). The PDF comes from the
// browser's own print engine ("Save as PDF"), so it is identical to the printout:
// real selectable text, embedded fonts, small files, fully offline. This module adds a
// clear file name and a one-time guide with the steps for the person's device.

import { esc } from "./dom.js";
import { t } from "./i18n.js";
import { openSheet } from "./sheet.js";

const HIDE_KEY = "invogen.pdfGuideHidden";
const safe = fn => { try { return fn(); } catch { return null; } };

export function pdfFileName(doc) {
  const base = [doc.no || t(`type.${doc.type}`), (doc.client && doc.client.name || "").trim()].filter(Boolean).join(" – ");
  return (base || "Invoice").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").slice(0, 120);
}

export function platform() {
  const ua = navigator.userAgent || "", p = navigator.platform || "";
  const iOS = /iPhone|iPad|iPod/.test(ua) || (p === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return "safari";
  return "chrome";
}

// Shows the guide (unless hidden), then calls `run`, which opens the print dialog.
export function withPdfGuide(doc, run) {
  if (safe(() => localStorage.getItem(HIDE_KEY) === "1")) { run(); return; }
  const steps = [t(`pdf.${platform()}.1`), t(`pdf.${platform()}.2`)];
  openSheet({
    title: t("pdf.title"),
    body: `<p>${esc(t("pdf.intro"))}</p>
      <ol class="steps">${steps.map((s, i) => `<li><span class="step-n" aria-hidden="true">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
      <p class="hint">${esc(t("pdf.fileName", { name: pdfFileName(doc) + ".pdf" }))}</p>
      <label class="check"><input type="checkbox" id="pdfHide"> <span>${esc(t("pdf.dontShow"))}</span></label>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="button" class="btn btn-primary" data-close="go">${esc(t("pdf.continue"))}</button>`,
    onOpen: dlg => {
      const go = dlg.querySelector('[data-close="go"]');
      go.focus();
      go.addEventListener("click", () => { if (dlg.querySelector("#pdfHide").checked) safe(() => localStorage.setItem(HIDE_KEY, "1")); });
    },
    onClose: v => { if (v === "go") setTimeout(run, 80); }
  });
}
export function resetPdfGuide() { safe(() => localStorage.removeItem(HIDE_KEY)); }

// pdfExport.js — "Download PDF".
// exportPdf() makes the PDF file on the device with jsPDF (pdfDownload.js, loaded only
// when needed) and downloads it straight away: no print window. On phones and tablets a
// short "PDF ready" sheet offers Download and Share (a fresh tap is needed to save there).
// If the PDF can't be made (very old browser), it falls back to the print window with the
// one-time guide below (the v3.41 "Save as PDF" steps).

import { esc } from "./dom.js";
import { t } from "./i18n.js";
import { openSheet } from "./sheet.js";
import { toast, dismissToast } from "./toast.js";
import { icon } from "./icons.js";

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

/* ---------------- direct download (jsPDF) ---------------- */
let busy = false;
export async function exportPdf(doc) {
  if (busy) return;
  busy = true;
  toast(t("pdf.making"), { duration: 120000 });
  try {
    const P = await import("./pdfDownload.js");
    const { blob, name } = await P.downloadPdf(doc, {
      onProgress: (i, n) => { if (n > 1 && i < n) toast(t("pdf.makingPage", { n: i + 1, total: n }), { duration: 120000 }); }
    });
    dismissToast();
    if (matchMedia("(pointer: coarse)").matches) readySheet(P, blob, name);
    else { await P.savePdf(blob, name); toast(t("pdf.saved", { name })); }
  } catch (e) {
    console.error(e);
    toast(t("pdf.failed"), {
      action: t("pdf.printInstead"), duration: 12000,
      onAction: () => withPdfGuide(doc, () => import("./print.js").then(m => m.printDocument(doc)))
    });
  } finally {
    busy = false;
  }
}

// Phones and tablets: the file is ready; a tap on Download or Share saves it.
function readySheet(P, blob, name) {
  const url = URL.createObjectURL(blob);
  const file = typeof File === "function" ? new File([blob], name, { type: "application/pdf" }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const kb = Math.max(1, Math.round(blob.size / 1024));
  openSheet({
    title: t("pdf.readyTitle"),
    body: `<p class="pdf-ready">${icon("file-text", 22)}<span><strong dir="auto">${esc(name)}</strong><span class="hint">${esc(kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`)}</span></span></p>`,
    foot: `${canShare ? `<button type="button" class="btn btn-outline" data-pdf="share">${icon("share-2", 18)}${esc(t("pdf.share"))}</button>` : ""}
      <a class="btn btn-primary" href="${url}" download="${esc(name)}" data-pdf="download">${icon("download", 18)}${esc(t("pdf.download"))}</a>`,
    onOpen: dlg => {
      dlg.addEventListener("click", async e => {
        const b = e.target.closest("[data-pdf]");
        if (!b) return;
        if (b.dataset.pdf === "share") {
          e.preventDefault();
          try { await navigator.share({ files: [file], title: name }); dlg.close(); }
          catch (err) { if (!err || err.name !== "AbortError") { P.savePdf(blob, name); dlg.close(); } }
        } else setTimeout(() => dlg.close(), 300);
      });
    },
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000)
  });
}

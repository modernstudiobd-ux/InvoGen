// pdfExport.js — "Download PDF".
// exportPdf() makes the PDF file on the device with jsPDF (pdfDownload.js, loaded only
// when needed) and downloads it straight away: no print window. On phones and tablets a
// short "PDF ready" sheet offers Download and Share (a fresh tap is needed to save there).
// If the PDF can't be made (very old browser), it falls back to the print window with the
// one-time guide below (the v3.41 "Save as PDF" steps).
// pdfAttachment() makes the PDF when the Send or reminder sheet opens, so Share hands the
// file to Mail, Gmail or WhatsApp with the message, and "Open email" on a computer also
// downloads it ready to attach (a mailto: link can never carry a file).

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
const coarse = () => matchMedia("(pointer: coarse)").matches;
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
    deliverFile(blob, name);
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

// Computers download the file straight away. Phones and tablets get a short sheet,
// because saving or sharing there needs a fresh tap.
export function deliverFile(blob, name) {
  if (coarse()) readySheet(blob, name);
  else { saveFile(blob, name); toast(t("pdf.saved", { name })); }
}
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const asFile = (blob, name) => (typeof File === "function" ? safe(() => new File([blob], name, { type: blob.type || "application/pdf" })) : null);
const canShareFile = file => !!(file && navigator.canShare && safe(() => navigator.canShare({ files: [file] })));
// True when this browser can hand a PDF file to other apps (Mail, Gmail, WhatsApp…).
export function fileShareSupported() {
  return canShareFile(asFile(new Blob(["%PDF-1.4"], { type: "application/pdf" }), "test.pdf"));
}

function readySheet(blob, name) {
  const url = URL.createObjectURL(blob);
  const file = asFile(blob, name);
  const canShare = canShareFile(file);
  openSheet({
    title: t(blob.type === "image/png" ? "pos.imageReady" : "pdf.readyTitle"),
    body: `<p class="pdf-ready">${icon(blob.type === "image/png" ? "image" : "file-text", 22)}<span><strong dir="auto">${esc(name)}</strong><span class="hint">${esc(sizeLabel(blob.size))}</span></span></p>`,
    foot: `${canShare ? `<button type="button" class="btn btn-outline" data-pdf="share">${icon("share-2", 18)}${esc(t("pdf.share"))}</button>` : ""}
      <a class="btn btn-primary" href="${url}" download="${esc(name)}" data-pdf="download">${icon("download", 18)}${esc(t("pdf.download"))}</a>`,
    onOpen: dlg => {
      dlg.addEventListener("click", async e => {
        const b = e.target.closest("[data-pdf]");
        if (!b) return;
        if (b.dataset.pdf === "share") {
          e.preventDefault();
          try { await navigator.share({ files: [file], title: name }); dlg.close(); }
          catch (err) { if (!err || err.name !== "AbortError") { saveFile(blob, name); dlg.close(); } }
        } else setTimeout(() => dlg.close(), 300);
      });
    },
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000)
  });
}
const sizeLabel = n => { const kb = Math.max(1, Math.round(n / 1024)); return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`; };

/* ---------------- PDF attached to Send and reminder messages ---------------- */
// The PDF is made as soon as the sheet opens, so Share can attach it at once
// (Safari only lets a page share right after a tap, not seconds later).
// Receipts can be attached as the full page or as the POS receipt.
const FMT_KEY = "invogen.sendFormat.v1";

async function makeFile(doc, format) {
  if (format === "pos") return (await import("./pos.js")).makePosFile(doc, "pdf");
  const { downloadPdf } = await import("./pdfDownload.js");
  const { blob, name } = await downloadPdf(doc);
  return { blob, name };
}

// Returns { html, attach(dlg) }. attach() wires the sheet and returns the controller.
export function pdfAttachment(doc) {
  const choose = doc.type === "receipt";
  let format = choose && safe(() => localStorage.getItem(FMT_KEY)) === "pos" ? "pos" : "full";
  const html = `<div class="attach">
    ${choose ? `<div class="field"><span class="label" id="attL">${esc(t("send.attachAs"))}</span>
      <div class="segmented" role="radiogroup" aria-labelledby="attL">${["full", "pos"].map(f => `<button type="button" class="chip" role="radio" data-att="${f}" aria-checked="${f === format}">${esc(t(f === "pos" ? "send.posReceipt" : "send.fullPage"))}</button>`).join("")}</div></div>` : ""}
    <p class="pdf-ready attach-file">${icon("file-text", 22)}<span><strong dir="auto" data-att-name>${esc(pdfFileName(doc) + ".pdf")}</strong><span class="hint" data-att-state aria-live="polite">${esc(t("send.preparing"))}</span></span></p>
    <p class="hint">${esc(sendHint())}</p>
  </div>`;

  function attach(dlg) {
    let job = null, result = null, gen = 0;
    const nameEl = dlg.querySelector("[data-att-name]"), stateEl = dlg.querySelector("[data-att-state]");
    const start = () => {
      const my = ++gen;
      result = null;
      stateEl.textContent = t("send.preparing");
      job = makeFile(doc, format).then(r => {
        if (my !== gen) return job;
        result = { ...r, file: asFile(r.blob, r.name) };
        nameEl.textContent = r.name;
        stateEl.textContent = sizeLabel(r.blob.size);
        return result;
      }).catch(e => {
        console.error(e);
        if (my === gen) stateEl.textContent = t("send.attachFailed");
        return null;
      });
    };
    dlg.addEventListener("click", e => {
      const b = e.target.closest("[data-att]");
      if (!b || b.dataset.att === format) return;
      format = b.dataset.att;
      safe(() => localStorage.setItem(FMT_KEY, format));
      dlg.querySelectorAll("[data-att]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      start();
    });
    start();
    const get = () => job.then(() => result);
    return {
      // Share: the PDF and the message together. Returns true when shared.
      async share({ title, text }) {
        if (!navigator.share) return false;
        let r = result;
        const late = !r;
        if (late) r = await get();
        const files = r && canShareFile(r.file) ? [r.file] : null;
        try {
          await navigator.share(files ? { files, title, text } : { title, text });
          return true;
        } catch (err) {
          if (err && err.name === "NotAllowedError" && late) toast(t("send.tapAgain"));
          return false;
        }
      },
      // Email: on a computer the PDF downloads too, ready to attach; then the email app opens.
      async email(href) {
        if (!coarse()) {
          const r = result || await get();
          if (r) { saveFile(r.blob, r.name); toast(t("send.attachNow", { name: r.name }), { duration: 10000 }); }
          setTimeout(() => { window.location.href = href; }, r ? 400 : 0);
        } else window.location.href = href;
      },
      async download() {
        const r = result || await get();
        if (r) deliverFile(r.blob, r.name);
        else exportPdf(doc);
      }
    };
  }
  return { html, attach };
}

function sendHint() {
  const files = fileShareSupported();
  if (coarse()) return t(files ? "send.hintShare" : "send.attachHint");
  return files ? `${t("send.hintEmail")} ${t("send.hintShareToo")}` : t("send.hintEmail");
}

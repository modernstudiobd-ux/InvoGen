// pos.js — POS / thermal receipt printing on 58 mm or 80 mm roll paper (carried over
// from v3.41). Builds a compact, black-only receipt from any document and prints it on
// a page exactly as tall as the receipt, so thermal printers cut in the right place.

import { esc, safeLogo } from "./dom.js";
import { t } from "./i18n.js";
import { totals, lineAmount } from "./calc.js";
import { lineOptions } from "./columns.js";
import { formatMoney, formatDate, formatNumber, decimalsOf } from "./format.js";
import { dl } from "./docLabels.js";
import { normalizeUrl, qrSvg } from "./preview.js";
import { runPrint } from "./print.js";
import { openSheet } from "./sheet.js";
import { pdfFileName, deliverFile } from "./pdfExport.js";
import { toast, dismissToast } from "./toast.js";
import { icon } from "./icons.js";

const PREF = "invogen.pos.v1";
const safe = fn => { try { return fn(); } catch { return null; } };
let prefs = Object.assign({ w: 80, logo: true, qr: false, client: true }, safe(() => JSON.parse(localStorage.getItem(PREF))) || {});
const savePrefs = () => safe(() => localStorage.setItem(PREF, JSON.stringify(prefs)));

export function buildReceipt(doc, p = prefs) {
  const L = doc.lang || "en", type = doc.type;
  const tt = totals(doc);
  const nf = { fmt: doc.numberFormat, lang: L };
  const money = n => formatMoney(n, doc.currency, nf);
  const line = '<div class="pr-rule"></div>';
  const row = (label, value, cls = "") => `<div class="pr-row ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const lopt = lineOptions(doc.columns);
  const items = doc.items.filter(i => i.desc.trim() || Number(i.rate)).map(i => {
    const qty = !lopt.qty || i.qty === "" ? 1 : Number(i.qty);
    const extra = [lopt.disc && Number(i.disc) ? `−${formatNumber(Number(i.disc), 2, doc.numberFormat, L).replace(/[.,]00$/, "")}%` : "", lopt.tax && Number(i.tax) ? `+${formatNumber(Number(i.tax), 2, doc.numberFormat, L).replace(/[.,]00$/, "")}%` : ""].filter(Boolean).join(" ");
    return `<div class="pr-item"><div class="pr-name" dir="auto">${esc(i.desc || "—")}</div><div class="pr-row"><span>${esc(formatNumber(qty, Number.isInteger(qty) ? 0 : 2, doc.numberFormat, L))} × ${esc(money(i.rate))}${extra ? " " + esc(extra) : ""}</span><b>${esc(money(lineAmount(i, decimalsOf(doc.currency), lopt)))}</b></div></div>`;
  }).join("");
  const b = doc.business || {}, c = doc.client || {};
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const contact = [b.phone, b.email, b.website].filter(Boolean).map(esc).join("<br>");
  const link = normalizeUrl(doc.payLink);
  const logo = p.logo ? safeLogo(b.logo) : "";
  return `<div class="pr pr-${p.w}" dir="auto" lang="${esc(L)}">
    ${logo ? `<img class="pr-logo" src="${logo}" alt="">` : ""}
    ${b.name ? `<div class="pr-co">${esc(b.name)}</div>` : ""}
    ${b.address ? `<div class="pr-c">${esc(b.address).replace(/\n/g, "<br>")}</div>` : ""}
    ${contact ? `<div class="pr-c">${contact}</div>` : ""}${b.taxId ? `<div class="pr-c">${esc(b.taxId)}</div>` : ""}
    ${line}
    <div class="pr-title">${esc(dl(L, "title", type))}</div>
    ${row("#", doc.no)}
    ${row(dl(L, "date", type), formatDate(doc.issued, doc.dateFormat, L, doc.numberFormat) + " " + time)}
    ${p.client && c.name ? row(dl(L, "bill", type), c.name) : ""}
    ${line}${items || '<div class="pr-c">—</div>'}${line}
    ${row(dl(L, "subtotal"), money(tt.subtotal))}
    ${tt.discount ? row(dl(L, "discount"), "−" + money(tt.discount)) : ""}
    ${tt.tax ? row(`${doc.tax.name || dl(L, "tax")} ${doc.tax.rate}%`, money(tt.tax)) : ""}
    ${tt.tax2 ? row(`${doc.tax2.name || dl(L, "tax")} ${doc.tax2.rate}%`, money(tt.tax2)) : ""}
    ${tt.shipping ? row(dl(L, "shipping"), money(tt.shipping)) : ""}
    ${row(dl(L, "total"), money(tt.total), "pr-total")}
    ${type === "invoice" && tt.paid ? row(dl(L, "paid"), money(tt.paid)) : ""}
    ${type === "invoice" && tt.credited ? row(dl(L, "credited"), "−" + money(tt.credited)) : ""}
    ${type === "invoice" && (tt.paid || tt.credited) ? row(dl(L, "balanceRow"), money(tt.balance), "pr-strong") : ""}
    ${doc.payMethod ? row(dl(L, "method"), doc.payMethod) : ""}
    ${line}
    ${p.qr && link ? `<div class="pr-qr">${qrSvg(link)}<div class="pr-c">${esc(dl(L, "scan"))}</div></div>` : ""}
    ${doc.notes.trim() ? `<div class="pr-c">${esc(doc.notes)}</div>` : ""}
    <div class="pr-c pr-thanks">${esc(doc.footer.trim() || t("pos.thanks"))}</div>
  </div>`;
}

export function printPos(doc) {
  // Measure the receipt off-screen, then size the page to it.
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;left:-10000px;top:0;width:${prefs.w}mm`;
  probe.innerHTML = buildReceipt(doc);
  document.body.appendChild(probe);
  const hMm = Math.ceil(probe.getBoundingClientRect().height * 25.4 / 96) + 4;
  probe.remove();
  return runPrint({ html: buildReceipt(doc), pageCss: `@page{size:${prefs.w}mm ${hMm}mm;margin:0}`, title: pdfFileName(doc), bodyClass: "pos-print" });
}

// The receipt as a file: a PDF one roll-width wide and exactly as tall as the receipt,
// or a PNG picture (handy for WhatsApp). Drawn with the same engine as "Download PDF".
export async function makePosFile(doc, kind = "pdf", p = prefs) {
  const P = await import("./pdfDownload.js");
  const { jsPDF, shot } = await P.loadPdfLibs();
  const W = Math.round(p.w * P.MM);
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `position:fixed;left:-${W * 3}px;top:0;width:${W}px;pointer-events:none;`;
  stage.innerHTML = `<div style="width:${W}px;background:#fff;padding:2mm 0">${buildReceipt(doc, p)}</div>`;
  document.body.appendChild(stage);
  try {
    const page = stage.firstElementChild;
    page.querySelector(".pr").style.margin = "0 auto";
    await P.ready(page);
    const H = Math.ceil(page.getBoundingClientRect().height);
    const scale = Math.min(3, Math.sqrt(16e6 / (W * H)));
    const canvas = await shot.domToCanvas(page, { scale, width: W, height: H, backgroundColor: "#ffffff" });
    const base = `${pdfFileName(doc)} – POS ${p.w}mm`;
    if (kind === "png") {
      const blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("png"))), "image/png"));
      return { blob, name: base + ".png" };
    }
    const hmm = H / P.MM;
    const pdf = new jsPDF({ unit: "mm", format: [p.w, hmm], orientation: p.w > hmm ? "landscape" : "portrait", compress: true });
    pdf.setProperties({ title: pdfFileName(doc), creator: "InvoGen" });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, p.w, hmm, undefined, "FAST");
    return { blob: pdf.output("blob"), name: base + ".pdf" };
  } finally {
    stage.remove();
  }
}

let posBusy = false;
async function downloadPos(doc, kind) {
  if (posBusy) return;
  posBusy = true;
  toast(t(kind === "png" ? "pos.makingImage" : "pdf.making"), { duration: 120000 });
  try {
    const { blob, name } = await makePosFile(doc, kind);
    dismissToast();
    deliverFile(blob, name);
  } catch (e) {
    console.error(e);
    toast(t("pdf.failed"), { action: t("pos.print"), duration: 12000, onAction: () => printPos(doc) });
  } finally {
    posBusy = false;
  }
}

export function openPosSheet(doc) {
  const hasLink = !!normalizeUrl(doc.payLink);
  const chk = (k, label, hidden = false) => `<label class="check"${hidden ? " hidden" : ""}><input type="checkbox" data-pos="${k}"${prefs[k] ? " checked" : ""}> <span>${esc(label)}</span></label>`;
  openSheet({
    title: t("pos.title"),
    wide: true,
    body: `<div class="pos-grid">
      <div class="pos-opts">
        <div class="field"><span class="label" id="posWLabel">${esc(t("pos.width"))}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="posWLabel">
            ${[58, 80].map(w => `<button type="button" class="chip" role="radio" data-w="${w}" aria-checked="${prefs.w === w}">${w} mm</button>`).join("")}
          </div></div>
        ${chk("logo", t("pos.logo"))}${chk("client", t("pos.client"))}${chk("qr", t("pos.qr"), !hasLink)}
        <p class="hint">${esc(t("pos.hint"))}</p>
      </div>
      <div class="pos-preview" tabindex="0" aria-label="${esc(t("pos.preview"))}" role="img"><div id="posPreview">${buildReceipt(doc)}</div></div>
    </div>`,
    foot: `<button type="button" class="btn btn-outline" data-pos-dl="png">${icon("image", 18)}${esc(t("pos.image"))}</button>
           <button type="button" class="btn btn-outline" data-pos-dl="pdf">${icon("download", 18)}PDF</button>
           <button type="button" class="btn btn-primary" data-close="print">${icon("printer", 18)}${esc(t("pos.print"))}</button>`,
    onOpen: dlg => {
      const refresh = () => { dlg.querySelector("#posPreview").innerHTML = buildReceipt(doc); };
      dlg.addEventListener("click", e => {
        const d = e.target.closest("[data-pos-dl]");
        if (d) { downloadPos(doc, d.dataset.posDl); return; }
        const b = e.target.closest("[data-w]");
        if (!b) return;
        prefs.w = Number(b.dataset.w); savePrefs();
        dlg.querySelectorAll("[data-w]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
        refresh();
      });
      dlg.addEventListener("change", e => {
        const k = e.target.dataset.pos;
        if (k) { prefs[k] = e.target.checked; savePrefs(); refresh(); }
      });
    },
    onClose: v => { if (v === "print") setTimeout(() => printPos(doc), 80); }
  });
}

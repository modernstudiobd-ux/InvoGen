// pdfDownload.js — "Download PDF" as a real file, made in the browser with jsPDF.
// No print dialog and no steps: the PDF file downloads (or opens the share sheet on phones).
//   1. The document is laid out off screen at its paper width, exactly as in the preview.
//   2. It is split into pages between rows and paragraphs (never through a line of text).
//      Every page gets the template background, the table header when the items table
//      continues, the footer with the document number, and the watermark.
//   3. Each page is drawn into an image (modern-screenshot, which uses the browser's own
//      text engine, so Arabic, Bangla, Hindi and every template font look right) and
//      placed on a PDF page of the document's paper size with jsPDF.
// Both libraries load only when a PDF is made and are cached for offline use.
// "Print" still uses the browser's print dialog (print.js), with selectable text.

import { renderDocument, paperOf } from "./preview.js";
import { pdfFileName } from "./pdfExport.js";

const MM = 96 / 25.4;                       // CSS pixels per millimetre
const SCALE = 2;                            // image detail: about 190 dpi, sharp in print
const MAX_PIXELS = 16e6;                    // stay under phone canvas limits

let libs = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error("load " + src));
    document.head.appendChild(s);
  });
}
export function loadPdfLibs() {
  if (!libs) {
    libs = Promise.all([
      window.jspdf ? null : loadScript(new URL("./vendor/jspdf.umd.min.js", import.meta.url).href),
      import("./vendor/modern-screenshot.mjs")
    ]).then(([, shot]) => ({ jsPDF: window.jspdf.jsPDF, shot }));
    libs.catch(() => { libs = null; });
  }
  return libs;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

async function ready(el) {
  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : null;
  const imgs = [...el.querySelectorAll("img")].map(i => (i.decode ? i.decode().catch(() => {}) : null));
  await Promise.all([fonts, Promise.race([Promise.all(imgs), wait(2500)])]);
  await frame();
}

// Blocks kept on one page when they fit in half a page (header, totals, notes, signature).
const KEEP = ".doc-head, .doc-parties, .doc-summary, .doc-block, .doc-sig, .doc-pay-row, .doc-qr";

// Elements that must not be cut through: table rows, pictures and anything holding text.
function atomicBoxes(body, top, avail) {
  const out = [];
  for (const el of body.querySelectorAll(KEEP)) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height <= avail / 2) out.push([r.top - top, r.bottom - top]);
  }
  for (const el of body.querySelectorAll("*")) {
    const tag = el.tagName;
    let atomic = tag === "TR" || tag === "IMG" || tag === "svg" || tag === "CANVAS";
    if (!atomic && !el.closest("tr")) {
      const kids = [...el.children];
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      atomic = hasText || (kids.length && kids.every(k => getComputedStyle(k).display.startsWith("inline")) && el.textContent.trim() !== "");
    }
    if (!atomic) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) out.push([r.top - top, r.bottom - top]);
  }
  return out;
}

// Page breaks (in body coordinates): as far down as fits, but never inside a row or a line.
function planPages(boxes, bodyH, avail, table) {
  const ends = [...new Set(boxes.map(b => Math.round(b[1] * 10) / 10))].sort((a, b) => a - b);
  const pages = [];
  let y0 = 0, repeat = false;
  while (y0 < bodyH - 0.5) {
    const room = avail - (repeat ? table.headH : 0);
    let y1 = y0 + room;
    if (y1 >= bodyH) { pages.push({ y0, y1: bodyH, repeat }); break; }
    const safe = ends.filter(y => y > y0 + 1 && y <= y1 && !(table && Math.abs(y - table.headBottom) < 1) && !boxes.some(b => b[0] < y - 0.5 && b[1] > y + 0.5));
    if (safe.length) y1 = safe[safe.length - 1];
    pages.push({ y0, y1, repeat });
    repeat = !!table && y1 > table.headBottom && y1 < table.bottom - 0.5;
    y0 = y1;
  }
  return pages;
}

// A window onto the laid-out document: shows `h` pixels starting at document position `from`.
function windowOnto(docEl, from, h, top, w) {
  const win = document.createElement("div");
  win.style.cssText = `position:absolute;left:0;top:${top}px;width:${w}px;height:${h}px;overflow:hidden;`;
  const c = docEl.cloneNode(true);
  c.querySelectorAll(".doc-wm").forEach(n => n.remove());
  c.style.position = "absolute"; c.style.left = "0"; c.style.top = `${-from}px`; c.style.width = `${w}px`;
  c.style.background = "transparent";
  win.appendChild(c);
  return win;
}

export async function downloadPdf(doc, { onProgress } = {}) {
  const { jsPDF, shot } = await loadPdfLibs();
  const [wmm, hmm] = paperOf(doc.paper);
  const W = Math.round(wmm * MM), H = Math.round(hmm * MM);

  const stage = document.createElement("div");
  stage.className = "pdf-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `position:fixed;left:-${W * 3}px;top:0;width:${W}px;pointer-events:none;`;
  stage.innerHTML = renderDocument(doc, { editable: false });
  document.body.appendChild(stage);
  try {
    const docEl = stage.querySelector(".doc");
    docEl.style.width = `${W}px`;
    await ready(stage);

    const top = docEl.getBoundingClientRect().top;
    const body = docEl.querySelector(".doc-body");
    const br = body.getBoundingClientRect();
    const bodyTop = br.top - top, bodyH = br.height;
    const headRow = docEl.querySelector(".doc-frame > thead > tr").getBoundingClientRect().height;
    const footTr = docEl.querySelector(".doc-frame > tfoot > tr").getBoundingClientRect();
    const footRow = footTr.height, footTop = footTr.top - top;
    const avail = H - headRow - footRow;

    const items = body.querySelector(".doc-items");
    let table = null;
    if (items && items.tHead && getComputedStyle(items.tHead).display !== "none") {
      const hr = items.tHead.getBoundingClientRect(), tr = items.getBoundingClientRect();
      table = { headTop: hr.top - top, headH: hr.height, headBottom: hr.bottom - br.top, bottom: tr.bottom - br.top };
    }
    const pages = planPages(atomicBoxes(body, br.top, avail), bodyH, avail, table);

    const pdf = new jsPDF({ unit: "mm", format: [wmm, hmm], orientation: wmm > hmm ? "landscape" : "portrait", compress: true });
    pdf.setProperties({ title: pdfFileName(doc), creator: "InvoGen" });
    const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (W * H)));
    const wm = docEl.querySelector(".doc-wm");

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      // The page itself carries the template's classes, so its background, stripe or grid
      // and the watermark style match the document.
      const page = document.createElement("article");
      page.className = docEl.className;
      page.setAttribute("dir", docEl.getAttribute("dir"));
      page.setAttribute("lang", docEl.getAttribute("lang"));
      page.setAttribute("style", docEl.getAttribute("style") || "");
      page.style.width = `${W}px`; page.style.height = `${H}px`;
      page.style.position = "relative"; page.style.overflow = "hidden";
      let y = 0;
      if (i === 0) {
        page.appendChild(windowOnto(docEl, 0, bodyTop + p.y1, 0, W));
      } else {
        y = headRow;
        if (p.repeat) { page.appendChild(windowOnto(docEl, table.headTop, table.headH, y, W)); y += table.headH; }
        page.appendChild(windowOnto(docEl, bodyTop + p.y0, p.y1 - p.y0, y, W));
      }
      page.appendChild(windowOnto(docEl, footTop, footRow, H - footRow, W));
      if (wm) page.appendChild(wm.cloneNode(true));
      stage.appendChild(page);
      await ready(page);
      const canvas = await shot.domToCanvas(page, { scale, width: W, height: H, backgroundColor: null });
      page.remove();
      const img = canvas.toDataURL("image/jpeg", 0.9);
      if (i > 0) pdf.addPage([wmm, hmm], wmm > hmm ? "landscape" : "portrait");
      pdf.addImage(img, "JPEG", 0, 0, wmm, hmm, undefined, "FAST");
      if (onProgress) onProgress(i + 1, pages.length);
    }
    const name = pdfFileName(doc) + ".pdf";
    return { blob: pdf.output("blob"), name, pages: pages.length };
  } finally {
    stage.remove();
  }
}

// Saves the file with a normal download (phones get a "PDF ready" sheet in pdfExport.js).
export function savePdf(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}

// print.js — prints a document with the browser's own print dialog (carried over from
// v3.41: no PDF library, real selectable text, works offline). The document is rendered
// into #printHost (the only thing print.css lets through), the page size is set to the
// document's paper, and everything is restored when the dialog closes.

import { renderDocument, paperOf } from "./preview.js";
import { pdfFileName } from "./pdfExport.js";
import { printBackground } from "./templates.js";
import { isRtlLang } from "./docLabels.js";

function host() {
  let h = document.getElementById("printHost");
  if (!h) { h = document.createElement("div"); h.id = "printHost"; document.body.appendChild(h); }
  return h;
}
function pageStyle() {
  let s = document.getElementById("pageSizeCSS");
  if (!s) { s = document.createElement("style"); s.id = "pageSizeCSS"; document.head.appendChild(s); }
  return s;
}

// Shared by document and POS printing: wait for fonts/images, print, then restore.
export function runPrint({ html, pageCss, title, bodyClass = "", bg = "" }) {
  const h = host(), ps = pageStyle();
  const oldTitle = document.title;
  h.innerHTML = html;
  ps.textContent = pageCss;
  if (bodyClass) document.body.classList.add(bodyClass);
  if (bg) document.documentElement.style.setProperty("--print-bg", bg);
  if (title) document.title = title;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    window.removeEventListener("afterprint", restore);
    window.removeEventListener("focus", onFocus);
    h.innerHTML = "";
    if (bodyClass) document.body.classList.remove(bodyClass);
    document.documentElement.style.removeProperty("--print-bg");
    document.title = oldTitle;
  };
  // afterprint is the main signal; regaining focus after the dialog closes is a backup;
  // the long timer is only a last-resort safety net (see v3.41 notes).
  const onFocus = () => setTimeout(restore, 400);
  window.addEventListener("afterprint", restore);

  const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  const imgs = [...h.querySelectorAll("img")].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })).filter(Boolean);
  const ready = Promise.all([fonts, Promise.race([Promise.all(imgs), new Promise(r => setTimeout(r, 1500))])]);
  return ready.then(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
    window.print();
    window.addEventListener("focus", onFocus);
    setTimeout(restore, 60000);
    res();
  }, 60)))));
}

export function printDocument(doc) {
  const [w, hgt] = paperOf(doc.paper);
  const html = renderDocument(doc, { editable: false });
  return runPrint({
    html,
    pageCss: `@page{size:${w}mm ${hgt}mm;margin:0}`,
    title: pdfFileName(doc),
    bg: printBackground(doc.template, doc.accent, isRtlLang(doc.lang))   // tinted, dark, striped and grid templates fill every page
  });
}

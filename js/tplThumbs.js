// tplThumbs.js — live template previews: a sample document drawn with the real
// template (so a thumbnail always matches what prints), scaled down to fit its card.

import { renderDocument } from "./preview.js";
import { normalizeDoc, getState } from "./state.js";
import { t } from "./i18n.js";
import { addDays, todayISO } from "./format.js";
import { DOC_LANGS } from "./docLabels.js";

const PAPER_PX = 793.7;   // 210 mm at 96 dpi
const docLangOk = new Set(DOC_LANGS.map(l => l[0]));

// A believable sample in the person's own currency, language and business name.
export function sampleDoc(template, over = {}) {
  const s = getState().settings, today = todayISO();
  return normalizeDoc({
    type: "invoice", no: `${s.numbering.invoice.prefix ? s.numbering.invoice.prefix + "-" : ""}0001`, status: "sent",
    issued: today, due: addDays(today, 30), termsDays: 30,
    currency: s.currency, lang: docLangOk.has(s.docLang) ? s.docLang : "en", dateFormat: s.dateFormat, numberFormat: s.numberFormat,
    business: { name: s.business.name || t("tpl.sampleBiz"), email: s.business.email || "hello@example.com", address: s.business.address || "", phone: s.business.phone || "", logo: "" },
    client: { name: t("tpl.sampleClient"), email: "accounts@example.com", address: "" },
    items: [
      { desc: t("tpl.sampleItem1"), qty: 1, rate: 2400 },
      { desc: t("tpl.sampleItem2"), qty: 6, rate: 120 },
      { desc: t("tpl.sampleItem3"), qty: 12, rate: 25 }
    ],
    tax: { name: s.taxName || "Tax", rate: s.taxRate || 0, inclusive: false },
    notes: "", terms: "", template, accent: "", font: "", paper: "A4",
    ...over,
    ...(over.business ? { business: { ...over.business, name: over.business.name || t("tpl.sampleBiz") } } : {})
  });
}

export function thumbHtml(doc) {
  return `<div class="tpl-thumb" aria-hidden="true"><div class="tpl-thumb-in">${renderDocument(doc)}</div></div>`;
}

// Scales every thumbnail inside `root` to its box, now and whenever the box resizes.
export function fitThumbs(root) {
  const fit = el => { const w = el.clientWidth; if (w) el.style.setProperty("--s", String(w / PAPER_PX)); };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(es => es.forEach(e => fit(e.target))) : null;
  root.querySelectorAll(".tpl-thumb").forEach(el => { fit(el); if (ro) ro.observe(el); });
  return () => ro && ro.disconnect();
}

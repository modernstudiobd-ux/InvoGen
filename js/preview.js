// preview.js — turns a document into its printable page. The same HTML is used for the
// live preview, Print and PDF, so what you see is exactly what prints.
// Handles any document language (incl. right-to-left), very large amounts, long names,
// logos, signatures, payment links with QR codes and watermarks.

import { esc, safeLogo } from "./dom.js";
import { totals } from "./calc.js";
import { formatMoney, formatDate, formatNumber } from "./format.js";
import { dl, colLabel, isRtlLang, netTerms } from "./docLabels.js";
import { amountInWords } from "./words.js";
import qrcode from "./vendor/qrcode.js";
import { DOC_FONTS, templateVars, TEMPLATE_IDS } from "./templates.js";

// Paper sizes in millimetres [width, height]
export const PAPERS = {
  A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A5: [148, 210], A3: [297, 420],
  B5: [176, 250], Executive: [184.15, 266.7], "Half letter": [139.7, 215.9], Tabloid: [279.4, 431.8], A6: [105, 148]
};
export const paperOf = name => PAPERS[name] || PAPERS.A4;

export const SIGNATURE_FONTS = ["Caveat", "Dancing Script", "Great Vibes", "Homemade Apple", "Kristi"];

export { DOC_FONTS };

// Scripts without capital letters (or where spaced capitals look wrong) get plain labels.
const PLAIN_SCRIPT = new Set(["zh", "hi", "ar", "bn", "ja", "ur", "ko", "fa", "th"]);

// Only plain web links are ever turned into a clickable link or QR code.
export function normalizeUrl(v) {
  let s = String(v || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}

export function qrSvg(text) {
  try {
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return `<svg class="doc-qr-img" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch { return ""; }
}

const lines = s => esc(s).replace(/\r?\n/g, "<br>");
const editAttr = (on, path, multiline = false) => on ? ` data-edit="${path}" contenteditable="plaintext-only" spellcheck="false" role="textbox"${multiline ? ' aria-multiline="true"' : ""} tabindex="0"` : "";

// renderDocument(doc, { editable, today, labelFor }) → HTML string of one paper page flow.
export function renderDocument(doc, { editable = false, today, placeholders = null } = {}) {
  const L = doc.lang || "en", type = doc.type;
  const rtl = isRtlLang(L);
  const t = totals(doc, today);
  const nf = { fmt: doc.numberFormat, lang: L };
  const m = n => `<bdi class="ltr">${esc(formatMoney(n, doc.currency, nf))}</bdi>`;
  const d = iso => esc(formatDate(iso, doc.dateFormat, L, doc.numberFormat));
  const [pw, ph] = paperOf(doc.paper);
  const tpl = TEMPLATE_IDS.includes(doc.template) ? doc.template : "modern";
  const vars = templateVars(tpl, doc.accent);
  if (DOC_FONTS[doc.font]) vars["--doc-font"] = DOC_FONTS[doc.font];
  const style = `--paper-w:${pw}mm;--paper-h:${ph}mm;` + Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");

  /* ---- header ---- */
  const b = doc.business || {};
  const logo = safeLogo(b.logo);
  const bizLines = [b.address && lines(b.address), [b.phone, b.email].filter(Boolean).map(esc).join(" · "), b.website && esc(b.website), b.taxId && esc(b.taxId)].filter(Boolean);
  const head = `<header class="doc-head">
      <div class="doc-from">
        ${logo ? `<img class="doc-logo" src="${logo}" alt="" style="height:${doc.logoSize}px">` : ""}
        <div class="doc-biz" dir="auto"${editAttr(editable, "business.name")}>${esc(b.name) || (placeholders ? `<span class="doc-ph">${esc(placeholders.biz)}</span>` : "")}</div>
        ${bizLines.length ? `<div class="doc-small" dir="auto">${bizLines.join("<br>")}</div>` : ""}
      </div>
      <div class="doc-titleblock">
        <h1 class="doc-title">${esc(dl(L, "noun", type))}</h1>
        <div class="doc-no"><bdi class="ltr"${editAttr(editable, "no")}>${esc(doc.no)}</bdi></div>
      </div>
    </header>`;

  /* ---- parties & dates ---- */
  const c = doc.client || {};
  const cLines = [c.contact && esc(c.contact), c.address && lines(c.address), [c.email, c.phone].filter(Boolean).map(esc).join(" · "), c.taxId && esc(c.taxId)].filter(Boolean);
  const showBill = doc.show.billTo !== false;
  const dates = [[dl(L, "date", type), d(doc.issued)]];
  if (type !== "receipt" && doc.due && doc.show.dueDate !== false) dates.push([dl(L, "due", type), d(doc.due)]);
  if (type === "receipt") {
    const last = (doc.payments || []).map(p => p.date).sort().pop();
    if (doc.payMethod) dates.push([dl(L, "method"), esc(doc.payMethod)]);
    if (last && last !== doc.issued) dates.push([dl(L, "due", "receipt"), d(last)]);
  }
  if (type === "invoice" && doc.termsDays !== "" && doc.termsDays != null) dates.push([dl(L, "payTerms"), esc(Number(doc.termsDays) === 0 ? dl(L, "receipt") : netTerms(L, doc.termsDays))]);
  if (doc.reference) dates.push([dl(L, "ref"), `<bdi>${esc(doc.reference)}</bdi>`]);
  const parties = `<section class="doc-parties">
      ${showBill ? `<div class="doc-billto"><div class="doc-label">${esc(dl(L, "bill", type))}</div>
        <div class="doc-client" dir="auto"${editAttr(editable, "client.name")}>${esc(c.name) || (placeholders ? `<span class="doc-ph">${esc(placeholders.client)}</span>` : "")}</div>
        ${cLines.length ? `<div class="doc-small" dir="auto">${cLines.join("<br>")}</div>` : ""}</div>` : "<div></div>"}
      <dl class="doc-dates">${dates.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
    </section>`;

  /* ---- items ---- */
  const cols = doc.cols || {};
  const qtyFmt = q => esc(formatNumber(q, Number.isInteger(Number(q)) ? 0 : Math.min(3, (String(q).split(".")[1] || "").length || 2), doc.numberFormat, L));
  const visibleItems = doc.items.filter((it, i) => editable || it.desc.trim() || Number(it.rate) || doc.items.length === 1 || i === 0);
  const head2 = [
    cols.sku ? `<th class="c-sku">${esc(colLabel(L, "sku"))}</th>` : "",
    `<th class="c-desc">${esc(colLabel(L, "description"))}</th>`,
    cols.qty ? `<th class="c-num">${esc(colLabel(L, "quantity"))}</th>` : "",
    cols.unit ? `<th class="c-unit">${esc(colLabel(L, "unit"))}</th>` : "",
    cols.rate ? `<th class="c-num">${esc(colLabel(L, "rate"))}</th>` : "",
    `<th class="c-num c-amt">${esc(colLabel(L, "amount"))}</th>`
  ].join("");
  const rows = visibleItems.map(it => {
    const i = doc.items.indexOf(it);
    const amt = (it.qty === "" || it.qty == null ? 1 : Number(it.qty)) * Number(it.rate || 0);
    return `<tr>
      ${cols.sku ? `<td class="c-sku"><bdi>${esc(it.sku)}</bdi></td>` : ""}
      <td class="c-desc"><div class="doc-desc" dir="auto"${editAttr(editable, `items.${i}.desc`)}>${esc(it.desc)}</div>${it.details ? `<div class="doc-details" dir="auto">${lines(it.details)}</div>` : ""}</td>
      ${cols.qty ? `<td class="c-num">${qtyFmt(it.qty === "" ? 1 : it.qty)}</td>` : ""}
      ${cols.unit ? `<td class="c-unit">${esc(it.unit)}</td>` : ""}
      ${cols.rate ? `<td class="c-num">${m(it.rate)}</td>` : ""}
      <td class="c-num c-amt">${m(amt)}</td>
    </tr>`;
  }).join("");
  const items = `<table class="doc-items"><thead><tr>${head2}</tr></thead><tbody>${rows}</tbody></table>`;

  /* ---- totals ---- */
  const tr = (label, value, cls = "") => `<tr class="${cls}"><th scope="row">${label}</th><td>${value}</td></tr>`;
  const pct = v => esc(formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2, doc.numberFormat, L)) + "%";
  const rowsT = [tr(esc(dl(L, "subtotal")), m(t.subtotal))];
  if (t.discount) rowsT.push(tr(`${esc(dl(L, "discount"))}${doc.discount.type === "percent" ? " " + pct(doc.discount.value) : ""}`, `−${m(t.discount)}`));
  if (t.tax || Number(doc.tax.rate)) rowsT.push(tr(`${esc(doc.tax.name || dl(L, "tax"))} ${pct(doc.tax.rate)}`, m(t.tax), doc.tax.inclusive ? "is-incl" : ""));
  if (t.tax2) rowsT.push(tr(`${esc(doc.tax2.name || dl(L, "tax"))} ${pct(doc.tax2.rate)}`, m(t.tax2)));
  if (t.shipping) rowsT.push(tr(esc(dl(L, "shipping")), m(t.shipping)));
  if (t.subtotal !== t.total || t.paid || t.lateFee) rowsT.push(tr(esc(dl(L, "total")), m(t.total), "is-total"));
  if (type === "invoice" && t.lateFee) rowsT.push(tr(esc(dl(L, "lateFee")), m(t.lateFee)));
  if (type === "invoice" && t.paid) rowsT.push(tr(esc(dl(L, "paid", type)), `−${m(t.paid)}`));
  const big = type === "invoice" ? t.balance : t.total;
  const balance = `<div class="doc-balance"><span class="doc-balance-label">${esc(dl(L, "balance", type))}</span><span class="doc-balance-amt">${m(big)}</span></div>`;
  const deposit = type !== "receipt" && doc.deposit.on && t.depositDue > 0
    ? `<div class="doc-deposit"><span>${esc(dl(L, "deposit"))}</span><span>${m(t.depositDue)}</span></div>` : "";
  const words = doc.show.words ? `<div class="doc-words"><div class="doc-label">${esc(dl(L, "words"))}</div><div>${esc(amountInWords(big, doc.currency))}</div></div>` : "<div></div>";
  const summary = `<section class="doc-summary">${words}<div class="doc-sum"><table class="doc-totals">${rowsT.join("")}</table>${balance}${deposit}</div></section>`;

  /* ---- notes, payment, signature ---- */
  const link = normalizeUrl(doc.payLink);
  const blocks = [];
  if (doc.notes.trim() || editable) blocks.push(`<div class="doc-block"><div class="doc-label">${esc(dl(L, "note"))}</div><div class="doc-text" dir="auto"${editAttr(editable, "notes", true)}>${lines(doc.notes)}</div></div>`);
  if (doc.terms.trim()) blocks.push(`<div class="doc-block"><div class="doc-label">${esc(dl(L, "payment"))}</div><div class="doc-text" dir="auto">${lines(doc.terms)}</div></div>`);
  if (link && type !== "receipt") {
    const label = doc.payProvider ? `${dl(L, "payOnline")} · ${doc.payProvider}` : dl(L, "payOnline");
    blocks.push(`<div class="doc-block doc-pay"><div class="doc-label">${esc(label)}</div>
      <div class="doc-pay-row">${doc.show.qr ? `<div class="doc-qr">${qrSvg(link)}</div>` : ""}
      <div><a class="doc-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer"><bdi class="ltr">${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</bdi></a>${doc.show.qr ? `<div class="doc-small">${esc(dl(L, "scan"))}</div>` : ""}</div></div></div>`);
  }
  const sig = doc.signature;
  let sigHtml = "";
  if (sig.on) {
    const img = safeLogo(sig.img);
    const mark = sig.mode === "type"
      ? (sig.text.trim() ? `<div class="doc-sig-type" dir="auto" style="font-family:'${esc(SIGNATURE_FONTS.includes(sig.font) ? sig.font : "Caveat")}',cursive">${esc(sig.text)}</div>` : "")
      : (img ? `<img class="doc-sig-img" src="${img}" alt="">` : "");
    sigHtml = `<div class="doc-sig">${mark}<div class="doc-sig-line">${esc(dl(L, "sign"))}</div></div>`;
  }
  const extra = blocks.length || sigHtml ? `<section class="doc-extra"><div class="doc-blocks">${blocks.join("")}</div>${sigHtml}</section>` : "";

  const footerText = doc.footer.trim();
  const footer = `<div class="doc-foot">${footerText ? `<span dir="auto"${editAttr(editable, "footer")}>${esc(footerText)}</span>` : "<span></span>"}<span class="doc-foot-no"><bdi class="ltr">${esc(doc.no)}</bdi></span></div>`;

  const wmText = doc.watermark.on ? (doc.watermark.text.trim() || dl(L, "wmDraft")) : "";
  const wm = wmText ? `<div class="doc-wm" aria-hidden="true"><span>${esc(wmText)}</span></div>` : "";

  return `<article class="doc tpl-${tpl}${rtl ? " is-rtl" : ""}${PLAIN_SCRIPT.has(L) ? " plain" : ""}" dir="${rtl ? "rtl" : "ltr"}" lang="${esc(L)}" style="${style}">
    ${wm}
    <table class="doc-frame" role="presentation">
      <thead><tr><td><div class="doc-pad-top"></div></td></tr></thead>
      <tfoot><tr><td><div class="doc-pad-bottom">${footer}</div></td></tr></tfoot>
      <tbody><tr><td class="doc-body">${head}${parties}${items}${summary}${extra}</td></tr></tbody>
    </table>
  </article>`;
}

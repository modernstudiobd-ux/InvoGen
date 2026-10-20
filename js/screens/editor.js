// screens/editor.js — create and edit every document type: invoices, estimates, receipts,
// credit notes, proformas, purchase orders and delivery notes.
// Form on the left (numbered, collapsible sections; advanced options folded away),
// live preview on the right (Form / Preview tabs on phones and tablets). Every change
// is saved automatically. Undo/redo, Design, PDF, Print, POS receipt and Send included.

import { esc, uid, debounce, isTyping } from "../dom.js";
import { icon } from "../icons.js";
import { t, getLanguage, currencyName } from "../i18n.js";
import {
  getState, settings, subscribe, getDoc, newDoc, nextNumber, saveDoc, deleteDoc, restoreDoc, duplicateDoc,
  setSettings, saveClient, saveProducts, markPaid, markSent, convertToInvoice, restorePaymentState, setDocFields, normalizeDoc,
  DOC_TYPES, STATUS_BY_TYPE, QUOTE_TYPES, NO_DUE_TYPES, sentStatus, createCreditNote, createDeliveryNote
} from "../state.js";
import { openReminderSheet, canRemind } from "../reminders.js";
import { totals, statusOf, lineAmount } from "../calc.js";
import { formatMoney, formatNumber, formatDate, parseNumber, addDays, daysBetween, todayISO, DATE_FORMATS, NUMBER_FORMATS, decimalsOf } from "../format.js";
import { CURRENCIES, COMMON_CURRENCIES } from "../currencies.js";
import { DOC_LANGS, dl } from "../docLabels.js";
import { renderDocument, PAPERS, paperOf, SIGNATURE_FONTS, DOC_FONTS, normalizeUrl } from "../preview.js";
import { TEMPLATES, templateOf, validHex, hasFixedColor } from "../templates.js";
import { sampleDoc, thumbHtml, fitThumbs } from "../tplThumbs.js";
import { printDocument } from "../print.js";
import { exportPdf as makePdf, pdfFileName, pdfAttachment } from "../pdfExport.js";
import { openPosSheet } from "../pos.js";
import { openPaymentSheet } from "../payments.js";
import { openSheet, confirmSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { readImage, signaturePad } from "../images.js";
import { parseDelimited, toItems, readSheetFile } from "../importSheet.js";
import { enhancePickers } from "../picker.js";
import { attachSuggest } from "../suggest.js";
import { OPTIONAL, lineOptions, isNumeric, defaultWeight, normalizeColumns } from "../columns.js";

/* ---------------- module state ---------------- */
let root = null, doc = null, isNew = false, dirty = false, saveState = "saved";
let ac = null, typeNos = {};
let unsub = null, past = [], future = [], lastSnap = "", view = "form", pad = null, keyHandler = null, resizeObs = null;
const OPEN_KEY = "invogen.editor.open";
let open = loadOpen();

function loadOpen() {
  try { const v = JSON.parse(sessionStorage.getItem(OPEN_KEY)); if (Array.isArray(v)) return new Set(v); } catch {}
  return new Set(["client", "items"]);
}
const saveOpen = () => { try { sessionStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {} };

// International payment providers; anything local (bKash, UPI, M-Pesa…) is typed in as a custom one.
const PAY_PROVIDERS = ["PayPal", "Stripe", "Wise", "Payoneer", "Square", "Revolut", "Skrill"];
const PAY_METHODS = ["bank", "card", "cash", "cheque", "online"];
let customProvider = false, customMethod = false;
const TERMS = ["", 0, 7, 14, 15, 30, 45, 60, 90];
const COLORS = ["#292524", "#1f3a5f", "#2f6b4f", "#b5532a", "#2b59c3", "#7a5a12", "#8b2a4b"];
const statusOpts = ty => (ty === "receipt" ? [] : STATUS_BY_TYPE[ty] || []);
// Types that take money up front or online (deposit, payment link and QR code).
const PAYABLE = ["invoice", "estimate", "proforma"];

/* ---------------- helpers ---------------- */
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] ?? (a[ks[i]] = {}); a[ks[ks.length - 1]] = v; }
const fid = p => "f-" + p.replace(/\./g, "-");
const appFmt = () => ({ fmt: settings().numberFormat, lang: getLanguage() });
const dmoney = n => formatMoney(n, doc.currency, appFmt());
const typeName = ty => t(`type.${ty}`);
const numStr = v => (v === "" || v == null ? "" : String(v));

function field(label, path, o = {}) {
  const v = getPath(doc, path);
  const id = fid(path);
  const hint = o.hint ? `<p class="hint" id="${id}-h">${esc(o.hint)}</p>` : "";
  const desc = o.hint ? ` aria-describedby="${id}-h"` : "";
  const common = `id="${id}" data-f="${path}" data-k="${o.kind || "text"}"${o.rerender ? ` data-rerender="${o.rerender}"` : ""}${desc}`;
  let ctl;
  if (o.options) {
    ctl = `<select class="select" ${common}${o.currency ? " data-currency" : ""}>${o.options.map(([val, lab, grp]) => grp ? grp : `<option value="${esc(val)}"${String(val) === String(v ?? "") ? " selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
  } else if (o.textarea) {
    ctl = `<textarea class="input textarea" rows="${o.rows || 3}" ${common}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""} dir="auto">${esc(v)}</textarea>`;
  } else {
    const isNum = o.kind === "num" || o.kind === "int";
    const type = o.type || "text";
    ctl = `<input class="input${isNum ? " num" : ""}" type="${type}" ${common} value="${esc(isNum ? numStr(v) : v)}"${isNum ? ' inputmode="decimal"' : ""}${o.ac ? ` autocomplete="${o.ac}"` : ' autocomplete="off"'}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}${o.list ? ` list="${o.list}"` : ""}${type === "text" || type === "email" ? ' dir="auto"' : ""}${o.max ? ` maxlength="${o.max}"` : ""}>`;
  }
  return `<div class="field${o.span ? " span2" : ""}"><label for="${id}">${esc(label)}</label>${ctl}${hint}</div>`;
}
function toggle(label, path, { hint, rerender } = {}) {
  const id = fid(path), on = !!getPath(doc, path);
  return `<label class="switch-row" for="${id}"><span class="switch-text"><span>${esc(label)}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</span>
    <input type="checkbox" class="switch" role="switch" id="${id}" data-f="${path}" data-k="bool"${on ? " checked" : ""}${rerender ? ` data-rerender="${rerender}"` : ""}></label>`;
}
function seg(label, path, opts, rerender) {
  const v = getPath(doc, path), id = fid(path);
  return `<div class="field span2"><span class="label" id="${id}-l">${esc(label)}</span>
    <div class="segmented seg-full" role="radiogroup" aria-labelledby="${id}-l">${opts.map(([val, lab]) =>
      `<button type="button" class="chip" role="radio" aria-checked="${v === val}" data-seg="${path}" data-val="${esc(val)}"${rerender ? ` data-rerender="${rerender}"` : ""}>${esc(lab)}</button>`).join("")}</div></div>`;
}
const details = (summary, body, openIt = false) => `<details class="ed-more"${openIt ? " open" : ""}><summary>${icon("chevron-right", 16)}<span>${esc(summary)}</span></summary><div class="ed-grid">${body}</div></details>`;

/* ---------------- sections ---------------- */
function sections() {
  const ty = doc.type;
  return [
    ["doc", t("ed.sec.document")],
    ["biz", t("ed.sec.business")],
    ["client", t(ty === "purchaseOrder" ? "ed.sec.supplier" : "ed.sec.client")],
    ["items", t("ed.sec.items")],
    ...(ty === "deliveryNote" ? [] : [["totals", t("ed.sec.totals")]]),
    ["payment", t(PAYABLE.includes(ty) ? "ed.sec.payment" : "ed.sec.notes")],
    ["brand", t("ed.sec.brand")],
    ["layout", t("ed.sec.layout")],
    ...(ty === "invoice" ? [["recurring", t("ed.sec.recurring")]] : [])
  ];
}

function summary(id) {
  const tt = totals(doc);
  switch (id) {
    case "doc": return `${typeName(doc.type)} ${doc.no}`;
    case "biz": return doc.business.name || t("ed.addDetails");
    case "client": return doc.client.name || t("ed.addClient");
    case "items": return doc.type === "deliveryNote" ? t("cl.itemCount", { n: doc.items.length }) : t("ed.itemsSum", { n: doc.items.length, amount: dmoney(tt.subtotal) });
    case "totals": return `${doc.tax.name || dl(doc.lang, "tax")} ${formatNumber(doc.tax.rate, Number.isInteger(+doc.tax.rate) ? 0 : 2, "auto", getLanguage())}%`;
    case "payment": return [doc.deposit.on && t("ed.deposit"), doc.lateFee.on && t("ed.lateFee"), normalizeUrl(doc.payLink) && t("ed.payLinkShort")].filter(Boolean).join(" · ") || (doc.notes.trim() ? t("ed.hasNotes") : t("ed.none"));
    case "brand": return [doc.business.logo && t("ed.logo"), doc.signature.on && t("ed.signature")].filter(Boolean).join(" · ") || t("ed.none");
    case "layout": return [doc.watermark.on && t("ed.watermark"), doc.paper].filter(Boolean).join(" · ");
    case "recurring": return doc.recurring.on ? t("ed.repeatsSum", { n: doc.recurring.every, unit: t(`ed.unit.${doc.recurring.unit}`) }) : t("ed.off");
  }
  return "";
}

function body(id) {
  const ty = doc.type, s = settings();
  switch (id) {
    case "doc": {
      const curOpts = [["", "", `<optgroup label="${esc(t("ed.commonCurrencies"))}">`],
        ...COMMON_CURRENCIES.map(c => { const x = CURRENCIES.find(r => r[0] === c); return [c, `${c} · ${x[1]} · ${currencyName(c, x[2])}`]; }),
        ["", "", `</optgroup><optgroup label="${esc(t("ed.allCurrencies"))}">`],
        ...CURRENCIES.slice().sort((a, b) => a[0].localeCompare(b[0])).map(([c, sym, en]) => [c, `${c} · ${sym} · ${currencyName(c, en)}`]),
        ["", "", "</optgroup>"]];
      const status = statusOpts(ty).length ? field(t("ed.status"), "status", { options: statusOpts(ty).map(v => [v, t(`status.${v}`)]), kind: "status" }) : "";
      const dueLabel = QUOTE_TYPES.includes(ty) ? t("ed.validUntil") : ty === "purchaseOrder" ? t("ed.deliverBy") : t("ed.due");
      return `<div class="ed-grid">
        ${field(t("ed.docType"), "type", { options: DOC_TYPES.map(v => [v, typeName(v)]), rerender: "all", span: true })}
        ${ty === "creditNote" ? creditForField() : ""}
        ${field(t("ed.number"), "no", { max: 60 })}
        ${status}
        ${field(t("ed.issued"), "issued", { type: "date", kind: "date" })}
        ${ty === "invoice" ? field(t("ed.terms"), "termsDays", { kind: "terms", options: TERMS.map(n => [n, n === "" ? t("ed.termsCustom") : n === 0 ? t("ed.termsReceipt") : t("ed.termsNet", { n })]) }) : ""}
        ${!NO_DUE_TYPES.includes(ty) ? field(dueLabel, "due", { type: "date", kind: "date" }) : ty === "receipt" ? methodField() : ""}
        ${field(t("ed.currency"), "currency", { options: curOpts, span: true, currency: true })}
        ${field(t("ed.reference"), "reference", { span: true, max: 200 })}
        </div>
        ${details(t("ed.moreDocOptions"), `
          ${field(t("ed.docLang"), "lang", { options: DOC_LANGS.map(([c, n]) => [c, n]), hint: t("ed.docLangHint"), span: true })}
          ${field(t("ed.dateFormat"), "dateFormat", { options: DATE_FORMATS.map(f => [f, formatDate("2026-11-09", f, doc.lang)]) })}
          ${field(t("ed.numberFormat"), "numberFormat", { options: NUMBER_FORMATS.map(([k, ex]) => [k, ex || t(`ed.nf.${k}`)]) })}`)}`;
    }
    case "biz":
      return `<div class="ed-grid">
        ${field(t("ed.bizName"), "business.name", { span: true, ac: "organization" })}
        ${field(t("ed.email"), "business.email", { type: "email", ac: "email" })}
        ${field(t("ed.phone"), "business.phone", { type: "tel", ac: "tel" })}
        ${field(t("ed.address"), "business.address", { textarea: true, rows: 3, span: true })}
        ${field(t("ed.website"), "business.website", { type: "url", ac: "url" })}
        ${field(t("ed.taxId"), "business.taxId")}
      </div><p class="hint">${esc(t("ed.bizHint"))}</p>`;
    case "client": {
      return `<div class="ed-actions-row">
          <button type="button" class="btn btn-outline" data-act="pick-client" aria-haspopup="dialog">${icon("users", 18)}${esc(t("ed.chooseClient"))}</button>
          <button type="button" class="btn btn-outline" data-act="save-client" id="saveClientBtn"${doc.client.name.trim() ? "" : " hidden"}${clientIsSaved() ? ' aria-disabled="true"' : ""}>${icon(clientIsSaved() ? "check" : "plus", 18)}<span>${esc(clientBtnLabel())}</span></button>
        </div>
        <div class="ed-grid">
          ${field(t("ed.clientName"), "client.name", { span: true })}
          ${field(t("ed.email"), "client.email", { type: "email", span: true })}
        </div>
        ${details(t("ed.moreClientDetails"), `
          ${field(t("ed.contact"), "client.contact")}
          ${field(t("ed.phone"), "client.phone", { type: "tel" })}
          ${field(t("ed.billingAddress"), "client.address", { textarea: true, rows: 3, span: true })}
          ${field(t("ed.taxIdOpt"), "client.taxId", { span: true })}`, !!(doc.client.contact || doc.client.phone || doc.client.address || doc.client.taxId))}`;
    }
    case "items": return itemsBody();
    case "totals":
      return `<div class="ed-grid">
          ${field(t("ed.taxName"), "tax.name", { max: 40 })}
          ${field(t("ed.taxRate"), "tax.rate", { kind: "num" })}
          <div class="span2">${toggle(t("ed.taxInclusive"), "tax.inclusive", { hint: t("ed.taxInclusiveHint") })}</div>
          ${field(t("ed.discountType"), "discount.type", { options: [["percent", t("ed.percent")], ["amount", t("ed.fixedAmount")]] })}
          ${field(t("ed.discount"), "discount.value", { kind: "num" })}
          ${field(t("ed.shipping"), "shipping", { kind: "num", span: true })}
        </div>
        ${details(t("ed.secondTax"), `<div class="span2">${toggle(t("ed.secondTaxOn"), "tax2.on", { rerender: "totals" })}</div>
          ${doc.tax2.on ? field(t("ed.taxName"), "tax2.name", { max: 40 }) + field(t("ed.taxRate"), "tax2.rate", { kind: "num" }) : ""}`, doc.tax2.on)}`;
    case "payment": {
      const isInv = ty === "invoice", payable = PAYABLE.includes(ty);
      const pays = isInv ? paymentsList() : "";
      return `${payable ? details(t(isInv ? "ed.depositLate" : "ed.deposit"), `
          <div class="span2">${toggle(t("ed.depositOn"), "deposit.on", { hint: t("ed.depositHint"), rerender: "payment" })}</div>
          ${doc.deposit.on ? field(t("ed.depositType"), "deposit.type", { options: [["percent", t("ed.percent")], ["amount", t("ed.fixedAmount")]] }) + field(t("ed.depositValue"), "deposit.value", { kind: "num" }) : ""}
          ${isInv ? `<div class="span2">${toggle(t("ed.lateOn"), "lateFee.on", { hint: t("ed.lateHint"), rerender: "payment" })}</div>
          ${doc.lateFee.on ? field(t("ed.lateType"), "lateFee.type", { options: [["percent", t("ed.percentOfUnpaid")], ["amount", t("ed.fixedAmount")]] }) + field(t("ed.lateValue"), "lateFee.value", { kind: "num" }) + field(t("ed.graceDays"), "lateFee.graceDays", { kind: "int" }) + field(t("ed.lateRepeat"), "lateFee.repeat", { options: [["once", t("ed.once")], ["monthly", t("ed.every30")]] }) : ""}` : ""}`, doc.deposit.on || doc.lateFee.on) : ""}
        ${payable ? details(t("ed.payOnline"), `
          ${providerField()}
          ${field(t("ed.payLink"), "payLink", { type: "url", placeholder: "https://", hint: t("ed.payLinkHint"), kind: "url" })}
          <div class="span2">${toggle(t("ed.showQr"), "show.qr")}</div>`, !!(doc.payLink || doc.payProvider)) : ""}
        <div class="ed-grid">
          ${ty !== "receipt" && ty !== "deliveryNote" ? field(t(ty === "purchaseOrder" ? "ed.orderTerms" : "ed.payInstructions"), "terms", { textarea: true, rows: 3, span: true, placeholder: ty === "purchaseOrder" ? "" : t("ed.payInstructionsPh") }) : ""}
          ${field(t("ed.notes"), "notes", { textarea: true, rows: 3, span: true })}
          ${field(t("ed.footer"), "footer", { span: true, max: 300 })}
        </div>${pays}`;
    }
    case "brand": return brandBody();
    case "layout":
      return `<div class="ed-grid">
          <div class="span2">${toggle(t("ed.watermarkOn"), "watermark.on", { rerender: "layout" })}</div>
          ${doc.watermark.on ? field(t("ed.watermarkText"), "watermark.text", { span: true, max: 40, placeholder: dl(doc.lang, "wmDraft"), hint: t("ed.watermarkHint") }) : ""}
          ${field(t("ed.paper"), "paper", { options: Object.keys(PAPERS).map(p => [p, `${p} · ${paperOf(p).join(" × ")} mm`]) })}
          <div class="span2 ed-switches">
            ${toggle(t("ed.showBillTo"), "show.billTo")}${toggle(t("ed.showWords"), "show.words", { hint: t("ed.showWordsHint") })}
          </div>
        </div>`;
    case "recurring":
      return `<div class="ed-grid">
          <div class="span2">${toggle(t("ed.recurOn"), "recurring.on", { hint: t("ed.recurHint"), rerender: "recurring" })}</div>
          ${doc.recurring.on ? `
            ${field(t("ed.recurEvery"), "recurring.every", { kind: "int" })}
            ${field(t("ed.recurUnit"), "recurring.unit", { options: ["week", "month", "year"].map(u => [u, t(`ed.unit.${u}`)]) })}
            ${field(t("ed.recurNext"), "recurring.next", { type: "date", kind: "date" })}
            ${field(t("ed.recurEnd"), "recurring.end", { type: "date", kind: "date", hint: t("ed.recurEndHint") })}` : ""}
        </div>`;
  }
  return "";
}

function itemsBody() {
  const cols = doc.columns;
  const lopt = lineOptions(cols);
  // Every column except Description and Amount gets a box on each line, in column order.
  // Price is always shown here (the amount needs it), even when hidden on the document.
  const noPrices = doc.type === "deliveryNote";
  const boxes = cols.filter(c => c.id !== "desc" && c.id !== "amount" && (c.on || c.id === "rate") && !(noPrices && ["rate", "disc", "tax"].includes(c.id)));
  const cards = doc.items.map((it, i) => {
    const p = `items.${i}`;
    const box = c => {
      if (c.id === "qty") return itemNum(colName(c), `${p}.qty`, numStr(it.qty), "num");
      if (c.id === "rate") return itemNum(colName(c), `${p}.rate`, numStr(it.rate), "num", curSymbol());
      if (c.id === "sku" || c.id === "unit") return itemNum(colName(c), `${p}.${c.id}`, it[c.id], "text");
      if (c.id === "disc" || c.id === "tax") return itemNum(colName(c), `${p}.${c.id}`, numStr(it[c.id]), "num");
      return itemNum(colName(c), `${p}.cells.${c.id}`, (it.cells || {})[c.id] ?? "", c.role === "number" ? "cellnum" : "text");
    };
    return `<div class="item-card" data-item="${i}">
      <div class="item-top">
        <label class="visually-hidden" for="${fid(p + ".desc")}">${esc(t("ed.itemDesc", { n: i + 1 }))}</label>
        <input class="input" id="${fid(p + ".desc")}" data-f="${p}.desc" data-k="text" data-desc="${i}" value="${esc(it.desc)}" placeholder="${esc(t("ed.descPh"))}" autocomplete="off" dir="auto" enterkeyhint="next">
        <button type="button" class="icon-btn" data-act="del-item" data-i="${i}" aria-label="${esc(t("ed.removeItem", { n: i + 1 }))}">${icon("trash-2", 18)}</button>
      </div>
      <div class="item-grid">
        ${boxes.map(box).join("")}
        ${noPrices ? "" : `<div class="field"><span class="label">${esc(colName(cols.find(c => c.id === "amount")))}</span><output class="item-amt num" data-amt="${i}"><bdi class="ltr">${esc(dmoney(lineAmount(it, decimalsOf(doc.currency), lopt)))}</bdi></output></div>`}
      </div>
      ${it.details || it._details ? `<div class="field"><label for="${fid(p + ".details")}">${esc(t("ed.details"))}</label><textarea class="input textarea" rows="2" id="${fid(p + ".details")}" data-f="${p}.details" data-k="text" dir="auto">${esc(it.details)}</textarea></div>`
        : `<button type="button" class="link-btn" data-act="add-details" data-i="${i}">${icon("plus", 16)}${esc(t("ed.addDetails2"))}</button>`}
    </div>`;
  }).join("");
  return `<div class="items">${cards}</div>
    <button type="button" class="btn add-item" data-act="add-item">${icon("plus", 18)}${esc(t("ed.addItem"))}</button>
    <div class="ed-actions-row">
      <button type="button" class="btn btn-outline" data-act="columns" aria-haspopup="dialog">${icon("columns-3", 18)}${esc(t("ed.columns"))}</button>
      <button type="button" class="btn btn-outline" data-act="pick-item" aria-haspopup="dialog">${icon("files", 18)}${esc(t("ed.savedItems"))}</button>
      <button type="button" class="btn btn-outline" data-act="import-items" aria-haspopup="dialog">${icon("upload", 18)}${esc(t("ed.importItems"))}</button>
    </div>
    ${doc.items.length > 1 ? `<button type="button" class="link-btn danger-text clear-items" data-act="clear-items">${icon("trash-2", 16)}${esc(t("ed.clearItems"))}</button>` : ""}`;
}
// A column's name in the editor: the name typed in Columns, or the standard one.
function colName(c) {
  if (c.label.trim()) return c.label.trim();
  return { desc: t("ed.descShort"), qty: t("ed.qty"), rate: t("ed.rate"), amount: t("ed.amount"), sku: t("ed.sku"), unit: t("ed.unit"), disc: t("col.disc"), tax: t("col.tax") }[c.id] || t(c.role === "number" ? "col.number" : "col.text");
}
function itemNum(label, path, value, kind, affix = "") {
  const num = kind === "num" || kind === "cellnum";
  const input = `<input class="input${num ? " num" : ""}" id="${fid(path)}" data-f="${path}" data-k="${kind === "cellnum" ? "text" : kind}" value="${esc(value)}"${num ? ' inputmode="decimal"' : ""} autocomplete="off" dir="${num ? "ltr" : "auto"}">`;
  // The currency symbol sits inside the price box (always on the left, like the number).
  const box = affix ? `<div class="affix-wrap" dir="ltr" style="--affix:${[...affix].length + 1}ch"><span class="affix" aria-hidden="true">${esc(affix)}</span>${input}</div>` : input;
  return `<div class="field"><label for="${fid(path)}">${esc(label)}${affix ? `<span class="visually-hidden"> (${esc(doc.currency)})</span>` : ""}</label>${box}</div>`;
}
function curSymbol() { const c = CURRENCIES.find(r => r[0] === doc.currency); return c ? c[1] : doc.currency; }

function paymentsList() {
  const tt = totals(doc);
  const rows = doc.payments.map(p => `<li class="pay-row"><span><bdi>${esc(formatDate(p.date, settings().dateFormat, getLanguage()))}</bdi>${p.method ? ` · ${esc(p.method)}` : ""}${p.note ? ` · ${esc(p.note)}` : ""}</span>
      <span class="num"><bdi class="ltr">${esc(dmoney(p.amount))}</bdi></span>
      <button type="button" class="icon-btn" data-act="del-payment" data-id="${esc(p.id)}" aria-label="${esc(t("ed.removePayment"))}">${icon("x", 18)}</button></li>`).join("");
  // Issued credit notes for this invoice (open them to change or cancel).
  const credits = (getDoc(doc.id) || doc).credits || [];
  const crows = credits.map(c => `<li class="pay-row"><span><a href="#/edit/${encodeURIComponent(c.id)}">${esc(t("type.creditNote"))} <bdi class="ltr">${esc(c.no)}</bdi></a> · <bdi>${esc(formatDate(c.date, settings().dateFormat, getLanguage()))}</bdi></span>
      <span class="num"><bdi class="ltr">−${esc(dmoney(c.amount))}</bdi></span></li>`).join("");
  return `<div class="ed-payments"><h3 class="eyebrow">${esc(t("ed.payments"))}</h3>
    ${rows ? `<ul class="pay-list">${rows}</ul>` : `<p class="hint">${esc(t("ed.noPayments"))}</p>`}
    ${crows ? `<h3 class="eyebrow">${esc(t("ed.credits"))}</h3><ul class="pay-list">${crows}</ul>` : ""}
    <p class="pay-sum">${esc(t("ed.balanceNow"))}: <strong><bdi class="ltr">${esc(dmoney(tt.balance))}</bdi></strong></p>
    ${tt.refundDue > 0 ? `<p class="hint">${esc(t("ed.refundDue", { amount: dmoney(tt.refundDue) }))}</p>` : ""}
    ${tt.balance > 0 ? `<button type="button" class="btn btn-outline" data-act="payment">${icon("banknote", 18)}${esc(t("docs.act.recordPayment"))}</button>` : ""}</div>`;
}

function brandBody() {
  const sig = doc.signature, logo = doc.business.logo;
  const fonts = SIGNATURE_FONTS.map(f => `<button type="button" class="sig-font" role="radio" aria-checked="${sig.font === f}" data-sigfont="${esc(f)}" aria-label="${esc(f)}"><span style="font-family:'${esc(f)}',cursive" dir="auto">${esc(sig.text.trim() || doc.business.name || t("ed.yourName"))}</span></button>`).join("");
  return `<div class="ed-stack">
    <div class="ed-sub"><h3 class="eyebrow">${esc(t("ed.logo"))}</h3>
      <div class="ed-actions-row">
        <label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t(logo ? "ed.replaceLogo" : "ed.uploadLogo"))}</span><input type="file" accept="image/*" data-act="logo-file" class="visually-hidden"></label>
        ${logo ? `<button type="button" class="btn btn-ghost" data-act="remove-logo">${icon("trash-2", 18)}${esc(t("ed.removeLogo"))}</button>` : ""}
      </div>
      ${logo ? `<div class="field"><label for="f-logoSize">${esc(t("ed.logoSize"))}</label><input type="range" min="24" max="140" step="2" id="f-logoSize" data-f="logoSize" data-k="int" value="${doc.logoSize}"></div>` : ""}
      <p class="hint">${esc(t("ed.logoHint"))}</p>
    </div>
    <div class="ed-sub"><h3 class="eyebrow">${esc(t("ed.signature"))}</h3>
      ${toggle(t("ed.sigOn"), "signature.on", { rerender: "brand" })}
      ${sig.on ? `${seg(t("ed.sigMode"), "signature.mode", [["type", t("ed.sigType")], ["draw", t("ed.sigDraw")], ["image", t("ed.sigUpload")]], "brand")}
        ${sig.mode === "type" ? `${field(t("ed.sigName"), "signature.text", { max: 80, placeholder: t("ed.yourName") })}
          <div class="sig-fonts" role="radiogroup" aria-label="${esc(t("ed.sigStyle"))}">${fonts}</div>` : ""}
        ${sig.mode === "draw" ? `<div class="sig-pad-wrap"><canvas class="sig-pad" id="sigPad" aria-label="${esc(t("ed.sigPadLabel"))}" role="img"></canvas></div>
          <div class="ed-actions-row"><button type="button" class="btn btn-outline" data-act="sig-clear">${esc(t("ed.sigClear"))}</button><button type="button" class="btn btn-primary" data-act="sig-use">${esc(t("ed.sigUse"))}</button></div>
          ${sig.img ? `<p class="hint">${esc(t("ed.sigSaved"))}</p>` : ""}` : ""}
        ${sig.mode === "image" ? `<div class="ed-actions-row"><label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t("ed.sigUploadBtn"))}</span><input type="file" accept="image/*" data-act="sig-file" class="visually-hidden"></label></div>
          ${sig.img ? `<img class="sig-thumb" src="${esc(sig.img)}" alt="${esc(t("ed.signature"))}">` : ""}` : ""}` : ""}
    </div>
  </div>`;
}

/* ---------------- shell ---------------- */
function shell() {
  return `<div class="ed" data-view="${view}">
    <header class="ed-bar">
      <a class="icon-btn" href="#/documents" aria-label="${esc(t("ed.back"))}">${icon("arrow-left")}</a>
      <div class="ed-titles">
        <h1 class="ed-title" id="pageTitle" tabindex="-1" dir="auto">${titleHtml()}</h1>
        <p class="ed-status" id="edStatus" aria-live="polite"></p>
      </div>
      <div class="ed-tools">
        <button type="button" class="icon-btn hide-xs" data-act="undo" aria-label="${esc(t("ed.undo"))}" aria-keyshortcuts="Control+Z" disabled>${icon("undo-2")}</button>
        <button type="button" class="icon-btn hide-sm flip" data-act="redo" aria-label="${esc(t("ed.redo"))}" aria-keyshortcuts="Control+Shift+Z" disabled>${icon("undo-2")}</button>
        <button type="button" class="btn btn-outline tool-btn" data-act="design" aria-haspopup="dialog">${icon("layout-template", 18)}<span class="tool-label">${esc(t("ed.design"))}</span></button>
        <button type="button" class="btn btn-outline tool-btn" data-act="pdf">${icon("download", 18)}<span class="tool-label">PDF</span></button>
        <button type="button" class="icon-btn outline" data-act="more" aria-haspopup="dialog" aria-label="${esc(t("ed.moreActions"))}">${icon("ellipsis")}</button>
        <button type="button" class="btn btn-primary tool-btn" data-act="send" aria-haspopup="dialog">${icon("send", 18)}<span class="tool-label">${esc(t("ed.send"))}</span></button>
      </div>
    </header>
    <div class="ed-tabs" role="tablist" aria-label="${esc(t("ed.viewLabel"))}">
      <button type="button" class="chip" role="tab" id="tabForm" aria-controls="edFormPanel" aria-selected="${view === "form"}" data-view="form">${esc(t("ed.form"))}</button>
      <button type="button" class="chip" role="tab" id="tabPrev" aria-controls="edPreview" aria-selected="${view === "preview"}" data-view="preview">${esc(t("ed.preview"))}</button>
    </div>
    <div class="ed-body">
      <div class="ed-form-wrap" id="edFormPanel" role="tabpanel" aria-labelledby="tabForm"><form class="ed-form" id="edForm" novalidate autocomplete="off" aria-label="${esc(t("ed.form"))}">
        ${formHtml()}
      </form></div>
      <div class="ed-preview" id="edPreview" role="tabpanel" aria-labelledby="tabPrev">
        <div class="ed-paper-wrap"><div class="ed-paper" id="docPreview" aria-label="${esc(t("ed.preview"))}"></div></div>
        ${settings().editMode ? `<p class="hint ed-edit-hint">${esc(t("ed.editModeHint"))}</p>` : ""}
      </div>
    </div>
    <div class="ed-totalbar" id="edTotalBar"${doc.type === "deliveryNote" ? " hidden" : ""}>
      <span class="tb-text"><span class="tb-label" id="tbLabel"></span><bdi class="tb-amt num ltr" id="tbAmt"></bdi></span>
      <button type="button" class="btn btn-outline tb-prev" data-act="to-preview">${icon("eye", 18)}${esc(t("ed.preview"))}</button>
    </div>
  </div>`;
}
// Logo, layout and recurring are needed less often: they sit behind "More options",
// which stays open once opened (or while one of those sections is open).
const MORE_SECS = ["brand", "layout", "recurring"];
const MORE_KEY = "invogen.edMoreOpen";
const moreShown = () => MORE_SECS.some(id => open.has(id)) || safeGet(MORE_KEY) === "1";
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function formHtml() {
  const list = sections();
  const num = id => list.findIndex(x => x[0] === id) + 1;
  const main = list.filter(([id]) => !MORE_SECS.includes(id)), extra = list.filter(([id]) => MORE_SECS.includes(id));
  const shown = moreShown();
  return main.map(([id, title]) => sectionHtml(id, title, num(id))).join("") + (extra.length ? `
    <button type="button" class="ed-more-secs" data-act="more-secs" aria-expanded="${shown}" aria-controls="edMoreSecs">
      <span class="mi-text"><span>${esc(t("ed.moreOptions"))}</span><span class="hint">${esc(extra.map(x => x[1]).join(" · "))}</span></span>${icon("chevron-down", 18)}</button>
    <div class="ed-more-wrap" id="edMoreSecs"${shown ? "" : " hidden"}>${extra.map(([id, title]) => sectionHtml(id, title, num(id))).join("")}</div>` : "");
}
function toggleMoreSecs() {
  const wrap = root.querySelector("#edMoreSecs"), btn = root.querySelector('[data-act="more-secs"]');
  if (!wrap || !btn) return;
  const show = wrap.hidden;
  wrap.hidden = !show;
  btn.setAttribute("aria-expanded", String(show));
  safeSet(MORE_KEY, show ? "1" : "0");
  if (!show) {                       // closing the group also closes its sections
    MORE_SECS.forEach(id => { if (open.has(id)) { open.delete(id); renderSection(id); } });
    saveOpen();
  }
}

function sectionHtml(id, title, n) {
  const isOpen = open.has(id);
  return `<section class="ed-sec${isOpen ? " is-open" : ""}" data-sec="${id}">
    <h2 class="ed-sec-h"><button type="button" class="ed-sec-btn" aria-expanded="${isOpen}" aria-controls="secb-${id}" data-toggle="${id}">
      <span class="ed-num" aria-hidden="true">${n}</span><span class="ed-sec-title">${esc(title)}</span>
      <span class="ed-sum" data-sum="${id}" dir="auto">${isOpen ? "" : esc(summary(id))}</span>${icon("chevron-down", 18)}</button></h2>
    <div class="ed-sec-body" id="secb-${id}"${isOpen ? "" : " hidden"}>${isOpen ? body(id) : ""}</div>
  </section>`;
}

/* ---------------- rendering ---------------- */
function renderSection(id) {
  const sec = root.querySelector(`[data-sec="${id}"]`);
  if (!sec) return;
  const focusId = document.activeElement && sec.contains(document.activeElement) ? document.activeElement.id : "";
  const segFocus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.val : null;
  const n = sections().findIndex(s => s[0] === id) + 1;
  const title = sections().find(s => s[0] === id)[1];
  const openMore = [...sec.querySelectorAll("details")].map(d => d.open);   // keep "more options" open
  sec.outerHTML = sectionHtml(id, title, n);
  root.querySelectorAll(`[data-sec="${id}"] details`).forEach((d, i) => { if (openMore[i]) d.open = true; });
  enhancePickers(root.querySelector(`[data-sec="${id}"]`));   // so focus can return to a drop-down or date field
  afterSectionRender(id);
  if (focusId) { const el = root.querySelector("#" + CSS.escape(focusId)); if (el) el.focus(); }
  else if (segFocus != null) { const el = root.querySelector(`[data-sec="${id}"] [data-val="${CSS.escape(segFocus)}"]`); if (el) el.focus(); }
}
function renderForm() {
  const form = root.querySelector("#edForm");
  form.innerHTML = formHtml();
  open.forEach(afterSectionRender);
}
function afterSectionRender(id) {
  // Typing a client name suggests matching saved clients (styled like the drop-downs).
  if (id === "client") attachSuggest(root.querySelector("#f-client-name"), {
    label: t("ed.chooseClient"),
    items: () => getState().clients.map(c => ({ id: c.id, label: c.name, sub: c.email || c.phone || "" })),
    onPick: cid => {
      const c = getState().clients.find(x => x.id === cid);
      if (!c) return;
      fillClient(c);
      renderSection("client"); changed();
    }
  });
  // Typing an item description suggests matching saved items; picking one fills its price.
  if (id === "items" && getState().products.length) root.querySelectorAll("[data-desc]").forEach(inp => {
    const i = +inp.dataset.desc;
    attachSuggest(inp, {
      label: t("ed.savedItems"),
      items: () => getState().products.map(p => ({ id: p.id, label: p.desc, sub: [p.unit, dmoney(p.rate)].filter(Boolean).join(" · ") })),
      onPick: pid => {
        const p = getState().products.find(x => x.id === pid), it = doc.items[i];
        if (!p || !it) return;
        Object.assign(it, { desc: p.desc, rate: p.rate, unit: p.unit || it.unit, sku: p.sku || it.sku });
        renderSection("items"); changed();
        const q = root.querySelector(`#${fid(`items.${i}.qty`)}`) || root.querySelector(`#${fid(`items.${i}.rate`)}`);
        if (q) q.focus();
      }
    });
  });
  if (id === "brand" && doc.signature.on && doc.signature.mode === "draw") {
    const c = root.querySelector("#sigPad");
    if (pad) pad.destroy();
    pad = c ? signaturePad(c) : null;
  }
}
function refreshSummaries() {
  root.querySelectorAll("[data-sum]").forEach(el => {
    const id = el.dataset.sum;
    if (!open.has(id)) el.textContent = summary(id);
  });
  const ttl = root.querySelector("#pageTitle");
  if (ttl) ttl.innerHTML = titleHtml();
  renderTotalBar();
}
// Phones and tablets: the total stays in view at the bottom of the form.
function renderTotalBar() {
  const bar = root && root.querySelector("#edTotalBar");
  if (!bar) return;
  bar.hidden = doc.type === "deliveryNote";
  if (bar.hidden) return;
  const tt = totals(doc);
  const owing = doc.type === "invoice" && (tt.paid || tt.credited);
  bar.querySelector("#tbLabel").textContent = t(owing ? "ed.bar.balance" : "ed.bar.total");
  bar.querySelector("#tbAmt").textContent = dmoney(owing ? tt.balance : tt.total);
}
// "Invoice · Client". Small phones show only the client; the type stays for screen readers.
function titleHtml() {
  return `<span class="ed-title-type">${esc(typeName(doc.type))} · </span>${esc(doc.client.name || t("ed.newClient"))}`;
}
function refreshAmounts() {
  const d = decimalsOf(doc.currency);
  root.querySelectorAll("[data-amt]").forEach(o => {
    const it = doc.items[+o.dataset.amt];
    if (it) o.innerHTML = `<bdi class="ltr">${esc(dmoney(lineAmount(it, d, lineOptions(doc.columns))))}</bdi>`;
  });
}

let pvFrame = 0;
function schedulePreview() {
  cancelAnimationFrame(pvFrame);
  pvFrame = requestAnimationFrame(renderPreview);
}
function renderPreview() {
  const host = root && root.querySelector("#docPreview");
  if (!host) return;
  if (host.contains(document.activeElement) && document.activeElement.hasAttribute("data-edit")) return; // don't disturb inline typing
  host.innerHTML = renderDocument(doc, { editable: !!settings().editMode, placeholders: { biz: t("ed.bizPh"), client: t("ed.clientPh") } });
  fitPreview();
}
// The on-screen preview reflows to the space available (like the design); Print and
// PDF always use the real paper width. Nothing to measure, so this is a no-op hook.
function fitPreview() {}
function renderStatus() {
  const el = root && root.querySelector("#edStatus");
  if (!el) return;
  const st = statusOf(doc);
  const msg = saveState === "saving" ? t("ed.saving") : saveState === "error" ? t("ed.saveError") : isNew && !dirty ? t("ed.notSaved") : t("ed.saved");
  el.innerHTML = `<span class="dot${saveState === "saved" && !(isNew && !dirty) ? " on" : ""}" aria-hidden="true"></span>${esc(msg)} · ${esc(t(`status.${st}`))}`;
}
function renderUndo() {
  const u = root.querySelector('[data-act="undo"]'), r = root.querySelector('[data-act="redo"]');
  if (u) u.disabled = !past.length;
  if (r) r.disabled = !future.length;
}

/* ---------------- changes, history, saving ---------------- */
const snapshot = () => JSON.stringify(doc);
const commitHistory = debounce(() => {
  const s = snapshot();
  if (s === lastSnap) return;
  past.push(lastSnap); if (past.length > 60) past.shift();
  future = []; lastSnap = s; renderUndo();
}, 450);

const persist = debounce(() => {
  saveState = "saving"; renderStatus();
  try {
    const saved = saveDoc(doc);
    if (isNew) {
      isNew = false;
      history.replaceState(null, "", `#/edit/${encodeURIComponent(saved.id)}`);
    }
    saveState = "saved";
  } catch (e) { console.error(e); saveState = "error"; }
  renderStatus();
}, 350);

function changed({ rerender, path } = {}) {
  dirty = true;
  if (rerender === "all") { renderForm(); }
  else if (rerender) renderSection(rerender);
  refreshSummaries();
  refreshAmounts();
  if (path && open.has("payment") && /^(items|tax|discount|shipping|deposit|lateFee|currency|tax2)/.test(path)) {
    const pl = root.querySelector(".ed-payments");
    if (pl) pl.outerHTML = paymentsList();
  }
  schedulePreview();
  renderStatus();
  commitHistory();
  persist();
}
function flushNow() {
  commitHistory.cancel && commitHistory.cancel();
  if (dirty && (persist.cancel)) { persist.cancel(); }
  if (dirty) {
    try { const saved = saveDoc(doc); if (isNew) { isNew = false; history.replaceState(null, "", `#/edit/${encodeURIComponent(saved.id)}`); } saveState = "saved"; }
    catch { saveState = "error"; }
  }
}

function applyValue(path, raw, kind) {
  let v = raw;
  if (kind === "num") v = raw === "" ? 0 : parseNumber(raw);
  else if (kind === "int") v = Math.max(0, Math.round(parseNumber(raw)));
  else if (kind === "terms") v = raw === "" ? "" : Number(raw);
  const before = getPath(doc, path);
  if (path === "qty" || /\.qty$/.test(path)) v = raw === "" ? "" : parseNumber(raw);
  if (kind === "status") return applyStatus(raw, before);
  setPath(doc, path, v);
  if (path === "sourceId") {
    // Linking a credit note to an invoice: same client and currency, and its number as reference.
    const inv = getDoc(v);
    if (inv) {
      doc.reference = inv.no;
      doc.currency = inv.currency;
      if (!doc.client.name.trim()) doc.client = { ...inv.client };
    }
  }

  // Side effects
  if (path === "termsDays" && v !== "") doc.due = addDays(doc.issued, v);
  if (path === "issued") {
    if (doc.type === "invoice" && doc.termsDays !== "") doc.due = addDays(v, doc.termsDays);
    else if (doc.due && before) doc.due = addDays(v, Math.max(0, daysBetween(before, doc.due)));
    const due = root.querySelector("#f-due"); if (due) due.value = doc.due;
  }
  if (path === "due" && doc.type === "invoice") {
    const n = daysBetween(doc.issued, v);
    doc.termsDays = TERMS.includes(n) && n !== "" ? n : "";
    const ts = root.querySelector("#f-termsDays"); if (ts) ts.value = String(doc.termsDays);
  }
  if (path === "termsDays") { const due = root.querySelector("#f-due"); if (due) due.value = doc.due; }
  if (path.startsWith("business.")) setSettings({ business: { ...settings().business, [path.split(".")[1]]: v } }, "ui");
  if (path === "recurring.on" && v && !doc.recurring.next) doc.recurring.next = nextRecurDate();
  if (path === "type") onTypeChange(before);
  if (path.startsWith("client.")) syncClientBtn();
}

function applyStatus(v, before) {
  const prev = { status: doc.status, payments: structuredClone(doc.payments) };
  if (v === "paid" && doc.type === "invoice") {
    const owed = totals(doc).balance;
    if (owed > 0) doc.payments.push({ id: uid(), date: todayISO(), amount: owed, method: "", note: "" });
    doc.status = "paid";
  } else {
    if (before === "paid" && doc.type === "invoice") doc.payments = [];
    doc.status = v;
    if ((v === "sent" || v === "issued") && !doc.sentAt) doc.sentAt = Date.now();
  }
  if (prev.payments.length !== doc.payments.length) toast(t(v === "paid" ? "docs.toast.markedPaid" : "docs.toast.markedUnpaid", { doc: `${typeName(doc.type)} ${doc.no}` }), {
    action: t("common.undo"), onAction: () => { doc.status = prev.status; doc.payments = prev.payments; renderForm(); changed(); }
  });
  if (open.has("payment")) renderSection("payment");
}

function onTypeChange(prevType) {
  const ty = doc.type;
  // Remember each type's number so switching back and forth never skips numbers.
  typeNos[prevType] = typeNos[prevType] || doc.no;
  doc.no = typeNos[ty] || nextNumber(ty).no;
  doc.status = ty === "receipt" ? "paid" : "draft";
  if (NO_DUE_TYPES.includes(ty)) doc.due = "";
  else if (!doc.due) doc.due = addDays(doc.issued, QUOTE_TYPES.includes(ty) ? settings().estimateValidDays : settings().termsDays);
  if (ty !== "invoice") { doc.termsDays = ""; doc.lateFee.on = false; doc.recurring.on = false; }
  else if (prevType !== "invoice") doc.termsDays = settings().termsDays;
  if (!PAYABLE.includes(ty)) doc.deposit.on = false;
  if (ty !== "creditNote" && prevType === "creditNote") doc.sourceId = "";
}
function nextRecurDate() {
  const u = doc.recurring.unit, n = doc.recurring.every || 1;
  const d = new Date(doc.issued + "T00:00:00");
  if (u === "week") d.setDate(d.getDate() + 7 * n); else if (u === "year") d.setFullYear(d.getFullYear() + n); else d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------------- client helpers ---------------- */
function matchingClient() {
  const c = doc.client;
  const cl = getState().clients;
  return (c.id && cl.find(x => x.id === c.id)) || cl.find(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase() && c.name.trim()) || null;
}
function clientBtnLabel() {
  const m = matchingClient(), c = doc.client;
  if (!m) return t("ed.saveClient");
  const same = ["name", "contact", "email", "phone", "address", "taxId"].every(k => (m[k] || "") === (c[k] || ""));
  return same ? t("ed.clientSaved") : t("ed.updateClient");
}
// "Save as client" appears once a client name is typed; it reads "Saved client" (and
// does nothing) while the details match the saved client.
function clientIsSaved() {
  const m = matchingClient(), c = doc.client;
  return !!m && ["name", "contact", "email", "phone", "address", "taxId"].every(k => (m[k] || "") === (c[k] || ""));
}
function syncClientBtn() {
  const btn = root.querySelector("#saveClientBtn");
  if (!btn) return;
  const saved = clientIsSaved();
  btn.hidden = !doc.client.name.trim();
  if (saved) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
  btn.innerHTML = `${icon(saved ? "check" : "plus", 18)}<span>${esc(clientBtnLabel())}</span>`;
}
function fillClient(c) {
  doc.client = { id: c.id, name: c.name, contact: c.contact || "", email: c.email || "", phone: c.phone || "", address: c.address || "", taxId: c.taxId || "" };
}

/* ---------------- events ---------------- */
function onInput(e) {
  const el = e.target;
  if (el.closest("#docPreview")) return onInlineEdit(e);
  if (!el.matches("[data-f]")) return;
  const k = el.dataset.k;
  if (k === "bool" || el.tagName === "SELECT" || k === "date") return; // handled on change
  applyValue(el.dataset.f, el.value, k);
  changed({ path: el.dataset.f });
}
function onChange(e) {
  const el = e.target;
  if (el.matches("[data-pick]")) return onPick(el);
  if (el.matches('[data-act="logo-file"]')) return onLogoFile(el);
  if (el.matches('[data-act="sig-file"]')) return onSigFile(el);
  if (!el.matches("[data-f]")) return;
  const k = el.dataset.k;
  if (k === "bool") applyValue(el.dataset.f, el.checked, "bool");
  else if (el.tagName === "SELECT" || k === "date") applyValue(el.dataset.f, el.value, k);
  else return; // text inputs already applied on input
  changed({ rerender: el.dataset.rerender || (el.dataset.f === "currency" ? "items" : null), path: el.dataset.f });
}

function onInlineEdit(e) {
  const el = e.target.closest("[data-edit]");
  if (!el) return;
  const path = el.dataset.edit;
  setPath(doc, path, el.innerText.replace(/\n+$/, ""));
  const input = root.querySelector(`[data-f="${CSS.escape(path)}"]`);
  if (input) input.value = getPath(doc, path);
  dirty = true; refreshSummaries(); renderStatus(); commitHistory(); persist();
}

async function onClick(e) {
  const tg = e.target.closest("[data-toggle]");
  if (tg) { toggleSection(tg.dataset.toggle); return; }
  const sg = e.target.closest("[data-seg]");
  if (sg) {
    const path = sg.dataset.seg, val = sg.dataset.val;
    if (getPath(doc, path) === val) return;
    applyValue(path, val, "text");
    changed({ rerender: sg.dataset.rerender, path });
    return;
  }
  const sf = e.target.closest("[data-sigfont]");
  if (sf) {
    doc.signature.font = sf.dataset.sigfont;
    root.querySelectorAll("[data-sigfont]").forEach(b => b.setAttribute("aria-checked", String(b === sf)));
    changed({ path: "signature.font" });
    return;
  }
  const v = e.target.closest(".ed-tabs [data-view]");
  if (v) { setView(v.dataset.view); return; }
  const b = e.target.closest("[data-act]");
  if (!b || b.matches("input")) return;
  const act = b.dataset.act;
  switch (act) {
    case "undo": return undo();
    case "redo": return redo();
    case "design": return openDesign();
    case "columns": return openColumns();
    case "pdf": return pdfButton();
    case "more": return openMore();
    case "more-secs": return toggleMoreSecs();
    case "to-preview": setView("preview"); root.querySelector("#tabPrev").focus(); return;
    case "send": return openSend();
    case "add-item": return addItem();
    case "del-item": return delItem(+b.dataset.i);
    case "add-details": doc.items[+b.dataset.i]._details = true; renderSection("items"); { const ta = root.querySelector(`#${fid(`items.${b.dataset.i}.details`)}`); if (ta) ta.focus(); } return;
    case "clear-items": return clearItems();
    case "pick-item": return pickItem();
    case "import-items": return importItems();
    case "pick-client": return pickClient();
    case "save-client": return saveAsClient();
    case "payment": flushNow(); return openPaymentSheet(doc.id, { onDone: reloadFromState });
    case "del-payment": {
      const idx = doc.payments.findIndex(p => p.id === b.dataset.id);
      if (idx < 0) return;
      const [p] = doc.payments.splice(idx, 1);
      const prevStatus = doc.status;
      if (doc.status === "paid") doc.status = "sent";
      renderSection("payment"); changed();
      toast(t("ed.paymentRemoved"), { action: t("common.undo"), onAction: () => { doc.payments.splice(idx, 0, p); doc.status = prevStatus; renderSection("payment"); changed(); } });
      return;
    }
    case "remove-logo": doc.business.logo = ""; setSettings({ business: { ...settings().business, logo: "" } }, "ui"); renderSection("brand"); return changed();
    case "sig-clear": if (pad) pad.clear(); return;
    case "sig-use": {
      const url = pad ? pad.toDataURL() : "";
      if (!url) { toast(t("ed.sigEmpty")); return; }
      doc.signature.img = url; renderSection("brand"); changed(); toast(t("ed.sigSavedToast")); return;
    }
  }
}

function onFocusIn(e) {
  // Number fields: select the value so typing replaces a 0 straight away.
  if (e.target.matches('input[data-k="num"], input[data-k="int"]')) setTimeout(() => { try { e.target.select(); } catch {} }, 0);
}

function onKeydown(e) {
  // Enter in the last item description adds a new item
  if (e.key === "Enter" && e.target.matches("[data-desc]")) {
    e.preventDefault();
    const i = +e.target.dataset.desc;
    if (i === doc.items.length - 1) addItem();
    else { const nx = root.querySelector(`[data-desc="${i + 1}"]`); if (nx) nx.focus(); }
    return;
  }
  // Arrow keys move between segmented options (radiogroup pattern)
  if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.target.matches("[data-seg], [data-sigfont]")) {
    const group = [...e.target.parentElement.querySelectorAll("button")];
    const dir = (e.key === "ArrowRight") !== (document.dir === "rtl") ? 1 : -1;
    const nx = group[(group.indexOf(e.target) + dir + group.length) % group.length];
    nx.focus(); nx.click(); e.preventDefault();
  }
  if (e.key === "Enter" && e.target.matches("#edForm input:not([data-desc])")) e.preventDefault(); // never submit the form
}

function toggleSection(id) {
  if (open.has(id)) open.delete(id); else open.add(id);
  saveOpen();
  renderSection(id);
  const btn = root.querySelector(`[data-toggle="${id}"]`); if (btn) btn.focus();
}
export function setView(v) {
  view = v;
  const ed = root.querySelector(".ed");
  ed.dataset.view = v;
  root.querySelectorAll(".ed-tabs [data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
  if (v === "preview") requestAnimationFrame(fitPreview);
}

function undo() {
  commitHistory.cancel(); { const s = snapshot(); if (s !== lastSnap) { past.push(lastSnap); lastSnap = s; } }
  if (!past.length) return;
  future.push(lastSnap);
  lastSnap = past.pop();
  doc = normalizeDoc(JSON.parse(lastSnap));
  renderForm(); renderUndo(); schedulePreview(); dirty = true; persist(); refreshSummaries();
}
function redo() {
  if (!future.length) return;
  past.push(lastSnap);
  lastSnap = future.pop();
  doc = normalizeDoc(JSON.parse(lastSnap));
  renderForm(); renderUndo(); schedulePreview(); dirty = true; persist(); refreshSummaries();
}

function reloadFromState() {
  const d = getDoc(doc.id);
  if (!d) return;
  doc = structuredClone(d);
  lastSnap = snapshot();
  renderForm(); refreshSummaries(); schedulePreview(); renderStatus();
}

/* ---------------- items ---------------- */
function addItem(it = { desc: "", qty: 1, rate: 0 }) {
  doc.items.push({ id: uid(), desc: "", details: "", sku: "", unit: "", qty: 1, rate: 0, disc: "", tax: "", cells: {}, ...it });
  if (!open.has("items")) { open.add("items"); saveOpen(); }
  renderSection("items"); changed();
  const last = root.querySelector(`[data-desc="${doc.items.length - 1}"]`); if (last) last.focus();
}
function delItem(i) {
  const [it] = doc.items.splice(i, 1);
  if (!doc.items.length) doc.items.push({ id: uid(), desc: "", details: "", sku: "", unit: "", qty: 1, rate: 0, disc: "", tax: "", cells: {} });
  renderSection("items"); changed();
  const nx = root.querySelector(`[data-desc="${Math.min(i, doc.items.length - 1)}"]`); if (nx) nx.focus();
  toast(t("ed.itemRemoved", { item: it.desc || t("ed.item") }), { action: t("common.undo"), onAction: () => {
    if (doc.items.length === 1 && !doc.items[0].desc && !Number(doc.items[0].rate)) doc.items = [];
    doc.items.splice(i, 0, it); renderSection("items"); changed();
  } });
}
async function clearItems() {
  const ok = await confirmSheet({ title: t("ed.clearTitle"), message: t("ed.clearMsg"), confirm: t("ed.clearItems"), danger: true });
  if (!ok) return;
  const prev = doc.items;
  doc.items = [{ id: uid(), desc: "", details: "", sku: "", unit: "", qty: 1, rate: 0, disc: "", tax: "", cells: {} }];
  renderSection("items"); changed();
  toast(t("ed.cleared"), { action: t("common.undo"), onAction: () => { doc.items = prev; renderSection("items"); changed(); } });
}
function pickItem() {
  const list = getState().products;
  const row = p => `<button type="button" class="menu-item" data-close="${esc(p.id)}"><span class="pick-main"><span dir="auto">${esc(p.desc)}</span>${p.unit ? `<span class="hint">${esc(p.unit)}</span>` : ""}</span><span class="end num"><bdi class="ltr">${esc(dmoney(p.rate))}</bdi></span></button>`;
  const savable = doc.items.filter(i => i.desc.trim());
  openSheet({
    title: t("ed.savedItems"),
    body: `${list.length > 6 ? `<label class="search">${icon("search")}<span class="visually-hidden">${esc(t("ed.searchItems"))}</span><input type="search" class="input" id="pickQ" placeholder="${esc(t("ed.searchItems"))}"></label>` : ""}
      <div class="menu" id="pickList">${list.length ? list.map(row).join("") : `<p class="hint">${esc(t("ed.noSavedItems"))}</p>`}</div>`,
    foot: savable.length ? `<button type="button" class="btn btn-outline" data-close="save">${icon("plus", 18)}${esc(t("ed.saveItems", { n: savable.length }))}</button>` : "",
    onOpen: dlg => {
      const q = dlg.querySelector("#pickQ");
      if (q) q.addEventListener("input", () => {
        const v = q.value.trim().toLowerCase();
        dlg.querySelector("#pickList").innerHTML = list.filter(p => p.desc.toLowerCase().includes(v) || p.sku.toLowerCase().includes(v)).map(row).join("");
      });
    },
    onClose: v => {
      if (v === "save") { saveProducts(savable.map(i => ({ desc: i.desc, rate: i.rate, unit: i.unit, sku: i.sku }))); toast(t("ed.itemsSaved", { n: savable.length })); return; }
      const p = list.find(x => x.id === v);
      if (!p) return;
      const blank = doc.items.length === 1 && !doc.items[0].desc && !Number(doc.items[0].rate);
      if (blank) doc.items = [];
      addItem({ desc: p.desc, rate: p.rate, unit: p.unit, sku: p.sku, qty: 1 });
    }
  });
}
function importItems() {
  let found = [];
  const preview = () => found.length
    ? `<p class="hint">${esc(t("ed.importFound", { n: found.length }))}</p><div class="imp-table-wrap"><table class="imp-table"><thead><tr><th>${esc(t("ed.descShort"))}</th><th>${esc(t("ed.qty"))}</th><th>${esc(t("ed.rate"))}</th></tr></thead><tbody>${found.slice(0, 50).map(i => `<tr><td dir="auto">${esc(i.desc)}</td><td class="num">${esc(formatNumber(i.qty, Number.isInteger(i.qty) ? 0 : 2))}</td><td class="num"><bdi class="ltr">${esc(dmoney(i.rate))}</bdi></td></tr>`).join("")}</tbody></table></div>`
    : "";
  openSheet({
    title: t("ed.importItems"),
    wide: true,
    body: `<p>${esc(t("ed.importIntro"))}</p>
      <div class="field"><label for="impPaste">${esc(t("ed.pasteLabel"))}</label><textarea class="input textarea mono" id="impPaste" rows="5" placeholder="${esc(t("ed.pastePh"))}"></textarea></div>
      <div class="ed-actions-row"><label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t("ed.chooseFile"))}</span><input type="file" id="impFile" class="visually-hidden" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label><span class="hint">CSV · Excel · Google Sheets</span></div>
      <p class="err" id="impErr" hidden></p>
      <div id="impPreview"></div>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="button" class="btn btn-outline" data-close="replace" id="impReplace" disabled>${esc(t("ed.importReplace"))}</button>
           <button type="button" class="btn btn-primary" data-close="add" id="impAdd" disabled>${esc(t("ed.importAdd"))}</button>`,
    onOpen: dlg => {
      const show = rows => {
        found = toItems(rows);
        dlg.querySelector("#impPreview").innerHTML = preview();
        const err = dlg.querySelector("#impErr");
        err.hidden = !!found.length || !rows.length;
        err.textContent = t("ed.importNone");
        dlg.querySelector("#impAdd").disabled = dlg.querySelector("#impReplace").disabled = !found.length;
      };
      dlg.querySelector("#impPaste").addEventListener("input", debounce(e => show(parseDelimited(e.target.value)), 200));
      dlg.querySelector("#impFile").addEventListener("change", async e => {
        const f = e.target.files[0]; e.target.value = "";
        if (!f) return;
        try { show(await readSheetFile(f)); }
        catch (err) { const el = dlg.querySelector("#impErr"); el.hidden = false; el.textContent = t(err.message === "xlsx-load" ? "ed.importXlsxFail" : "ed.importFail"); }
      });
    },
    onClose: v => {
      if (v !== "add" && v !== "replace" || !found.length) return;
      const prev = doc.items;
      const blank = doc.items.length === 1 && !doc.items[0].desc && !Number(doc.items[0].rate);
      const add = found.map(i => ({ id: uid(), desc: i.desc, details: "", sku: i.sku, unit: i.unit, qty: i.qty, rate: i.rate, disc: "", tax: "", cells: {} }));
      doc.items = v === "replace" || blank ? add : [...doc.items, ...add];
      if (add.some(i => i.unit)) showColumn("unit");
      if (add.some(i => i.sku)) showColumn("sku");
      if (!open.has("items")) { open.add("items"); saveOpen(); }
      renderSection("items"); changed();
      toast(t("ed.imported", { n: add.length }), { action: t("common.undo"), onAction: () => { doc.items = prev; renderSection("items"); changed(); } });
    }
  });
}

/* ---------------- clients ---------------- */
function pickClient() {
  const list = getState().clients;
  const row = c => `<button type="button" class="menu-item" data-close="${esc(c.id)}"><span class="avatar" aria-hidden="true">${esc((c.name || "?").slice(0, 1).toUpperCase())}</span><span class="pick-main"><span dir="auto">${esc(c.name)}</span>${c.email ? `<span class="hint">${esc(c.email)}</span>` : ""}</span></button>`;
  openSheet({
    title: t("ed.chooseClient"),
    body: `${list.length > 6 ? `<label class="search">${icon("search")}<span class="visually-hidden">${esc(t("ed.searchClients"))}</span><input type="search" class="input" id="pickQ" placeholder="${esc(t("ed.searchClients"))}"></label>` : ""}
      <div class="menu" id="pickList">${list.length ? list.map(row).join("") : `<p class="hint">${esc(t("ed.noClients"))}</p>`}</div>`,
    onOpen: dlg => {
      const q = dlg.querySelector("#pickQ");
      if (q) q.addEventListener("input", () => {
        const v = q.value.trim().toLowerCase();
        dlg.querySelector("#pickList").innerHTML = list.filter(c => (c.name + " " + c.email).toLowerCase().includes(v)).map(row).join("");
      });
    },
    onClose: v => {
      const c = list.find(x => x.id === v);
      if (!c) return;
      fillClient(c);
      if (!open.has("client")) { open.add("client"); saveOpen(); }
      renderSection("client"); changed();
    }
  });
}
function saveAsClient() {
  const c = doc.client;
  if (clientIsSaved()) return;
  if (!c.name.trim()) { toast(t("ed.clientNameFirst")); const n = root.querySelector("#f-client-name"); if (n) n.focus(); return; }
  const m = matchingClient();
  const saved = saveClient({ ...(m || {}), id: m ? m.id : undefined, name: c.name.trim(), contact: c.contact, email: c.email, phone: c.phone, address: c.address, taxId: c.taxId });
  doc.client.id = saved.id;
  changed();
  syncClientBtn();
  toast(t(m ? "ed.clientUpdated" : "ed.clientSavedToast", { name: saved.name }));
}

/* ---------------- logo & signature files ---------------- */
async function onLogoFile(input) {
  const f = input.files[0]; input.value = "";
  if (!f) return;
  try {
    const url = await readImage(f, { maxW: 800, maxH: 400 });
    doc.business.logo = url;
    setSettings({ business: { ...settings().business, logo: url } }, "ui");
    renderSection("brand"); changed();
  } catch { toast(t("ed.imageFail")); }
}
async function onSigFile(input) {
  const f = input.files[0]; input.value = "";
  if (!f) return;
  try { doc.signature.img = await readImage(f, { maxW: 600, maxH: 240 }); renderSection("brand"); changed(); }
  catch { toast(t("ed.imageFail")); }
}

/* ---------------- payment provider & method ---------------- */
// International providers and methods are listed; anything local is typed in (Custom).
const methodLabels = () => PAY_METHODS.map(m => t(`pay.m.${m}`));
function providerField() {
  const cur = doc.payProvider || "";
  const custom = customProvider || (!!cur && !PAY_PROVIDERS.includes(cur));
  return `<div class="field"><label for="f-provPick">${esc(t("ed.provider"))}</label>
      <select class="select" id="f-provPick" data-pick="provider"><option value="">${esc(t("ed.none"))}</option>
        ${PAY_PROVIDERS.map(p => `<option value="${esc(p)}"${!custom && cur === p ? " selected" : ""}>${esc(p)}</option>`).join("")}
        <option value="__custom"${custom ? " selected" : ""}>${esc(t("pay.customOpt"))}</option></select></div>
    ${custom ? field(t("pay.customProvider"), "payProvider", { max: 40, placeholder: t("pay.customProviderPh") }) : ""}`;
}
function methodField() {
  const cur = doc.payMethod || "", labels = methodLabels();
  const custom = customMethod || (!!cur && !labels.includes(cur));
  return `<div class="field"><label for="f-methodPick">${esc(t("ed.payMethod"))}</label>
      <select class="select" id="f-methodPick" data-pick="method"><option value="">${esc(t("ed.none"))}</option>
        ${labels.map(l => `<option value="${esc(l)}"${!custom && cur === l ? " selected" : ""}>${esc(l)}</option>`).join("")}
        <option value="__custom"${custom ? " selected" : ""}>${esc(t("pay.customOpt"))}</option></select></div>
    ${custom ? field(t("pay.customMethod"), "payMethod", { max: 40, placeholder: t("pay.customMethodPh") }) : ""}`;
}
// Credit note: which invoice it credits. Once issued, its total comes off that invoice.
function creditForField() {
  const inv = getState().docs.filter(d => d.type === "invoice" && d.status !== "draft" && d.status !== "void")
    .sort((a, b) => b.issued.localeCompare(a.issued) || b.createdAt - a.createdAt).slice(0, 300);
  const cur = inv.find(d => d.id === doc.sourceId);
  const opts = [["", t("ed.creditForNone")], ...inv.map(d => [d.id, `${d.no} · ${d.client.name || t("docs.noClient")} · ${formatMoney(totals(d).total, d.currency, appFmt())}`])];
  if (doc.sourceId && !cur) opts.push([doc.sourceId, doc.reference || doc.sourceId]);
  return field(t("ed.creditFor"), "sourceId", { options: opts, span: true, kind: "link", rerender: "all", hint: t("ed.creditForHint") });
}

function onPick(el) {
  const isProv = el.dataset.pick === "provider", key = isProv ? "payProvider" : "payMethod";
  const listed = isProv ? PAY_PROVIDERS : methodLabels();
  if (el.value === "__custom") {
    if (isProv) customProvider = true; else customMethod = true;
    if (listed.includes(doc[key])) doc[key] = "";
  } else {
    if (isProv) customProvider = false; else customMethod = false;
    doc[key] = el.value;
  }
  const sec = el.closest("[data-sec]").dataset.sec;
  renderSection(sec); changed({ path: key });
  const next = root.querySelector(el.value === "__custom" ? `#${fid(key)}` : `#${el.id}`);
  if (next) next.focus();
}

/* ---------------- columns ---------------- */
function showColumn(id) {
  const c = doc.columns.find(x => x.id === id);
  if (c) c.on = true;
  else doc.columns.splice(doc.columns.length - 1, 0, { id, role: id === "disc" ? "disc" : id === "tax" ? "tax" : "text", label: "", on: true, w: 0 });
}
const ROLE_HINT = { desc: "col.r.desc", qty: "col.r.qty", rate: "col.r.rate", amount: "col.r.amount", sku: "col.r.sku", unit: "col.r.unit", disc: "col.r.disc", tax: "col.r.tax" };
function openColumns() {
  const rowHtml = (c, i, all) => {
    const name = colName(c), fixed = c.id === "desc" || c.id === "amount";
    const removable = OPTIONAL.includes(c.id) || c.id.startsWith("c_");
    const w = c.w || defaultWeight(c);
    const std = c.label.trim() ? "" : name;
    return `<li class="col-row${c.on ? "" : " is-off"}" data-col="${esc(c.id)}">
      <div class="col-main">
        <input class="input" data-cf="label" value="${esc(c.label)}" placeholder="${esc(std || name)}" maxlength="40" dir="auto" autocomplete="off" aria-label="${esc(t("col.nameOf", { col: name }))}">
        ${fixed ? "" : `<button type="button" class="icon-btn" data-cf="up" aria-label="${esc(t("col.up", { col: name }))}"${i <= 1 ? " disabled" : ""}>${icon("chevron-up", 18)}</button>
        <button type="button" class="icon-btn" data-cf="down" aria-label="${esc(t("col.down", { col: name }))}"${i >= all.length - 2 ? " disabled" : ""}>${icon("chevron-down", 18)}</button>`}
      </div>
      <div class="col-sub">
        <span class="hint">${esc(t(ROLE_HINT[c.id] || (c.role === "number" ? "col.r.number" : "col.r.text")))}</span>
        <label class="col-w"><span>${esc(t("col.width"))}</span><input type="range" data-cf="w" min="0.3" max="8" step="0.1" value="${w}" aria-label="${esc(t("col.widthOf", { col: name }))}"></label>
        ${removable ? `<button type="button" class="icon-btn" data-cf="remove" aria-label="${esc(t("col.remove", { col: name }))}">${icon("trash-2", 18)}</button>` : ""}
        ${fixed ? "" : `<input type="checkbox" class="switch" role="switch" data-cf="on"${c.on ? " checked" : ""} aria-label="${esc(t("col.show", { col: name }))}">`}
      </div>
    </li>`;
  };
  const addHtml = () => {
    const opts = OPTIONAL.filter(id => !doc.columns.some(c => c.id === id)).map(id => [id, { sku: t("ed.sku"), unit: t("ed.unit"), disc: t("col.disc"), tax: t("col.tax") }[id]]);
    opts.push(["text", t("col.text")], ["number", t("col.number")]);
    return opts.map(([id, l]) => `<button type="button" class="chip col-add" data-add="${id}">${icon("plus", 16)}${esc(l)}</button>`).join("");
  };
  const listHtml = () => doc.columns.map((c, i, all) => rowHtml(c, i, all)).join("");
  openSheet({
    title: t("col.title"),
    side: true,
    body: `<p class="hint">${esc(t("col.intro"))}</p>
      <ol class="col-list" id="colList">${listHtml()}</ol>
      <h3 class="col-add-h" id="colAddL">${esc(t("col.add"))}</h3>
      <div class="col-adds" id="colAdds" role="group" aria-labelledby="colAddL">${addHtml()}</div>`,
    foot: `<button type="button" class="btn btn-ghost" data-cf="reset-w">${esc(t("col.resetWidths"))}</button>
      <button type="button" class="btn btn-outline" data-cf="default">${esc(t("col.useDefault"))}</button>
      <button type="button" class="btn btn-primary" data-close="done">${esc(t("common.done"))}</button>`,
    onOpen: dlg => {
      const apply = (focusSel) => {
        renderSection("items"); changed({ path: "columns" });
        dlg.querySelector("#colList").innerHTML = listHtml();
        dlg.querySelector("#colAdds").innerHTML = addHtml();
        if (focusSel) { const f = dlg.querySelector(focusSel); if (f) f.focus(); }
      };
      const colOf = el => { const li = el.closest("[data-col]"); return li && doc.columns.find(c => c.id === li.dataset.col); };
      dlg.addEventListener("input", e => {
        const c = colOf(e.target); if (!c) return;
        if (e.target.dataset.cf === "label") { c.label = e.target.value.slice(0, 40); renderSection("items"); changed({ path: "columns" }); }
        else if (e.target.dataset.cf === "w") { c.w = Number(e.target.value); changed({ path: "columns" }); }
      });
      dlg.addEventListener("change", e => {
        const c = colOf(e.target);
        if (c && e.target.dataset.cf === "on") { c.on = e.target.checked; apply(`[data-col="${CSS.escape(c.id)}"] [data-cf="on"]`); }
      });
      dlg.addEventListener("click", e => {
        const add = e.target.closest("[data-add]");
        if (add) {
          const id = add.dataset.add;
          if (OPTIONAL.includes(id)) showColumn(id);
          else doc.columns.splice(doc.columns.length - 1, 0, { id: "c_" + uid().slice(0, 8), role: id, label: t(id === "number" ? "col.number" : "col.text"), on: true, w: 0 });
          const added = doc.columns[OPTIONAL.includes(id) ? doc.columns.findIndex(c => c.id === id) : doc.columns.length - 2];
          apply(`[data-col="${CSS.escape(added.id)}"] [data-cf="label"]`);
          return;
        }
        const b = e.target.closest("[data-cf]");
        if (!b || b.tagName === "INPUT") return;
        const act = b.dataset.cf, c = colOf(b);
        if (act === "reset-w") { doc.columns.forEach(x => { x.w = 0; }); apply(); return; }
        if (act === "default") {
          setSettings({ columns: structuredClone(doc.columns.map(x => ({ ...x }))) });
          toast(t("col.defaultSaved"));
          return;
        }
        if (!c) return;
        const i = doc.columns.indexOf(c);
        if (act === "up" || act === "down") {
          const j = act === "up" ? i - 1 : i + 1;
          if (j < 1 || j > doc.columns.length - 2) return;
          [doc.columns[i], doc.columns[j]] = [doc.columns[j], doc.columns[i]];
          apply(`[data-col="${CSS.escape(c.id)}"] [data-cf="${act}"]:not([disabled]), [data-col="${CSS.escape(c.id)}"] [data-cf="label"]`);
        } else if (act === "remove") {
          const prev = structuredClone(doc.columns);
          doc.columns.splice(i, 1);
          apply("#colAdds .col-add");
          toast(t("col.removed", { col: colName(c) }), { action: t("common.undo"), onAction: () => { doc.columns = prev; renderSection("items"); changed({ path: "columns" }); } });
        }
      });
    }
  });
}

/* ---------------- top-bar actions ---------------- */
function exportPdf() { flushNow(); precheck("pdf", () => makePdf(doc)); }

// Before Send, Download PDF and Print: list what looks unfinished, each with a Fix button.
// "… anyway" carries on. Nothing is shown when everything is filled in.
function issues() {
  const out = [], ty = doc.type, tt = totals(doc);
  if (!doc.business.name.trim()) out.push(["check.biz", "biz", "#f-business-name"]);
  if (ty !== "receipt" && !doc.client.name.trim()) out.push([ty === "purchaseOrder" ? "check.supplier" : "check.client", "client", "#f-client-name"]);
  const filled = doc.items.filter(i => i.desc.trim() || Number(i.rate));
  if (!filled.length) out.push(["check.items", "items", "#f-items-0-desc"]);
  else if (ty !== "deliveryNote" && !(tt.total > 0)) out.push(["check.zero", "items", `#f-items-${doc.items.indexOf(filled[0])}-rate`]);
  if (!NO_DUE_TYPES.includes(ty) && doc.due && doc.issued && doc.due < doc.issued) out.push(["check.due", "doc", "#f-due"]);
  return out;
}
function precheck(kind, go) {
  const list = issues();
  if (!list.length) return go();
  openSheet({
    title: t(`check.title.${kind}`),
    body: `<p>${esc(t("check.intro"))}</p>
      <ul class="check-list">${list.map(([key], i) => `<li><span>${esc(t(key, { amount: dmoney(totals(doc).total) }))}</span><button type="button" class="btn btn-outline" data-close="fix${i}">${esc(t("check.fix"))}</button></li>`).join("")}</ul>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("check.back"))}</button>
           <button type="button" class="btn btn-primary" data-close="go">${esc(t(`check.anyway.${kind}`))}</button>`,
    onClose: v => {
      if (v === "go") setTimeout(go, 60);
      else if (v.startsWith("fix")) setTimeout(() => fixIssue(list[+v.slice(3)]), 80);
    }
  });
}
function fixIssue([, sec, sel]) {
  setView("form");
  if (MORE_SECS.includes(sec)) { const w = root.querySelector("#edMoreSecs"); if (w && w.hidden) toggleMoreSecs(); }
  if (!open.has(sec)) { open.add(sec); saveOpen(); renderSection(sec); }
  const el = root.querySelector(sel) || root.querySelector(`[data-sec="${sec}"] input, [data-sec="${sec}"] [data-toggle]`);
  if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
}
// Receipts: the PDF button asks which kind — the full page or the POS receipt.
function pdfButton() {
  if (doc.type !== "receipt") return exportPdf();
  flushNow();
  openSheet({
    title: t("dl.title"),
    body: `<div class="menu">
      <button type="button" class="menu-item" data-close="full">${icon("file-text")}<span class="mi-text">${esc(t("dl.full"))}<span class="hint">${esc(t("dl.fullHint"))}</span></span></button>
      <button type="button" class="menu-item" data-close="pos">${icon("receipt")}<span class="mi-text">${esc(t("dl.pos"))}<span class="hint">${esc(t("dl.posHint"))}</span></span></button>
    </div>`,
    onClose: v => { if (v === "full") setTimeout(exportPdf, 60); else if (v === "pos") setTimeout(() => openPosSheet(doc), 60); }
  });
}

function openDesign() {
  const effAccent = () => (validHex(doc.accent) ? doc.accent : templateOf(doc.template).accent).toLowerCase();
  const swatches = () => [...new Set([templateOf(doc.template).accent, ...COLORS])].map(c => `<button type="button" class="swatch" role="radio" aria-checked="${effAccent() === c}" data-color="${c}" style="--c:${c}" aria-label="${esc(c)}"></button>`).join("");
  const fontsHtml = () => [["", `${t("ed.templateFont")} · ${templateOf(doc.template).font}`], ...Object.keys(DOC_FONTS).map(f => [f, f])].map(([k, l]) =>
    `<button type="button" class="font-opt" role="radio" aria-checked="${(doc.font || "") === k}" data-font="${esc(k)}" style="font-family:${k ? DOC_FONTS[k] : DOC_FONTS[templateOf(doc.template).font] || "'Inter'"}">${esc(l)}</button>`).join("");
  const colorHtml = () => hasFixedColor(doc.template)
    ? `<span class="label">${esc(t("ed.brandColor"))}</span><p class="hint ds-fixed">${icon("lock", 16)}<span>${esc(t("ed.colorFixed"))}</span></p>`
    : `<span class="label" id="dsColL">${esc(t("ed.brandColor"))}</span><div class="swatches" role="radiogroup" aria-labelledby="dsColL" id="dsSw">${swatches()}</div>
        <label class="hint" for="dsHex">${esc(t("ed.hex"))}</label><input class="input" id="dsHex" value="${esc(effAccent())}" maxlength="7" autocomplete="off" spellcheck="false" dir="ltr">`;
  const tplHtml = () => TEMPLATES.map(tp => {
    const on = doc.template === tp.id;
    return `<button type="button" class="tpl-card${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-tpl="${tp.id}">${thumbHtml(sampleDoc(tp.id, { lang: doc.lang, currency: doc.currency, business: { ...doc.business, logo: "" } }))}<span class="tpl-meta"><span class="tpl-name">${esc(t(`tpl.name.${tp.id}`))}</span></span></button>`;
  }).join("");
  let stopFit = null;
  openSheet({
    title: t("ed.design"),
    side: true,
    body: `<div class="design-sheet">
      <div class="field"><span class="label" id="dsTplL">${esc(t("ed.template"))}</span><div class="tpl-pick" role="radiogroup" aria-labelledby="dsTplL" id="dsTpl">${tplHtml()}</div></div>
      <div class="field" id="dsColor">${colorHtml()}</div>
      <div class="field"><span class="label" id="dsFontL">${esc(t("ed.font"))}</span><p class="hint">${esc(t("ed.fontHint"))}</p><div class="font-grid" role="radiogroup" aria-labelledby="dsFontL" id="dsFonts">${fontsHtml()}</div></div>
      <div class="field"><label for="dsPaper">${esc(t("ed.paper"))}</label><select class="select" id="dsPaper">${Object.keys(PAPERS).map(p => `<option value="${esc(p)}"${doc.paper === p ? " selected" : ""}>${esc(p)} · ${paperOf(p).join(" × ")} mm</option>`).join("")}</select></div>
    </div>`,
    onOpen: dlg => {
      stopFit = fitThumbs(dlg);
      const setColor = c => {
        doc.accent = c;
        dlg.querySelectorAll("[data-color]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.color === c.toLowerCase())));
        changed({ path: "accent" });
      };
      dlg.addEventListener("click", e => {
        const tb = e.target.closest("[data-tpl]");
        if (tb) {
          // A new template brings its own colour and heading font (as in the design).
          doc.template = tb.dataset.tpl; doc.accent = ""; doc.font = "";
          dlg.querySelectorAll("[data-tpl]").forEach(b => { const on = b === tb; b.setAttribute("aria-checked", String(on)); b.classList.toggle("is-on", on); });
          dlg.querySelector("#dsColor").innerHTML = colorHtml();
          dlg.querySelector("#dsFonts").innerHTML = fontsHtml();
          changed({ path: "template" });
          return;
        }
        const s = e.target.closest("[data-color]");
        if (s) { setColor(s.dataset.color); dlg.querySelector("#dsHex").value = s.dataset.color; return; }
        const f = e.target.closest("[data-font]");
        if (f) { doc.font = f.dataset.font; dlg.querySelectorAll("[data-font]").forEach(b => b.setAttribute("aria-checked", String(b === f))); changed({ path: "font" }); }
      });
      dlg.addEventListener("keydown", e => {
        // Arrow keys move between options inside each radio group.
        const r = e.target.closest("[role=radio]");
        if (!r || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
        const all = [...r.parentElement.querySelectorAll("[role=radio]")];
        const fwd = e.key === "ArrowDown" || e.key === (document.dir === "rtl" ? "ArrowLeft" : "ArrowRight");
        const n = all[(all.indexOf(r) + (fwd ? 1 : -1) + all.length) % all.length];
        e.preventDefault(); n.focus(); n.click();
      });
      dlg.addEventListener("input", e => { if (e.target.id !== "dsHex") return; const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) setColor(v.toLowerCase()); });
      dlg.querySelector("#dsPaper").addEventListener("change", e => { doc.paper = e.target.value; const p = root.querySelector("#f-paper"); if (p) p.value = doc.paper; changed({ path: "paper" }); });
    },
    onClose: () => { if (stopFit) stopFit(); }
  });
}

function openMore() {
  flushNow();
  const st = statusOf(doc), ty = doc.type, saved = !isNew;
  const items = [];
  if (matchMedia("(max-width: 599.98px)").matches) {
    if (past.length) items.push(["undo", "undo-2", t("ed.undo")]);
    if (future.length) items.push(["redo", "redo-2", t("ed.redo")]);
  }
  items.push(["pdf", "download", t("ed.downloadPdf")], ["print", "file-text", t("ed.print")]);
  if (ty !== "deliveryNote" && ty !== "purchaseOrder") items.push(["pos", "receipt", t("ed.posPrint")]);
  if (saved) items.push(["duplicate", "copy", t("docs.act.duplicate")]);
  if (saved && ty !== "receipt" && st === "draft") items.push(["sent", "send", t(ty === "creditNote" ? "docs.act.issue" : "docs.act.markSent")]);
  if (saved && canRemind(doc, st)) items.push(["remind", "bell", t("docs.act.remind")]);
  if (saved && ty === "invoice" && ["draft", "sent", "partial", "overdue"].includes(st)) items.push(["payment", "banknote", t("docs.act.recordPayment")], ["paid", "circle-check", t("docs.act.markPaid")]);
  if (saved && ty === "invoice" && (st === "paid" || totals(doc).paid > 0)) items.push(["unpaid", "undo-2", t("docs.act.markUnpaid")]);
  if (saved && QUOTE_TYPES.includes(ty)) items.push(["convert", "arrow-right-left", t("docs.act.convert")]);
  if (saved && ty === "invoice" && st === "paid") items.push(["toReceipt", "receipt", t("ed.toReceipt")]);
  if (saved && ty === "invoice" && !["draft", "void", "credited"].includes(st)) items.push(["credit", "file-minus", t("docs.act.creditNote")]);
  if (saved && ["invoice", "proforma", "purchaseOrder"].includes(ty) && st !== "void") items.push(["delivery", "truck", t("docs.act.deliveryNote")]);
  if (saved && ty === "purchaseOrder" && st === "sent") items.push(["received", "circle-check", t("docs.act.markReceived")]);
  if (saved && ty === "deliveryNote" && st !== "delivered") items.push(["delivered", "circle-check", t("docs.act.markDelivered")]);
  if (ty === "creditNote" && doc.sourceId && getDoc(doc.sourceId)) items.push(["source", "file-text", t("docs.act.openInvoice", { no: getDoc(doc.sourceId).no })]);
  if (saved) items.push(["delete", "trash-2", t("docs.act.delete")]);
  openSheet({
    title: t("ed.moreActions"),
    body: `<div class="menu">${items.map(([a, ic, l]) => `<button type="button" class="menu-item${a === "delete" ? " danger" : ""}" data-close="${a}">${icon(ic)}<span>${esc(l)}</span></button>`).join("")}</div>`,
    onClose: a => a && setTimeout(() => runMore(a), 60)
  });
}
function runMore(a) {
  const label = `${typeName(doc.type)} ${doc.no}`;
  switch (a) {
    case "undo": return undo();
    case "redo": return redo();
    case "pdf": return exportPdf();
    case "print": return precheck("print", () => printDocument(doc));
    case "pos": return openPosSheet(doc);
    case "duplicate": {
      const c = duplicateDoc(doc.id);
      if (c) { toast(t("docs.toast.duplicated", { doc: label, copy: c.no })); location.hash = `#/edit/${encodeURIComponent(c.id)}`; }
      return;
    }
    case "sent": markSent(doc.id); reloadFromState(); return toast(t(doc.type === "creditNote" ? "docs.toast.issued" : "docs.toast.markedSent", { doc: label }));
    case "payment": return openPaymentSheet(doc.id, { onDone: reloadFromState });
    case "remind": return openReminderSheet(doc.id, { onDone: reloadFromState });
    case "received": case "delivered": { setDocFields(doc.id, { status: a }); reloadFromState(); return toast(t(`docs.toast.${a}`, { doc: label })); }
    case "credit": { const cn = createCreditNote(doc.id); if (cn) { toast(t("docs.toast.creditMade", { no: cn.no, doc: label })); location.hash = `#/edit/${encodeURIComponent(cn.id)}`; } return; }
    case "delivery": { const dn = createDeliveryNote(doc.id); if (dn) { toast(t("docs.toast.deliveryMade", { no: dn.no, doc: label })); location.hash = `#/edit/${encodeURIComponent(dn.id)}`; } return; }
    case "source": location.hash = `#/edit/${encodeURIComponent(doc.sourceId)}`; return;
    case "paid": { const prev = markPaid(doc.id); reloadFromState(); return toast(t("docs.toast.markedPaid", { doc: label }), { action: t("common.undo"), onAction: () => { restorePaymentState(doc.id, prev); reloadFromState(); } }); }
    case "unpaid": { const p = { status: doc.status, payments: structuredClone(doc.payments) }; setDocFields(doc.id, { status: "sent", payments: [] }); reloadFromState(); return toast(t("docs.toast.markedUnpaid", { doc: label }), { action: t("common.undo"), onAction: () => { restorePaymentState(doc.id, p); reloadFromState(); } }); }
    case "convert": { const inv = convertToInvoice(doc.id); if (inv) { toast(t("docs.toast.converted", { doc: label, inv: inv.no })); location.hash = `#/edit/${encodeURIComponent(inv.id)}`; } return; }
    case "toReceipt": { const r = duplicateDoc(doc.id, "receipt"); if (r) { setDocFields(r.id, { reference: doc.no, payMethod: (doc.payments[doc.payments.length - 1] || {}).method || "" }); toast(t("ed.receiptMade", { no: r.no })); location.hash = `#/edit/${encodeURIComponent(r.id)}`; } return; }
    case "delete": {
      const r = deleteDoc(doc.id);
      dirty = false;
      location.hash = "#/documents";
      if (r) setTimeout(() => toast(t("docs.toast.deleted", { doc: label }), { action: t("common.undo"), onAction: () => restoreDoc(r.doc, r.index) }), 50);
      return;
    }
  }
}

function openSend() {
  flushNow();
  precheck("send", sendSheet);
}
function sendSheet() {
  const tt = totals(doc);
  const amount = formatMoney(doc.type === "invoice" ? tt.balance : tt.total, doc.currency, { fmt: doc.numberFormat, lang: doc.lang });
  const subject = `${dl(doc.lang, "noun", doc.type)} ${doc.no}${doc.business.name ? " – " + doc.business.name : ""}`;
  const due = !NO_DUE_TYPES.includes(doc.type) && doc.due ? formatDate(doc.due, doc.dateFormat, doc.lang) : "";
  const body = t(`send.body.${doc.type}${doc.type === "purchaseOrder" && !due ? "NoDate" : ""}`, { name: doc.client.contact || doc.client.name || "", doc: `${typeName(doc.type)} ${doc.no}`, amount, due, biz: doc.business.name || "", inv: doc.reference || "" }).replace(/[ \t]+\n/g, "\n");
  const canShare = !!navigator.share;
  const att = pdfAttachment(doc);
  openSheet({
    title: t("send.title"),
    body: `<div class="field"><label for="sendTo">${esc(t("send.to"))}</label><input class="input" type="email" id="sendTo" value="${esc(doc.client.email)}" autocomplete="email" dir="ltr"></div>
      <div class="field"><label for="sendSubj">${esc(t("send.subject"))}</label><input class="input" id="sendSubj" value="${esc(subject)}" dir="auto"></div>
      <div class="field"><label for="sendMsg">${esc(t("send.message"))}</label><textarea class="input textarea" id="sendMsg" rows="6" dir="auto">${esc(body)}</textarea></div>
      ${att.html}
      <div class="send-grid">
        <button type="button" class="btn btn-outline" data-send="pdf">${icon("download", 18)}${esc(t("send.pdfFirst"))}</button>
        ${canShare ? `<button type="button" class="btn btn-outline" data-send="share">${icon("share-2", 18)}${esc(t("send.share"))}</button>` : ""}
        <button type="button" class="btn btn-primary" data-send="email">${icon("send", 18)}${esc(t("send.email"))}</button>
      </div>`,
    onOpen: dlg => {
      const pdf = att.attach(dlg);
      dlg.addEventListener("click", async e => {
        const b = e.target.closest("[data-send]");
        if (!b) return;
        const to = dlg.querySelector("#sendTo").value.trim(), subj = dlg.querySelector("#sendSubj").value, msg = dlg.querySelector("#sendMsg").value;
        if (b.dataset.send === "pdf") { pdf.download(); return; }
        if (b.dataset.send === "share") {
          if (await pdf.share({ title: subj, text: msg })) { markAsSentAfterSend(); dlg.close(); }
          return;
        }
        const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(msg)}`;
        if (to && doc.client.email !== to) { doc.client.email = to; changed({ path: "client.email" }); }
        dlg.close();
        pdf.email(href);
        markAsSentAfterSend();
      });
    }
  });
}
function markAsSentAfterSend() {
  if (doc.type !== "receipt" && doc.status === "draft") {
    doc.status = sentStatus(doc.type); doc.sentAt = Date.now();
    renderSection("doc"); changed();
    toast(t(doc.type === "creditNote" ? "docs.toast.issued" : "docs.toast.markedSent", { doc: `${typeName(doc.type)} ${doc.no}` }), { action: t("common.undo"), onAction: () => { doc.status = "draft"; doc.sentAt = 0; renderSection("doc"); changed(); } });
  }
}

/* ---------------- mount ---------------- */
export function mount(el, params) {
  root = el;
  customProvider = customMethod = false;
  past = []; future = []; dirty = false; saveState = "saved";
  view = "form";
  const route = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  if (route === "edit") {
    const d = getDoc(params.id);
    if (!d) {
      root.innerHTML = `<div class="page"><header class="page-head"><div><h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("ed.notFound"))}</h1></div></header>
        <section class="card placeholder"><p>${esc(t("ed.notFoundBody"))}</p><a class="btn btn-outline" href="#/documents">${esc(t("common.backToDocs"))}</a></section></div>`;
      return { title: t("ed.notFound") };
    }
    doc = structuredClone(d); isNew = false;
  } else {
    const q = params.query || new URLSearchParams();
    const type = DOC_TYPES.includes(q.get("type")) ? q.get("type") : "invoice";
    doc = newDoc(type);
    const cid = q.get("client");
    const c = cid && getState().clients.find(x => x.id === cid);
    if (c) fillClient(c);
    isNew = true;
  }
  lastSnap = snapshot();
  typeNos = { [doc.type]: doc.no };
  document.getElementById("main").classList.add("main--editor");
  root.innerHTML = shell();
  open.forEach(afterSectionRender);
  renderTotalBar();
  ac = new AbortController();
  const sig = { signal: ac.signal };
  root.addEventListener("input", onInput, sig);
  root.addEventListener("change", onChange, sig);
  root.addEventListener("click", onClick, sig);
  root.addEventListener("keydown", onKeydown, sig);
  root.addEventListener("focusin", onFocusIn, sig);
  root.addEventListener("focusout", e => { if (e.target.closest && e.target.closest("#docPreview [data-edit]")) setTimeout(schedulePreview, 0); }, sig);
  keyHandler = e => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !isTyping(e)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === "y" && !isTyping(e)) { e.preventDefault(); redo(); }
    else if (k === "s") { e.preventDefault(); flushNow(); renderStatus(); toast(t("ed.saved")); }
    else if (k === "p") { e.preventDefault(); flushNow(); printDocument(doc); }
  };
  document.addEventListener("keydown", keyHandler);
  resizeObs = new ResizeObserver(() => fitPreview());
  resizeObs.observe(root.querySelector(".ed-paper-wrap"));
  unsub = subscribe((st, reason) => {
    if (reason === "sync" && !isNew) { const d = getDoc(doc.id); if (d && JSON.stringify(d) !== JSON.stringify(normalizeDoc({ ...doc, updatedAt: d.updatedAt }))) { if (!dirty) reloadFromState(); } }
    if (reason === "clients") syncClientBtn();
  });
  renderPreview();
  renderStatus();
  renderUndo();
  // #/edit/<id>?send=1 (from the guided first invoice) opens Send straight away.
  if (!isNew && params.query && params.query.get("send") === "1") {
    history.replaceState(null, "", `#/edit/${encodeURIComponent(doc.id)}`);
    setTimeout(() => { if (root) openSend(); }, 0);
  }
  return { title: `${typeName(doc.type)} ${doc.no}`, focusSearch: null };
}

export function unmount() {
  if (doc && (dirty || !isNew)) { persist.cancel(); if (dirty) flushNow(); }
  commitHistory.cancel();
  if (unsub) unsub();
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  if (resizeObs) resizeObs.disconnect();
  if (pad) { pad.destroy(); pad = null; }
  const m = document.getElementById("main"); if (m) m.classList.remove("main--editor");
  if (ac) { ac.abort(); ac = null; }
  root = null; doc = null;
}
